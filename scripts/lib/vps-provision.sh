#!/usr/bin/env bash
# shellcheck shell=bash
#
# scripts/lib/vps-provision.sh — the one-time VPS provisioning steps of the
# original scripts/vps-setup.sh, each wrapped verbatim in a step_* function
# and orchestrated by run_provision "$DOMAIN". See scripts/vps-setup.sh for
# what provisioning covers; this file is SOURCED, never executed.
#
# Requires scripts/lib/common.sh to be sourced first (logging, prompts,
# validators, run_apt, traps). The caller must have installed the traps
# (install_cleanup_trap / install_err_trap), validated $DOMAIN, cd'd to the
# repo root, and set REPO_ROOT and RUN_USER.
#
# Step bodies keep their original top-level indentation on purpose, so they
# diff byte-identically against the pre-refactor script.
#
# !!! NAMESPACE COLLISION WARNING !!!
# This file and scripts/lib/vps-deploy.sh intentionally reuse function names
# (step_sanity, step_compose_up). They must NEVER be sourced into the same
# shell — source exactly ONE of them per process, or the later one silently
# overwrites the earlier one's steps.

if [[ -n "${_JASS_VPS_DEPLOY_LOADED:-}" ]]; then
  printf '[ERROR] scripts/lib/vps-provision.sh must not be sourced into the same shell as scripts/lib/vps-deploy.sh (their step_* functions collide).\n' >&2
  return 1
fi
[[ -n "${_JASS_VPS_PROVISION_LOADED:-}" ]] && return 0
_JASS_VPS_PROVISION_LOADED=1

# Globals owned by this mode (set/consumed across steps): DOMAIN, DOCKER_BIN,
# ENV_FILE, ENV_WAS_FRESH, TMP_ENV_FILE (from common.sh), REPO_ROOT, RUN_USER.

# ---------------------------------------------------------------------------
# Step 1: Sanity checks
# ---------------------------------------------------------------------------

step_sanity() {
step "Sanity checks"

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  die "Do not run this script as root. Run it as a non-root, sudo-capable user (e.g. the 'deploy' user from README step 1) — it invokes 'sudo' itself for the specific commands that need it."
fi

if ! command -v sudo >/dev/null 2>&1; then
  die "'sudo' is not available. This script must be run as a non-root user with sudo access."
fi

info "Checking sudo access (you may be prompted for your password)..."
sudo -v || die "Could not obtain sudo privileges for $RUN_USER."

REQUIRED_FILES=(docker-compose.yml Dockerfile Caddyfile .env.example)
for f in "${REQUIRED_FILES[@]}"; do
  [[ -f "$REPO_ROOT/$f" ]] || die "Expected to find '$f' in $REPO_ROOT — is this the JASS repo root? Run this script from inside the cloned repo (e.g. /opt/jass/scripts/vps-setup.sh)."
done
info "Found docker-compose.yml, Dockerfile, Caddyfile, and .env.example in $REPO_ROOT."

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian)
      info "Detected OS: ${PRETTY_NAME:-$ID}"
      ;;
    *)
      warn "This script targets Ubuntu 22.04+/Debian 12; detected '${PRETTY_NAME:-${ID:-unknown}}'. Continuing anyway, but apt/ufw/systemd commands below may not behave as expected."
      ;;
  esac
else
  warn "/etc/os-release not found; cannot verify this is Ubuntu/Debian. Continuing anyway."
fi
}

# ---------------------------------------------------------------------------
# Step 2: Reminders for the manual README steps + best-effort DNS check
# ---------------------------------------------------------------------------

step_dns_check() {
step "Reminders (README steps 1-2 — not automated by this script)"

info "Step 1 (provision the VPS): assumed done already — a non-root 'deploy' user with sudo and your SSH key should already exist, and you should be running this script as that user."
info "Step 2 (point DNS at the VPS): make sure OVH's DNS Zone for $DOMAIN has A records for '@' and 'www' pointing at this VPS's public IP. Propagation can take minutes to hours; Caddy's automatic HTTPS won't succeed until it resolves."

step "Best-effort DNS check for $DOMAIN"

# Bounded: at most 3 services x 5s = 15s worst case, and every failure below is
# a warning only — a flaky/absent DNS or no outbound access must never be fatal.
PUBLIC_IP=""
for url in "https://ifconfig.me" "https://icanhazip.com" "https://api.ipify.org"; do
  PUBLIC_IP="$(curl -fsS4 --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
  [[ -n "$PUBLIC_IP" ]] && break
done

RESOLVED_IP=""
if command -v dig >/dev/null 2>&1; then
  RESOLVED_IP="$(dig +short "$DOMAIN" A 2>/dev/null | tail -n1 || true)"
elif command -v getent >/dev/null 2>&1; then
  RESOLVED_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
fi

if [[ -z "$PUBLIC_IP" ]]; then
  warn "Could not determine this VPS's public IP (no outbound access to ifconfig.me/icanhazip.com/ipify.org?). Skipping the DNS match check."
elif [[ -z "$RESOLVED_IP" ]]; then
  warn "'$DOMAIN' does not currently resolve to anything. DNS may not be configured or propagated yet — Caddy's automatic HTTPS will fail until it does. This is not fatal; re-run later once DNS is live."
elif [[ "$PUBLIC_IP" != "$RESOLVED_IP" ]]; then
  warn "'$DOMAIN' resolves to $RESOLVED_IP, but this VPS's public IP appears to be $PUBLIC_IP. If DNS just changed this is expected until it propagates; otherwise double-check the OVH DNS zone (README step 2)."
else
  info "'$DOMAIN' resolves to $RESOLVED_IP, matching this VPS's public IP."
fi
}

# ---------------------------------------------------------------------------
# Step 3: Firewall (ufw)
# ---------------------------------------------------------------------------

step_firewall() {
step "Firewall (ufw)"

if ! command -v ufw >/dev/null 2>&1; then
  info "ufw not found; installing..."
  run_apt update
  run_apt install -y ufw
else
  info "ufw already installed."
fi

info "Ensuring firewall rules for OpenSSH, 80/tcp, 443/tcp ('ufw allow' is idempotent — existing rules are skipped, not duplicated)..."
sudo ufw allow OpenSSH  || die "'sudo ufw allow OpenSSH' failed."
sudo ufw allow 80/tcp   || die "'sudo ufw allow 80/tcp' failed."
sudo ufw allow 443/tcp  || die "'sudo ufw allow 443/tcp' failed."

if sudo ufw status | grep -q "Status: active"; then
  info "ufw is already active."
else
  info "About to enable ufw (non-interactive: sudo ufw --force enable)."
  sudo ufw --force enable || die "'sudo ufw --force enable' failed."
fi

warn "Reminder: OVH's separate VPS control-panel 'Network Firewall' (off by default, but if enabled must independently allow 80/443) cannot be checked or changed from this script — verify it manually in the OVH panel."
}

# ---------------------------------------------------------------------------
# Step 4: Docker
# ---------------------------------------------------------------------------

step_docker() {
step "Docker"

if command -v docker >/dev/null 2>&1; then
  info "Docker already installed ($(docker --version 2>/dev/null || echo 'version unknown'))."
else
  info "Docker not found. About to install via: curl -fsSL https://get.docker.com | sh"
  if ! curl -fsSL https://get.docker.com | sh; then
    die "Docker installation failed (curl -fsSL https://get.docker.com | sh). Check outbound network/DNS and re-run."
  fi
  command -v docker >/dev/null 2>&1 || die "Docker install script completed but 'docker' is still not on PATH. Re-run, or install Docker manually per README step 4."
fi

if id -nG "$RUN_USER" 2>/dev/null | grep -qw docker; then
  info "$RUN_USER is already in the docker group."
else
  info "Adding $RUN_USER to the docker group (sudo usermod -aG docker $RUN_USER)..."
  sudo usermod -aG docker "$RUN_USER" || die "Failed to add $RUN_USER to the docker group."
  warn "You must log out and back in (or run 'newgrp docker') before 'docker' works without sudo in new shells. This run of the script will use 'sudo docker' for the remaining steps."
fi

# Decide once how to invoke docker/compose for the rest of the script: plain
# 'docker' if this shell can already reach the daemon, else 'sudo docker'
# (the group change above only takes effect in a new login shell). Every
# container operation below MUST go through $DOCKER_BIN so the choice is
# applied consistently. Intentionally unquoted at call sites so 'sudo docker'
# splits into two words.
DOCKER_BIN="docker"
if ! docker info >/dev/null 2>&1; then
  DOCKER_BIN="sudo docker"
fi
}

# ---------------------------------------------------------------------------
# Step 5: Caddy
# ---------------------------------------------------------------------------

step_caddy() {
step "Caddy"

if command -v caddy >/dev/null 2>&1; then
  info "Caddy already installed ($(caddy version 2>/dev/null | head -n1 || echo 'version unknown'))."
else
  info "Caddy not found. About to install via the official apt repo..."
  run_apt update
  run_apt install -y debian-keyring debian-archive-keyring apt-transport-https
  if ! curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg; then
    die "Failed to fetch or install Caddy's package-signing key from cloudsmith.io. Check outbound network/DNS and re-run."
  fi
  if ! curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null; then
    die "Failed to add Caddy's apt repository. Check outbound network/DNS and re-run."
  fi
  run_apt update
  run_apt install -y caddy
fi

# Substitute the deploy domain into the repo's Caddyfile. Done with bash
# parameter expansion (a literal string replace) rather than sed, so the
# domain value needs no escaping and can never break out of / corrupt the
# substitution the way an unescaped sed replacement could (a '/', '&', or
# backslash in the value). Replacing the bare apex 'justasimpleserver.net'
# also fixes up 'www.justasimpleserver.net' -> 'www.<domain>'.
CADDY_TEMPLATE="$(<"$REPO_ROOT/Caddyfile")"
DESIRED_CADDYFILE="${CADDY_TEMPLATE//justasimpleserver.net/$DOMAIN}"

if [[ -f /etc/caddy/Caddyfile ]] && diff -q <(printf '%s\n' "$DESIRED_CADDYFILE") /etc/caddy/Caddyfile >/dev/null 2>&1; then
  info "/etc/caddy/Caddyfile already matches the desired config (domain: $DOMAIN); leaving it alone."
else
  info "About to write /etc/caddy/Caddyfile (domain: $DOMAIN)..."
  printf '%s\n' "$DESIRED_CADDYFILE" | sudo tee /etc/caddy/Caddyfile >/dev/null || die "Failed to write /etc/caddy/Caddyfile."
fi

if systemctl is-active --quiet caddy 2>/dev/null; then
  info "caddy is running; reloading it to pick up any config change..."
  sudo systemctl reload caddy || die "'sudo systemctl reload caddy' failed. Check 'sudo systemctl status caddy' and 'journalctl -u caddy' — a Caddyfile syntax error is the usual cause."
else
  info "caddy is not running; enabling and starting it..."
  sudo systemctl enable --now caddy || die "'sudo systemctl enable --now caddy' failed. Check 'sudo systemctl status caddy' and 'journalctl -u caddy'."
fi
}

# ---------------------------------------------------------------------------
# Step 6: .env.production
# ---------------------------------------------------------------------------

step_env_production() {
step ".env.production"

ENV_FILE="$REPO_ROOT/.env.production"
ENV_WAS_FRESH=false

if [[ -f "$ENV_FILE" ]]; then
  info "$ENV_FILE already exists; leaving it (and its secrets) untouched."
else
  ENV_WAS_FRESH=true
  info "About to create $ENV_FILE from .env.example..."

  # Build the file in a private temp file in the same directory and only
  # rename it into place once EVERY value is populated. This makes creation
  # atomic: if the script dies partway (failed AUTH_SECRET generation, aborted
  # prompt, apt lock, etc.) there is no half-written .env.production for a
  # re-run to see and skip — the temp file is cleaned up by the EXIT trap and
  # the next run starts fresh. mktemp creates the file mode 0600, so the
  # AUTH_SECRET is never briefly world-readable.
  TMP_ENV_FILE="$(mktemp "${ENV_FILE}.XXXXXX")" || die "Could not create a temp file next to $ENV_FILE (is $REPO_ROOT writable?)."
  chmod 600 "$TMP_ENV_FILE"
  cp "$REPO_ROOT/.env.example" "$TMP_ENV_FILE" || die "Failed to copy .env.example into place."
  chmod 600 "$TMP_ENV_FILE"

  info "Generating a fresh AUTH_SECRET (never reusing the dev secret — see docs/DEPLOYMENT.md)..."
  hide_xtrace
  AUTH_SECRET_VALUE="$(generate_auth_secret)" || { restore_xtrace; die "Failed to generate AUTH_SECRET (needs host 'node', or a working Docker to run node:20-bookworm-slim)."; }
  if [[ -z "$AUTH_SECRET_VALUE" ]]; then
    restore_xtrace
    die "AUTH_SECRET generation produced an empty value; refusing to write an insecure .env.production."
  fi
  set_env_var "$TMP_ENV_FILE" "AUTH_SECRET" "$AUTH_SECRET_VALUE"
  unset AUTH_SECRET_VALUE
  restore_xtrace

  AUTH_URL_VALUE="$(prompt_validated "AUTH_URL" "https://$DOMAIN" \
    '^https?://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$' \
    "AUTH_URL must be an http:// or https:// URL with no spaces")"
  set_env_var "$TMP_ENV_FILE" "AUTH_URL" "$AUTH_URL_VALUE"

  MC_HOST_VALUE="$(prompt_validated "MC_SERVER_HOST" "$DOMAIN" \
    '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' \
    "MC_SERVER_HOST must be a hostname or IP (letters, digits, dots, hyphens; no spaces or special characters)")"
  set_env_var "$TMP_ENV_FILE" "MC_SERVER_HOST" "$MC_HOST_VALUE"

  MC_PORT_VALUE=""
  while true; do
    MC_PORT_VALUE="$(prompt_default "MC_SERVER_PORT" "25565")"
    if is_valid_port "$MC_PORT_VALUE"; then
      break
    fi
    error "MC_SERVER_PORT must be an integer in the range 1-65535 (got: '$MC_PORT_VALUE')."
  done
  set_env_var "$TMP_ENV_FILE" "MC_SERVER_PORT" "$MC_PORT_VALUE"

  # All four values are in place — publish atomically.
  chmod 600 "$TMP_ENV_FILE"
  mv -f "$TMP_ENV_FILE" "$ENV_FILE" || die "Failed to move the completed env file into place at $ENV_FILE."
  TMP_ENV_FILE=""

  info "$ENV_FILE written. DATABASE_URL is left at the .env.example default — docker-compose.yml overrides it internally to the container's bind-mount path."
fi
}

# ---------------------------------------------------------------------------
# Step 7: Build and start
# ---------------------------------------------------------------------------

step_compose_up() {
step "Build and start (docker compose up -d --build)"

# Phase 10: the uploads bind-mount target must exist (with the invoking
# user's ownership) before compose starts the container. Added during the
# Phase 11 refactor — not part of the original vps-setup.sh.
mkdir -p data/uploads

info "About to run: $DOCKER_BIN compose up -d --build (this can take a few minutes on the first run)..."
$DOCKER_BIN compose up -d --build || die "'$DOCKER_BIN compose up -d --build' failed. Check the build output above and '$DOCKER_BIN compose logs web'."

info "Waiting for the app to respond on 127.0.0.1:3000..."
READY=false
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:3000"; then
    READY=true
    break
  fi
  sleep 2
done

if [[ "$READY" == true ]]; then
  info "App is up and responding on 127.0.0.1:3000."
else
  die "App did not become ready on 127.0.0.1:3000 after ~60s. Check '$DOCKER_BIN compose logs web' before continuing."
fi
}

# ---------------------------------------------------------------------------
# Step 8: Migrate + seed
# ---------------------------------------------------------------------------

step_migrate_seed() {
step "Migrate + seed"

info "About to run: $DOCKER_BIN compose exec web node --no-turbofan node_modules/prisma/build/index.js migrate deploy"
$DOCKER_BIN compose exec web node --no-turbofan node_modules/prisma/build/index.js migrate deploy \
  || die "'prisma migrate deploy' failed inside the container. Check '$DOCKER_BIN compose logs web' and re-run."

if [[ "$ENV_WAS_FRESH" == true ]]; then
  info "About to run: $DOCKER_BIN compose exec web npm run db:seed"
  $DOCKER_BIN compose exec web npm run db:seed \
    || die "'npm run db:seed' failed inside the container. Check '$DOCKER_BIN compose logs web'."
else
  warn "An existing .env.production was found, which suggests this may be a re-run against a site that already has real content."
  warn "npm run db:seed OVERWRITES ContentBlock/Rule/Feature/Post rows back to placeholder text if the site already has real admin-edited content (see README's 'Available scripts' note)."
  if ask_yes_no "Run 'npm run db:seed' anyway?" "N"; then
    $DOCKER_BIN compose exec web npm run db:seed \
      || die "'npm run db:seed' failed inside the container. Check '$DOCKER_BIN compose logs web'."
  else
    info "Skipped. If you only need pages/nav seeded safely, run later: $DOCKER_BIN compose exec web npm run db:seed -- --pages-only"
  fi
fi
}

# ---------------------------------------------------------------------------
# Step 9: First OWNER account
# ---------------------------------------------------------------------------

step_owner_account() {
step "First OWNER account"

if ask_yes_no "Create/update an OWNER account now?" "N"; then
  # Email — required, no safe default. Loop until it has a basic name@host.tld
  # shape; fail fast (rather than hang or loop forever) if stdin is exhausted.
  OWNER_EMAIL=""
  while true; do
    if ! read -r -p "Email: " OWNER_EMAIL; then
      printf '\n' >&2
      die "Could not read an email address — stdin is not interactive. Create the OWNER account later with: $DOCKER_BIN compose exec web npm run create-admin -- <email> <password> --role OWNER"
    fi
    if [[ "$OWNER_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
      break
    fi
    error "That does not look like a valid email address (expected something like name@example.com). Try again."
  done

  # Password — required, secret. hide_xtrace so it never lands in a `bash -x`
  # trace; the guard stays on THROUGH the create-admin invocation below, because
  # the password is passed as a command-line argument and xtrace would otherwise
  # print the expanded command. The values are quoted at the call site and never
  # passed through eval or a second round of shell parsing, so a password
  # containing $(...), a backtick, or a quote is treated as a literal string.
  OWNER_PASSWORD=""
  OWNER_PASSWORD_CONFIRM=""
  hide_xtrace
  while true; do
    if ! IFS= read -r -s -p "Password (min 8 characters): " OWNER_PASSWORD; then
      printf '\n' >&2
      restore_xtrace
      die "Could not read a password — stdin is not interactive. Create the OWNER account later with: $DOCKER_BIN compose exec web npm run create-admin -- <email> <password> --role OWNER"
    fi
    printf '\n' >&2
    if ! IFS= read -r -s -p "Confirm password: " OWNER_PASSWORD_CONFIRM; then
      printf '\n' >&2
      restore_xtrace
      die "Could not read the password confirmation — stdin is not interactive."
    fi
    printf '\n' >&2
    if [[ "$OWNER_PASSWORD" != "$OWNER_PASSWORD_CONFIRM" ]]; then
      error "Passwords did not match. Try again."
      continue
    fi
    if [[ "${#OWNER_PASSWORD}" -lt 8 ]]; then
      error "Password must be at least 8 characters long. Try again."
      continue
    fi
    break
  done

  info "About to run: $DOCKER_BIN compose exec web npm run create-admin -- $OWNER_EMAIL <password> --role OWNER"
  $DOCKER_BIN compose exec web npm run create-admin -- "$OWNER_EMAIL" "$OWNER_PASSWORD" --role OWNER \
    || { restore_xtrace; die "'npm run create-admin' failed inside the container. Retry later with: $DOCKER_BIN compose exec web npm run create-admin -- <email> <password> --role OWNER"; }
  unset OWNER_PASSWORD OWNER_PASSWORD_CONFIRM
  restore_xtrace
else
  info "Skipped. Run this later with:"
  info "  $DOCKER_BIN compose exec web npm run create-admin -- <email> <password> --role OWNER"
fi
}

# ---------------------------------------------------------------------------
# Step 10: Automatic backups
# ---------------------------------------------------------------------------

step_backups() {
step "Automatic backups (systemd timer)"

if ask_yes_no "Install the systemd db-backup service+timer (daily npm run db:backup)?" "N"; then
  info "About to write /etc/systemd/system/jass-db-backup.service and jass-db-backup.timer (WorkingDirectory=$REPO_ROOT, User=$RUN_USER)..."

  if ! command -v npm >/dev/null 2>&1; then
    warn "npm was not found on the host. The backup timer's ExecStart (npm run db:backup) runs on the host directly (not inside the Docker container) per docs/DEPLOYMENT.md, so it will fail until Node/npm is installed on the host."
  fi

  sudo tee /etc/systemd/system/jass-db-backup.service >/dev/null <<EOF || die "Failed to write jass-db-backup.service."
[Unit]
Description=JASS SQLite DB backup

[Service]
Type=oneshot
WorkingDirectory=$REPO_ROOT
ExecStart=/usr/bin/npm run db:backup
User=$RUN_USER
EOF

  sudo tee /etc/systemd/system/jass-db-backup.timer >/dev/null <<EOF || die "Failed to write jass-db-backup.timer."
[Unit]
Description=Run JASS DB backup daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF

  sudo systemctl daemon-reload || die "'sudo systemctl daemon-reload' failed."
  info "About to run: systemctl enable --now jass-db-backup.timer"
  sudo systemctl enable --now jass-db-backup.timer || die "'sudo systemctl enable --now jass-db-backup.timer' failed."
  info "Backup timer installed. Check status with: systemctl status jass-db-backup.timer"
else
  info "Skipped. See docs/DEPLOYMENT.md's 'Backup story for the SQLite DB' section to install this later."
fi
}

# ---------------------------------------------------------------------------
# Step 11: Final verification banner
# ---------------------------------------------------------------------------

step_final_checklist() {
step "Done — manual verification checklist (README step 11)"

cat <<EOF

  [ ] https://$DOMAIN loads over HTTPS with a valid Let's Encrypt certificate.
  [ ] curl -I https://$DOMAIN shows Content-Security-Policy, X-Content-Type-Options,
      Referrer-Policy, Permissions-Policy, Strict-Transport-Security, and
      X-Frame-Options headers (see next.config.ts's headers()).
  [ ] https://$DOMAIN/login works with the account created above, and the
      "Edit mode" toggle appears after logging in.
  [ ] Re-run docs/DEPLOYMENT.md's "Pre-deploy security checklist" (re-verify
      npm audit findings) before treating this as a real public launch
      rather than a first deploy.

EOF

if ! id -nG "$RUN_USER" 2>/dev/null | grep -qw docker || [[ "$DOCKER_BIN" == "sudo docker" ]]; then
  warn "Remember: log out and back in (or run 'newgrp docker') so future 'docker'/'docker compose' commands work without sudo."
fi

info "vps-setup.sh finished."
}

# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

run_provision() {
  # run_provision <domain> — runs every provisioning step in the original
  # vps-setup.sh order. The caller must already have validated <domain> via
  # validate_domain and cd'd to the repo root.
  DOMAIN="$1"
  step_sanity
  step_dns_check
  step_firewall
  step_docker
  step_caddy
  step_env_production
  step_compose_up
  step_migrate_seed
  step_owner_account
  step_backups
  step_final_checklist
}
