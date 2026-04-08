#!/usr/bin/env python3
"""
Schedule a Week of Posts
========================

Creates 7 posts (one per day, Mon-Sun) from a predefined content list and
schedules them at a consistent time each morning.

Usage:
    export BULKPUBLISH_API_KEY=bp_your_key
    python schedule_week_of_posts.py

Requirements:
    pip install requests
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta

API_KEY = os.environ.get("BULKPUBLISH_API_KEY")
BASE_URL = os.environ.get("BULKPUBLISH_BASE_URL", "https://app.bulkpublish.com")

if not API_KEY:
    print("Error: Set the BULKPUBLISH_API_KEY environment variable.")
    print("Get your API key at https://app.bulkpublish.com/developer")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# --- Configuration ---

SCHEDULE_TIME = "09:00"  # 9:00 AM
TIMEZONE = "America/New_York"

# Content for each day of the week
WEEKLY_CONTENT = [
    "Monday motivation: Start your week strong! What's one goal you're tackling today? #MondayMotivation",
    "Tuesday tip: Consistency beats intensity. Show up every day, even when it's hard. #TuesdayTips",
    "Wednesday wisdom: The best time to start was yesterday. The second best time is now. #WednesdayWisdom",
    "Throwback Thursday: Remember where you started. Look how far you've come! #ThrowbackThursday #TBT",
    "Friday feature: Our latest update just dropped! Check out what's new. Link in bio. #FridayFeature",
    "Saturday spotlight: Shoutout to our amazing community. You make this all worthwhile! #SaturdaySpotlight",
    "Sunday reset: Take time to plan your week ahead. A little preparation goes a long way. #SundayReset",
]


def get_channels():
    """Fetch all active channels."""
    resp = requests.get(f"{BASE_URL}/api/channels", headers=HEADERS)
    resp.raise_for_status()
    data = resp.json()
    return data.get("channels", [])


def create_scheduled_post(content, channels, scheduled_at):
    """Create a scheduled post."""
    payload = {
        "content": content,
        "channels": channels,
        "status": "scheduled",
        "scheduledAt": scheduled_at,
        "timezone": TIMEZONE,
    }
    resp = requests.post(f"{BASE_URL}/api/posts", headers=HEADERS, json=payload)
    resp.raise_for_status()
    return resp.json()


def main():
    print("BulkPublish — Schedule a Week of Posts")
    print("=" * 42)
    print()

    # 1. Fetch channels
    print("Fetching connected channels...")
    channels = get_channels()

    if not channels:
        print("No active channels found. Connect a channel at https://app.bulkpublish.com/channels")
        sys.exit(1)

    channel_entries = [
        {"channelId": ch["id"], "platform": ch["platform"]}
        for ch in channels
    ]

    print(f"Found {len(channels)} channel(s):")
    for ch in channels:
        print(f"  - {ch['platform']}: {ch['accountName']} (ID: {ch['id']})")
    print()

    # 2. Calculate schedule dates (next Monday through Sunday)
    today = datetime.now()
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7  # Start next Monday, not today
    next_monday = today + timedelta(days=days_until_monday)
    next_monday = next_monday.replace(
        hour=int(SCHEDULE_TIME.split(":")[0]),
        minute=int(SCHEDULE_TIME.split(":")[1]),
        second=0,
        microsecond=0,
    )

    # 3. Schedule each post
    print(f"Scheduling 7 posts starting {next_monday.strftime('%A, %B %d')} at {SCHEDULE_TIME} {TIMEZONE}:")
    print()

    created_posts = []
    for i, content in enumerate(WEEKLY_CONTENT):
        scheduled_date = next_monday + timedelta(days=i)
        scheduled_iso = scheduled_date.strftime("%Y-%m-%dT%H:%M:%S")

        try:
            post = create_scheduled_post(content, channel_entries, scheduled_iso)
            post_id = post.get("id", "?")
            day_name = scheduled_date.strftime("%A")
            print(f"  [{day_name}] Post #{post_id} scheduled for {scheduled_date.strftime('%Y-%m-%d %H:%M')}")
            print(f"    Content: {content[:60]}...")
            created_posts.append(post)
        except requests.HTTPError as e:
            print(f"  [ERROR] Failed to schedule day {i + 1}: {e}")
            try:
                print(f"    Response: {e.response.json()}")
            except Exception:
                pass

    print()
    print(f"Done! {len(created_posts)}/{len(WEEKLY_CONTENT)} posts scheduled.")
    print(f"View your calendar at {BASE_URL}/calendar")


if __name__ == "__main__":
    main()
