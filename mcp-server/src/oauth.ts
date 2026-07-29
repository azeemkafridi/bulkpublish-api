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

/**
 * Our own issuer identifier, per RFC 9207.
 *
 * MUST be byte-identical to the `issuer` in the authorization-server metadata,
 * because a client validating `iss` compares them as exact strings. http.ts
 * passes `issuerUrl: new URL(PUBLIC_BASE)` to mcpAuthRouter, which serialises
 * it via URL.href — and href appends a trailing slash to an origin-only URL
 * ("https://mcp.bulkpublish.com" -> "https://mcp.bulkpublish.com/"). Building
 * this the same way keeps the two in step; do NOT strip the trailing slash.
 */
const ISSUER = new URL(
  (process.env.PUBLIC_BASE_URL || "https://mcp.bulkpublish.com").replace(/\/+$/, "")
).href;

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
    const c = open<
      Sealed & {
        redirect_uris?: string[];
        client_name?: string;
        application_type?: string;
      }
    >(clientId);
    if (!c || c.t !== "client") return undefined;
    return {
      client_id: clientId,
      redirect_uris: (c.redirect_uris as string[]) ?? [],
      client_name: c.client_name as string | undefined,
      // MCP 2026-07-28 / SEP-837: desktop and CLI clients register as "native"
      // so an authorization server knows not to reject their localhost
      // redirects. We accept any registered redirect_uri, so this changes no
      // behaviour here — but it must survive a round trip rather than being
      // silently dropped, since clients read it back from the registration.
      application_type: c.application_type as string | undefined,
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
        application_type: (client as { application_type?: string }).application_type,
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

export function consentPage(params: {
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
  // Mirrors the webapp's AuthLayout + sign-in page: same fonts, tokens, card
  // geometry and ambient gradients. Values are copied from
  // webapp/src/styles/global.css (:root, .auth-*, .input, .label, .btn) — keep
  // them in sync when the webapp tokens change.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connect BulkPublish</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    color-scheme: light;
    --font-display: 'Inter', system-ui, -apple-system, sans-serif;
    --font-body: 'DM Sans', system-ui, -apple-system, sans-serif;
    --stone-100: #F5F5F4;
    --stone-400: #A8A29E;
    --stone-500: #78716C;
    --stone-700: #3D3830;
    --stone-800: #222222;
    --stone-900: #1A1A1A;
    --accent-50: #FFF4E6;
    --accent-500: #FA8112;
    --accent-600: #E06D00;
    --card-yellow: #FEF3C7;
    --color-error-bg: #FEF7F7;
    --surface-main: #FFFFFF;
    --radius-md: 8px;
    --radius-xl: 16px;
    --radius-2xl: 20px;
    --radius-pill: 999px;
    --transition-base: 180ms ease;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: var(--font-body);
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--stone-800);
    background: var(--stone-100);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px 16px;
    position: relative;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  body::before, body::after { content: ''; position: absolute; pointer-events: none; }
  body::before {
    top: -40%; right: -20%; width: 60vw; height: 60vw;
    background: radial-gradient(circle, var(--accent-50) 0%, transparent 70%);
  }
  body::after {
    bottom: -30%; left: -15%; width: 50vw; height: 50vw; opacity: .3;
    background: radial-gradient(circle, var(--card-yellow) 0%, transparent 70%);
  }
  .card {
    position: relative;
    width: 100%;
    max-width: 420px;
    background: var(--surface-main);
    border-radius: var(--radius-2xl);
    padding: 48px 40px;
    animation: authFadeIn 600ms cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  @keyframes authFadeIn {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .logo { display: block; margin-bottom: 36px; }
  h1 {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--stone-900);
    margin: 0 0 8px;
  }
  .sub { font-size: 0.8125rem; color: var(--stone-500); margin: 0 0 32px; }
  label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--stone-700);
    margin-bottom: 6px;
  }
  input[type=text], input[type=password] {
    width: 100%;
    height: 42px;
    padding: 0 16px;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--stone-800);
    background: var(--stone-100);
    border: none;
    border-radius: var(--radius-xl);
    transition: box-shadow var(--transition-base);
  }
  input::placeholder { color: var(--stone-400); }
  input:focus { outline: none; box-shadow: 0 0 0 3px var(--accent-50); }
  .hint { font-size: 0.8125rem; color: var(--stone-500); margin: 10px 0 24px; }
  .hint a { color: var(--accent-500); text-decoration: underline; }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 46px;
    padding: 0 28px;
    border: none;
    border-radius: var(--radius-pill);
    font-family: inherit;
    font-size: 0.9375rem;
    font-weight: 500;
    background: var(--accent-500);
    color: #fff;
    cursor: pointer;
    transition: all var(--transition-base);
  }
  button:hover { background: var(--accent-600); transform: translateY(-1px); }
  button:active { transform: translateY(0); }
  .err {
    padding: 10px 14px;
    border-radius: var(--radius-md);
    background: var(--color-error-bg);
    color: #991B1B;
    font-size: 0.8125rem;
    font-weight: 500;
    margin: 0 0 16px;
  }
</style></head><body>
<form class="card" method="POST" action="/oauth/consent">
  <a class="logo" href="https://www.bulkpublish.com" target="_blank" rel="noopener"><img src="${BASE_URL}/assets/logo.svg" alt="BulkPublish" width="36" height="22" style="display:block;" /></a>
  <h1>Connect BulkPublish</h1>
  <p class="sub">${who} wants to manage your social posts, channels, media, and analytics through BulkPublish.</p>
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
  // RFC 9207 (MCP 2026-07-28, SEP-2468): name ourselves in the authorization
  // response so a client holding several authorization servers cannot be
  // tricked into redeeming our code at a different one (the "AS mix-up"
  // attack). Clients that validate `iss` require this; clients that don't
  // ignore the extra parameter, so it is safe to always send.
  url.searchParams.set("iss", ISSUER);
  res.redirect(url.toString());
}
