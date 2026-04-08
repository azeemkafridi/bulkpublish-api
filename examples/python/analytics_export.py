#!/usr/bin/env python3
"""
Analytics Export
================

Fetches analytics data from BulkPublish and exports it to a JSON file.
Includes summary stats, per-platform breakdown, and daily post counts.

Usage:
    export BULKPUBLISH_API_KEY=bp_your_key
    python analytics_export.py                          # Last 30 days
    python analytics_export.py --from 2025-01-01 --to 2025-01-31
    python analytics_export.py --days 90 --output report.json

Requirements:
    pip install requests
"""

import os
import sys
import json
import argparse
import requests
from datetime import datetime, timedelta

API_KEY = os.environ.get("BULKPUBLISH_API_KEY")
BASE_URL = os.environ.get("BULKPUBLISH_BASE_URL", "https://app.bulkpublish.com")

if not API_KEY:
    print("Error: Set the BULKPUBLISH_API_KEY environment variable.")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


def get_analytics(from_date, to_date):
    """Fetch analytics summary."""
    resp = requests.get(
        f"{BASE_URL}/api/analytics/summary",
        headers=HEADERS,
        params={"from": from_date, "to": to_date},
    )
    resp.raise_for_status()
    return resp.json()


def get_posts(status=None, from_date=None, to_date=None, limit=500):
    """Fetch posts with optional filters."""
    params = {"limit": str(limit)}
    if status:
        params["status"] = status
    if from_date:
        params["from"] = from_date
    if to_date:
        params["to"] = to_date

    resp = requests.get(f"{BASE_URL}/api/posts", headers=HEADERS, params=params)
    resp.raise_for_status()
    return resp.json()


def get_quota_usage():
    """Fetch current quota usage."""
    resp = requests.get(f"{BASE_URL}/api/quotas/usage", headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


def main():
    parser = argparse.ArgumentParser(description="Export BulkPublish analytics to JSON")
    parser.add_argument("--from", dest="from_date", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--to", dest="to_date", help="End date (YYYY-MM-DD)")
    parser.add_argument("--days", type=int, default=30, help="Number of days to look back (default: 30)")
    parser.add_argument("--output", "-o", default=None, help="Output file path (default: analytics_YYYYMMDD.json)")
    args = parser.parse_args()

    # Calculate date range
    if args.from_date and args.to_date:
        from_date = args.from_date
        to_date = args.to_date
    else:
        to_dt = datetime.now()
        from_dt = to_dt - timedelta(days=args.days)
        from_date = from_dt.strftime("%Y-%m-%d")
        to_date = to_dt.strftime("%Y-%m-%d")

    output_file = args.output or f"analytics_{datetime.now().strftime('%Y%m%d')}.json"

    print("BulkPublish — Analytics Export")
    print("=" * 30)
    print(f"Date range: {from_date} to {to_date}")
    print()

    # Gather data
    print("Fetching analytics summary...")
    analytics = get_analytics(from_date, to_date)

    print("Fetching published posts...")
    published = get_posts(status="published", from_date=from_date, to_date=to_date)

    print("Fetching failed posts...")
    failed = get_posts(status="failed", from_date=from_date, to_date=to_date)

    print("Fetching quota usage...")
    quota = get_quota_usage()

    # Build export
    export_data = {
        "exportedAt": datetime.now().isoformat(),
        "dateRange": {
            "from": from_date,
            "to": to_date,
        },
        "summary": analytics,
        "quota": quota,
        "posts": {
            "published": {
                "count": published.get("total", 0),
                "items": published.get("posts", []),
            },
            "failed": {
                "count": failed.get("total", 0),
                "items": failed.get("posts", []),
            },
        },
    }

    # Print summary
    print()
    print("Summary:")
    print(f"  Total posts:  {analytics.get('totalPosts', 0)}")
    print(f"  Published:    {analytics.get('published', 0)}")
    print(f"  Failed:       {analytics.get('failed', 0)}")
    print(f"  Scheduled:    {analytics.get('scheduled', 0)}")
    print()

    by_platform = analytics.get("byPlatform", {})
    if by_platform:
        print("  By platform:")
        for platform, stats in by_platform.items():
            total = stats.get("total", 0)
            pub = stats.get("published", 0)
            fail = stats.get("failed", 0)
            rate = f"{(pub / total * 100):.0f}%" if total > 0 else "N/A"
            print(f"    {platform}: {total} total, {pub} published, {fail} failed ({rate} success)")
        print()

    by_day = analytics.get("byDay", [])
    if by_day:
        print("  Top 5 days by volume:")
        sorted_days = sorted(by_day, key=lambda d: d.get("count", 0), reverse=True)[:5]
        for day in sorted_days:
            print(f"    {day['date']}: {day['count']} posts")
        print()

    # Write to file
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(export_data, f, indent=2, default=str)

    print(f"Exported to: {output_file}")
    print(f"File size: {os.path.getsize(output_file):,} bytes")


if __name__ == "__main__":
    main()
