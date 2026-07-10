#!/usr/bin/env bash
# shellcheck shell=bash
#
# scripts/lib/vps-deploy.sh — the day-to-day deploy/redeploy tasks of the
# original scripts/vps-start.sh, each wrapped verbatim in a step_* function
# and orchestrated by run_deploy. This file is SOURCED, never executed.
#
# Requires scripts/lib/common.sh to be sourced first (logging + step()). The
# caller must have installed the ERR trap (install_err_trap), cd'd to the
# repo root, set REPO_ROOT, and set the DO_PULL / DO_BUILD globals (0/1)
# before calling run_deploy.
#
# Step bodies keep their original top-level indentation on purpose, so they
# diff byte-identically against the pre-refactor script.
#
# !!! NAMESPACE COLLISION WARNING !!!
# This file and scripts/lib/vps-provision.sh intentionally reuse function
# names (step_sanity, step_compose_up). They must NEVER be sourced into the
# same shell — source exactly ONE of them per process, or the later one
# silently overwrites the earlier one's steps.

if [[ -n "${_JASS_VPS_PROVISION_LOADED:-}" ]]; then
  printf '[ERROR] scripts/lib/vps-deploy.sh must not be sourced into the same shell as scripts/lib/vps-provision.sh (their step_* functions collide).\n' >&2
  return 1
fi
[[ -n "${_JASS_VPS_DEPLOY_LOADED:-}" ]] && return 0
_JASS_VPS_DEPLOY_LOADED=1

# vps-start.sh had its own phase() section header (printed with its blue
# COLOR_INFO); common.sh's step() is the reconciled equivalent. One-line shim
# so the step bodies below stay verbatim.
phase() { step "$@"; }

# ---------------------------------------------------------------------------
# Small helpers used further down
# ---------------------------------------------------------------------------
#
# compose_service_state / wait_for_service_running now live in common.sh (they
# are shared with vps-provision.sh's own migrate-before-health-check step).

# _caddy_normalize — collapse whitespace runs, trim, and drop blank/comment
# lines from stdin, so cosmetic formatting differences don't trip the compare.
# Never fails.
_caddy_normalize() {
  sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//' | { grep -vE '^$|^#' || true; }
}

# caddy_diff_check — warn (heads-up only) if the host's live Caddyfile differs
# from what vps-setup.sh would write from the repo's Caddyfile. This never
# writes anything; it just nudges the operator. Robust against domain
# substitution and whitespace-only edits (see comments inline).
caddy_diff_check() {
  local host_file="/etc/caddy/Caddyfile" repo_file="$REPO_ROOT/Caddyfile"
  local host_domain desired

  if [[ ! -f "$repo_file" ]]; then
    warn "Repo Caddyfile not found at $repo_file — skipping the Caddyfile comparison."
    return 0
  fi

  # vps-setup.sh writes the host Caddyfile as the repo's Caddyfile with the
  # 'justasimpleserver.net' placeholder replaced by the real --domain. Recover
  # that domain from the host's site-address line — the only line that starts
  # at column 0 (not indented, not a comment) and opens a block with '{'. Then
  # rebuild exactly what vps-setup.sh *would* have written and compare, instead
  # of trying to regex the site-block line out of both sides.
  host_domain="$(grep -E '^[^[:space:]#].*\{[[:space:]]*$' "$host_file" 2>/dev/null \
    | head -n1 \
    | sed -E 's/[[:space:]]*,.*$//; s/[[:space:]]*\{.*$//' \
    | tr -d '[:space:]' || true)"

  if [[ -z "$host_domain" ]]; then
    warn "Could not parse the site domain from $host_file — skipping the Caddyfile comparison."
    return 0
  fi

  # Bash parameter expansion (literal replace), not sed, so a domain
  # containing '/', '&', or '\' can't corrupt the substitution — same
  # reasoning as vps-setup.sh's Caddyfile write.
  local repo_content
  repo_content="$(<"$repo_file")"
  desired="${repo_content//justasimpleserver.net/$host_domain}"

  if ! diff -q \
      <(printf '%s\n' "$desired" | _caddy_normalize) \
      <(_caddy_normalize < "$host_file") >/dev/null 2>&1; then
    warn "/etc/caddy/Caddyfile differs from the repo's Caddyfile (beyond the domain substitution)."
    warn "If you intentionally changed the Caddyfile, re-run scripts/vps-setup.sh's Caddy step, or"
    warn "manually copy it: sudo cp $repo_file /etc/caddy/Caddyfile"
  fi
}

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------

step_sanity() {
phase "Sanity checks"

if [[ ! -f "$REPO_ROOT/.env.production" ]]; then
  error ".env.production not found in $REPO_ROOT."
  error "If this is a fresh VPS, run scripts/vps-setup.sh first (it creates .env.production)."
  error "For a non-VPS use case, copy .env.example to .env.production yourself and fill in real values."
  exit 1
fi
info ".env.production found."

if ! command -v docker >/dev/null 2>&1; then
  error "docker not found on PATH. Run scripts/vps-setup.sh first to install Docker."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  error "'docker compose' is not available. Run scripts/vps-setup.sh first to install Docker (with the Compose plugin)."
  exit 1
fi
info "docker compose is available."

# curl is used for the health check below; fail early with a clear message
# rather than partway through the deploy.
if ! command -v curl >/dev/null 2>&1; then
  error "curl not found on PATH, but it's needed for the post-start health check."
  error "Install it (e.g. 'sudo apt-get install -y curl') and re-run this script."
  exit 1
fi
}

# ---------------------------------------------------------------------------
# Optional: git pull
# ---------------------------------------------------------------------------

step_git_pull() {
if [[ "$DO_PULL" -eq 1 ]]; then
  phase "Pulling latest code"

  if ! command -v git >/dev/null 2>&1; then
    error "git not found on PATH, but --pull was requested."
    error "Install git, or omit --pull and update the code the way it was originally deployed (e.g. rsync/tarball)."
    exit 1
  fi

  # A tarball/rsync-based deploy is not a git working tree — pulling there
  # fails with a confusing raw git error. Check first and explain clearly.
  if ! git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    error "$REPO_ROOT is not a git working tree, so --pull can't work here."
    error "This deploy was likely set up by copying files (tarball/rsync) rather than 'git clone'."
    error "Update the code the same way it was originally deployed, then re-run this script WITHOUT --pull."
    exit 1
  fi

  # A deploy host should track the remote exactly and carry no local edits.
  # Warn up front if it doesn't, so the (likely) --ff-only failure below makes
  # sense rather than looking mysterious.
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain 2>/dev/null || true)" ]]; then
    warn "The working tree has uncommitted local changes — a fast-forward pull may refuse to run."
    warn "A deploy host normally has no local edits; review 'git -C \"$REPO_ROOT\" status' if the pull below fails."
  fi

  if ! git -C "$REPO_ROOT" pull --ff-only; then
    error "git pull --ff-only failed."
    error "On a deploy host this almost always means the local checkout has diverged from the remote —"
    error "either uncommitted local changes in the way, or local commits that aren't upstream."
    error "Inspect what's going on:"
    error "  git -C \"$REPO_ROOT\" status"
    error "  git -C \"$REPO_ROOT\" log --oneline @{u}..HEAD   # local commits not on the remote"
    error "A deploy host should mirror the remote, so the usual fix is to discard local changes"
    error "intentionally (e.g. 'git -C \"$REPO_ROOT\" stash' for uncommitted edits) and re-run — NOT to"
    error "merge/rebase divergent history here. Investigate before forcing anything."
    exit 1
  fi
else
  info "Skipping git pull (pass --pull to enable)."
fi
}

# ---------------------------------------------------------------------------
# Build + start
# ---------------------------------------------------------------------------

step_compose_up() {
# Phase 10: the uploads bind-mount target must exist before compose starts
# the container. Added during the Phase 11 refactor — not part of the
# original vps-start.sh.
mkdir -p data/uploads

if [[ "$DO_BUILD" -eq 1 ]]; then
  phase "Building and starting containers"
  if ! docker compose up -d --build; then
    error "docker compose up -d --build failed (see the output above)."
    error "Common causes: a Dockerfile build error, a docker-compose.yml problem, or the Docker daemon not running."
    exit 1
  fi
else
  phase "Starting containers (no rebuild)"
  if ! docker compose up -d; then
    error "docker compose up -d failed (see the output above)."
    error "Common causes: a docker-compose.yml problem or the Docker daemon not running."
    exit 1
  fi
fi
}

# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------
#
# `docker compose up -d` returns as soon as the container is *started*, which
# is not the same as the app inside being ready to serve HTTP. For `exec` to
# work, though, we only need the container to be running — so gate the migrate
# step on that (a cheap, fast check) rather than on the full HTTP health check
# (which naturally comes after migrate, since the app can't serve requests
# until migrations are applied). If the container crash-loops on boot, this
# surfaces it here with logs instead of a confusing `exec` error.

step_migrate_deploy() {
phase "Confirming the web container is running"
if ! wait_for_service_running web 30; then
  error "Cannot run database migrations because the 'web' container isn't running."
  error "Inspect what happened:"
  error "  docker compose ps"
  error "  docker compose logs web --tail=50"
  exit 1
fi
info "web container is running."

phase "Applying database migrations"
# -T: no TTY allocation — this runs non-interactively from a script.
if ! docker compose exec -T web node --no-turbofan node_modules/prisma/build/index.js migrate deploy; then
  error "prisma migrate deploy failed inside the 'web' container (see the output above)."
  error "Check the container logs for detail: docker compose logs web --tail=50"
  exit 1
fi
}

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

step_health_check() {
phase "Waiting for the app to respond on 127.0.0.1:3000"

HEALTH_URL="http://127.0.0.1:3000"
HEALTH_TIMEOUT_SECONDS=60
HEALTH_INTERVAL_SECONDS=2
elapsed=0
healthy=0

while [[ "$elapsed" -lt "$HEALTH_TIMEOUT_SECONDS" ]]; do
  if curl -sf -o /dev/null "$HEALTH_URL"; then
    healthy=1
    break
  fi
  # Don't wait out the full timeout if the container has clearly died or is
  # crash-looping — surface that immediately.
  case "$(compose_service_state web)" in
    restarting|exited|dead)
      error "The 'web' container stopped or is crash-looping while waiting for it to respond on $HEALTH_URL."
      error "Check the logs: docker compose logs web --tail=50"
      exit 1
      ;;
  esac
  sleep "$HEALTH_INTERVAL_SECONDS"
  elapsed=$((elapsed + HEALTH_INTERVAL_SECONDS))
done

if [[ "$healthy" -ne 1 ]]; then
  error "App did not respond on $HEALTH_URL within ${HEALTH_TIMEOUT_SECONDS}s."
  error "The container is running but the app isn't serving requests yet — inspect:"
  error "  docker compose logs web --tail=50"
  error "  docker compose ps"
  exit 1
fi

info "App is responding on $HEALTH_URL."
}

# ---------------------------------------------------------------------------
# Caddy
# ---------------------------------------------------------------------------
#
# By this point the app itself is up and healthy. A Caddy reload failure
# (e.g. bad Caddyfile syntax on the host) therefore must NOT be treated like
# an earlier fatal step: we warn loudly, remember it, and exit non-zero at the
# very end with a message making clear the app IS up but Caddy may be stale.

step_caddy_reload() {
CADDY_RELOAD_FAILED=0

phase "Checking Caddy"

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^caddy\.service'; then
  if [[ -f /etc/caddy/Caddyfile ]]; then
    # Heads-up only — this script never writes to /etc/caddy (that's
    # vps-setup.sh's job).
    caddy_diff_check
  else
    warn "/etc/caddy/Caddyfile not found — Caddy may not be configured yet. See scripts/vps-setup.sh."
  fi

  if [[ "$(systemctl is-active caddy 2>/dev/null || true)" == "active" ]]; then
    if ! command -v sudo >/dev/null 2>&1; then
      warn "Caddy is active but 'sudo' isn't available to reload it — skipping reload."
      warn "The app is up, but Caddy may still be serving a stale config. Reload it manually as root."
      CADDY_RELOAD_FAILED=1
    else
      info "Reloading Caddy."
      if ! sudo systemctl reload caddy; then
        warn "Caddy reload failed — the host Caddyfile may have invalid syntax."
        warn "Validate and fix it, then reload:"
        warn "  sudo caddy validate --config /etc/caddy/Caddyfile"
        warn "  sudo systemctl reload caddy   (or: sudo systemctl status caddy)"
        CADDY_RELOAD_FAILED=1
      fi
    fi
  else
    warn "Caddy is installed but not active (systemctl is-active caddy != active) — skipping reload."
    warn "Start it with: sudo systemctl enable --now caddy"
  fi
else
  info "Caddy is not managed via systemd on this host — skipping reload. (Fine if Caddy isn't used here.)"
fi
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

step_status_report() {
phase "Status"
docker compose ps || warn "Could not run 'docker compose ps' for the status summary."

if [[ "$CADDY_RELOAD_FAILED" -eq 1 ]]; then
  error "Deploy note: the app IS up and responding on $HEALTH_URL, but reloading Caddy did not succeed (see the warning above)."
  error "Caddy may still be serving its previously-loaded config, so the public site could be stale until you reload it."
  error "Fix the host Caddyfile and reload:"
  error "  sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy"
  exit 1
fi

info "Deploy complete. Tail logs with: docker compose logs -f web"
}

# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

run_deploy() {
  # Runs every deploy task in the original vps-start.sh order. Respects the
  # DO_PULL / DO_BUILD globals set by the caller's flag parsing.
  step_sanity
  step_git_pull
  step_compose_up
  step_migrate_deploy
  step_health_check
  step_caddy_reload
  step_status_report

  # After a successful deploy, offer the resource-pack walkthrough — but only
  # if scripts/lib/walkthroughs.sh has been sourced by the caller (setup.sh
  # does; the back-compat vps-start.sh wrapper doesn't).
  if declare -F offer_resource_pack_walkthrough >/dev/null; then
    offer_resource_pack_walkthrough
  fi
}
