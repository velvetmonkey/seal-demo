#!/usr/bin/env bash
# demo.sh — run the seal demo in one command.
#
# Serves public/ over HTTP (the wasm kernel cannot be fetched over file://),
# picks a free port from 8080, prints the URL, and opens the browser.
# Convenience only: this script serves the existing static files and never
# touches or regenerates any demo artifact. Docker live mode is separate
# (see README, Target B).
#
# Usage: ./demo.sh [--port N] [--no-open]
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/public"

BASE_PORT=8080
OPEN_BROWSER=1
while [ $# -gt 0 ]; do
  case "$1" in
    --port) shift; BASE_PORT="${1:?--port needs a number}";;
    --port=*) BASE_PORT="${1#--port=}";;
    --no-open) OPEN_BROWSER=0;;
    -h|--help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 1;;
  esac
  shift
done
case "$BASE_PORT" in (*[!0-9]*|"") echo "--port needs a number, got: $BASE_PORT" >&2; exit 1;; esac

[ -f "$PUBLIC_DIR/index.html" ] || { echo "cannot find $PUBLIC_DIR/index.html — is this a seal-demo checkout?" >&2; exit 1; }

# A TCP connect that succeeds means something is already listening.
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3>&- 3<&-; return 0; } || return 1; }

PORT=""
for p in $(seq "$BASE_PORT" $((BASE_PORT + 20))); do
  if ! port_busy "$p"; then PORT="$p"; break; fi
done
[ -n "$PORT" ] || { echo "no free port in $BASE_PORT-$((BASE_PORT + 20))" >&2; exit 1; }
[ "$PORT" = "$BASE_PORT" ] || echo "port $BASE_PORT busy → using $PORT"

# Static-server fallback chain; python3 first (offline-friendly). npx needs
# the network, so it is never the default.
if command -v python3 >/dev/null 2>&1; then
  SERVER_DESC="python3 -m http.server"
  python3 -m http.server "$PORT" --directory "$PUBLIC_DIR" >/dev/null 2>&1 &
elif command -v python >/dev/null 2>&1 \
  && python -c 'import sys; raise SystemExit(sys.version_info < (3, 7))' 2>/dev/null; then
  # bare `python` only counts if it is 3.7+ (http.server --directory)
  SERVER_DESC="python -m http.server"
  python -m http.server "$PORT" --directory "$PUBLIC_DIR" >/dev/null 2>&1 &
elif command -v npx >/dev/null 2>&1; then
  SERVER_DESC="npx serve"
  npx serve -l "$PORT" "$PUBLIC_DIR" >/dev/null 2>&1 &
elif command -v php >/dev/null 2>&1; then
  SERVER_DESC="php -S"
  php -S "localhost:$PORT" -t "$PUBLIC_DIR" >/dev/null 2>&1 &
else
  cat >&2 <<'EOF'
No static file server found on PATH.
Install one of:
  python3   (Debian/Ubuntu: apt install python3 · macOS: brew install python)
  node      (then: npx serve)
  php
Then run ./demo.sh again.
EOF
  exit 1
fi
SERVER_PID=$!

cleanup() { kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; exit 0; }
trap cleanup INT TERM

# Wait until the server answers (up to ~5s), so the URL we print is live.
for _ in $(seq 1 50); do
  port_busy "$PORT" && break
  kill -0 "$SERVER_PID" 2>/dev/null || { echo "server ($SERVER_DESC) exited before it came up" >&2; exit 1; }
  sleep 0.1
done

URL="http://localhost:$PORT"
echo
echo "  seal demo running ($SERVER_DESC)"
echo
echo "  ▶  $URL"
echo
echo "  Ctrl-C to stop."
echo

if [ "$OPEN_BROWSER" = 1 ]; then
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1 || true
  else echo "  (no browser opener found — open $URL yourself)"
  fi
else
  echo "  (browser launch skipped — open $URL yourself)"
fi

wait "$SERVER_PID"
