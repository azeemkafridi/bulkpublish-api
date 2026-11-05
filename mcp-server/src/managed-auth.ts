/**
 * Enterprise-managed authorization ("auto-connect") for the hosted server.
 *
 * MCP extension io.modelcontextprotocol/enterprise-managed-authorization, as
 * Claude implements it (claude.com/docs/connectors/building/enterprise-managed-auth):
 * the client presents an identity assertion (an ID-JAG, signed by the
 * customer's identity provider or by Claude) at our token endpoint with
 * `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, and gets an access
 * token with no consent screen.
 *
 * This server has no database, so it does not judge the assertion itself. It
 * checks the client and the resource, then forwards the assertion to the
 * webapp (POST /api/internal/managed-auth/token, HMAC-signed with
 * MANAGED_AUTH_SECRET). The webapp holds each workspace's trusted issuer and
 * the replay ledger, validates the assertion, and answers with a short-lived
 * API token for the member it names; we seal that into our own access token,
 * exactly as the interactive flow seals a pasted bp_ key.
 *
 * Registered BEFORE mcpAuthRouter on POST /token. Any other grant type falls
 * through to the SDK's handler untouched, and with MANAGED_AUTH off this
 * grant does too, which the SDK answers with unsupported_grant_type, so the
 * existing flows cannot be affected by this file.
 */
import { createHmac } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { isMetadataDocumentClientId } from "./cimd.js";
import { ACCESS_TTL, clientsStore, managedAuthEnabled, sealAccessToken } from "./oauth.js";

export const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

const BASE_URL = (process.env.BULKPUBLISH_BASE_URL || "https://app.bulkpublish.com").replace(/\/+$/, "");
/** Claude waits 10 seconds on the token endpoint; answer well inside it. */
const UPSTREAM_TIMEOUT_MS = 7000;

// A small per-IP limiter: this handler runs before the SDK's token router, so
// that router's own limiter never sees these requests.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function oauthError(res: Response, status: number, error: string, description?: string): void {
  res
    .status(status)
    .set("Cache-Control", "no-store")
    .json(description ? { error, error_description: description } : { error });
}

/** Same scheme as the webapp's lib/links/signature.ts: hex HMAC of `${ms}.${body}`. */
export function signedHeaders(secret: string, body: string, now = Date.now()): Record<string, string> {
  return {
    "X-BP-Timestamp": String(now),
    "X-BP-Signature": createHmac("sha256", secret).update(`${now}.${body}`).digest("hex"),
  };
}

/**
 * The resource identifiers that name this server: either MCP endpoint, or the
 * origin itself (Claude sends the protected-resource `resource` when it is our
 * URL or a parent of it). Tokens here are not bound to one endpoint, so this
 * only refuses a token meant for somebody else.
 */
export function isOwnResource(resource: string, publicBase: string): boolean {
  const base = publicBase.replace(/\/+$/, "");
  return [base, `${base}/`, `${base}/mcp`, `${base}/mcp/full`].includes(resource);
}

export function managedAuthTokenHandler(publicBase: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!managedAuthEnabled() || body.grant_type !== JWT_BEARER_GRANT) return next();

    if (rateLimited(req.ip ?? "unknown")) return oauthError(res, 429, "slow_down");

    const clientId = typeof body.client_id === "string" ? body.client_id : "";
    const assertion = typeof body.assertion === "string" ? body.assertion : "";
    if (!clientId || !assertion) {
      return oauthError(res, 400, "invalid_request", "client_id and assertion are required");
    }

    // Public clients only: we never issued a secret and do not advertise
    // private_key_jwt, so a request carrying client credentials is not ours.
    if (body.client_secret !== undefined || body.client_assertion !== undefined || req.headers.authorization) {
      return oauthError(res, 401, "invalid_client", "This client authenticates as a public client");
    }

    // The identity provider stamps a fixed client_id into every assertion, so
    // only a client with a stable id (a metadata document) can ever match.
    if (!isMetadataDocumentClientId(clientId) || !(await clientsStore.getClient(clientId))) {
      return oauthError(res, 401, "invalid_client", "Unknown client");
    }

    const resource = typeof body.resource === "string" ? body.resource : undefined;
    if (resource !== undefined && !isOwnResource(resource, publicBase)) {
      return oauthError(res, 400, "invalid_target", "resource is not this server");
    }

    const payload = JSON.stringify({ assertion, clientId });
    let upstream: globalThis.Response;
    try {
      upstream = await fetch(`${BASE_URL}/api/internal/managed-auth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...signedHeaders(process.env.MANAGED_AUTH_SECRET ?? "", payload),
        },
        body: payload,
        redirect: "manual",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (err) {
      console.error("managed-auth exchange unreachable:", (err as Error).message);
      return oauthError(res, 503, "temporarily_unavailable");
    }

    if (upstream.status === 400) {
      const err = (await upstream.json().catch(() => ({}))) as { error?: string };
      if (err.error === "invalid_grant") return oauthError(res, 400, "invalid_grant");
      return oauthError(res, 400, "invalid_request");
    }
    if (upstream.status !== 200) {
      // 401 here means the two sides disagree on MANAGED_AUTH_SECRET: an
      // operator problem, not the client's, so it is not reported as one.
      console.error(`managed-auth exchange answered ${upstream.status}`);
      return oauthError(res, 503, "temporarily_unavailable");
    }

    const minted = (await upstream.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown };
    if (typeof minted.access_token !== "string" || typeof minted.expires_in !== "number" || minted.expires_in <= 0) {
      console.error("managed-auth exchange answered without a usable token");
      return oauthError(res, 503, "temporarily_unavailable");
    }

    // Never outlive the credential inside it.
    const ttl = Math.max(1, Math.min(ACCESS_TTL, Math.floor(minted.expires_in)));
    res
      .status(200)
      .set("Cache-Control", "no-store")
      .json({
        access_token: sealAccessToken(minted.access_token, ttl),
        token_type: "Bearer",
        expires_in: ttl,
        scope: "bulkpublish",
      });
  };
}

/**
 * What the authorization-server metadata gains while auto-connect is on:
 * Claude uses metadata documents only when both values below are advertised
 * (`none` is already in token_endpoint_auth_methods_supported), and sends
 * assertions only when the grant type is listed.
 */
export function managedAuthMetadata(body: Record<string, unknown>): Record<string, unknown> {
  if (!managedAuthEnabled()) return body;
  const grants = Array.isArray(body.grant_types_supported) ? (body.grant_types_supported as string[]) : [];
  return {
    ...body,
    grant_types_supported: grants.includes(JWT_BEARER_GRANT) ? grants : [...grants, JWT_BEARER_GRANT],
    client_id_metadata_document_supported: true,
  };
}
