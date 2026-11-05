/**
 * Client ID Metadata Documents (MCP 2025-11-25 authorization; IETF
 * draft-ietf-oauth-client-id-metadata-document).
 *
 * A client whose client_id is an https URL is described by the JSON document at
 * that URL; there is no registration step. Claude's is
 * https://claude.ai/oauth/mcp-oauth-client-metadata, and Claude Code's is
 * https://claude.ai/oauth/claude-code-client-metadata. Enterprise-managed
 * authorization (src/managed-auth.ts) needs one: an identity provider stamps a
 * fixed client_id into every assertion, and a DCR id (a sealed blob of ours)
 * can never match it.
 *
 * The URL comes from whoever calls /authorize or /token, so the fetch is an
 * SSRF surface: https on the default port only, no IP literals, every resolved
 * address checked at connect time (so a rebinding record cannot swap in a
 * private address after the check), no redirects, small bodies, short timeout.
 *
 * Only public clients (`token_endpoint_auth_method` absent or "none") are
 * accepted. We do not advertise private_key_jwt, so Claude presents its public
 * document; Claude's docs warn that adding it later changes which client_id
 * Claude presents and breaks customers already set up.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import https from "node:https";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 8 * 1024;
const MIN_TTL_MS = 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;
const DEFAULT_TTL_MS = 5 * 60 * 1000;
/** A URL that failed is not fetched again for this long. */
const NEGATIVE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

// --- address guard ----------------------------------------------------------

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** IPv4 carried inside an IPv6 address (mapped, compatible, NAT64, 6to4). */
function embeddedIPv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  const dotted = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  const sixToFour = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/.exec(lower);
  if (sixToFour) {
    const a = parseInt(sixToFour[1], 16);
    const b = parseInt(sixToFour[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return null;
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, "ipv4");
  if (family === 6) {
    const v4 = embeddedIPv4(ip);
    if (v4) return blocked.check(v4, "ipv4");
    return blocked.check(ip, "ipv6");
  }
  return true;
}

/** DNS lookup for the socket: every record must be public, or none is used. */
function guardedLookup(
  hostname: string,
  options: object,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void
): void {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
      return callback(Object.assign(new Error(`refusing private address for ${hostname}`), { code: "EBLOCKED" }), "", 0);
    }
    if ((options as { all?: boolean }).all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

// --- client_id URL ----------------------------------------------------------

/**
 * Whether a client_id is a metadata-document URL we will fetch: https, default
 * port, a hostname (not an IP literal), a path other than "/", and no query,
 * fragment, credentials or dot segments.
 */
export function isMetadataDocumentClientId(clientId: string): boolean {
  if (!clientId.startsWith("https://") || clientId.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(clientId);
  } catch {
    return false;
  }
  if (u.href !== clientId) return false; // already normalized, so no dot segments or odd escapes
  if (u.port || u.username || u.password || u.search || u.hash) return false;
  if (u.pathname === "/" || isIP(u.hostname.replace(/^\[|\]$/g, ""))) return false;
  return true;
}

// --- fetch + validate ---------------------------------------------------------

function fetchDocument(url: string): Promise<{ body: string; maxAgeMs: number | null }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { lookup: guardedLookup as never, headers: { Accept: "application/json" }, timeout: FETCH_TIMEOUT_MS },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`metadata document answered ${res.statusCode}`));
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) {
            req.destroy(new Error("metadata document is too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(String(res.headers["cache-control"] ?? ""));
          resolve({ body: Buffer.concat(chunks).toString("utf8"), maxAgeMs: maxAge ? Number(maxAge[1]) * 1000 : null });
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("metadata document timed out")));
    req.on("error", reject);
  });
}

export type RedirectUriCheck = (uri: string) => boolean;

/**
 * Turn a fetched document into the SDK's client shape, or null if it is not a
 * document we accept. The name shown on the consent screen carries the
 * document's host, because `client_name` is whatever the document says and a
 * document anywhere could say "Claude".
 */
export function parseMetadataDocument(
  clientId: string,
  raw: string,
  isAllowedRedirectUri: RedirectUriCheck
): OAuthClientInformationFull | null {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object" || doc.client_id !== clientId) return null;

  const auth = doc.token_endpoint_auth_method;
  if (auth !== undefined && auth !== "none") return null;

  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 20) return null;
  if (!uris.every((u) => typeof u === "string" && isAllowedRedirectUri(u))) return null;

  const host = new URL(clientId).hostname;
  const name = typeof doc.client_name === "string" && doc.client_name.trim() ? doc.client_name.trim().slice(0, 100) : host;
  const grants = Array.isArray(doc.grant_types) && doc.grant_types.every((g) => typeof g === "string")
    ? (doc.grant_types as string[])
    : ["authorization_code"];

  return {
    client_id: clientId,
    client_name: `${name} (${host})`,
    redirect_uris: uris as string[],
    grant_types: grants,
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  } as OAuthClientInformationFull;
}

interface CacheEntry {
  client: OAuthClientInformationFull | null;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OAuthClientInformationFull | null>>();

/** The client a metadata-document client_id describes, or undefined. */
export async function getMetadataDocumentClient(
  clientId: string,
  isAllowedRedirectUri: RedirectUriCheck
): Promise<OAuthClientInformationFull | undefined> {
  if (!isMetadataDocumentClientId(clientId)) return undefined;
  const hit = cache.get(clientId);
  if (hit && hit.expiresAt > Date.now()) return hit.client ?? undefined;

  let pending = inflight.get(clientId);
  if (!pending) {
    pending = (async () => {
      let client: OAuthClientInformationFull | null = null;
      let ttl = NEGATIVE_TTL_MS;
      try {
        const { body, maxAgeMs } = await fetchDocument(clientId);
        client = parseMetadataDocument(clientId, body, isAllowedRedirectUri);
        if (client) ttl = Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, maxAgeMs ?? DEFAULT_TTL_MS));
      } catch (err) {
        console.error(`client metadata document ${clientId} could not be read:`, (err as Error).message);
      }
      if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(clientId, { client, expiresAt: Date.now() + ttl });
      return client;
    })().finally(() => inflight.delete(clientId));
    inflight.set(clientId, pending);
  }
  return (await pending) ?? undefined;
}

/** Tests only. */
export function clearMetadataDocumentCache(): void {
  cache.clear();
}
