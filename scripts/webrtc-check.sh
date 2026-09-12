#!/usr/bin/env bash
# ==============================================================================
# Headless WebRTC decode test — no webapp, no build.
#
#   ./scripts/webrtc-check.sh <stream-name> [wait-seconds]   # app defaults to "live"
#   ./scripts/webrtc-check.sh <app>/<stream-name> [wait-seconds]
#   ./scripts/webrtc-check.sh                       # list available streams
#   ./scripts/webrtc-check.sh --all [wait-seconds]  # test every stream
#
# Drives real headless Chrome against ZLMediaKit's own bundled test player
# (webrtc/index.html) — the exact decode path the browser LivePlayer uses.
# Prints a JSON verdict (state=pass|fail, resolution, framesDecoded, decodeFps,
# ttffMs, connectionState), writes a screenshot, exit 0 = video decoded.
#
# Connects to webrtc-service DIRECTLY (ZLM_URL, default http://localhost:18080
# — published only by the local-dev docker-compose.override.yml, not in
# production) rather than through the API gateway's /webrtc proxy: the gateway
# requires a verified client API key or M2M header on every request, including
# the ones ZLMediaKit's own JS makes internally, which this standalone script
# has no clean way to inject. This is a decode smoke-test, not an auth test.
#
# Env overrides: ZLM_URL, CHROME, PORT, SHOT,
# ZLM_SECRET (must match [api] secret in services/zlmediakit/config.ini).
# ==============================================================================
set -uo pipefail

ARG1="${1:-}"
WAIT="${2:-12}"
ZLM_URL="${ZLM_URL:-http://localhost:18080}"
PORT="${PORT:-9222}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
SHOT="${SHOT:-/tmp/webrtc-check.png}"
ZLM_SECRET="${ZLM_SECRET:-hubsight-zlm-internal-secret}"
HERE="$(cd "$(dirname "$0")" && pwd)"

[ -x "$CHROME" ] || { echo "Chrome not found: $CHROME  (set CHROME=/path/to/chrome)"; exit 1; }

# --- ensure a Node with global WebSocket (>= 21); auto-switch via nvm if needed ---
have_ws() { command -v node >/dev/null && [ "$(node -e 'process.stdout.write(typeof WebSocket)' 2>/dev/null)" = function ]; }
if ! have_ws && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"; nvm use 24 >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || true
fi
have_ws || { echo "need Node >= 21 (global WebSocket). Try: nvm use 24"; exit 1; }

list_streams() {
  curl -s "$ZLM_URL/index/api/getMediaList?secret=$ZLM_SECRET" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
        try{
          const j=JSON.parse(s);
          const seen=new Set();
          (j.data||[]).forEach(m=>{const k=m.app+"/"+m.stream; if(!seen.has(k)){seen.add(k); console.log("  "+k);}});
          if(!seen.size) console.log("  (none registered)");
        }catch{console.log("  (none / ZLMediaKit unreachable — is docker-compose.override.yml publishing port 18080?)")}
      })'
}

if [ -z "$ARG1" ]; then
  echo "streams on $ZLM_URL (app/stream):"
  list_streams
  echo
  echo "usage: $0 <stream-name>|<app>/<stream-name> [wait-seconds]   |   $0 --all"
  exit 0
fi

run_one() {
  local appstream="$1" wait_s="$2" shot="$3"
  local app="live" stream="$appstream"
  case "$appstream" in
    */*) app="${appstream%%/*}"; stream="${appstream#*/}" ;;
  esac

  PROFILE_DIR="$(mktemp -d)"
  CHROME_PID=""
  cleanup() { [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null; wait 2>/dev/null; rm -rf "$PROFILE_DIR"; }
  trap cleanup EXIT INT TERM

  # Real Chrome by default — headless Chrome's software H.264/WebRTC decode is
  # flaky and gives false FAILs. It opens a window for ~20s then closes.
  # HEADLESS=1 forces headless (best-effort, CI).
  HL=""; [ "${HEADLESS:-0}" = 1 ] && HL="--headless=new --disable-gpu"
  # shellcheck disable=SC2086
  # ZLMediaKit's demo page captures local camera/mic unconditionally (its
  # useCamera/audioEnable/videoEnable checkboxes default on regardless of
  # type=play) — fake-device flag lets getUserMedia succeed with no real
  # hardware/permission grant, even though we only care about the play side.
  "$CHROME" $HL --no-first-run --no-default-browser-check --disable-features=Translate \
    --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream \
    --use-fake-device-for-media-stream \
    --user-data-dir="$PROFILE_DIR" --remote-debugging-port="$PORT" \
    --window-size=1360,900 --window-position=60,60 "about:blank" >/dev/null 2>&1 &
  CHROME_PID=$!

  for _ in $(seq 1 40); do
    curl -sf "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && break
    sleep 0.25
  done

  local enc_app enc_stream
  enc_app=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$app")
  enc_stream=$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$stream")
  PAGE="$ZLM_URL/webrtc/index.html?app=$enc_app&stream=$enc_stream&type=play"
  echo "→ testing '$app/$stream'  (${wait_s}s)"
  node "$HERE/webrtc-check.mjs" "$PORT" "$PAGE" "$wait_s" "$shot"
  local rc=$?
  cleanup
  trap - EXIT INT TERM
  return $rc
}

if [ "$ARG1" = "--all" ]; then
  # Portable read (no `mapfile`/`readarray` — macOS ships bash 3.2 by default).
  STREAMS=()
  while IFS= read -r line; do
    [ -n "$line" ] && STREAMS+=("$line")
  done < <(list_streams | sed 's/^  //' | grep -v '^(none')
  if [ "${#STREAMS[@]}" -eq 0 ]; then
    echo "no streams registered on $ZLM_URL"
    exit 1
  fi
  echo "→ testing ALL ${#STREAMS[@]} stream(s)  (~${WAIT}s each)"
  PASS=0
  for s in "${STREAMS[@]}"; do
    shot="/tmp/webrtc-check-$(echo "$s" | tr '/' '_').png"
    if run_one "$s" "$WAIT" "$shot"; then
      echo "  ✅ PASS  $s"
      PASS=$((PASS + 1))
    else
      echo "  ❌ FAIL  $s"
    fi
  done
  echo
  echo "$PASS/${#STREAMS[@]} passed"
  [ "$PASS" -eq "${#STREAMS[@]}" ]
  exit $?
fi

run_one "$ARG1" "$WAIT" "$SHOT"
RC=$?
echo
echo "screenshot: $SHOT"
[ "$RC" -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL (rc=$RC)"
exit $RC
