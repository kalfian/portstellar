#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BE_PID=""
FE_PID=""

cleanup() {
  echo ""
  echo "stopping..."
  [ -n "$BE_PID" ] && kill "$BE_PID" 2>/dev/null
  [ -n "$FE_PID" ] && kill "$FE_PID" 2>/dev/null
  wait 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Pre-build backend so first load is instant
echo "[be] compiling..."
cd "$ROOT/backend"
go build -o /tmp/portstellar-dev .
echo "[be] compiled — starting on :8080"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}" /tmp/portstellar-dev &
BE_PID=$!

# Frontend
echo "[fe] starting vite on :1212"
cd "$ROOT"
npm run dev &
FE_PID=$!

echo ""
echo "  backend  → http://localhost:8080"
echo "  frontend → http://localhost:1212"
echo ""
echo "  ctrl+c to stop both"
echo ""

wait
