# Media Uploads

BulkPublish supports uploading images and videos that can be attached to posts across all platforms.

## Upload Flow

Upload a file using `POST /api/media` with a `multipart/form-data` request:

```bash
curl -X POST https://app.bulkpublish.com/api/media \
  -H "Authorization: Bearer bp_your_key_here" \
  -F "file=@photo.jpg"
```

**Python**

```python
media = client.media.upload("photo.jpg")
print(media["file"]["id"])  # Use this ID when creating posts
```

**Python (requests)**

```python
import requests

with open("photo.jpg", "rb") as f:
    response = requests.post(
        "https://app.bulkpublish.com/api/media",
        headers={"Authorization": "Bearer bp_your_key_here"},
        files={"file": ("photo.jpg", f, "image/jpeg")},
    )

media = response.json()
print(media["file"]["id"])
```

**Node.js**

```javascript
import fs from "fs";

const media = await client.media.upload(fs.createReadStream("photo.jpg"));
console.log(media.file.id);
```

### Upload Response

```json
{
  "file": {
    "id": 42,
    "fileName": "photo.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 245760,
    "width": 1080,
    "height": 1080,
    "duration": null,
    "originalUrl": "https://cdn.bulkpublish.com/media/abc123/original.jpg",
    "thumbnailUrl": "https://cdn.bulkpublish.com/media/abc123/thumb.jpg",
    "previewUrl": "https://cdn.bulkpublish.com/media/abc123/preview.jpg"
  }
}
```

For images, `width` and `height` are automatically extracted. For videos, `duration` (in seconds) is also populated.

## Supported File Types

| Type | MIME Types | Extensions |
|------|-----------|------------|
| JPEG | `image/jpeg` | `.jpg`, `.jpeg` |
| PNG | `image/png` | `.png` |
| WebP | `image/webp` | `.webp` |
| GIF | `image/gif` | `.gif` |
| MP4 | `video/mp4` | `.mp4` |
| QuickTime | `video/quicktime` | `.mov` |
| WebM | `video/webm` | `.webm` |

Any other file types are rejected with a `400` error.

## File Size Limit

Maximum size for a single-request upload (`POST /api/media`): **100 MB**

Files exceeding this limit receive:

```json
{
  "error": "File too large (max 100MB)"
}
```

Larger videos — up to **1 GB** — can be uploaded in chunks with the multipart flow below (images stay capped at 100 MB).

## Multipart Uploads (large videos, up to 1GB)

For big files, use the chunked direct-to-storage flow. The file is uploaded in fixed **10 MB parts** (`partSize` = 10485760 bytes), each to its own presigned URL — a failed part can be retried on its own, so a network drop never restarts the whole file.

**Step 1 — create.** `POST /api/media/multipart/create` with `contentType` and the exact `sizeBytes`. Returns `r2Key`, `uploadId`, `partSize`, `expiresIn` (3600 seconds), and `partUrls` — one presigned PUT URL per part, in order.

**Step 2 — upload parts + complete.** PUT each 10 MB slice of the file to its `partUrls[i]` and record the `ETag` response header of every part. Then `POST /api/media/multipart/complete` with `r2Key`, `uploadId`, the `parts` array (`{ partNumber, etag }`, 1-based), and the file metadata (`fileName`, `mimeType`, `sizeBytes`, optional `width`/`height`/`duration`). The server assembles the parts, runs the same verification as `/api/media/finalize` (existence, size, magic bytes, storage quota), and records the media file — the response has the same shape as a normal upload. A failed assembly automatically aborts the upload.

**Abort.** `POST /api/media/multipart/abort` with `r2Key` + `uploadId` cancels an in-progress upload and frees the stored parts.

**Python**

```python
up = client.media.create_multipart(content_type="video/mp4", size_bytes=size)
parts = []
with open("promo.mp4", "rb") as f:
    for i, url in enumerate(up["partUrls"]):
        chunk = f.read(up["partSize"])
        resp = httpx.put(url, content=chunk)
        parts.append({"partNumber": i + 1, "etag": resp.headers["etag"]})
result = client.media.complete_multipart(
    r2_key=up["r2Key"], upload_id=up["uploadId"], parts=parts,
    file_name="promo.mp4", mime_type="video/mp4", size_bytes=size,
)
```

**Node.js**

```javascript
const { r2Key, uploadId, partSize, partUrls } = await client.media.createMultipart({
  contentType: "video/mp4",
  sizeBytes: buffer.length,
});
const parts = [];
for (let i = 0; i < partUrls.length; i++) {
  const chunk = buffer.subarray(i * partSize, (i + 1) * partSize);
  const res = await fetch(partUrls[i], { method: "PUT", body: chunk });
  parts.push({ partNumber: i + 1, etag: res.headers.get("etag") });
}
const { file } = await client.media.completeMultipart({
  r2Key, uploadId, parts,
  fileName: "promo.mp4", mimeType: "video/mp4", sizeBytes: buffer.length,
});
```

## Content Validation

BulkPublish validates that file contents match the declared MIME type by checking magic bytes. If you send a `.jpg` file that is actually a PNG, the upload is rejected:

```json
{
  "error": "File content does not match declared type"
}
```

## Using Media in Posts

After uploading, reference media by ID in the `mediaFiles` array when creating a post:

```bash
curl -X POST https://app.bulkpublish.com/api/posts \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Check out this photo!",
    "channels": [{"channelId": 1, "platform": "instagram"}],
    "mediaFiles": [42],
    "status": "scheduled",
    "scheduledAt": "2026-04-10T12:00:00Z"
  }'
```

You can attach multiple media files:

```json
{
  "mediaFiles": [42, 43, 44]
}
```

### Media Ownership

All media files must belong to your organization. Attempting to use another organization's media returns:

```json
{
  "error": {
    "message": "Some media files do not belong to you",
    "code": "FORBIDDEN"
  }
}
```

## Thumbnails and Variants

After uploading an image, BulkPublish automatically generates:

- **Thumbnail**: A smaller version for previews in the dashboard and API responses
- **Preview**: A medium-sized version optimized for display
- **Platform variants**: Format conversions needed by specific platforms (e.g., JPEG for Instagram and Google Business Profile)

These are generated in the background. The `thumbnailUrl` and `previewUrl` fields in the response may be `null` immediately after upload and populate shortly after.

## Listing Media

Retrieve your uploaded files with pagination and search:

```bash
# List all media
curl "https://app.bulkpublish.com/api/media" \
  -H "Authorization: Bearer bp_your_key_here"

# Search by filename
curl "https://app.bulkpublish.com/api/media?search=product" \
  -H "Authorization: Bearer bp_your_key_here"

# Paginate
curl "https://app.bulkpublish.com/api/media?page=2&limit=50" \
  -H "Authorization: Bearer bp_your_key_here"

# Filter by labels
curl "https://app.bulkpublish.com/api/media?labelIds=1,2" \
  -H "Authorization: Bearer bp_your_key_here"

# Only images (or videos) — matches the MIME type prefix
curl "https://app.bulkpublish.com/api/media?type=image" \
  -H "Authorization: Bearer bp_your_key_here"
```

The response is `{ files, page, limit, total }` — `total` counts every file
matching the filters across all pages, so use it (not `files.length`, which is
capped at `limit`, max 100) when displaying library size or paginating.

## Deleting Media

```bash
curl -X DELETE https://app.bulkpublish.com/api/media/42 \
  -H "Authorization: Bearer bp_your_key_here"
```

### Media Retention

By default, media is **kept** after publishing (`deleteMediaAfterPublish: false`) and reclaimed later by a 3-month retention sweep, so recurring schedules and reposts can reuse the same files. Opt in to immediate cleanup with the `deleteMediaAfterPublish` field when creating a post:

```json
{
  "deleteMediaAfterPublish": true
}
```

The server forces this to `false` for posts attached to a recurring schedule (the schedule re-uses the media on every run) and for bulk-created posts.

## Media Labels

You can tag media files with labels for organization:

```bash
curl -X POST https://app.bulkpublish.com/api/media/42/labels \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"labelIds": [1, 2]}'
```

## Storage Limits

| Plan | Storage |
|------|---------|
| Free | 100 MB |
| Pro | 2 GB |
| Business | 10 GB |

When your storage quota is exceeded, uploads are rejected:

```json
{
  "error": {
    "message": "Media storage quota exceeded",
    "code": "QUOTA_EXCEEDED"
  }
}
```

## Platform-Specific Media Requirements

Different platforms have different requirements for media. BulkPublish handles most conversions automatically, but you should be aware of these limits:

| Platform | Image Max | Video Max | Max Files | Notes |
|----------|----------|----------|-----------|-------|
| Instagram | 8 MB (JPEG) | 1 GB | 10 (carousel) | Auto-converts to JPEG |
| TikTok | 20 MB | 4 GB | 1 video or 35 photos | Photos must be 1080px max |
| YouTube | -- | 128 GB | 1 | Video only |
| Facebook | -- | -- | Multiple | Images + videos |
| X / Twitter | -- | -- | 4 images or 1 video | GIFs supported |
| Pinterest | -- | -- | 1 | Image or video per pin |
| LinkedIn | 10 MB (JPEG/PNG/GIF) | 500 MB (MP4) | 20 images or 1 video | Video 3–1800s; 2–20 images for gallery or PDF carousel |
| Threads | -- | -- | Multiple | Images + videos |
| Bluesky | -- | -- | 4 | Images only |
| Mastodon | -- | -- | 4 | Images + videos |
| Google Business | -- | -- | Multiple | Images only for most post types |
