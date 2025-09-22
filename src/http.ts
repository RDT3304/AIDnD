import Fastify from "fastify";
import fastifyExpress from "@fastify/express";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

type AuthenticatedRequest = Request & {
  auth?: {
    token: string;
    clientId: string;
    scopes: string[];
  };
};

export async function startHttpServer(server: McpServer): Promise<void> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID()
  });

  await server.connect(transport);

  const fastify = Fastify({
    logger: true
  });

  await fastify.register(fastifyExpress);

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const expectedToken = process.env.MCP_TOKEN;
  if (!expectedToken) {
    throw new Error("MCP_TOKEN must be set when using HTTP transport");
  }

  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }
    const token = header.slice("Bearer ".length).trim();
    if (token !== expectedToken) {
      res.status(403).json({ error: "Invalid bearer token" });
      return;
    }
    (req as AuthenticatedRequest).auth = {
      token,
      clientId: "bearer",
      scopes: []
    };
    next();
  };

  app.post("/mcp/messages", authenticate, async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/mcp/events", authenticate, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp/session", authenticate, async (req, res) => {
    await transport.handleRequest(req, res);
  });

  fastify.use(app);

  fastify.get("/health", async () => ({ ok: true }));

  const port = Number(process.env.PORT ?? 3030);
  const host = process.env.HOST ?? "0.0.0.0";

  await fastify.listen({ port, host });

  fastify.addHook("onClose", async () => {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  });

  console.log(`[MCP] HTTP transport listening on http://${host}:${port}`);
}
