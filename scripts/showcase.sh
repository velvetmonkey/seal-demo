#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# thin launcher for the shipped static kernel demo
python3 -m http.server --directory public 8081 >/dev/null 2>&1 & SRV=$!
sleep 1
# surface real shipped page content (contains kernel/verdict/ALLOW/BLOCK descriptions)
curl -s --max-time 2 http://localhost:8081/ | head -c 2500
kill $SRV 2>/dev/null || true
wait $SRV 2>/dev/null || true
