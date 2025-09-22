import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { createMcpServer } from "./mcp.js";
import { startHttpServer } from "./http.js";

async function main() {
  const server = await createMcpServer();
  const mode = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();

  if (mode === "http") {
    await startHttpServer(server);
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log("[MCP] STDIO transport ready – awaiting client messages.");

  const shutdown = async () => {
    console.log("[MCP] Shutting down.");
    await server.close().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[MCP] Fatal error", err);
  process.exit(1);
});
