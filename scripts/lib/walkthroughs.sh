#!/usr/bin/env bash
#
# scripts/lib/walkthroughs.sh — guided walkthroughs for the manual setup steps
# no script can automate: registrar DNS records, OVH's cloud-level Network
# Firewall, and the Minecraft server's server.properties. Each walkthrough
# prints numbered instructions, pauses with an EOF-safe "Press Enter when
# done", then runs an optional best-effort verification (never fatal).
#
# Source-safe: function definitions only, no top-level side effects, guarded
# against double-sourcing. Requires scripts/lib/common.sh to be sourced first
# (info/warn/error/step, ask_yes_no, prompt_default, prompt_validated).

[[ -n "${JASS_LIB_WALKTHROUGHS_SOURCED:-}" ]] && return 0
JASS_LIB_WALKTHROUGHS_SOURCED=1

# Source-safe: no top-level `set -Eeuo pipefail` here. The entry point that
# sources this file (setup.sh) owns shell options, exactly as common.sh,
# vps-provision.sh, and vps-deploy.sh do.

_walkthrough_pause() {
  # EOF-safe pause: with piped/redirected/closed stdin, a read returns
  # immediately instead of hanging (same convention as common.sh's prompt
  # helpers) — print a newline so the next output starts cleanly, and go on.
  local _reply
  if ! read -r -p "Press Enter when done: " _reply; then
    printf '\n' >&2
  fi
  return 0
}

walkthrough_dns() {
  # walkthrough_dns <domain> — registrar-side A/AAAA records for '@' and
  # 'www', then a best-effort resolved-IP vs public-IP comparison.
  local domain="$1"

  step "Walkthrough: DNS records for $domain"
  cat <<EOF

Do this in your domain registrar's DNS zone editor. For a domain managed at
OVH: OVH Control Panel -> Web Cloud -> Domain names -> $domain ->
"DNS Zone" tab.

  1. Find this server's public IPv4 address (shown in the OVH panel next to
     the VPS, or run 'curl -4 ifconfig.me' on the VPS itself).
  2. Add or update an A record for '@' (the bare domain, $domain)
     pointing at that IP.
  3. Add or update an A record for 'www' pointing at the same IP.
  4. If the VPS also has a public IPv6 address, add matching AAAA records for
     '@' and 'www'. Skip this step if unsure.
  5. Save the zone. Propagation can take minutes to hours — Caddy's automatic
     HTTPS cannot issue a certificate until $domain actually resolves to
     this server.

EOF
  _walkthrough_pause

  # Best-effort verification (mirrors vps-setup.sh's DNS check). Bounded: at
  # most 3 services x 5s for the public-IP lookup, and every failure below is
  # a warning only — DNS lag or missing outbound access must never be fatal.
  local public_ip="" resolved_ip="" url
  for url in "https://ifconfig.me" "https://icanhazip.com" "https://api.ipify.org"; do
    public_ip="$(curl -fsS4 --max-time 5 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
    [[ -n "$public_ip" ]] && break
  done

  if command -v dig >/dev/null 2>&1; then
    resolved_ip="$(dig +short "$domain" A 2>/dev/null | tail -n1 || true)"
  elif command -v getent >/dev/null 2>&1; then
    resolved_ip="$(getent ahostsv4 "$domain" 2>/dev/null | awk '{print $1; exit}' || true)"
  fi

  if [[ -z "$public_ip" ]]; then
    warn "Could not determine this machine's public IP (no outbound access to ifconfig.me/icanhazip.com/ipify.org?). Skipping the DNS match check."
  elif [[ -z "$resolved_ip" ]]; then
    warn "'$domain' does not currently resolve to anything. DNS may not be configured or propagated yet — not fatal; verify again later (e.g. 'dig +short $domain')."
  elif [[ "$public_ip" != "$resolved_ip" ]]; then
    warn "'$domain' resolves to $resolved_ip, but this machine's public IP appears to be $public_ip. If the records were just changed this is expected until propagation completes; otherwise re-check the zone edits above."
  else
    info "'$domain' resolves to $resolved_ip, matching this machine's public IP. DNS looks good."
  fi
  return 0
}

walkthrough_ovh_firewall() {
  # OVH's cloud-level Network Firewall sits in front of the VPS, separate
  # from (and in addition to) the host-level ufw that provisioning configures.
  step "Walkthrough: OVH Network Firewall (allow 80/443)"
  cat <<'EOF'

OVH runs its own network-level firewall in front of the VPS, separate from
the host's ufw. It is OFF by default — but if it is (or ever gets) enabled,
it must explicitly allow web traffic or the site will be unreachable from the
internet even with ufw open and Caddy running.

  1. Open the OVH Control Panel (ovh.com) and log in.
  2. Go to: Bare Metal Cloud -> Virtual Private Servers -> select this VPS.
  3. Open the VPS's IP block (the "IPs" tab).
  4. Click the gear icon next to the VPS's public IP.
  5. Choose "Manage firewall".
  6. If the firewall shows as disabled: nothing to do — either leave it
     disabled, or if you enable it, continue with step 7.
  7. If enabled: add rules to ACCEPT TCP port 80 and TCP port 443 — and make
     sure your SSH port stays allowed — then confirm/apply the rules.

This is in addition to the host firewall (ufw), which the provision step
configures automatically.

EOF
  _walkthrough_pause
  info "No automated verification is possible here: the OVH network firewall sits in front of the VPS, so it cannot be inspected from this machine. If the site is later unreachable from the internet despite Caddy running, check this firewall first."
  return 0
}

walkthrough_resource_pack() {
  # walkthrough_resource_pack — query the live resource-pack meta endpoint and
  # print ready-to-paste server.properties lines with the actual sha1, or
  # explain how to publish a pack first. Domain precedence: the $DOMAIN global
  # (set by provision mode / --domain), then an interactive prompt.
  local domain
  if [[ -n "${DOMAIN:-}" ]]; then
    domain="$DOMAIN"
  else
    # Same hostname shape common.sh's validate_domain enforces; re-prompts
    # on invalid input instead of dying (this runs after a successful
    # deploy, so a typo should not abort the script). EOF-safe: the default
    # matches the regex.
    domain="$(prompt_validated "Site domain" "justasimpleserver.net" \
      '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' \
      "Must be a valid hostname like example.com (letters, digits, hyphens and dots only)")"
  fi

  step "Walkthrough: point server.properties at the hosted resource pack"

  local meta_url="https://$domain/api/resource-pack/meta"
  info "Checking for an active resource pack: curl -fsS $meta_url"
  local meta_json=""
  meta_json="$(curl -fsS --max-time 10 "$meta_url" 2>/dev/null || true)"

  # Extract the sha1 without requiring jq (use it only if present). The API
  # envelope is {"data":{"filename":...,"size":...,"sha1":"<40 hex>",...}} or
  # {"data":null} when no pack is active.
  local sha1=""
  if [[ -n "$meta_json" ]]; then
    if command -v jq >/dev/null 2>&1; then
      sha1="$(printf '%s' "$meta_json" | jq -r '.data.sha1 // empty' 2>/dev/null || true)"
    else
      sha1="$(printf '%s' "$meta_json" \
        | grep -o '"sha1"[[:space:]]*:[[:space:]]*"[0-9a-fA-F]\{40\}"' \
        | head -n1 \
        | sed -E 's/.*"([0-9a-fA-F]{40})".*/\1/' || true)"
    fi
    # Defensive: only accept a value that actually looks like a sha1.
    [[ "$sha1" =~ ^[0-9a-fA-F]{40}$ ]] || sha1=""
  fi

  if [[ -z "$sha1" ]]; then
    if [[ -z "$meta_json" ]]; then
      warn "Could not fetch $meta_url — the site may be unreachable from here, or HTTPS may not be up yet."
    else
      warn "No active resource pack is published yet (the meta endpoint returned no pack)."
    fi
    cat <<EOF

To publish a pack first:

  1. Log in at https://$domain/login and turn on Edit mode (header toggle).
  2. Go to https://$domain/resource — the resource-pack page shows an
     upload/manage panel in edit mode.
  3. Upload your resource-pack .zip and activate it.
  4. Re-run this walkthrough (it is offered again after every
     './setup.sh --mode deploy').

EOF
    return 0
  fi

  info "Active pack found (sha1: $sha1)."
  cat <<EOF

On the Minecraft server host:

  1. Stop the Minecraft server (or plan a restart at the end).
  2. Open server.properties and set these two lines exactly:

       resource-pack=https://$domain/api/resource-pack
       resource-pack-sha1=$sha1

  3. Optional: also set 'require-resource-pack=true' to force players to
     accept the pack (clients that decline are disconnected).
  4. Start the Minecraft server again.
  5. Join with a vanilla client — you should be prompted to download the pack.

Note: the sha1 line must be updated every time a new pack is activated on the
site (re-run this walkthrough to get the current value).

EOF
  _walkthrough_pause
  info "If clients fail to download the pack, re-check the two lines above and confirm 'curl -I https://$domain/api/resource-pack' returns HTTP 200."
  return 0
}

offer_resource_pack_walkthrough() {
  # Called by run_deploy (scripts/lib/vps-deploy.sh) after a successful
  # deploy, guarded there with `declare -F` so the wrappers that don't source
  # this file still work.
  if ask_yes_no "Walk through pointing server.properties at the resource pack?" "N"; then
    walkthrough_resource_pack
  fi
  return 0
}
