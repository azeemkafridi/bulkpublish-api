# Directory Submission Rules

These rules apply before submitting the BulkPublish skills, API, or MCP server to any directory, marketplace, registry, or repository.

## Duplicate prevention is mandatory

Never submit until the target has been checked for an existing listing or contribution.

1. Identify the submission type: skill folder, API repository, or MCP documentation/server listing.
2. Search the destination's own index, repository, or API first. A general web search is supplementary, not proof of absence.
3. Compare repository URLs case-insensitively after canonicalization:
   - lowercase the hostname and owner/repository path;
   - remove a trailing slash, `.git`, URL fragments, and tracking parameters;
   - treat `/tree/main/...`, `/tree/master/...`, and equivalent branch paths as the same repository when checking API or MCP listings;
   - treat a skill folder URL and its direct `SKILL.md` URL as the same skill.
4. Compare skill names, slugs, and handles case-insensitively after trimming whitespace and treating runs of hyphens, underscores, and spaces as equivalent.
5. Check both the canonical BulkPublish name and likely variants, including `BulkPublish`, `bulkpublish`, `BulkPublish API`, `BulkPublish MCP`, and each skill's slug.
6. Check the destination's pending/submitted state when visible. Do not resubmit an item marked pending, under review, or awaiting verification.
7. Record the check before submission, including the date, destination, search URL or API response, canonical URL searched, normalized name/slug, and result.

## Submission rules

- Submit one destination at a time. Wait for an authoritative success, pending, duplicate, or error result before moving on.
- Use the folder link for skills: `https://github.com/azeemkafridi/bulkpublish-api/tree/main/skills/social-media-content-skills`.
- Use the repository link for the API: `https://github.com/azeemkafridi/bulkpublish-api`.
- Use `https://app.bulkpublish.com/docs` for the MCP documentation link.
- Do not submit a skill to an MCP-only directory, or an MCP server to a skill-only directory.
- Do not create alternate listings merely because a directory uses a different category, language, or platform label.
- Paid placement, sponsorship, or listing fees require separate user confirmation immediately before payment.
- If a directory requires contact information or verification, confirm the exact destination and data before entering it.

## Minimum ledger entry

Before attempting a submission, record:

```text
Destination:
Submission type: skill | API | MCP
Canonical URL checked:
Normalized name/slug checked:
Directory search/API evidence:
Duplicate or pending listing found: yes | no | unclear
Action: submit | skip | needs review
Outcome/status:
Listing URL or receipt:
Checked/submitted at:
Notes:
```

An `unclear` duplicate check means `skip` until the destination can be checked more reliably or the user decides.
