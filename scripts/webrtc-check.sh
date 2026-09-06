#!/usr/bin/env bash
# ==============================================================================
# Headless WebRTC decode test — no webapp, no build.
#
#   ./scripts/webrtc-check.sh <stream-name> [wait-seconds]
#   ./scripts/webrtc-check.sh                       # list available streams
#   ./scripts/webrtc-check.sh --all [wait-seconds]  # test every stream
#
# Drives real headless Chrome against services/go2rtc/www/webrtc-test.html — the
# exact decode path the browser LivePlayer uses. Prints a JSON verdict
# (state=pass|fail, resolution, framesDecoded, decodeFps, ttffMs, codec,
# transport), writes a screenshot, exit 0 = video decoded.
#
# Env overrides: GATEWAY (default http://localhost:8088), CHROME, PORT, SHOT.
# ==============================================================================
set -uo pipefail

ARG1="${1:-}"
WAIT="${2:-12}"
GATEWAY="${GATEWAY:-http://localhost:8088}"
PORT="${PORT:-9222}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SHOT="${SHOT:-/tmp/webrtc-check.png}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -x "$CHROME" ] || { echo "Chrome not found: $CHROME  (set CHROME=/path/to/chrome)"; exit 1; }

# --- ensure a Node with global WebSocket (>= 21); auto-switch via nvm if needed ---
have_ws() { command -v node >/dev/null && [ "$(node -e 'process.stdout.write(typeof WebSocket)' 2>/dev/null)" = function ]; }
if ! have_ws && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"; nvm use 24 >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
fi
have_ws || { echo "need Node >= 21 (global WebSocket). Try: nvm use 24"; exit 1; }

if [ -z "$ARG1" ]; then
  echo "streams on $GATEWAY:"
  curl -s "$GATEWAY/webrtc/api/streams" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{Object.keys(JSON.parse(s)).sort().forEach(k=>console.log("  "+k))}catch{console.log("  (none / go2rtc unreachable)")}})'
  echo
  echo "usage: $0 <stream-name> [wait-seconds]   |   $0 --all"
  exit 0
fi

PROFILE_DIR="$(mktemp -d)"
CHROME_PID=""
cleanup() { [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null; wait 2>/dev/null; rm -rf "$PROFILE_DIR"; }
trap cleanup EXIT INT TERM

# Real Chrome by default — headless Chrome's software H.264/WebRTC decode is
# flaky and gives false FAILs. It opens a window for ~20s then closes.
# HEADLESS=1 forces headless (best-effort, CI).
HL=""; [ "${HEADLESS:-0}" = 1 ] && HL="--headless=new --disable-gpu"
# shellcheck disable=SC2086
"$CHROME" $HL --no-first-run --no-default-browser-check --disable-features=Translate \
  --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream \
  --user-data-dir="$PROFILE_DIR" --remote-debugging-port="$PORT" \
  --window-size=1360,900 --window-position=60,60 "about:blank" >/dev/null 2>&1 &
CHROME_PID=$!

# wait for the CDP endpoint
for _ in $(seq 1 40); do
  curl -sf "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && break
  sleep 0.25
done

if [ "$ARG1" = "--all" ]; then
  PAGE="$GATEWAY/webrtc/webrtc-test.html?all=1"
  echo "→ testing ALL streams  (~${WAIT}s each)"
  node "$HERE/webrtc-check.mjs" "$PORT" "$PAGE" 999 "$SHOT" --all
  RC=$?
else
  ENC=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$ARG1")
  PAGE="$GATEWAY/webrtc/webrtc-test.html?src=$ENC&auto=1"
  echo "→ testing '$ARG1'  (${WAIT}s)"
  node "$HERE/webrtc-check.mjs" "$PORT" "$PAGE" "$WAIT" "$SHOT"
  RC=$?
fi

# sweep any throwaway streams the page registered (Chrome is killed before its cleanup runs)
curl -s "$GATEWAY/webrtc/api/streams" 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{Object.keys(JSON.parse(s)).filter(k=>k.startsWith("wtest_")).forEach(k=>console.log(k))}catch{}})' \
  | while read -r n; do curl -s -X DELETE "$GATEWAY/webrtc/api/streams?src=$n" -o /dev/null; done

echo
echo "screenshot: $SHOT"
[ "$RC" -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL (rc=$RC)"
exit $RC
