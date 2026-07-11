#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m http.server --directory public 8080 >/dev/null 2>&1 & SRV=$!
sleep 2
echo "=== seal-demo showcase output (real served kernel page probe) ==="
curl -s --max-time 3 http://localhost:8080 | head -c 2000 || true
echo ""
echo "=== end rich showcase (kernel/verdict content from live page) ==="
kill $SRV 2>/dev/null || true
