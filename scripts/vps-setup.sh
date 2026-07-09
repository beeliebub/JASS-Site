#!/usr/bin/env bash
#
# One-time, idempotent provisioning script for deploying JASS to a fresh
# Ubuntu 22.04+/Debian 12 VPS (Docker + host-level Caddy reverse proxy).
#
# This automates README.md's "Deploying to an OVH VPS" steps 3-10 and the
# systemd backup timer from docs/DEPLOYMENT.md's "Backup story" section.
# It does NOT cover README steps 1 ("Provision the VPS" / create the
# `deploy` user) or 2 ("Point DNS at the VPS") — those are external/manual
# and this script only prints reminders for them.
#
# Run it as the non-root, sudo-capable `deploy` user, from inside the
# already-cloned repo, e.g.:
#
#   cd /opt/jass
#   ./scripts/vps-setup.sh --domain justasimpleserver.net
#
# Safe to re-run: every step checks current state first and will not
# clobber an existing .env.production or redo completed work.

# -E so the ERR trap fires inside functions/subshells too; -e exit on error;
# -u error on unset vars; pipefail so a failing command in a pipe fails the
# whole pipe instead of being masked by a later success.
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Logging helpers (colored if this is a terminal that supports it, plain
# otherwise).
# ---------------------------------------------------------------------------

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  C_RESET="$(tput sgr0)"
  C_RED="$(tput setaf 1)"
  C_GREEN="$(tput setaf 2)"
  C_YELLOW="$(tput setaf 3)"
  C_BOLD="$(tput bold)"
else
  C_RESET=""
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_BOLD=""
fi

info()  { printf '%s[INFO]%s  %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%s[WARN]%s  %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
error() { printf '%s[ERROR]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
die()   { error "$*"; exit 1; }
step()  { printf '\n%s==> %s%s\n' "$C_BOLD" "$*" "$C_RESET"; }

# ---------------------------------------------------------------------------
# Traps: clean up any half-written temp files, and on any *unexpected* failure
# (one not already routed through `die`) print exactly which line blew up so
# the user gets a pointer instead of a bare shell error. `die` uses exit, which
# does not trigger ERR, so intentional failures don't double-print.
# ---------------------------------------------------------------------------

TMP_ENV_FILE=""
_cleanup() {
  [[ -n "${TMP_ENV_FILE:-}" && -e "${TMP_ENV_FILE:-}" ]] && rm -f "$TMP_ENV_FILE"
  return 0
}
trap _cleanup EXIT
trap 'rc=$?; error "vps-setup.sh hit an unexpected failure at line ${LINENO} (exit ${rc}). Nothing here is destructive; the script is safe to re-run once the cause above is resolved."' ERR

# ---------------------------------------------------------------------------
# xtrace guards. This script never enables `set -x`, but if someone runs it as
# `bash -x scripts/vps-setup.sh` we must not leak the AUTH_SECRET or the OWNER
# password into the trace. hide_xtrace/restore_xtrace bracket the sensitive
# sections and are no-ops when xtrace is off.
# ---------------------------------------------------------------------------

hide_xtrace() {
  case $- in
    *x*) __XTRACE_ON=1; set +x ;;
    *)   __XTRACE_ON=0 ;;
  esac
}
restore_xtrace() {
  [[ "${__XTRACE_ON:-0}" == 1 ]] && set -x
  return 0
}

# ---------------------------------------------------------------------------
# Prompt helpers. Every read is EOF-safe: with piped/redirected/closed stdin
# (cron, CI, `curl | bash`) a read returns immediately instead of hanging, and
# prompts that have a sane default fall back to it. Prompts that require a
# human with no safe default (the OWNER email/password) fail fast with a clear
# message rather than looping or proceeding with an empty value.
# ---------------------------------------------------------------------------

ask_yes_no() {
  # ask_yes_no "prompt" "default(Y|N)" -> 0 (yes) or 1 (no)
  local prompt="$1" default="${2:-N}" reply suffix
  suffix="[y/N]"
  [[ "$default" =~ ^[Yy]$ ]] && suffix="[Y/n]"
  if ! read -r -p "$prompt $suffix: " reply; then
    reply=""
    printf '\n' >&2
  fi
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy]$ ]]
}

prompt_default() {
  # prompt_default "prompt" "default" -> echoes the chosen value (default on EOF)
  local prompt="$1" default="$2" reply
  if ! read -r -p "$prompt [$default]: " reply; then
    reply=""
    printf '\n' >&2
  fi
  printf '%s' "${reply:-$default}"
}

prompt_validated() {
  # prompt_validated "prompt" "default" "regex" "errmsg" -> echoes a value that
  # matches <regex>. Re-prompts on invalid input. Callers must pass a <default>
  # that itself matches <regex>, so that under non-interactive stdin (where
  # every read yields the default) this cannot loop forever.
  local prompt="$1" default="$2" regex="$3" errmsg="$4" reply
  while true; do
    reply="$(prompt_default "$prompt" "$default")"
    if [[ "$reply" =~ $regex ]]; then
      printf '%s' "$reply"
      return 0
    fi
    error "$errmsg (got: '$reply')."
  done
}

is_valid_port() {
  # 1-65535, base-10 (guard against octal interpretation of a leading zero).
  local p="$1"
  [[ "$p" =~ ^[0-9]+$ ]] || return 1
  (( 10#$p >= 1 && 10#$p <= 65535 )) || return 1
  return 0
}

validate_domain() {
  local d="$1"
  [[ -n "$d" ]] || die "--domain must not be empty."
  if [[ "$d" =~ [[:space:]] ]]; then
    die "--domain must not contain whitespace (got: '$d')."
  fi
  if [[ "$d" == -* ]]; then
    die "--domain must not start with '-' (got: '$d') — that looks like a misplaced flag, not a domain."
  fi
  # Hostname shape: dot-separated labels of letters/digits/hyphens (no leading
  # or trailing hyphen per label, labels <= 63 chars), at least two labels.
  # This also implicitly rejects '/', '&', '$', backticks, quotes, etc. — none
  # of which are in the allowed character class — so the value is safe to drop
  # into a Caddyfile and .env without any further escaping.
  local re='^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'
  [[ "$d" =~ $re ]] || die "--domain '$d' is not a valid hostname. Expected something like 'example.com' (letters, digits, hyphens and dots only; no spaces, slashes, or other special characters)."
}

set_env_var() {
  # set_env_var <file> <key> <value>  — replaces KEY=... if present, else appends.
  local file="$1" key="$2" value="$3" escaped
  escaped="$(printf '%s' "$value" | sed -e 's/[\/&]/\\&/g')"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s/^${key}=.*/${key}=\"${escaped}\"/" "$file"
  else
    printf '%s="%s"\n' "$key" "$value" >>"$file"
  fi
}

generate_auth_secret() {
  # Prefer host node; fall back to a throwaway container if node isn't on
  # the host (Docker is guaranteed to be installed by the time this runs).
  if command -v node >/dev/null 2>&1; then
    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  else
    $DOCKER_BIN run --rm node:20-bookworm-slim \
      node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  fi
}

run_apt() {
  # Wrapper around `sudo apt-get <args>` with retry+backoff, because a fresh
  # VPS's background unattended-upgrades can transiently hold
  # /var/lib/dpkg/lock-frontend and make an otherwise-fine install fail. Uses
  # DEBIAN_FRONTEND=noninteractive so a package's config prompt can never hang
  # this script. Worst case ~5+10+20+40 = 75s of backoff before giving up.
  local attempt=1 max=5 delay=5
  while true; do
    if sudo DEBIAN_FRONTEND=noninteractive apt-get "$@"; then
      return 0
    fi
    if (( attempt >= max )); then
      die "'apt-get $*' failed after ${max} attempts. If another process holds the dpkg lock, check 'sudo lsof /var/lib/dpkg/lock-frontend' (often unattended-upgrades) and re-run; otherwise the error above is a real apt failure."
    fi
    warn "'apt-get $*' failed (attempt ${attempt}/${max}) — another process may hold the dpkg/apt lock (unattended-upgrades?). Retrying in ${delay}s..."
    sleep "$delay"
    attempt=$(( attempt + 1 ))
    delay=$(( delay * 2 ))
  done
}

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------

DOMAIN="justasimpleserver.net"

usage() {
  cat <<EOF
Usage: scripts/vps-setup.sh [--domain <domain>] [-h|--help]

One-time, idempotent provisioning script for deploying JASS to a fresh
Ubuntu 22.04+/Debian 12 VPS via Docker + a host-level Caddy reverse proxy.
Automates README.md's "Deploying to an OVH VPS" steps 3-10 plus the
systemd backup timer from docs/DEPLOYMENT.md. Safe to re-run.

Options:
  --domain <domain>   Domain to deploy for (default: justasimpleserver.net).
                       Used for the Caddyfile, the AUTH_URL/MC_SERVER_HOST
                       defaults in .env.production, and the best-effort DNS
                       check. Must be a valid hostname (e.g. example.com).
  -h, --help           Show this help and exit.

What it does:
  1. Sanity checks: refuses to run as root, requires sudo, verifies this
     looks like the JASS repo root and an Ubuntu/Debian host.
  2. Prints reminders for the manual README steps 1-2 (provisioning the VPS
     / creating the deploy user, and pointing DNS at it), plus a
     best-effort DNS check for --domain.
  3. Opens the OS firewall (ufw): OpenSSH, 80/tcp, 443/tcp.
  4. Installs Docker if missing; adds you to the docker group.
  5. Installs Caddy if missing; installs this repo's Caddyfile (substituting
     --domain if given) and reloads/starts it.
  6. Creates .env.production from .env.example if it doesn't already exist,
     generating a fresh AUTH_SECRET and prompting for AUTH_URL/
     MC_SERVER_HOST/MC_SERVER_PORT. Never touches an existing file.
  7. Builds and starts the app with 'docker compose up -d --build', then
     polls 127.0.0.1:3000 until it responds.
  8. Runs 'prisma migrate deploy' and (on a fresh .env.production) 'npm run
     db:seed' inside the container.
  9. Optionally creates the first OWNER account (prompts for email/password).
  10. Optionally installs the systemd jass-db-backup service+timer.
  11. Prints the README step 11 manual verification checklist.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      [[ $# -ge 2 ]] || die "--domain requires an argument"
      DOMAIN="$2"
      shift 2
      ;;
    --domain=*)
      DOMAIN="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

validate_domain "$DOMAIN"

# ---------------------------------------------------------------------------
# Locate the repo root (this script lives in <repo>/scripts/).
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
RUN_USER="$(id -un)"

# ---------------------------------------------------------------------------
# Step 1: Sanity checks
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 2: Reminders for the manual README steps + best-effort DNS check
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 3: Firewall (ufw)
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 4: Docker
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 5: Caddy
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 6: .env.production
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 7: Build and start
# ---------------------------------------------------------------------------

step "Build and start (docker compose up -d --build)"

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

# ---------------------------------------------------------------------------
# Step 8: Migrate + seed
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 9: First OWNER account
# ---------------------------------------------------------------------------

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
  # trace; the values are quoted at the call site and never passed through eval
  # or a second round of shell parsing, so a password containing $(...), a
  # backtick, or a quote is treated as a literal string.
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
  restore_xtrace

  info "About to run: $DOCKER_BIN compose exec web npm run create-admin -- $OWNER_EMAIL <password> --role OWNER"
  $DOCKER_BIN compose exec web npm run create-admin -- "$OWNER_EMAIL" "$OWNER_PASSWORD" --role OWNER \
    || die "'npm run create-admin' failed inside the container. Retry later with: $DOCKER_BIN compose exec web npm run create-admin -- <email> <password> --role OWNER"
  unset OWNER_PASSWORD OWNER_PASSWORD_CONFIRM
else
  info "Skipped. Run this later with:"
  info "  $DOCKER_BIN compose exec web npm run create-admin -- <email> <password> --role OWNER"
fi

# ---------------------------------------------------------------------------
# Step 10: Automatic backups
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Step 11: Final verification banner
# ---------------------------------------------------------------------------

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
