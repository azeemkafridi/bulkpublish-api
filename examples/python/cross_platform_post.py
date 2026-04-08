#!/usr/bin/env python3
"""
Cross-Platform Post
===================

Posts the same content to all connected channels, with platform-specific
tweaks (shorter text for X/Twitter, hashtags for Instagram, etc.).

Usage:
    export BULKPUBLISH_API_KEY=bp_your_key
    python cross_platform_post.py

Requirements:
    pip install requests
"""

import os
import sys
import json
import requests

API_KEY = os.environ.get("BULKPUBLISH_API_KEY")
BASE_URL = os.environ.get("BULKPUBLISH_BASE_URL", "https://app.bulkpublish.com")

if not API_KEY:
    print("Error: Set the BULKPUBLISH_API_KEY environment variable.")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# --- Configuration ---

# Base content (used for platforms without a specific override)
BASE_CONTENT = (
    "We just launched our biggest update yet! Here's what's new:\n\n"
    "- Smarter scheduling with AI suggestions\n"
    "- Analytics dashboard redesign\n"
    "- 3 new platform integrations\n\n"
    "Try it now at bulkpublish.com"
)

# Platform-specific content overrides
PLATFORM_CONTENT = {
    "x": (
        "We just launched our biggest update yet!\n\n"
        "- AI scheduling\n"
        "- New analytics\n"
        "- 3 new integrations\n\n"
        "Try it: bulkpublish.com"
    ),
    "instagram": (
        "We just launched our biggest update yet! Here's what's new:\n\n"
        "- Smarter scheduling with AI suggestions\n"
        "- Analytics dashboard redesign\n"
        "- 3 new platform integrations\n\n"
        "Link in bio to try it out!\n\n"
        "#socialmedia #marketing #contentcreator #scheduling #newfeature "
        "#bulkpublish #digitalmarketing #socialmediamanagement"
    ),
    "linkedin": (
        "Excited to announce a major update to BulkPublish!\n\n"
        "After months of development, we're releasing:\n\n"
        "1. AI-powered scheduling suggestions — let the algorithm find your optimal posting times\n"
        "2. Completely redesigned analytics dashboard — deeper insights, cleaner visuals\n"
        "3. Three new platform integrations — expanding where you can publish\n\n"
        "We built this based on feedback from thousands of marketers and content creators.\n\n"
        "What feature would you like to see next? Drop a comment below.\n\n"
        "Try the update: bulkpublish.com"
    ),
}

# Platform-specific settings
PLATFORM_SPECIFIC = {
    "instagram": {
        "postType": "feed",  # "feed", "reel", or "story"
    },
}


def get_channels():
    """Fetch all active channels."""
    resp = requests.get(f"{BASE_URL}/api/channels", headers=HEADERS)
    resp.raise_for_status()
    return resp.json().get("channels", [])


def main():
    print("BulkPublish — Cross-Platform Post")
    print("=" * 34)
    print()

    # 1. Fetch channels
    print("Fetching connected channels...")
    channels = get_channels()

    if not channels:
        print("No active channels found.")
        sys.exit(1)

    # Display channels
    print(f"Found {len(channels)} channel(s):")
    for ch in channels:
        status = ch.get("tokenStatus", "unknown")
        status_icon = {"valid": "[OK]", "expiring_soon": "[!]", "expired": "[X]"}.get(status, "[?]")
        print(f"  {status_icon} {ch['platform']}: {ch['accountName']} (ID: {ch['id']})")

    # Filter out channels with expired tokens
    active_channels = [ch for ch in channels if ch.get("tokenStatus") != "expired"]
    if not active_channels:
        print("\nNo channels with valid tokens. Please reconnect your accounts.")
        sys.exit(1)

    skipped = len(channels) - len(active_channels)
    if skipped > 0:
        print(f"\nSkipping {skipped} channel(s) with expired tokens.")
    print()

    # 2. Build channel entries
    channel_entries = [
        {"channelId": ch["id"], "platform": ch["platform"]}
        for ch in active_channels
    ]

    # 3. Show content preview
    print("Content preview by platform:")
    print("-" * 40)

    platforms_in_use = set(ch["platform"] for ch in active_channels)
    for platform in sorted(platforms_in_use):
        content = PLATFORM_CONTENT.get(platform, BASE_CONTENT)
        preview = content[:80].replace("\n", " ")
        char_count = len(content)
        print(f"  {platform} ({char_count} chars): {preview}...")
    print()

    # 4. Create the post
    print("Creating cross-platform post...")
    payload = {
        "content": BASE_CONTENT,
        "channels": channel_entries,
        "status": "draft",
        "platformContent": PLATFORM_CONTENT,
        "platformSpecific": PLATFORM_SPECIFIC,
    }

    resp = requests.post(f"{BASE_URL}/api/posts", headers=HEADERS, json=payload)
    resp.raise_for_status()
    post = resp.json()

    post_id = post.get("id", "?")
    status = post.get("status", "?")
    platforms = post.get("postPlatforms", [])

    print(f"\nPost created successfully!")
    print(f"  ID: {post_id}")
    print(f"  Status: {status}")
    print(f"  Platforms: {len(platforms)}")
    for pp in platforms:
        print(f"    - {pp.get('platform', '?')} (channel {pp.get('channelId', '?')})")

    print(f"\nTo publish now, run:")
    print(f"  curl -X POST {BASE_URL}/api/posts/{post_id}/publish \\")
    print(f"    -H 'Authorization: Bearer $BULKPUBLISH_API_KEY'")

    print(f"\nOr view it at {BASE_URL}/posts/{post_id}")


if __name__ == "__main__":
    main()
