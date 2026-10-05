#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -x .venv/bin/python ]]; then
  echo 'Create .venv and install backend/requirements.txt first. See README.md.'
  exit 1
fi
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
backend_pid=$!
cleanup() { kill "$backend_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
cd frontend
npm run dev -- --host 0.0.0.0
