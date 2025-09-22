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

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "WARNING: DATABASE_URL not set. Defaulting to sqlite at file:/app/data/prod.db"
  DATABASE_PROVIDER=sqlite
  export DATABASE_PROVIDER
  DATABASE_URL="file:/app/data/prod.db"
  export DATABASE_URL
fi

if [[ "$DATABASE_PROVIDER" == "sqlite" ]]; then
  if [[ "$DATABASE_URL" != file:* ]]; then
    log "ERROR: For sqlite, DATABASE_URL must start with file:"
    exit 1
  fi
  db_path=${DATABASE_URL#file:}
  if [[ "$db_path" == ./* ]]; then
    db_path="/app/${db_path#./}"
  fi
  db_dir=$(dirname "$db_path")
  mkdir -p "$db_dir"
  DATABASE_URL="file:$db_path"
  export DATABASE_URL
  log "SQLite database at $db_path"
else
  if [[ "$DATABASE_PROVIDER" != "postgresql" ]]; then
    log "WARNING: Unsupported DATABASE_PROVIDER=$DATABASE_PROVIDER. Using as-is."
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