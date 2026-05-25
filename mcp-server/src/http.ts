#!/usr/bin/env node

/**
 * BulkPublish MCP Server — hosted Streamable HTTP transport + OAuth 2.1.
 *
 * Serves the same tool suite as the stdio server (src/index.ts) over HTTP so web
 * hosts that can't spawn a local process (claude.ai, Smithery, ChatGPT Apps) can
 * connect and render the MCP Apps widgets.
 *
 * Auth is dual-mode, resolved per request to a BulkPublish key (bp_…):
 *   - OAuth 2.1 (for directory listings): Authorization: Bearer <access token>,
 *     issued by our own auth server (see src/oauth.ts) after the user pastes
 *     their bp_ key on the consent screen. Required by Anthropic's / ChatGPT's
 *     MCP directories. Endpoints (/.well-known/oauth-*, /authorize, /token,
 *     /register, /revoke) are mounted via the SDK's mcpAuthRouter.
 *   - Key-in-URL/header (for manual custom connectors + Smithery's gateway):
 *     ?key= / ?bulkpublishApiKey= / ?config= / X-BulkPublish-Key / Bearer bp_…
 *
 * initialize / tools-list / resources / ping need no auth (scans + discovery
 * work). A tools/call without a resolvable key → 401 + WWW-Authenticate that
 * advertises the protected-resource metadata, which triggers the OAuth flow.
 *
 * Other endpoints: GET /health, GET /.well-known/mcp/server-card.json.
 * Env: PORT (default 8080), PUBLIC_BASE_URL (the external https URL of THIS
 * server, default https://mcp.bulkpublish.com), OAUTH_SIGNING_SECRET,
 * BULKPUBLISH_BASE_URL (the API, inherited by src/index.ts).
 */

import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, requestContext } from "./index.js";
import { oauthProvider, handleConsent } from "./oauth.js";

const PORT = Number(process.env.PORT) || 8080;
const MCP_PATH = "/mcp";
const PUBLIC_BASE = (
  process.env.PUBLIC_BASE_URL || "https://mcp.bulkpublish.com"
).replace(/\/+$/, "");
// RFC 9728 path-suffixes the resource path onto the well-known metadata URL.
const RESOURCE_METADATA_URL = `${PUBLIC_BASE}/.well-known/oauth-protected-resource${MCP_PATH}`;

// ---------------------------------------------------------------------------
// Per-request key resolution: OAuth Bearer → bp_ key, else key-in-URL/header
// ---------------------------------------------------------------------------

async function resolveApiKey(req: Request): Promise<string | undefined> {
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const tok = auth.slice(7).trim();
    if (tok.startsWith("bp_")) return tok; // raw key passed as a bearer
    try {
      const info = await oauthProvider.verifyAccessToken(tok); // OAuth access token
      const bpKey = info.extra?.bpKey;
      if (typeof bpKey === "string") return bpKey;
    } catch {
      /* not a valid OAuth token — fall through to key-in-URL */
    }
  }
  const q = req.query as Record<string, string | undefined>;
  const direct = q.key || q.api_key || q.apiKey || q.bulkpublishApiKey;
  if (direct) return direct;
  if (typeof q.config === "string") {
    try {
      const parsed = JSON.parse(Buffer.from(q.config, "base64").toString("utf8"));
      if (typeof parsed?.bulkpublishApiKey === "string") return parsed.bulkpublishApiKey;
    } catch {
      /* not base64 JSON */
    }
  }
  const headerKey = req.headers["x-bulkpublish-key"];
  if (typeof headerKey === "string" && headerKey) return headerKey;
  return undefined;
}

function requiresKey(body: unknown): boolean {
  const msgs = Array.isArray(body) ? body : [body];
  return msgs.some(
    (m) => m != null && typeof m === "object" && (m as { method?: unknown }).method === "tools/call"
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

let serverCardJson = JSON.stringify({
  serverInfo: { name: "bulkpublish", version: "1.0.0" },
  authentication: { required: false },
  tools: [],
  resources: [],
  prompts: [],
});

async function buildServerCard(): Promise<string> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "card-builder", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  try {
    const info = client.getServerVersion() ?? { name: "bulkpublish", version: "1.0.0" };
    const { tools } = await client.listTools();
    let resources: Array<{ uri: string; name?: string; mimeType?: string }> = [];
    try {
      const r = await client.listResources();
      resources = (r.resources ?? []).map((x) => ({ uri: x.uri, name: x.name, mimeType: x.mimeType }));
    } catch {
      /* host may not list resources */
    }
    return JSON.stringify(
      {
        serverInfo: { name: info.name, version: info.version },
        authentication: { required: false },
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
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
// MCP request handler (stateless: fresh server + transport per request)
// ---------------------------------------------------------------------------

async function handleMcp(req: Request, res: Response): Promise<void> {
  const body = req.method === "POST" ? req.body : undefined;
  const apiKey = await resolveApiKey(req);

  if (req.method === "POST" && requiresKey(body) && !apiKey) {
    res
      .status(401)
      .set("WWW-Authenticate", `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`)
      .json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Authorization required. Connect via OAuth, or append ?key=bp_… to the URL. Get a key at https://app.bulkpublish.com/developer",
        },
        id: firstId(body),
      });
    return;
  }

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
    await requestContext.run({ apiKey }, () => transport.handleRequest(req, res, body));
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: firstId(body),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS (browser-based MCP clients / playgrounds)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", (req.headers.origin as string) ?? "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-BulkPublish-Key, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// OAuth 2.1 server: /.well-known/oauth-authorization-server, /.well-known/
// oauth-protected-resource, /authorize, /token, /register, /revoke.
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(PUBLIC_BASE),
    baseUrl: new URL(PUBLIC_BASE),
    resourceServerUrl: new URL(`${PUBLIC_BASE}${MCP_PATH}`),
    scopesSupported: ["bulkpublish"],
    resourceName: "BulkPublish",
  })
);

// Consent form POST (renders/validates inside src/oauth.ts).
app.post("/oauth/consent", handleConsent);

app.get("/.well-known/mcp/server-card.json", (_req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=300").type("application/json").send(serverCardJson);
});

app.get(["/health", "/"], (_req: Request, res: Response) => {
  res.json({ ok: true, service: "bulkpublish-mcp", transport: "streamable-http", mcp: MCP_PATH });
});

app.all(MCP_PATH, handleMcp);
app.post("/", handleMcp);

buildServerCard()
  .then((json) => {
    serverCardJson = json;
  })
  .catch((err) => console.error("Failed to build server card (serving fallback):", err))
  .finally(() => {
    app.listen(PORT, () => {
      console.error(
        `BulkPublish MCP (Streamable HTTP + OAuth) on :${PORT}${MCP_PATH} — issuer ${PUBLIC_BASE}`
      );
    });
  });
