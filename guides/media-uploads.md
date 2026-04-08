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

Maximum file size: **100 MB**

Files exceeding this limit receive:

```json
{
  "error": "File too large (max 100MB)"
}
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
```

## Deleting Media

```bash
curl -X DELETE https://app.bulkpublish.com/api/media/42 \
  -H "Authorization: Bearer bp_your_key_here"
```

### Auto-Deletion After Publish

By default, the original media file is cleaned up after a post is successfully published to all platforms. You can control this with the `deleteMediaAfterPublish` field when creating a post:

```json
{
  "deleteMediaAfterPublish": false
}
```

Set to `false` to keep the original file for reuse. Thumbnails and previews are always retained.

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
| LinkedIn | -- | -- | Multiple | Images + videos |
| Threads | -- | -- | Multiple | Images + videos |
| Bluesky | -- | -- | 4 | Images only |
| Mastodon | -- | -- | 4 | Images + videos |
| Google Business | -- | -- | Multiple | Images only for most post types |
