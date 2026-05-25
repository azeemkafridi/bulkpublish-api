# BulkPublish MCP Server — hosted Streamable HTTP transport (src/http.ts).
#
# This image hosts the SAME tool suite as the npm/stdio server over HTTP so web
# hosts (claude.ai custom connectors, Smithery's gateway) can connect. It is a
# separate concern from the npm package: npm ships the stdio bin (dist/index.js);
# this image runs the HTTP entry (dist/http.js). Multi-tenant — holds no API key.
#
# Build context: mcp-server/   ·   Serves: :8080  (GET /health, /mcp, /.well-known/mcp/server-card.json)

# ---- deps: full install (incl. dev) for the build ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile TS → dist (uses the committed src/ui/widgets.generated.ts) ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npx tsc

# ---- prod-deps: runtime dependencies only ----
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
EXPOSE 8080
# BULKPUBLISH_BASE_URL defaults to https://app.bulkpublish.com inside the app.
# No API key here — callers supply their own per request (?key= / Authorization).
CMD ["node", "dist/http.js"]
