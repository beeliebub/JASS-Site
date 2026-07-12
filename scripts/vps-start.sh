#!/usr/bin/env bash
#
# scripts/vps-start.sh — bring the JASS site up (or redeploy it) on a VPS
# that has already been through one-time provisioning (see
# scripts/vps-setup.sh, which installs Docker/Caddy/ufw and creates
# .env.production the first time — this script does NOT do any of that).
#
# Day-to-day usage:
#   scripts/vps-start.sh                 # (re)build + start, migrate, health-check
#   scripts/vps-start.sh --pull          # git pull first, then the above
#   scripts/vps-start.sh --no-build      # fast restart, skip the image rebuild
#   scripts/vps-start.sh --pull --no-build
#
# Safe to run repeatedly: `docker compose up -d` is idempotent, and
# `prisma migrate deploy` is a no-op when there's nothing new to apply.
#
# This is a thin back-compat wrapper: the helpers live in
# scripts/lib/common.sh and the deploy tasks in scripts/lib/vps-deploy.sh
# (also used by ./setup.sh's deploy mode). Flags and --help output are
# unchanged.

# -E so the ERR trap is inherited by functions/subshells; -e/-u/pipefail so
# unexpected failures abort loudly instead of limping on with bad state.
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Locate repo root and source the shared helpers + deploy tasks.
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/vps-deploy.sh
. "$SCRIPT_DIR/lib/vps-deploy.sh"

install_err_trap "vps-start.sh"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------

DO_PULL=0
DO_BUILD=1

usage() {
  cat <<'EOF'
Usage: scripts/vps-start.sh [--pull] [--no-build] [--help]

Brings the JASS site up (or redeploys it) on a VPS that has already been
provisioned via scripts/vps-setup.sh. Safe to run repeatedly — intended for:

  - starting the site after a server reboot
  - redeploying after pulling new code / applying new migrations

Flags:
  --pull       Run `git pull --ff-only` before doing anything else. Requires
               the repo root to be a git working tree; fails loudly on merge
               conflicts, a non-fast-forward pull, or local changes blocking
               the pull, rather than doing anything destructive (no
               `git reset --hard`, no force pull).
  --no-build   Skip the image rebuild and just run `docker compose up -d`
               (a fast plain restart). By default the script runs
               `docker compose up -d --build`, which is cheap when nothing
               changed (Docker layer caching) and guarantees a code or
               dependency change is picked up.
  --help       Show this help and exit.

What this script does, in order:
  1. Locate the repo root from its own path, so it works from any cwd.
  2. Sanity-check that .env.production exists and docker/docker compose/curl
     are available.
  3. (optional) git pull --ff-only (requires a git working tree).
  4. Build (unless --no-build) and start the containers.
  5. Confirm the web container is actually running, then run
     `prisma migrate deploy` inside it. This does NOT run `db:seed` —
     re-seeding is a one-time/opt-in operation that can overwrite live
     admin-edited content, so it's never run from here.
  6. Poll 127.0.0.1:3000 until the app responds (bailing early if the
     container starts crash-looping), or fail with a pointer to
     `docker compose logs web`.
  7. Note if the host's /etc/caddy/Caddyfile differs from the repo's
     Caddyfile, then reload Caddy if it's installed and active. A failed
     Caddy reload is reported loudly but does not undo the fact that the app
     itself is already up (the script exits non-zero so it's not missed).
  8. Print `docker compose ps` and a reminder on how to tail logs.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --pull)
      DO_PULL=1
      ;;
    --no-build)
      DO_BUILD=0
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      error "Unknown flag: $arg"
      usage
      exit 1
      ;;
  esac
done

cd "$REPO_ROOT"

info "Repo root: $REPO_ROOT"

run_deploy
