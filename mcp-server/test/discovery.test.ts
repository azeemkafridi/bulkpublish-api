// The discovery routes sit beside the MCP endpoint, so the thing to pin is
// that they answer AND that no MCP client request can land on them: an MCP
// client's GET always asks for text/event-stream, a browser's never does.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const PUBLIC = "https://mcp.example.test";
let child: ChildProcess;

before(async () => {
  child = spawn(process.execPath, ["--import", "tsx", "src/http.ts"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), PUBLIC_BASE_URL: PUBLIC, OAUTH_SIGNING_SECRET: "test-secret-test-secret-test-secret" },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});

after(() => {
  child?.kill();
});

const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

for (const path of ["/mcp", "/mcp/full"]) {
  test(`${path}: a browser gets the setup page`, async () => {
    const res = await fetch(BASE + path, { headers: { Accept: BROWSER } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
    const html = await res.text();
    assert.ok(html.includes(`${PUBLIC}${path}`), "shows the address to connect to");
  });

  test(`${path}: an MCP client's GET still opens the stream`, async () => {
    for (const accept of ["text/event-stream", "application/json, text/event-stream", "text/html, text/event-stream", "*/*"]) {
      const ctl = new AbortController();
      const res = await fetch(BASE + path, { headers: { Accept: accept }, signal: ctl.signal });
      assert.match(res.headers.get("content-type") ?? "", /^text\/event-stream/, `Accept: ${accept}`);
      ctl.abort();
    }
  });

  test(`${path}: a POST is never answered with the setup page`, async () => {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { Accept: BROWSER, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.match(res.headers.get("content-type") ?? "", /json|event-stream/);
    const body = await res.text();
    assert.ok(body.includes('"tools"'), "tools/list still answers");
  });

  test(`${path}/server-card: a card in the official shape`, async () => {
    const res = await fetch(`${BASE}${path}/server-card`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^application\/mcp-server-card\+json/);
    const card = (await res.json()) as Record<string, any>;
    assert.equal(card.$schema, "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json");
    assert.match(card.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    assert.ok(card.description.length > 0 && card.description.length <= 100, "the schema caps description at 100");
    assert.match(card.version, /^\d+\.\d+\.\d+/);
    assert.deepEqual(card.remotes.map((r: any) => [r.type, r.url]), [["streamable-http", `${PUBLIC}${path}`]]);
    assert.equal(card.tools, undefined, "cards do not list tools");
  });
}

test("the AI catalog points at both cards", async () => {
  const res = await fetch(`${BASE}/.well-known/ai-catalog.json`);
  assert.equal(res.status, 200);
  const cat = (await res.json()) as { entries: Array<{ type: string; url: string }> };
  assert.deepEqual(
    cat.entries.map((e) => e.url),
    [`${PUBLIC}/mcp/server-card`, `${PUBLIC}/mcp/full/server-card`]
  );
  for (const e of cat.entries) assert.equal(e.type, "application/mcp-server-card+json");
});

test("the older card is still served, with its fields intact", async () => {
  const card = (await (await fetch(`${BASE}/.well-known/mcp/server-card.json`)).json()) as Record<string, any>;
  assert.equal(card.name, "bulkpublish");
  assert.equal(card.serverUrl, `${PUBLIC}/mcp`);
  assert.ok(Array.isArray(card.tools) && card.tools.length > 0);
  assert.equal(card.remotes[0].url, `${PUBLIC}/mcp`);
});
