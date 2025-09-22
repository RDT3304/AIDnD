#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[entrypoint] $1"
}

MCP_TRANSPORT=${MCP_TRANSPORT:-stdio}
DATABASE_PROVIDER=${DATABASE_PROVIDER:-postgresql}

log "DATABASE_PROVIDER=${DATABASE_PROVIDER}"
log "MCP_TRANSPORT=${MCP_TRANSPORT}"
if [[ "$MCP_TRANSPORT" == "http" ]]; then
  if [[ -z "${MCP_TOKEN:-}" ]]; then
    log "ERROR: MCP_TRANSPORT=http requires MCP_TOKEN"
    exit 1
  fi
else
  log "MCP_TOKEN not required for stdio"
fi

if [[ "$DATABASE_PROVIDER" == "sqlite" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    DATABASE_URL="file:/app/data/prod.db"
    export DATABASE_URL
    log "DATABASE_URL not provided. Defaulting to $DATABASE_URL"
  fi
  if [[ "$DATABASE_URL" != file:* ]]; then
    log "ERROR: For sqlite, DATABASE_URL must start with file:"
    exit 1
  fi
  db_path=${DATABASE_URL#file:}
  if [[ "$db_path" == ./* ]]; then
    db_path="/app/${db_path#./}"
  fi
  mkdir -p "$(dirname "$db_path")"
  DATABASE_URL="file:$db_path"
  export DATABASE_URL
  log "SQLite database at $db_path"
else
  if [[ -z "${DATABASE_URL:-}" ]]; then
    log "ERROR: DATABASE_URL is required for provider $DATABASE_PROVIDER"
    exit 1
  fi
fi

log "Running prisma migrate deploy"
if ! npx prisma migrate deploy; then
  code=$?
  log "ERROR: prisma migrate deploy failed with $code"
  exit $code
fi

log "Starting node dist/index.js"
exec node dist/index.js
