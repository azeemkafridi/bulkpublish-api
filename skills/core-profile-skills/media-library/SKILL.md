---
name: media-library
description: Upload images and video to BulkPublish and browse the media library, so files can be attached to posts. Use when the user wants to add or find media.
---

# BulkPublish — Media

## Tools

| Tool | Use for | Key params |
|---|---|---|
| `upload_media` | Add a file the user attached, or one at a public URL | `file` (an attached file) OR `url`, optional `filename` |
| `list_media` | Find existing files | `search`, `type`, `page`, `limit` |
| `view_media` | Browse the library visually | `limit` |
| `create_media_upload` | Reserve a direct upload (advanced) | `contentType`, `sizeBytes` |
| `finalize_media_upload` | Register that upload (advanced) | `r2Key`, `fileName`, `mimeType`, `sizeBytes` |

For anything ordinary, use `upload_media`. The two advanced tools exist for a
large direct upload and must be used as a pair — reserve, upload, then register.
A reservation that is never registered stores nothing.

## Attaching to a post

`upload_media` returns the stored file. Pass its ID in `mediaFileIds` on
`create_post`. Upload first, then create the post — a post cannot reference a
file that does not exist yet.

## Before uploading

- Supported: JPEG, PNG, WebP, GIF, MP4, MOV, WebM, and documents (PDF, Word,
  PowerPoint), which publish to LinkedIn only. Maximum 100MB.
- A file the user attached in the chat goes in `file`; a file on the web goes
  in `url`. Use one, never both. `filePath` only works when the server runs on
  the user's own computer, so do not use it here.
- Check the target platforms' requirements first with `media-preflight`:
  dimensions, aspect ratio and duration limits differ per platform and per post
  type, and a file that is fine for one can be rejected by another.

## Notes

- `list_media` returns URLs and dimensions, so prefer it over re-uploading a
  file the user already has.
- Deleting media is not available here; tell the user it is done in BulkPublish.
- Uploading the same file twice stores two copies.
