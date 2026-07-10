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
#
# As of Phase 11 this is a thin back-compat wrapper: the helpers live in
# scripts/lib/common.sh and the provisioning steps in
# scripts/lib/vps-provision.sh (also used by ./setup.sh's provision mode).
# Flags and --help output are unchanged.

# -E so the ERR trap fires inside functions/subshells too; -e exit on error;
# -u error on unset vars; pipefail so a failing command in a pipe fails the
# whole pipe instead of being masked by a later success.
set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Locate the repo root (this script lives in <repo>/scripts/) and source the
# shared helpers + provisioning steps.
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/vps-provision.sh
. "$SCRIPT_DIR/lib/vps-provision.sh"

install_cleanup_trap
install_err_trap "vps-setup.sh"

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
  7. Builds and starts the app with 'docker compose up -d --build'.
  8. Runs 'prisma migrate deploy' and (on a fresh .env.production) 'npm run
     db:seed' inside the container (before the health check below, since
     every page queries the DB and would 500 until migrations are applied).
  9. Polls 127.0.0.1:3000 until it responds.
  10. Optionally creates the first OWNER account (prompts for email/password).
  11. Optionally installs the systemd jass-db-backup service+timer.
  12. Prints the README step 11 manual verification checklist.
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

cd "$REPO_ROOT"
RUN_USER="$(id -un)"

run_provision "$DOMAIN"
