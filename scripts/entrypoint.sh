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
deploy_succeeded=0
if npx prisma migrate deploy; then
  deploy_succeeded=1
else
  code=$?
  log "migrate deploy exited with $code; checking for failed migrations"
  failed_migrations=""
  if status_json=$(npx prisma migrate status --json 2>/dev/null); then
    failed_migrations=$(printf '%s' "$status_json" | node -e '
      const fs = require("fs");
      const input = fs.readFileSync(0, "utf8").trim();
      if (!input) process.exit(0);
      const data = JSON.parse(input);
      const failed = (data.migrations ?? []).filter((m) => m.status === "Failed").map((m) => m.name);
      process.stdout.write(failed.join(" "));
    ')
  else
    log "WARN: Unable to read prisma migrate status; skipping resolve step"
  fi

  if [[ -n "$failed_migrations" ]]; then
    for migration in $failed_migrations; do
      log "Marking migration $migration as rolled back"
      if ! npx prisma migrate resolve --rolled-back "$migration"; then
        log "WARN: Failed to mark $migration as rolled back"
      fi
    done
    log "Retrying prisma migrate deploy after resolving failures"
    if npx prisma migrate deploy; then
      deploy_succeeded=1
    fi
  fi

  if [[ $deploy_succeeded -ne 1 ]]; then
    log "migrate deploy still failing; attempting prisma db push"
    if ! npx prisma db push; then
      push_code=$?
      log "ERROR: prisma db push failed with $push_code"
      exit $push_code
    fi
  fi
fi

log "Starting node dist/index.js"
exec node dist/index.js
