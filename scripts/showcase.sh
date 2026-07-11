#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec ./demo.sh --no-open 2>&1
