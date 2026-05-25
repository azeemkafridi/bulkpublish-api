/**
 * OAuth 2.1 authorization server for the hosted BulkPublish MCP server.
 *
 * Anthropic's / ChatGPT's MCP directories require OAuth (API-key-in-URL is "not
 * supported" for listing). This implements a minimal, STATELESS OAuth server on
 * top of the MCP SDK's auth framework (mcpAuthRouter + OAuthServerProvider):
 *
 *   Claude → DCR (/register) → /authorize → consent screen (user pastes their
 *   bp_ key) → auth code → /token → access token → Authorization: Bearer on /mcp.
 *
 * No database: clients, auth codes, and tokens are self-contained AES-256-GCM
 * sealed blobs (confidential + tamper-proof) keyed by OAUTH_SIGNING_SECRET, so
 * they survive restarts and never expose the bp_ key they carry. The token is
 * just a sealed envelope around the user's own BulkPublish API key.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import type { Request, Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

const BASE_URL = (
  process.env.BULKPUBLISH_BASE_URL || "https://app.bulkpublish.com"
).replace(/\/+$/, "");

const SECRET =
  process.env.OAUTH_SIGNING_SECRET || randomBytes(32).toString("hex");
if (!process.env.OAUTH_SIGNING_SECRET) {
  console.error(
    "Warning: OAUTH_SIGNING_SECRET is not set — using an ephemeral secret. " +
      "OAuth tokens will not survive a restart; set OAUTH_SIGNING_SECRET in production."
  );
}
const KEY = scryptSync(SECRET, "bulkpublish-oauth-v1", 32);

const ACCESS_TTL = 3600; // 1h
const REFRESH_TTL = 60 * 60 * 24 * 30; // 30d
const CODE_TTL = 600; // 10m
const CLIENT_TTL = 60 * 60 * 24 * 365; // 1y

const now = () => Math.floor(Date.now() / 1000);

// --- AES-256-GCM sealed tokens: iv.tag.ciphertext (base64url) ---------------
type Sealed = Record<string, unknown> & { t: string; exp: number };

function seal(payload: Record<string, unknown>, ttlSec: number): string {
  const body = JSON.stringify({ ...payload, exp: now() + ttlSec });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

function open<T extends Sealed = Sealed>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, enc] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([
      decipher.update(enc),
      decipher.final(),
    ]).toString("utf8");
    const obj = JSON.parse(dec) as T;
    if (typeof obj.exp !== "number" || obj.exp < now()) return null;
    return obj;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
}

/** Validate a bp_ key by calling the API; true if it authenticates. */
async function isValidApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey || !apiKey.startsWith("bp_")) return false;
  try {
    const res = await fetch(`${BASE_URL}/api/quotas/usage`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- stateless clients store (client_id IS a sealed blob) -------------------
const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    const c = open<Sealed & { redirect_uris?: string[]; client_name?: string }>(
      clientId
    );
    if (!c || c.t !== "client") return undefined;
    return {
      client_id: clientId,
      redirect_uris: (c.redirect_uris as string[]) ?? [],
      client_name: c.client_name as string | undefined,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    } as OAuthClientInformationFull;
  },
  async registerClient(client) {
    // Ignore any handler-generated id; encode the client into a sealed id so we
    // need no storage and it survives restarts.
    const client_id = seal(
      {
        t: "client",
        redirect_uris: client.redirect_uris ?? [],
        client_name: client.client_name,
      },
      CLIENT_TTL
    );
    return {
      ...client,
      client_id,
      client_id_issued_at: now(),
      token_endpoint_auth_method: "none",
    } as OAuthClientInformationFull;
  },
};

function consentPage(params: {
  clientId: string;
  clientName?: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
  error?: string;
}): string {
  const f = (n: string, v?: string) =>
    `<input type="hidden" name="${n}" value="${escapeHtml(v ?? "")}" />`;
  const who = params.clientName
    ? `<strong>${escapeHtml(params.clientName)}</strong>`
    : "this app";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connect BulkPublish</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#f5f4f1; color:#1c1917; display:flex; min-height:100vh; align-items:center; justify-content:center; }
  .card { background:#fff; max-width:420px; width:calc(100% - 40px); padding:32px; border-radius:16px;
    box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.06); }
  h1 { font-size:20px; margin:0 0 4px; }
  p { color:#57534e; margin:0 0 20px; font-size:14px; }
  label { display:block; font-weight:600; font-size:13px; margin:0 0 6px; }
  input[type=text],input[type=password] { width:100%; box-sizing:border-box; height:44px; padding:0 14px;
    border:1px solid #e7e5e4; border-radius:10px; font-size:15px; background:#fafaf9; }
  input:focus { outline:none; border-color:#d97706; box-shadow:0 0 0 3px rgba(217,119,6,.15); }
  .hint { font-size:12px; color:#78716c; margin:8px 0 20px; }
  .hint a { color:#b45309; }
  button { width:100%; height:46px; border:none; border-radius:999px; background:#1c1917; color:#fff;
    font-size:15px; font-weight:600; cursor:pointer; }
  button:hover { background:#292524; }
  .err { background:#fef2f2; color:#b91c1c; padding:10px 12px; border-radius:10px; font-size:13px; margin:0 0 16px; }
  @media (prefers-color-scheme: dark){ body{background:#1c1917;color:#fafaf9} .card{background:#292524;box-shadow:none}
    input[type=text],input[type=password]{background:#1c1917;border-color:#44403c;color:#fafaf9} button{background:#d97706;color:#1c1917} }
</style></head><body>
<form class="card" method="POST" action="/oauth/consent">
  <h1>Connect BulkPublish</h1>
  <p>${who} wants to manage your social posts, channels, media, and analytics through BulkPublish.</p>
  ${params.error ? `<div class="err">${escapeHtml(params.error)}</div>` : ""}
  <label for="apiKey">Your BulkPublish API key</label>
  <input id="apiKey" name="apiKey" type="password" placeholder="bp_..." autocomplete="off" autofocus required />
  <div class="hint">Find it at <a href="${BASE_URL}/developer" target="_blank" rel="noopener">${BASE_URL.replace(/^https?:\/\//, "")}/developer</a>. It's stored only inside an encrypted token for this connection.</div>
  ${f("client_id", params.clientId)}
  ${f("redirect_uri", params.redirectUri)}
  ${f("code_challenge", params.codeChallenge)}
  ${f("state", params.state)}
  ${f("resource", params.resource)}
  <button type="submit">Authorize</button>
</form></body></html>`;
}

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      consentPage({
        clientId: client.client_id,
        clientName: client.client_name,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state,
        resource: params.resource?.href,
      })
    );
  },

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const code = open<Sealed & { cc: string }>(authorizationCode);
    if (!code || code.t !== "code") throw new Error("invalid_grant");
    return code.cc;
  },

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const code = open<Sealed & { k: string }>(authorizationCode);
    if (!code || code.t !== "code") throw new Error("invalid_grant");
    return issueTokens(code.k as string);
  },

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string
  ): Promise<OAuthTokens> {
    const rt = open<Sealed & { k: string }>(refreshToken);
    if (!rt || rt.t !== "rt") throw new Error("invalid_grant");
    return issueTokens(rt.k as string);
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const at = open<Sealed & { k: string }>(token);
    if (!at || at.t !== "at") throw new Error("invalid_token");
    return {
      token,
      clientId: "bulkpublish",
      scopes: ["bulkpublish"],
      expiresAt: at.exp,
      extra: { bpKey: at.k as string },
    };
  },
};

function issueTokens(bpKey: string): OAuthTokens {
  return {
    access_token: seal({ t: "at", k: bpKey }, ACCESS_TTL),
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: seal({ t: "rt", k: bpKey }, REFRESH_TTL),
    scope: "bulkpublish",
  };
}

/**
 * Handles the consent form POST: validates the bp_ key, mints a sealed auth
 * code carrying the key + PKCE challenge, and redirects back to the client.
 * Wire this as: app.post("/oauth/consent", urlencoded, handleConsent).
 */
export async function handleConsent(req: Request, res: Response): Promise<void> {
  const b = (req.body ?? {}) as Record<string, string>;
  const apiKey = (b.apiKey ?? "").trim();
  const clientId = b.client_id ?? "";
  const redirectUri = b.redirect_uri ?? "";
  const codeChallenge = b.code_challenge ?? "";
  const state = b.state ?? "";
  const resource = b.resource ?? "";

  const client = await clientsStore.getClient(clientId);
  // Prevent open redirects: redirect_uri must belong to the registered client.
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    res.status(400).send("Invalid client or redirect_uri.");
    return;
  }

  const reRender = (error: string) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      consentPage({
        clientId,
        clientName: client.client_name,
        redirectUri,
        codeChallenge,
        state,
        resource,
        error,
      })
    );
  };

  if (!apiKey.startsWith("bp_")) {
    return reRender("That doesn't look like a BulkPublish API key (bp_…).");
  }
  if (!(await isValidApiKey(apiKey))) {
    return reRender("That API key was rejected. Double-check it and try again.");
  }

  const code = seal({ t: "code", k: apiKey, cc: codeChallenge, ru: redirectUri }, CODE_TTL);
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
}
