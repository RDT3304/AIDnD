#!/usr/bin/env bash
set -euo pipefail

echo "[entrypoint] DATABASE_PROVIDER=${DATABASE_PROVIDER:-unset}"
echo "[entrypoint] MCP_TRANSPORT=${MCP_TRANSPORT:-unset}"
echo "[entrypoint] MCP_TOKEN set? $([[ -n "${MCP_TOKEN:-}" ]] && echo yes || echo no)"
echo "[entrypoint] DATABASE_URL set? $([[ -n "${DATABASE_URL:-}" ]] && echo yes || echo no)"
echo "[entrypoint] PORT=${PORT:-unset}"

if [[ "${MCP_TRANSPORT:-stdio}" == "http" && -z "${MCP_TOKEN:-}" ]]; then
  echo "[entrypoint] ERROR: MCP_TRANSPORT=http requires MCP_TOKEN."
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[entrypoint] ERROR: DATABASE_URL is not set."
  exit 1
fi

if [[ -z "${DATABASE_PROVIDER:-}" ]]; then
  echo "[entrypoint] WARNING: DATABASE_PROVIDER not set, defaulting to postgresql." >&2
  export DATABASE_PROVIDER=postgresql
fi

echo "[entrypoint] Running prisma migrate deploy"
if ! npx prisma migrate deploy; then
  status=$?
  echo "[entrypoint] prisma migrate failed with status $status" >&2
  exit $status
fi

echo "[entrypoint] Starting server"
exec node dist/index.js