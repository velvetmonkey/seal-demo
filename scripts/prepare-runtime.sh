#!/usr/bin/env bash
# Populate runtime/ with the private seal-host binary + MCP mock so the LIVE
# Docker image (Dockerfile.live) can run the real verified kernel.
# runtime/ is gitignored: the binary is the private pre-award implementation.
set -euo pipefail

SEAL_HOST="${SEAL_HOST_DIR:-$HOME/build/seal-host}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$SEAL_HOST/.lake/build/bin/seal-host"
MOCK="$SEAL_HOST/test/integration/mock_mcp_server.py"

[ -f "$BIN" ] || { echo "seal-host binary not found at $BIN — run 'lake build seal-host' in $SEAL_HOST first"; exit 1; }

mkdir -p "$HERE/runtime"
cp "$BIN" "$HERE/runtime/seal-host"
cp "$MOCK" "$HERE/runtime/mock_mcp_server.py"
echo "runtime/ ready: $(du -h "$HERE/runtime/seal-host" | cut -f1) binary + mock. Now: docker compose up --build"
