#!/usr/bin/env bash
#
# scripts/lib/local-dev.sh — "local dev" mode for setup.sh: walks a fresh
# checkout to a running `npm run dev` server. Every step is idempotent and
# prints SKIP (via info) when already satisfied, so re-running is always safe;
# an existing .env is never touched.
#
# Bakes in this machine's known Node V8 crash workarounds (see CLAUDE.md,
# "Known environment issue"): NODE_OPTIONS=--jitless retry for npm install,
# and the `node --no-turbofan node_modules/prisma/build/index.js` fallback for
# Prisma CLI commands (jitless breaks the WASM Prisma needs, so the two
# workarounds are deliberately different).
#
# Source-safe: function definitions only, no top-level side effects, guarded
# against double-sourcing. Requires scripts/lib/common.sh sourced first, and
# the caller (setup.sh) to have set REPO_ROOT and installed the cleanup trap
# (this file assigns the TMP_ENV_FILE global that trap cleans up).

[[ -n "${JASS_LIB_LOCAL_DEV_SOURCED:-}" ]] && return 0
JASS_LIB_LOCAL_DEV_SOURCED=1

# Source-safe: no top-level `set -Eeuo pipefail` here. The entry point that
# sources this file (setup.sh) owns shell options, exactly as common.sh,
# vps-provision.sh, and vps-deploy.sh do.

readonly JASS_MIN_NODE_MAJOR=20

# ---------------------------------------------------------------------------
# Step 1: Node >= 20
# ---------------------------------------------------------------------------

_local_dev_check_node() {
  step "Node.js >= ${JASS_MIN_NODE_MAJOR}"

  if ! command -v node >/dev/null 2>&1; then
    error "'node' was not found on PATH."
    error "Install Node ${JASS_MIN_NODE_MAJOR}+ first — either via nvm (https://github.com/nvm-sh/nvm)"
    error "or your distro's packages (e.g. NodeSource apt repo on Ubuntu/Debian), then re-run."
    die "Node.js is required for local development."
  fi

  local version major
  version="$(node --version 2>/dev/null || true)"
  major="${version#v}"
  major="${major%%.*}"
  if ! [[ "$major" =~ ^[0-9]+$ ]] || (( 10#$major < JASS_MIN_NODE_MAJOR )); then
    error "Node ${JASS_MIN_NODE_MAJOR}+ is required, but 'node --version' reports '${version:-unknown}'."
    error "Upgrade via nvm (https://github.com/nvm-sh/nvm) or your distro's packages, then re-run."
    die "Node.js version too old."
  fi
  info "Node $version detected — OK."
}

# ---------------------------------------------------------------------------
# Step 2: npm install (idempotent; V8-crash retry)
# ---------------------------------------------------------------------------

_local_dev_npm_install() {
  step "npm install"

  info "Running 'npm install' (idempotent — fast when node_modules is already current)..."
  if npm install; then
    return 0
  fi

  warn "'npm install' failed. This machine has a known Node V8 crash (InductionVariablePhiTypeIsPrefixedPoint — see CLAUDE.md's 'Known environment issue')."
  warn "Retrying ONCE with NODE_OPTIONS=\"--jitless\": this disables the JIT, which is fine for npm install but breaks WebAssembly — which is why the Prisma steps below use a separate --no-turbofan fallback instead of reusing this."
  if ! NODE_OPTIONS="--jitless" npm install; then
    die "'npm install' failed even with NODE_OPTIONS=--jitless. See the errors above — this is a real install failure, not the known V8 crash."
  fi
  info "npm install succeeded with the --jitless workaround."
}

# ---------------------------------------------------------------------------
# Step 3: .env (atomic creation; never touches an existing file)
# ---------------------------------------------------------------------------

_local_dev_env_file() {
  step ".env"

  local env_file="$REPO_ROOT/.env"
  if [[ -f "$env_file" ]]; then
    info "SKIP: $env_file already exists; leaving it (and its secrets) untouched."
    return 0
  fi

  info "About to create $env_file from .env.example..."

  # Build the file in a private temp file in the same directory and only
  # rename it into place once EVERY value is populated — the same atomic
  # mktemp(0600) -> mv pattern as vps-setup.sh's .env.production step. If the
  # script dies partway there is no half-written .env for a re-run to see and
  # skip; the temp file is cleaned up by common.sh's EXIT trap (TMP_ENV_FILE
  # is the global that trap watches).
  TMP_ENV_FILE="$(mktemp "$REPO_ROOT/.env.XXXXXX")" || die "Could not create a temp file next to $env_file (is $REPO_ROOT writable?)."
  chmod 600 "$TMP_ENV_FILE"
  cp "$REPO_ROOT/.env.example" "$TMP_ENV_FILE" || die "Failed to copy .env.example into place."
  chmod 600 "$TMP_ENV_FILE"

  info "Generating a fresh AUTH_SECRET..."
  hide_xtrace
  AUTH_SECRET_VALUE="$(generate_auth_secret)" || { restore_xtrace; die "Failed to generate AUTH_SECRET (needs 'node' on PATH — the Node check above should have caught this)."; }
  if [[ -z "$AUTH_SECRET_VALUE" ]]; then
    restore_xtrace
    die "AUTH_SECRET generation produced an empty value; refusing to write an insecure .env."
  fi
  set_env_var "$TMP_ENV_FILE" "AUTH_SECRET" "$AUTH_SECRET_VALUE"
  unset AUTH_SECRET_VALUE
  restore_xtrace

  local mc_host mc_port
  mc_host="$(prompt_validated "MC_SERVER_HOST" "localhost" \
    '^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$' \
    "MC_SERVER_HOST must be a hostname or IP (letters, digits, dots, hyphens; no spaces or special characters)")"
  set_env_var "$TMP_ENV_FILE" "MC_SERVER_HOST" "$mc_host"

  mc_port=""
  while true; do
    mc_port="$(prompt_default "MC_SERVER_PORT" "25565")"
    if is_valid_port "$mc_port"; then
      break
    fi
    error "MC_SERVER_PORT must be an integer in the range 1-65535 (got: '$mc_port')."
  done
  set_env_var "$TMP_ENV_FILE" "MC_SERVER_PORT" "$mc_port"

  # All values are in place — publish atomically.
  chmod 600 "$TMP_ENV_FILE"
  mv -f "$TMP_ENV_FILE" "$env_file" || die "Failed to move the completed env file into place at $env_file."
  TMP_ENV_FILE=""

  info "$env_file written. DATABASE_URL is left at the .env.example default (file:./prisma/dev.db)."
}

# ---------------------------------------------------------------------------
# Step 4: Prisma generate + migrate dev (with the V8-crash fallback)
# ---------------------------------------------------------------------------

_local_dev_run_prisma() {
  # _local_dev_run_prisma <prisma args...> — try `npx prisma ...` first,
  # capturing output (tee, so the user still sees it live). If it fails with
  # this machine's V8 crash signature, fall back to invoking the Prisma JS
  # entry directly with --no-turbofan (per CLAUDE.md: --no-turbofan is not
  # allowlisted for NODE_OPTIONS, so it must be passed to `node` on the actual
  # entry file, not via npx). A failure WITHOUT the signature is a real error
  # and dies with the real output.
  local log_file
  log_file="$(mktemp)" || die "Could not create a temp file to capture prisma output."

  info "About to run: npx prisma $*"
  if npx prisma "$@" 2>&1 | tee "$log_file"; then
    rm -f "$log_file"
    return 0
  fi

  if grep -qE 'InductionVariablePhiTypeIsPrefixedPoint|V8 [Ff]atal|Fatal error' "$log_file"; then
    rm -f "$log_file"
    warn "'npx prisma $*' hit this machine's known V8 crash (see CLAUDE.md's 'Known environment issue')."
    warn "Falling back to: node --no-turbofan node_modules/prisma/build/index.js $*"
    if ! node --no-turbofan node_modules/prisma/build/index.js "$@"; then
      die "'prisma $*' failed even via the node --no-turbofan fallback. See the output above."
    fi
    return 0
  fi

  rm -f "$log_file"
  die "'npx prisma $*' failed, and the failure is not the known V8 crash. See the real error above."
}

_local_dev_prisma() {
  step "Prisma client + migrations"

  _local_dev_run_prisma generate
  # No migration name is passed on purpose: the repo ships committed
  # migrations, so on a fresh DB `migrate dev` just applies them — it only
  # prompts for a name when it has to create a NEW migration from schema
  # drift, which a clean checkout doesn't have.
  _local_dev_run_prisma migrate dev
}

# ---------------------------------------------------------------------------
# Step 5: seed (guarded on a pre-existing DB)
# ---------------------------------------------------------------------------

_local_dev_seed() {
  # _local_dev_seed <db_was_fresh:true|false> — freshness is measured BEFORE
  # `migrate dev` runs (which always creates/updates prisma/dev.db), so this
  # distinguishes a brand-new DB from one that may hold real content.
  local db_was_fresh="$1"

  step "Seed placeholder content"

  if [[ "$db_was_fresh" == true ]]; then
    info "Fresh database — loading placeholder content (npm run db:seed)..."
    npm run db:seed || die "'npm run db:seed' failed. See the output above and re-run: npm run db:seed"
    return 0
  fi

  warn "prisma/dev.db already existed before this run — it may hold real admin-edited content."
  warn "'npm run db:seed' OVERWRITES ContentBlock/Rule/Feature/Post rows back to placeholder text."
  if ask_yes_no "Run 'npm run db:seed' anyway?" "N"; then
    npm run db:seed || die "'npm run db:seed' failed. See the output above and re-run: npm run db:seed"
  else
    info "SKIP: seeding skipped. For just the safe pages/nav portion, run: npm run db:seed -- --pages-only"
  fi
}

# ---------------------------------------------------------------------------
# Step 6: first OWNER account (optional; mirrors vps-setup.sh step 9)
# ---------------------------------------------------------------------------

_local_dev_owner_account() {
  step "First OWNER account"

  if ! ask_yes_no "Create/update an OWNER account now?" "N"; then
    info "Skipped. Run this later with:"
    info "  npm run create-admin -- <email> <password> --role OWNER"
    return 0
  fi

  # Email — required, no safe default. Loop until it has a basic name@host.tld
  # shape; fail fast (rather than hang or loop forever) if stdin is exhausted.
  local owner_email=""
  while true; do
    if ! read -r -p "Email: " owner_email; then
      printf '\n' >&2
      die "Could not read an email address — stdin is not interactive. Create the OWNER account later with: npm run create-admin -- <email> <password> --role OWNER"
    fi
    if [[ "$owner_email" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
      break
    fi
    error "That does not look like a valid email address (expected something like name@example.com). Try again."
  done

  # Password — required, secret. hide_xtrace so it never lands in a `bash -x`
  # trace; unlike the prompts, the guard here stays on THROUGH the
  # create-admin invocation below, because the password is passed as a
  # command-line argument and xtrace would otherwise print the expanded
  # command. The values are quoted at the call site and never pass through
  # eval or a second round of shell parsing, so a password containing $(...),
  # a backtick, or a quote is treated as a literal string.
  local owner_password="" owner_password_confirm=""
  hide_xtrace
  while true; do
    if ! IFS= read -r -s -p "Password (min 8 characters): " owner_password; then
      printf '\n' >&2
      restore_xtrace
      die "Could not read a password — stdin is not interactive. Create the OWNER account later with: npm run create-admin -- <email> <password> --role OWNER"
    fi
    printf '\n' >&2
    if ! IFS= read -r -s -p "Confirm password: " owner_password_confirm; then
      printf '\n' >&2
      restore_xtrace
      die "Could not read the password confirmation — stdin is not interactive."
    fi
    printf '\n' >&2
    if [[ "$owner_password" != "$owner_password_confirm" ]]; then
      error "Passwords did not match. Try again."
      continue
    fi
    if [[ "${#owner_password}" -lt 8 ]]; then
      error "Password must be at least 8 characters long. Try again."
      continue
    fi
    break
  done

  info "About to run: npm run create-admin -- $owner_email <password> --role OWNER"
  npm run create-admin -- "$owner_email" "$owner_password" --role OWNER \
    || { restore_xtrace; die "'npm run create-admin' failed. Retry later with: npm run create-admin -- <email> <password> --role OWNER"; }
  unset owner_password owner_password_confirm
  restore_xtrace
}

# ---------------------------------------------------------------------------
# Step 7: uploads dir (local resource-pack storage)
# ---------------------------------------------------------------------------

_local_dev_uploads_dir() {
  step "Uploads directory"

  if [[ -d "$REPO_ROOT/uploads" ]]; then
    info "SKIP: uploads/ already exists."
    return 0
  fi
  mkdir -p "$REPO_ROOT/uploads" || die "Failed to create $REPO_ROOT/uploads."
  info "Created uploads/ (resource-pack storage; override with UPLOADS_DIR in .env)."
}

# ---------------------------------------------------------------------------
# Step 8: offer to start the dev server
# ---------------------------------------------------------------------------

_local_dev_dev_server() {
  step "Dev server"

  if ask_yes_no "Start the dev server now (npm run dev)?" "Y"; then
    info "Starting: npm run dev — http://localhost:3000 (Ctrl-C stops it)."
    # exec replaces this shell so Ctrl-C, signals, and exit codes belong to
    # the dev server directly instead of a wrapper script.
    exec npm run dev
  fi
  info "All set. Start the dev server any time with: npm run dev"
}

# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

run_local_dev() {
  : "${REPO_ROOT:?REPO_ROOT must be set before run_local_dev (source this via setup.sh)}"

  _local_dev_check_node
  _local_dev_npm_install
  _local_dev_env_file

  # Record DB freshness BEFORE `migrate dev` creates/updates the file, so the
  # seed step can tell a brand-new DB from one that may hold real content.
  local db_was_fresh=false
  [[ -s "$REPO_ROOT/prisma/dev.db" ]] || db_was_fresh=true

  _local_dev_prisma
  _local_dev_seed "$db_was_fresh"
  _local_dev_owner_account
  _local_dev_uploads_dir
  _local_dev_dev_server
}
