#!/bin/bash
# Showcase for seal-demo: serve public/ headless briefly and probe for kernel/verdict content.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m http.server --directory public 8080 >/dev/null 2>&1 & SRV=$!
sleep 2
curl -s --max-time 3 http://localhost:8080 | grep -oE 'kernel|verdict|block|gauntlet|ALLOW|DENY' | sort | uniq -c || true
kill $SRV 2>/dev/null || true
