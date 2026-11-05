/**
 * Enterprise-managed authorization on the hosted server: the jwt-bearer
 * handler, the metadata it adds, and Client ID Metadata Document handling.
 *
 *   npm test
 *
 * No network: the webapp exchange is a stubbed fetch, and metadata documents
 * are parsed from strings.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.OAUTH_SIGNING_SECRET = "test-signing-secret";
process.env.MANAGED_AUTH = "on";
process.env.MANAGED_AUTH_SECRET = "test-managed-secret";
process.env.BULKPUBLISH_BASE_URL = "https://app.test";

const { isBlockedAddress, isMetadataDocumentClientId, parseMetadataDocument } = await import("../src/cimd.ts");
const { isAllowedRedirectUri, clientsStore, oauthProvider, managedAuthEnabled } = await import("../src/oauth.ts");
const { managedAuthTokenHandler, managedAuthMetadata, isOwnResource, signedHeaders, JWT_BEARER_GRANT } = await import(
  "../src/managed-auth.ts"
);

const BASE = "https://mcp.bulkpublish.com";
const CLAUDE = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const CLAUDE_DOC = JSON.stringify({
  client_id: CLAUDE,
  client_name: "Claude",
  client_uri: "https://claude.ai",
  redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
  grant_types: ["authorization_code", "refresh_token", JWT_BEARER_GRANT],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
});

// ---------------------------------------------------------------- CIMD

describe("client metadata documents", () => {
  test("which client_ids are fetched", () => {
    assert.equal(isMetadataDocumentClientId(CLAUDE), true);
    assert.equal(isMetadataDocumentClientId("https://claude.ai/oauth/claude-code-client-metadata"), true);
    for (const bad of [
      "http://claude.ai/x", "https://claude.ai/", "https://claude.ai", "https://claude.ai:8443/x",
      "https://127.0.0.1/x", "https://[::1]/x", "https://u:p@claude.ai/x", "https://claude.ai/x?y=1",
      "https://claude.ai/x#f", "https://claude.ai/a/../b", "sealed.blob.id",
    ]) {
      assert.equal(isMetadataDocumentClientId(bad), false, bad);
    }
  });

  test("private, loopback, link-local and embedded-IPv4 addresses are blocked", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
      "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "not-an-ip"]) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
    for (const ip of ["160.79.104.10", "1.1.1.1", "2606:4700::1111"]) assert.equal(isBlockedAddress(ip), false, ip);
  });

  test("Claude's real document parses into a public client named with its host", () => {
    const c = parseMetadataDocument(CLAUDE, CLAUDE_DOC, isAllowedRedirectUri);
    assert.ok(c);
    assert.equal(c.client_id, CLAUDE);
    assert.equal(c.client_name, "Claude (claude.ai)");
    assert.deepEqual(c.redirect_uris, ["https://claude.ai/api/mcp/auth_callback"]);
    assert.equal(c.token_endpoint_auth_method, "none");
    assert.equal("client_secret" in c, false);
  });

  test("Claude Code's port-less loopback redirects are accepted", () => {
    const id = "https://claude.ai/oauth/claude-code-client-metadata";
    const c = parseMetadataDocument(
      id,
      JSON.stringify({ client_id: id, client_name: "Claude Code", redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"], token_endpoint_auth_method: "none" }),
      isAllowedRedirectUri
    );
    assert.ok(c);
  });

  test("documents we refuse", () => {
    const doc = JSON.parse(CLAUDE_DOC);
    const refuse = (d: unknown, id = CLAUDE) => assert.equal(parseMetadataDocument(id, typeof d === "string" ? d : JSON.stringify(d), isAllowedRedirectUri), null);
    refuse({ ...doc, client_id: "https://evil.example/doc" }); // must name its own URL
    refuse({ ...doc, token_endpoint_auth_method: "private_key_jwt" }); // not advertised
    refuse({ ...doc, token_endpoint_auth_method: "client_secret_basic" });
    refuse({ ...doc, redirect_uris: [] });
    refuse({ ...doc, redirect_uris: ["http://evil.example/cb"] });
    refuse({ ...doc, redirect_uris: ["javascript:alert(1)"] });
    refuse("not json");
  });

  test("an https client_id is ignored entirely while the feature is off", async () => {
    process.env.MANAGED_AUTH = "off";
    try {
      assert.equal(managedAuthEnabled(), false);
      assert.equal(await clientsStore.getClient(CLAUDE), undefined);
    } finally {
      process.env.MANAGED_AUTH = "on";
    }
  });
});

// ---------------------------------------------------------------- metadata

describe("authorization-server metadata", () => {
  const sdkDoc = {
    issuer: `${BASE}/`,
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
  };

  test("adds the grant and metadata-document support, without touching the rest", () => {
    const out = managedAuthMetadata({ ...sdkDoc });
    assert.deepEqual(out.grant_types_supported, ["authorization_code", "refresh_token", JWT_BEARER_GRANT]);
    assert.equal(out.client_id_metadata_document_supported, true);
    assert.equal(out.issuer, `${BASE}/`);
    assert.deepEqual(out.token_endpoint_auth_methods_supported, ["client_secret_post", "none"]);
    // never private_key_jwt: it would change which client Claude presents
    assert.equal((out.token_endpoint_auth_methods_supported as string[]).includes("private_key_jwt"), false);
  });

  test("never edits the shared object, and adds the grant once", () => {
    const shared = { ...sdkDoc, grant_types_supported: [...sdkDoc.grant_types_supported] };
    managedAuthMetadata(shared);
    const twice = managedAuthMetadata(managedAuthMetadata(shared));
    assert.deepEqual(shared.grant_types_supported, ["authorization_code", "refresh_token"]);
    assert.equal((twice.grant_types_supported as string[]).filter((g) => g === JWT_BEARER_GRANT).length, 1);
  });

  test("is the SDK's document unchanged while the feature is off", () => {
    process.env.MANAGED_AUTH = "off";
    try {
      assert.deepEqual(managedAuthMetadata({ ...sdkDoc }), sdkDoc);
    } finally {
      process.env.MANAGED_AUTH = "on";
    }
  });

  test("resource identifiers that name this server", () => {
    for (const r of [BASE, `${BASE}/`, `${BASE}/mcp`, `${BASE}/mcp/full`]) assert.equal(isOwnResource(r, BASE), true, r);
    for (const r of ["https://evil.example/mcp", `${BASE}/other`, `${BASE}.evil.example/mcp`]) assert.equal(isOwnResource(r, BASE), false, r);
  });
});

// ---------------------------------------------------------------- /token handler

type Captured = { status?: number; body?: any; headers: Record<string, string>; nextCalled: boolean };

function run(body: Record<string, unknown>, headers: Record<string, string> = {}, ip = "203.0.113.9") {
  const out: Captured = { headers: {}, nextCalled: false };
  const res: any = {
    status(s: number) { out.status = s; return res; },
    set(k: string, v: string) { out.headers[k] = v; return res; },
    json(b: unknown) { out.body = b; return res; },
  };
  const req: any = { body, headers, ip };
  return managedAuthTokenHandler(BASE)(req, res, () => { out.nextCalled = true; }).then(() => out);
}

let upstream: { url: string; init: RequestInit } | null;
let reply: () => Response;
const realFetch = globalThis.fetch;
const realGetClient = clientsStore.getClient;

describe("POST /token jwt-bearer", () => {
  beforeEach(() => {
    upstream = null;
    reply = () => new Response(JSON.stringify({ access_token: "bpat_abc", expires_in: 3600 }), { status: 200 });
    // getClient for a metadata document goes through cimd.ts's own https.get, so
    // seed it the way a real fetch would: stub the one client we need.
    (clientsStore as any).getClient = async (id: string) =>
      id === CLAUDE ? parseMetadataDocument(CLAUDE, CLAUDE_DOC, isAllowedRedirectUri) ?? undefined : undefined;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      upstream = { url: String(url), init };
      return reply();
    }) as typeof fetch;
  });

  const grant = (over: Record<string, unknown> = {}) => ({ grant_type: JWT_BEARER_GRANT, client_id: CLAUDE, assertion: "a.b.c", ...over });

  test("other grants fall through to the SDK untouched", async () => {
    for (const g of ["authorization_code", "refresh_token", undefined]) {
      const out = await run({ grant_type: g });
      assert.equal(out.nextCalled, true);
      assert.equal(out.status, undefined);
    }
    assert.equal(upstream, null);
  });

  test("the grant itself falls through while the feature is off", async () => {
    process.env.MANAGED_AUTH = "off";
    try {
      assert.equal((await run(grant())).nextCalled, true);
    } finally {
      process.env.MANAGED_AUTH = "on";
    }
  });

  test("a good assertion: signed upstream call, sealed token, no refresh token", async () => {
    const out = await run(grant({ resource: `${BASE}/mcp`, scope: "read write" }));
    assert.equal(out.status, 200);
    assert.equal(out.headers["Cache-Control"], "no-store");
    assert.equal(out.body.token_type, "Bearer");
    assert.equal(out.body.expires_in, 3600);
    assert.equal(out.body.scope, "bulkpublish");
    assert.equal("refresh_token" in out.body, false);
    assert.notEqual(out.body.access_token, "bpat_abc"); // never handed out raw

    // The sealed token resolves to the webapp's credential on the next request.
    const info = await oauthProvider.verifyAccessToken(out.body.access_token);
    assert.equal(info.extra?.bpKey, "bpat_abc");

    // Upstream: the right URL, the exact body, a valid signature over it.
    assert.equal(upstream!.url, "https://app.test/api/internal/managed-auth/token");
    const sent = String(upstream!.init.body);
    assert.deepEqual(JSON.parse(sent), { assertion: "a.b.c", clientId: CLAUDE });
    const h = upstream!.init.headers as Record<string, string>;
    assert.equal(h["X-BP-Signature"], signedHeaders("test-managed-secret", sent, Number(h["X-BP-Timestamp"]))["X-BP-Signature"]);
  });

  test("never outlives the webapp's token", async () => {
    reply = () => new Response(JSON.stringify({ access_token: "bpat_abc", expires_in: 120 }), { status: 200 });
    const out = await run(grant());
    assert.equal(out.body.expires_in, 120);
  });

  test("a refused assertion is invalid_grant", async () => {
    reply = () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    const out = await run(grant());
    assert.deepEqual([out.status, out.body], [400, { error: "invalid_grant" }]);
  });

  test("an upstream failure is temporarily_unavailable, not the client's fault", async () => {
    for (const r of [
      () => new Response("{}", { status: 401 }), // secrets disagree
      () => new Response("{}", { status: 500 }),
      () => new Response(JSON.stringify({ access_token: 5 }), { status: 200 }),
      () => { throw new Error("ECONNREFUSED"); },
    ]) {
      reply = r as () => Response;
      const out = await run(grant(), {}, `198.51.100.${Math.floor(Math.random() * 200)}`);
      assert.deepEqual([out.status, out.body], [503, { error: "temporarily_unavailable" }]);
    }
  });

  test("refused before any upstream call", async () => {
    const cases: Array<[Record<string, unknown>, Record<string, string>, number, string]> = [
      [grant({ assertion: undefined }), {}, 400, "invalid_request"],
      [grant({ client_id: undefined }), {}, 400, "invalid_request"],
      [grant({ client_secret: "x" }), {}, 401, "invalid_client"],
      [grant({ client_assertion: "x" }), {}, 401, "invalid_client"],
      [grant(), { authorization: "Basic eDp5" }, 401, "invalid_client"],
      [grant({ client_id: "sealed.dcr.id" }), {}, 401, "invalid_client"],
      [grant({ client_id: "https://unknown.example/doc" }), {}, 401, "invalid_client"],
      [grant({ resource: "https://evil.example/mcp" }), {}, 400, "invalid_target"],
    ];
    for (const [body, headers, status, error] of cases) {
      const out = await run(body, headers, `192.0.2.${status}`);
      assert.equal(out.status, status, JSON.stringify(body));
      assert.equal(out.body.error, error);
    }
    assert.equal(upstream, null);
  });

  test("rate limited per address", async () => {
    let last: Captured | undefined;
    for (let i = 0; i < 1201; i++) last = await run(grant(), {}, "198.18.0.77");
    assert.equal(last!.status, 429);
  });
});

process.on("exit", () => {
  globalThis.fetch = realFetch;
  (clientsStore as any).getClient = realGetClient;
});
