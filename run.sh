#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
if [ ! -d frontend/dist ]; then
  cd frontend
  npm install
  npm run build
  cd ..
fi
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
