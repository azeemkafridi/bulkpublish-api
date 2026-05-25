#!/usr/bin/env node

/**
 * BulkPublish MCP Server — hosted Streamable HTTP transport.
 *
 * Serves the exact same tool suite as the stdio server (src/index.ts) over HTTP
 * so web hosts that cannot spawn a local process — claude.ai custom connectors,
 * Smithery's gateway — can connect and (for MCP Apps hosts) render the widgets.
 *
 * Multi-tenant: this process holds NO API key. Every request must carry the
 * caller's BulkPublish key (bp_…). createServer() is invoked per request and the
 * request runs inside requestContext.run({ apiKey }), so each tool call uses that
 * caller's key and nothing leaks between callers. The key is read from:
 *   - query   ?key= | ?api_key= | ?apiKey= | ?bulkpublishApiKey=
 *   - Smithery ?config=<base64 JSON {"bulkpublishApiKey":"…"}>
 *   - header  Authorization: Bearer bp_…  |  X-BulkPublish-Key: bp_…
 *
 * initialize / tools-list / resources / ping need NO key, so automated scans and
 * tool discovery succeed. A tools/call without a key returns 401.
 *
 * Endpoints:
 *   GET  /health                            → liveness JSON
 *   GET  /.well-known/mcp/server-card.json  → static metadata (lets Smithery skip scanning)
 *   ANY  /mcp   (and POST /)                → MCP Streamable HTTP (stateless)
 *
 * Env: PORT (default 8080), BULKPUBLISH_BASE_URL (inherited by src/index.ts).
 */

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, requestContext } from "./index.js";

const PORT = Number(process.env.PORT) || 8080;
const MCP_PATH = "/mcp";

// ---------------------------------------------------------------------------
// API key extraction (query → Smithery config → headers)
// ---------------------------------------------------------------------------

function extractApiKey(req: IncomingMessage, url: URL): string | undefined {
  const q = url.searchParams;
  const direct =
    q.get("key") ||
    q.get("api_key") ||
    q.get("apiKey") ||
    q.get("bulkpublishApiKey");
  if (direct) return direct;

  // Smithery's gateway can forward config as base64-encoded JSON in ?config=
  const cfg = q.get("config");
  if (cfg) {
    try {
      const parsed = JSON.parse(Buffer.from(cfg, "base64").toString("utf8"));
      const k = parsed?.bulkpublishApiKey;
      if (typeof k === "string" && k) return k;
    } catch {
      /* not base64 JSON — ignore */
    }
  }

  const headerKey = req.headers["x-bulkpublish-key"];
  if (typeof headerKey === "string" && headerKey) return headerKey;

  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const tok = auth.slice(7).trim();
    if (tok) return tok;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Body helpers
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      if (chunks.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

/** True when the request carries a tools/call (the only methods that need a key). */
function requiresKey(body: unknown): boolean {
  const msgs = Array.isArray(body) ? body : [body];
  return msgs.some(
    (m) =>
      m != null &&
      typeof m === "object" &&
      (m as { method?: unknown }).method === "tools/call"
  );
}

function firstId(body: unknown): string | number | null {
  const m = Array.isArray(body) ? body[0] : body;
  const id = (m as { id?: unknown } | undefined)?.id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

// ---------------------------------------------------------------------------
// Static server card — built once from the live server so it never drifts
// ---------------------------------------------------------------------------

const FALLBACK_CARD = JSON.stringify({
  serverInfo: { name: "bulkpublish", version: "1.0.0" },
  authentication: { required: false },
  tools: [],
  resources: [],
  prompts: [],
});
let serverCardJson = FALLBACK_CARD;

async function buildServerCard(): Promise<string> {
  const server = createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "card-builder", version: "1.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  try {
    const info = client.getServerVersion() ?? {
      name: "bulkpublish",
      version: "1.0.0",
    };
    const { tools } = await client.listTools();
    let resources: Array<{ uri: string; name?: string; mimeType?: string }> = [];
    try {
      const r = await client.listResources();
      resources = (r.resources ?? []).map((x) => ({
        uri: x.uri,
        name: x.name,
        mimeType: x.mimeType,
      }));
    } catch {
      /* a host that can't list resources is fine */
    }
    return JSON.stringify(
      {
        serverInfo: { name: info.name, version: info.version },
        // Key-in-URL/header model: no OAuth, so automated scans need no auth.
        authentication: { required: false },
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
        resources,
        prompts: [],
      },
      null,
      2
    );
  } finally {
    await client.close();
    await server.close();
  }
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

function sendJson(
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string> = {}
): void {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body);
}

// ---------------------------------------------------------------------------
// HTTP router
// ---------------------------------------------------------------------------

const httpServer = createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  // CORS — for browser-based MCP clients (e.g. Smithery's playground).
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-BulkPublish-Key, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (path === "/.well-known/mcp/server-card.json") {
    return sendJson(res, 200, serverCardJson, {
      "Cache-Control": "public, max-age=300",
    });
  }

  if (path === "/health" || (path === "/" && method === "GET")) {
    return sendJson(
      res,
      200,
      JSON.stringify({
        ok: true,
        service: "bulkpublish-mcp",
        transport: "streamable-http",
        mcp: MCP_PATH,
      })
    );
  }

  const isMcp = path === MCP_PATH || (path === "/" && method === "POST");
  if (isMcp) {
    const apiKey = extractApiKey(req, url);
    const body = method === "POST" ? await readBody(req) : undefined;

    if (method === "POST" && requiresKey(body) && !apiKey) {
      return sendJson(
        res,
        401,
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message:
              "Missing BulkPublish API key. Append ?key=bp_… to the connection URL, or send Authorization: Bearer bp_…. Get a key at https://app.bulkpublish.com/developer",
          },
          id: firstId(body),
        }),
        { "WWW-Authenticate": 'Bearer realm="bulkpublish", error="invalid_token"' }
      );
    }

    // Stateless: a fresh server + transport per request, disposed when the
    // response closes. createServer() builds an isolated instance whose tool
    // calls read the key from requestContext below.
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await requestContext.run({ apiKey }, () =>
        transport.handleRequest(req, res, body)
      );
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        sendJson(
          res,
          500,
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: firstId(body),
          })
        );
      }
    }
    return;
  }

  sendJson(res, 404, JSON.stringify({ error: "Not found" }));
});

// Build the card before listening, but start regardless if it fails.
buildServerCard()
  .then((json) => {
    serverCardJson = json;
  })
  .catch((err) => {
    console.error("Failed to build server card (serving fallback):", err);
  })
  .finally(() => {
    httpServer.listen(PORT, () => {
      console.error(
        `BulkPublish MCP (Streamable HTTP) listening on :${PORT}${MCP_PATH}`
      );
    });
  });
