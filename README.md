# MCP DM Server

MCP DM Server is a production-ready Model Context Protocol backend for AI Dungeon Masters. It bundles campaign authoring, worldbuilding assets, encounter prep, combat tracking, and state exports with deterministic dice tooling. The server can run locally via STDIO or remotely over the Streamable HTTP transport with bearer authentication.

**Key Features**

- Deterministic dice rolling with advantage/disadvantage, exploding dice, and seed reporting.
- Campaign, world, encounter, and combat tools backed by Prisma (SQLite dev, Postgres prod).
- Combat engine with initiative ordering, optimistic concurrency, and condition tracking.
- Snapshot/export utilities for state management plus event logging for every mutation.
- STDIO transport for local MCP clients and authenticated Streamable HTTP for remote/Coolify.

---

## Quickstart (SQLite, STDIO)

- `pnpm install`
- `cp .env.example .env`
- `pnpm dlx prisma migrate dev --name init`
- `pnpm dev`
- Attach your MCP client to the STDIO session (e.g., via IDE integration).

Health check when running HTTP mode locally:

```bash
curl -s http://localhost:3030/health
```

---

## Database Setup

- Set `DATABASE_PROVIDER=postgresql`
- Export `DATABASE_URL=postgres://user:password@host:5432/dbname`
- Run `pnpm dlx prisma migrate deploy`
- Restart the server (`MCP_TRANSPORT=http` recommended for remote clients)

---

## Transports

- `MCP_TRANSPORT=stdio`: runs against STDIO (default for local dev, e.g., `pnpm dev`).
- `MCP_TRANSPORT=http`: Fastify + Express Streamable HTTP server on `PORT` (default `3030`) with bearer authentication via `MCP_TOKEN`.
- Health endpoint: `GET /health` → `{ "ok": true }`
- Messages endpoint: `POST /mcp/messages` (JSON-RPC)
- Events endpoint: `GET /mcp/events` (SSE stream)

Example HTTP call (replace token):

```bash
curl -X POST http://localhost:3030/mcp/messages \
  -H "Authorization: Bearer REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"ping","params":{}}'
```

---

## Tool Catalog & Payload Samples

- `dice.roll`
```json
{
  "notation": "2d6+3",
  "advantage": "normal",
  "explode": false
}
```

- Campaign suite: `campaign.create`, `campaign.update`, `campaign.get`, `campaign.list`
```json
{
  "title": "Shards of Dawn",
  "system": "5e",
  "premise": "Dragons shattered the sun; shards empower mortals.",
  "tone": "Mythic heroism"
}
```

- Worldbuilding: `location.create`, `npc.create`, `quest.create`, `table.create`, `table.roll`
```json
{
  "campaign_id": "cuid123",
  "name": "Hollowmere",
  "kind": "Swamp",
  "description": "Ever-shifting peat bog surrounding an ancient obelisk."
}
```

- Encounter builder: `encounter.build`
```json
{
  "campaign_id": "cuid123",
  "name": "Ambush at Hollowmere",
  "difficulty": "hard",
  "roster": [
    { "name": "Bog Wraith", "side": "enemy" },
    { "name": "Swamp Sentinel", "side": "enemy" }
  ]
}
```

- Combat engine: `combat.start`, `combat.apply`, `combat.next_turn`
```json
{
  "combat_id": "cuidCombat",
  "action": "damage",
  "target": "cuidCombatant",
  "value": 7
}
```

- State management: `state.snapshot`, `state.restore`, `export.session_log`
```json
{
  "campaign_id": "cuid123",
  "format": "json"
}
```

---

## HTTP Coolify Deployment

1. Deploy “App from Git” and point Coolify at this repo/Dockerfile.
2. Configure env vars: `MCP_TRANSPORT=http`, `MCP_TOKEN`, `DATABASE_PROVIDER=postgresql`, `DATABASE_URL`, `PORT=3030`.
3. Set health check path to `/health`.
4. Expose port `3030`, assign domain, enforce TLS.
5. Point your MCP client (e.g., ChatGPT custom connector) to:
   - Messages: `POST https://your.domain/mcp/messages`
   - Events: `GET https://your.domain/mcp/events`
   - Auth header: `Authorization: Bearer <MCP_TOKEN>`

---

## Validation & Maintenance

- Generate client: `pnpm generate`
- Run migrations: `pnpm migrate`
- Type check: `pnpm lint`
- Seed demo content (optional): `pnpm exec tsx src/seed.ts`
- Smoke tests (documented):
  - `pnpm i`
  - `pnpm dlx prisma migrate dev --name init`
  - `pnpm dev` (stdio transport)
  - `curl localhost:3030/health` (when in HTTP mode)

---

## Security Checklist

- Keep `MCP_TOKEN` secret and rotate regularly.
- Serve HTTP transport behind TLS (Coolify handles certificates).
- Restrict database connectivity to private networks.
- Monitor event log exports before sharing.

---

## License

Released under the MIT license. See the repository header for attribution requirements.
