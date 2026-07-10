#!/usr/bin/env bash
# shellcheck shell=bash
#
# scripts/lib/common.sh — helpers shared by every setup/deploy mode (logging,
# traps, prompt helpers, validators, secret generation, apt wrapper).
#
# This file is SOURCED, never executed. It is source-safe: beyond defining
# functions (and the read-only color detection + a safe TMP_ENV_FILE default)
# it has no top-level side effects. In particular it does NOT change shell
# options and does NOT install traps — the sourcing entry point owns
# `set -Eeuo pipefail` and opts into traps via install_cleanup_trap /
# install_err_trap below.
#
# Everything here was extracted verbatim from scripts/vps-setup.sh during the
# Phase 11 refactor (vps-setup.sh's copies were the more defensive of the two
# VPS scripts' duplicated helpers). Do not "improve" bodies here without
# checking both callers.

# Guard against double-sourcing (setup.sh and the back-compat wrappers may
# both source this).
[[ -n "${_JASS_COMMON_LOADED:-}" ]] && return 0
_JASS_COMMON_LOADED=1

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
#
# Traps are NOT installed at source time — the entry point calls
# install_cleanup_trap / install_err_trap explicitly.
# ---------------------------------------------------------------------------

TMP_ENV_FILE=""
_cleanup() {
  [[ -n "${TMP_ENV_FILE:-}" && -e "${TMP_ENV_FILE:-}" ]] && rm -f "$TMP_ENV_FILE"
  return 0
}

install_cleanup_trap() {
  # Installs the EXIT trap that removes a half-written $TMP_ENV_FILE. Needed
  # by any mode that writes an env file (provisioning, local dev).
  trap _cleanup EXIT
}

install_err_trap() {
  # install_err_trap <script-name> — installs the ERR trap, naming the entry
  # point in the failure message. The name is expanded once, now (it comes
  # from our own entry-point scripts, never from user input); ${LINENO} and
  # $rc stay single-quoted so they expand when the trap fires.
  local script_name="$1"
  # shellcheck disable=SC2064  # early expansion of script_name is intentional
  trap 'rc=$?; error "'"$script_name"' hit an unexpected failure at line ${LINENO} (exit ${rc}). Nothing here is destructive; the script is safe to re-run once the cause above is resolved."' ERR
}

# ---------------------------------------------------------------------------
# xtrace guards. These scripts never enable `set -x`, but if someone runs one
# as `bash -x ...` we must not leak the AUTH_SECRET or the OWNER
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
