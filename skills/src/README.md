# Skill sources

The one place a skill is written. Every published copy is generated from here:

| Copy | Profile | Shipped as |
|---|---|---|
| `../core-profile-skills` | `core` | the ChatGPT plugin package, and any connector on `mcp.bulkpublish.com/mcp` |
| `../inbox-profile-skills` | `inbox` | beside core, for a connector running the Inbox profile |
| `../social-media-content-skills` | `full` | the npm/stdio server and `/mcp/full` |
| `bulkpublish-ai-toolkit/skills` | `full` | the Claude Code, Cursor and Gemini plugins and `npx skills add` |

```bash
cd mcp-server
npm run build && npm run build:skills   # write every copy
npm run check:skills                    # fail on drift, absent tools, wrong facts
```

The toolkit copy is written only when that repository is checked out beside this
one. Commit it there separately.

## Format

Each folder holds a `SKILL.md` whose frontmatter adds two fields the copies do
not carry:

- `profiles: core, full` — which copies get the skill. `inbox` alone means the
  Inbox copy; a skill core already has is never repeated there.
- `description.<profile>` — optional, a different description for one profile.

In the body:

- `<<<full: text ||| core: other text>>>` picks text per profile. A profile not
  named gets nothing. Written on lines of its own it is a block and leaves no
  blank line behind. Put a space before an inline one.
- `{{post-types}}` is the table of every `postTypeOverrides` value, read from
  `create_post`'s schema, so it cannot fall behind the server.
- `{{media-rules}}` is the media rules paragraph the prompts use
  (`MEDIA_RULES` in `mcp-server/src/prompts.ts`).

## What the check catches

`npm run check:skills` builds every copy in memory and fails when a committed
copy differs, then checks each copy against its own profile: a tool name the
profile does not serve, prose promising a feature it lacks, a vendor name, a
post type or a table parameter the schema does not accept, and claims that
were once true and are not any more (`scripts/lib/facts.mjs`). The prompt check
runs the same fact checks on every rendered prompt.
