#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m http.server --directory public 8080 >/dev/null 2>&1 & SRV=$!
sleep 2
echo "=== seal-demo showcase output ==="
curl -s --max-time 3 http://localhost:8080 | grep -oE 'kernel|verdict|block|gauntlet|ALLOW|DENY|Send the call' | head -20 || true
echo "=== end showcase (rich terminal probe of live kernel page) ==="
kill $SRV 2>/dev/null || true
