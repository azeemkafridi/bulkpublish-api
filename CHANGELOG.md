# Changelog

## 1.2.0 (2026-05-26)

### Added

- MCP server is now hostable over **Streamable HTTP** — a multi-tenant remote endpoint (`https://mcp.bulkpublish.com/mcp`) alongside the stdio bin, so web hosts (claude.ai custom connectors, Smithery's gateway, ChatGPT Apps) can connect. Serves `/.well-known/mcp/server-card.json` (skip-scan metadata) and `/health`. Per-request API key via `?key=` / `Authorization` / config; unauthenticated `initialize`/`tools/list` so scans succeed.
- **MCP Apps composer** (`compose_post`) and five read-only `view_*` widgets (`view_analytics`, `view_posts`, `view_channels`, `view_media`, `view_quota`) that render inline in MCP Apps hosts.
- In-composer **media upload** for images and video (presigned direct-to-R2) via new tools `create_media_upload` + `finalize_media_upload`. The MCP server now exposes **37 tools**.

## 1.1.0 (2026-05-21)

### Added

- LinkedIn company pages: connect personal profiles **and** organization (company) pages from the dashboard. Both appear in `GET /api/channels` with `accountType` of `personal` or `organization` and are posted to by `channelId` like any other channel.
- Documented all LinkedIn post types — `post`, `multi_image`, `pdf_carousel`, `article` — plus media limits (images JPEG/PNG/GIF ≤10 MB, max 20; MP4 ≤500 MB, 3–1800 s) and the 3,000-character limit.
- `accountType` field on the Channel type (Python SDK; already present in the Node SDK).

### Changed

- `postTypeOverrides` LinkedIn options now list `pdf_carousel` and `article`.

### Removed

- `POST /api/channels/connect-linkedin-page` from the API spec — connecting a LinkedIn page is a one-time dashboard OAuth action, not an API operation. The API lists and posts to already-connected channels.
- `GET /api/channels/:id/options` no longer returns LinkedIn organizations (connection moved to the dashboard OAuth flow).

## 1.0.0 (2024-12-01)

### Added

- MCP server with 12 tools for Claude Desktop and other AI assistants
- Python examples: CSV bulk publish, weekly scheduling, cross-platform posting, analytics export
- Node/TypeScript examples: scheduling, upload-and-publish
- curl quick-reference with every API endpoint
- AI agent examples: LangChain, Anthropic tool_use, OpenAI function calling
