#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
echo "[1/3] Python compile"
python -m py_compile $(find backend/app -name '*.py')
echo "[2/3] Backend tests"
PYTHONPATH=backend pytest -q backend/tests
echo "[3/3] Frontend build"
(cd frontend && npm ci && npm run build)
echo "GHM release validation passed."
