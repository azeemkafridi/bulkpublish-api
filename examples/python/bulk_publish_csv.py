#!/usr/bin/env python3
"""
Bulk Publish from CSV
=====================

Reads a CSV file and creates posts from each row. Supports scheduling,
platform targeting, and media attachments.

CSV format:
    content,platforms,scheduled_at,media_url
    "Hello world!","x,linkedin","2025-02-01T10:00:00Z",""
    "Check this out","instagram","2025-02-01T14:00:00Z","https://example.com/img.jpg"

Columns:
    - content (required): Post text
    - platforms (required): Comma-separated platform names (or "all" for all channels)
    - scheduled_at (optional): ISO 8601 datetime; if empty, post is saved as draft
    - media_url (optional): URL to an image/video to attach

Usage:
    export BULKPUBLISH_API_KEY=bp_your_key
    python bulk_publish_csv.py posts.csv

Requirements:
    pip install requests
"""

import os
import sys
import csv
import json
import requests
from pathlib import Path

API_KEY = os.environ.get("BULKPUBLISH_API_KEY")
BASE_URL = os.environ.get("BULKPUBLISH_BASE_URL", "https://app.bulkpublish.com")

if not API_KEY:
    print("Error: Set the BULKPUBLISH_API_KEY environment variable.")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


def get_channels():
    """Fetch all active channels, keyed by platform."""
    resp = requests.get(f"{BASE_URL}/api/channels", headers=HEADERS)
    resp.raise_for_status()
    channels = resp.json().get("channels", [])
    by_platform = {}
    for ch in channels:
        by_platform.setdefault(ch["platform"], []).append(ch)
    return channels, by_platform


def upload_media_from_url(url):
    """Download a file from a URL and upload it to BulkPublish."""
    print(f"    Downloading media from {url[:80]}...")
    file_resp = requests.get(url, stream=True, timeout=60)
    file_resp.raise_for_status()

    content_type = file_resp.headers.get("Content-Type", "application/octet-stream")
    filename = url.split("/")[-1].split("?")[0] or "upload"

    files = {
        "file": (filename, file_resp.content, content_type),
    }
    upload_resp = requests.post(
        f"{BASE_URL}/api/media",
        headers={"Authorization": f"Bearer {API_KEY}"},
        files=files,
    )
    upload_resp.raise_for_status()
    data = upload_resp.json()
    file_info = data.get("file", data)
    print(f"    Uploaded: {file_info.get('fileName', filename)} (ID: {file_info.get('id', '?')})")
    return file_info.get("id")


def create_post(content, channel_entries, scheduled_at=None, media_file_ids=None):
    """Create a post via the API."""
    payload = {
        "content": content,
        "channels": channel_entries,
        "status": "scheduled" if scheduled_at else "draft",
    }
    if scheduled_at:
        payload["scheduledAt"] = scheduled_at
    if media_file_ids:
        payload["mediaFiles"] = media_file_ids

    resp = requests.post(f"{BASE_URL}/api/posts", headers=HEADERS, json=payload)
    resp.raise_for_status()
    return resp.json()


def main():
    if len(sys.argv) < 2:
        print("Usage: python bulk_publish_csv.py <csv_file>")
        print()
        print("CSV columns: content, platforms, scheduled_at, media_url")
        sys.exit(1)

    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        print(f"Error: File not found: {csv_path}")
        sys.exit(1)

    print("BulkPublish — Bulk Publish from CSV")
    print("=" * 36)
    print()

    # Fetch channels
    print("Fetching channels...")
    all_channels, channels_by_platform = get_channels()
    if not all_channels:
        print("No active channels found.")
        sys.exit(1)

    print(f"Found {len(all_channels)} channel(s) across {len(channels_by_platform)} platform(s)")
    print()

    # Read CSV
    success_count = 0
    error_count = 0
    total_rows = 0

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row_num, row in enumerate(reader, start=2):  # Row 2 = first data row
            total_rows += 1
            content = row.get("content", "").strip()
            platforms_str = row.get("platforms", "").strip()
            scheduled_at = row.get("scheduled_at", "").strip() or None
            media_url = row.get("media_url", "").strip() or None

            if not content:
                print(f"  Row {row_num}: SKIP (empty content)")
                continue

            print(f"  Row {row_num}: {content[:50]}...")

            # Resolve platforms to channel entries
            channel_entries = []
            if platforms_str.lower() == "all":
                channel_entries = [
                    {"channelId": ch["id"], "platform": ch["platform"]}
                    for ch in all_channels
                ]
            else:
                for platform in platforms_str.split(","):
                    platform = platform.strip().lower()
                    if platform in channels_by_platform:
                        for ch in channels_by_platform[platform]:
                            channel_entries.append(
                                {"channelId": ch["id"], "platform": ch["platform"]}
                            )
                    else:
                        print(f"    Warning: No channel for platform '{platform}', skipping it")

            if not channel_entries:
                print(f"    ERROR: No valid channels for platforms: {platforms_str}")
                error_count += 1
                continue

            # Upload media if provided
            media_file_ids = None
            if media_url:
                try:
                    media_id = upload_media_from_url(media_url)
                    if media_id:
                        media_file_ids = [media_id]
                except Exception as e:
                    print(f"    Warning: Media upload failed: {e}")

            # Create the post
            try:
                post = create_post(content, channel_entries, scheduled_at, media_file_ids)
                post_id = post.get("id", "?")
                status = post.get("status", "?")
                print(f"    Created post #{post_id} ({status}) -> {len(channel_entries)} channel(s)")
                success_count += 1
            except requests.HTTPError as e:
                print(f"    ERROR: {e}")
                try:
                    print(f"    Response: {e.response.json()}")
                except Exception:
                    pass
                error_count += 1

    print()
    print(f"Done! {success_count} created, {error_count} errors, {total_rows} total rows.")


if __name__ == "__main__":
    main()
