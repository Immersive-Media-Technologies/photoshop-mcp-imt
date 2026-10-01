#!/bin/bash
# PS-MCP-IMT — install on macOS.
#   ./install.sh            check → build → live self-test → write client configs (asks first)
#   ./install.sh --yes      same, without questions
#   ./install.sh --no-config   check, build and self-test only; print the config instead
# Nothing is installed into Photoshop by this script; the optional UXP panel plugin is a
# separate step (README → «The UXP bridge»). Removing this folder removes the server.
set -u
YES=0; NOCONF=0
for a in "$@"; do case "$a" in --yes|-y) YES=1;; --no-config) NOCONF=1;; esac; done
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAIL=0
say()  { printf '%s\n' "$*"; }
ok()   { printf '%s  ok  %s%s\n' "$GRN" "$OFF" "$*"; }
warn() { printf '%s warn %s%s\n' "$YEL" "$OFF" "$*"; }
bad()  { printf '%s FAIL %s%s\n' "$RED" "$OFF" "$*"; FAIL=1; }
ask()  { [ "$YES" = "1" ] && return 0; printf '%s [y/N] ' "$1"; read -r r; [ "$r" = "y" ] || [ "$r" = "Y" ]; }

say ""; say "PS-MCP-IMT — environment check"; say "─────────────────────────────────────────────"
if [ "$(uname -s)" != "Darwin" ]; then bad "this script is for macOS (found: $(uname -s)); on Windows run install.ps1"; else ok "macOS $(sw_vers -productVersion)"; fi

PS_APP=""
for d in /Applications/Adobe\ Photoshop\ 2026/Adobe\ Photoshop\ 2026.app /Applications/Adobe\ Photoshop\ 2025/Adobe\ Photoshop\ 2025.app /Applications/Adobe\ Photoshop\ 2024/Adobe\ Photoshop\ 2024.app; do
  [ -d "$d" ] && { PS_APP="$d"; break; }
done
if [ -z "$PS_APP" ]; then
  PS_APP="$(ls -d /Applications/Adobe\ Photoshop*/Adobe\ Photoshop*.app 2>/dev/null | sort | tail -1)"
fi
[ -n "$PS_APP" ] && ok "Photoshop: $PS_APP" || bad "Photoshop not found in /Applications (2024–2026 supported)"

# Node by absolute path: a GUI client (Claude Desktop, Cursor) does not see nvm's PATH.
NODE_BIN=""
for n in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node "$(command -v node 2>/dev/null)"; do
  [ -n "$n" ] && [ -x "$n" ] || continue
  major="$("$n" -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')"
  [ -n "$major" ] && [ "$major" -ge 18 ] 2>/dev/null && { NODE_BIN="$n"; break; }
done
if [ -z "$NODE_BIN" ]; then
  bad "Node.js >= 18 not found (checked /opt/homebrew/bin, /usr/local/bin, /usr/bin, PATH)"
  say "${DIM}     install: brew install node   — or use the Claude Desktop extension (.mcpb), which needs no Node${OFF}"
else
  ok "Node $("$NODE_BIN" -v) — $NODE_BIN"
fi
[ "$FAIL" = "1" ] && { say ""; say "${RED}Stopped.${OFF}"; exit 1; }

say ""; say "Build"; say "─────────────────────────────────────────────"
cd "$HERE" || exit 1
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1
else npm install --no-audit --no-fund >/dev/null 2>&1; fi
[ -d node_modules ] && ok "dependencies installed" || { bad "npm install failed"; exit 1; }
npm run build >/dev/null 2>&1
[ -f dist/index.js ] && ok "server built: dist/index.js" || { bad "build produced no dist/index.js"; exit 1; }
[ -f dist/uxp/deepartisan-ps-bridge.ccx ] && ok "UXP plugin packed: dist/uxp/deepartisan-ps-bridge.ccx"

say ""; say "Live check against Photoshop"; say "─────────────────────────────────────────────"
if ! pgrep -f "Adobe Photoshop" >/dev/null 2>&1; then
  warn "Photoshop is not running — skipping the live check (start it and run ./install.sh again)"
else
  OUT="$(PS_MCP_UXP=1 "$NODE_BIN" "$HERE/tools/selftest.mjs" 2>/dev/null)"
  if printf '%s' "$OUT" | grep -q '"ok": *true'; then
    ok "Photoshop answers: $(printf '%s' "$OUT" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)"
    printf '%s' "$OUT" | grep -q '"uxp": *"ok"' && ok "UXP bridge: plugin is polling" || warn "UXP bridge: plugin not seen (optional — README → «The UXP bridge»)"
  else
    bad "Photoshop did not answer"; printf '%s\n' "$OUT" | head -12
    say "${DIM} • macOS asks once for Automation permission (System Settings → Privacy & Security → Automation);${OFF}"
    say "${DIM}   AppleScript error -1743 means it was denied — allow the terminal / client app to control Photoshop.${OFF}"
    say "${DIM} • A modal dialog in Photoshop blocks scripting — close it and retry.${OFF}"
  fi
fi

SERVER_JSON="{
      \"command\": \"$NODE_BIN\",
      \"args\": [\"$HERE/dist/index.js\"],
      \"env\": { \"PS_MCP_FACADE\": \"1\", \"PS_MCP_UXP\": \"1\" }
    }"
say ""; say "Connect"; say "─────────────────────────────────────────────"
if [ "$NOCONF" = "1" ]; then
  say "Add to your client's MCP config:"; say ""; say "  \"mcpServers\": { \"photoshop\": $SERVER_JSON }"; say ""
else
  # write_config <file> <label>: inserts/replaces mcpServers.photoshop, keeps everything else, backs up first
  write_config() {
    f="$1"; label="$2"
    if ask "Add the server to $label ($f)?"; then
      mkdir -p "$(dirname "$f")"
      [ -f "$f" ] && cp "$f" "$f.bak-$(date +%Y%m%d-%H%M%S)"
      "$NODE_BIN" - "$f" "$NODE_BIN" "$HERE/dist/index.js" <<'NODE'
const fs = require('fs'); const [file, node, entry] = process.argv.slice(2);
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers.photoshop = { command: node, args: [entry], env: { PS_MCP_FACADE: '1', PS_MCP_UXP: '1' } };
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
NODE
      ok "$label: mcpServers.photoshop written (restart $label)"
    fi
  }
  write_config "$HOME/Library/Application Support/Claude/claude_desktop_config.json" "Claude Desktop"
  write_config "$HOME/.cursor/mcp.json" "Cursor"
  say ""
  say "Other clients: \"mcpServers\": { \"photoshop\": $SERVER_JSON }"
fi
say ""
say "${DIM}Start with a copy of a real document: the agent edits what is open. The optional UXP panel${OFF}"
say "${DIM}plugin (dist/uxp/deepartisan-ps-bridge.ccx) keeps reads, save and export working while Photoshop is modal.${OFF}"
say ""
