#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
echo "[1/4] Python compile"
python -m py_compile $(find backend/app -name '*.py')
echo "[2/4] FastAPI import smoke test"
PYTHONPATH=backend python -c "import app.main; print('Backend import OK')"
echo "[3/4] Backend tests"
PYTHONPATH=backend pytest -q backend/tests
echo "[4/4] Frontend build"
(cd frontend && npm ci && npm run build)
echo "GHM release validation passed."
