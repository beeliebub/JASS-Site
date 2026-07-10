#!/usr/bin/env bash
#
# setup.sh — unified interactive setup wizard for the JASS site.
#
# One entry point, three modes:
#   ./setup.sh                                          # interactive menu
#   ./setup.sh --mode local                             # local dev: deps, .env, migrate, seed, run
#   ./setup.sh --mode provision --domain example.com    # one-time VPS provisioning
#   ./setup.sh --mode deploy [--pull] [--no-build]      # start/redeploy a provisioned VPS
#
# The pre-existing entry points keep working: scripts/vps-setup.sh (provision)
# and scripts/vps-start.sh (deploy) are thin wrappers over the same lib files
# in scripts/lib/.

set -Eeuo pipefail

# ---------------------------------------------------------------------------
# Flags. Parsed BEFORE sourcing any lib file, so `./setup.sh --help` (and
# flag-parse errors) never depend on the libs existing.
# ---------------------------------------------------------------------------

MODE=""
DOMAIN=""
DOMAIN_GIVEN=0
DO_PULL=0
DO_BUILD=1
PULL_FLAG_GIVEN=0
BUILD_FLAG_GIVEN=0

usage() {
  cat <<'EOF'
Usage: ./setup.sh [--mode local|provision|deploy] [options]

Unified interactive setup wizard for the JASS site. With no --mode it shows a
menu:

  1) Local dev       — install deps, .env, migrate, seed, run
  2) Provision VPS   — one-time server setup (Docker, Caddy, firewall, app)
  3) Redeploy        — update an already-provisioned VPS

Modes:
  --mode local       Set up a local development environment: Node >= 20 check,
                     npm install (with this machine's V8-crash workarounds —
                     see CLAUDE.md), .env creation from .env.example (never
                     overwrites an existing .env), prisma generate +
                     migrate dev, db:seed, optional first OWNER account,
                     uploads/ dir, then optionally starts 'npm run dev'.
                     Idempotent — safe to re-run; satisfied steps print SKIP.
  --mode provision   One-time VPS provisioning (same behavior and steps as
                     scripts/vps-setup.sh). First offers guided walkthroughs
                     for the two manual prerequisites: registrar DNS records
                     and OVH's Network Firewall.
  --mode deploy      Start or redeploy an already-provisioned VPS (same
                     behavior as scripts/vps-start.sh), then offers a
                     walkthrough for pointing the Minecraft server's
                     server.properties at the hosted resource pack.

Options:
  --domain <domain>  (provision only) Domain to deploy for
                     (default: justasimpleserver.net). Prompted for
                     interactively if omitted in provision mode.
  --pull             (deploy only) Run 'git pull --ff-only' before deploying.
  --no-build         (deploy only) Skip the image rebuild — fast plain restart.
  -h, --help         Show this help and exit.

Back-compat: scripts/vps-setup.sh and scripts/vps-start.sh still work as thin
wrappers over the same code, with their original flags and behavior.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      [[ $# -ge 2 ]] || { printf '[ERROR] --mode requires an argument (local, provision, or deploy).\n' >&2; usage >&2; exit 1; }
      MODE="$2"
      shift 2
      ;;
    --mode=*)
      MODE="${1#*=}"
      shift
      ;;
    --domain)
      [[ $# -ge 2 ]] || { printf '[ERROR] --domain requires an argument.\n' >&2; usage >&2; exit 1; }
      DOMAIN="$2"
      DOMAIN_GIVEN=1
      shift 2
      ;;
    --domain=*)
      DOMAIN="${1#*=}"
      DOMAIN_GIVEN=1
      shift
      ;;
    --pull)
      DO_PULL=1
      PULL_FLAG_GIVEN=1
      shift
      ;;
    --no-build)
      DO_BUILD=0
      BUILD_FLAG_GIVEN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '[ERROR] Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$MODE" in
  ""|local|provision|deploy) ;;
  *)
    printf '[ERROR] Invalid --mode: %s (expected local, provision, or deploy).\n' "$MODE" >&2
    usage >&2
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# Locate the repo root (this script lives at the repo root) and source libs.
# vps-provision.sh / vps-deploy.sh intentionally reuse function names
# (step_sanity, step_compose_up, ...) and must never be sourced into the same
# shell — so the chosen mode's lib is sourced later, immediately before
# dispatch, and only ever one of the two.
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$SCRIPT_DIR"
cd "$REPO_ROOT"

for lib in scripts/lib/common.sh scripts/lib/walkthroughs.sh scripts/lib/local-dev.sh; do
  if [[ ! -f "$REPO_ROOT/$lib" ]]; then
    printf '[ERROR] %s not found — is this a complete checkout of the JASS repo?\n' "$lib" >&2
    exit 1
  fi
done

# shellcheck source=scripts/lib/common.sh disable=SC1091
source "$REPO_ROOT/scripts/lib/common.sh"
install_err_trap "setup.sh"
install_cleanup_trap
# shellcheck source=scripts/lib/walkthroughs.sh
source "$REPO_ROOT/scripts/lib/walkthroughs.sh"
# shellcheck source=scripts/lib/local-dev.sh
source "$REPO_ROOT/scripts/lib/local-dev.sh"

if [[ "$DOMAIN_GIVEN" -eq 1 ]]; then
  validate_domain "$DOMAIN"
fi

# ---------------------------------------------------------------------------
# Mode selection (interactive menu when no --mode was given)
# ---------------------------------------------------------------------------

choose_mode() {
  printf '\n%s\n\n' "JASS setup — choose a mode:"
  cat <<'EOF'
  1) Local dev       — install deps, .env, migrate, seed, run
  2) Provision VPS   — one-time server setup (Docker, Caddy, firewall, app)
  3) Redeploy        — update an already-provisioned VPS
EOF
  printf '\n'

  # EOF-safe and bounded: EOF or an empty reply exits 0 cleanly (so piped/
  # non-interactive stdin can never hang or loop), and invalid choices only
  # re-prompt a few times before giving up.
  local reply attempts=0 max_attempts=5
  while true; do
    if ! read -r -p "Choice [1-3]: " reply; then
      printf '\n' >&2
      info "No selection made (stdin closed) — exiting. Re-run with --mode local|provision|deploy to skip the menu."
      exit 0
    fi
    if [[ -z "$reply" ]]; then
      info "No selection made — exiting. Re-run with --mode local|provision|deploy to skip the menu."
      exit 0
    fi
    case "$reply" in
      1) MODE="local";     return 0 ;;
      2) MODE="provision"; return 0 ;;
      3) MODE="deploy";    return 0 ;;
    esac
    attempts=$((attempts + 1))
    if (( attempts >= max_attempts )); then
      die "Too many invalid selections — expected 1, 2, or 3."
    fi
    error "Invalid choice: '$reply' — enter 1, 2, or 3."
  done
}

if [[ -z "$MODE" ]]; then
  choose_mode
fi

# Flag/mode cross-checks (warn-only: the flags are simply ignored).
if [[ "$MODE" != "deploy" && ( "$PULL_FLAG_GIVEN" -eq 1 || "$BUILD_FLAG_GIVEN" -eq 1 ) ]]; then
  warn "--pull/--no-build only apply to deploy mode; ignoring them for mode '$MODE'."
fi
if [[ "$MODE" != "provision" && "$DOMAIN_GIVEN" -eq 1 ]]; then
  warn "--domain only applies to provision mode; ignoring it for mode '$MODE'."
fi

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "$MODE" in
  local)
    run_local_dev
    ;;
  provision)
    if [[ "$DOMAIN_GIVEN" -eq 0 ]]; then
      DOMAIN="$(prompt_default "Domain to deploy for" "justasimpleserver.net")"
      validate_domain "$DOMAIN"
    fi
    # The two manual prerequisites (README steps 1-2 territory) that no
    # script can automate — offer the guided walkthroughs before provisioning.
    if ask_yes_no "Walk through pointing DNS records for $DOMAIN at this VPS first?" "N"; then
      walkthrough_dns "$DOMAIN"
    fi
    if ask_yes_no "Walk through opening ports 80/443 in OVH's Network Firewall?" "N"; then
      walkthrough_ovh_firewall
    fi
    # shellcheck source=scripts/lib/vps-provision.sh disable=SC1091
    source "$REPO_ROOT/scripts/lib/vps-provision.sh"
    # vps-provision.sh consumes RUN_USER (docker-group + backup service owner);
    # the entry point owns it (the vps-setup.sh wrapper sets it identically).
    RUN_USER="$(id -un)"
    run_provision "$DOMAIN"
    ;;
  deploy)
    # run_deploy reads the DO_PULL/DO_BUILD globals set from the flags above,
    # and ends by offering the resource-pack walkthrough (sourced earlier).
    # shellcheck source=scripts/lib/vps-deploy.sh disable=SC1091
    source "$REPO_ROOT/scripts/lib/vps-deploy.sh"
    run_deploy
    ;;
esac
