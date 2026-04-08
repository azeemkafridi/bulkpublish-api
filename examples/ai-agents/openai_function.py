#!/usr/bin/env python3
"""
OpenAI Function Calling — BulkPublish Post Manager
===================================================

Uses OpenAI's function calling API to let GPT-4 manage social media
posts via BulkPublish.

The script:
  1. Defines functions for list_channels, create_post, and publish_post
  2. Sends a user message to GPT-4
  3. GPT-4 calls functions, we execute them, and return results
  4. GPT-4 produces the final response

Usage:
    export BULKPUBLISH_API_KEY=bp_your_key
    export OPENAI_API_KEY=sk-your_key
    pip install openai requests
    python openai_function.py

Requirements:
    pip install openai requests
"""

import os
import sys
import json
import requests

API_KEY = os.environ.get("BULKPUBLISH_API_KEY")
BASE_URL = os.environ.get("BULKPUBLISH_BASE_URL", "https://app.bulkpublish.com")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

if not API_KEY:
    print("Error: Set the BULKPUBLISH_API_KEY environment variable.")
    sys.exit(1)

if not OPENAI_API_KEY:
    print("Error: Set the OPENAI_API_KEY environment variable.")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

try:
    from openai import OpenAI
except ImportError:
    print("Error: Install required packages:")
    print("  pip install openai requests")
    sys.exit(1)


# ============================================================================
# Function Definitions (OpenAI format)
# ============================================================================

FUNCTIONS = [
    {
        "type": "function",
        "function": {
            "name": "list_channels",
            "description": (
                "List all connected social media channels. Returns channel IDs, "
                "platform names, account names, and token status."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_post",
            "description": (
                "Create a social media post. Can be a draft or scheduled for a future time. "
                "Requires content text and at least one channel (get IDs from list_channels)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The post text content.",
                    },
                    "channel_ids_and_platforms": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "channelId": {"type": "integer"},
                                "platform": {"type": "string"},
                            },
                            "required": ["channelId", "platform"],
                        },
                        "description": "Array of {channelId, platform} objects.",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["draft", "scheduled"],
                        "description": "draft (default) or scheduled.",
                    },
                    "scheduled_at": {
                        "type": "string",
                        "description": "ISO 8601 datetime, e.g. 2025-02-01T14:00:00Z.",
                    },
                    "timezone": {
                        "type": "string",
                        "description": "Timezone, e.g. America/New_York.",
                    },
                },
                "required": ["content", "channel_ids_and_platforms"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "publish_post",
            "description": "Publish a draft post immediately by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "post_id": {
                        "type": "integer",
                        "description": "The post ID to publish.",
                    },
                },
                "required": ["post_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_analytics",
            "description": (
                "Get analytics summary for a date range. Returns total posts, "
                "status breakdown, per-platform stats, and daily counts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "from_date": {
                        "type": "string",
                        "description": "Start date (YYYY-MM-DD).",
                    },
                    "to_date": {
                        "type": "string",
                        "description": "End date (YYYY-MM-DD).",
                    },
                },
                "required": ["from_date", "to_date"],
            },
        },
    },
]


# ============================================================================
# Function Execution
# ============================================================================

def call_function(name: str, arguments: dict) -> str:
    """Execute a function call against the BulkPublish API."""

    try:
        if name == "list_channels":
            resp = requests.get(f"{BASE_URL}/api/channels", headers=HEADERS, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            channels = [
                {
                    "id": ch["id"],
                    "platform": ch["platform"],
                    "accountName": ch["accountName"],
                    "tokenStatus": ch.get("tokenStatus", "unknown"),
                }
                for ch in data.get("channels", [])
            ]
            return json.dumps(channels, indent=2)

        elif name == "create_post":
            payload = {
                "content": arguments["content"],
                "channels": arguments["channel_ids_and_platforms"],
                "status": arguments.get("status", "draft"),
            }
            if "scheduled_at" in arguments and arguments["scheduled_at"]:
                payload["scheduledAt"] = arguments["scheduled_at"]
            if "timezone" in arguments and arguments["timezone"]:
                payload["timezone"] = arguments["timezone"]

            resp = requests.post(
                f"{BASE_URL}/api/posts", headers=HEADERS, json=payload, timeout=30
            )
            resp.raise_for_status()
            post = resp.json()
            return json.dumps({
                "id": post.get("id"),
                "status": post.get("status"),
                "content": (post.get("content") or "")[:100],
                "scheduledAt": post.get("scheduledAt"),
                "platforms": [p["platform"] for p in post.get("postPlatforms", [])],
            }, indent=2)

        elif name == "publish_post":
            post_id = arguments["post_id"]
            resp = requests.post(
                f"{BASE_URL}/api/posts/{post_id}/publish", headers=HEADERS, timeout=30
            )
            resp.raise_for_status()
            data = resp.json()
            return json.dumps({
                "id": data.get("id"),
                "status": data.get("status"),
                "platforms": [
                    {"platform": p["platform"], "status": p["status"]}
                    for p in data.get("postPlatforms", [])
                ],
            }, indent=2)

        elif name == "get_analytics":
            params = {
                "from": arguments["from_date"],
                "to": arguments["to_date"],
            }
            resp = requests.get(
                f"{BASE_URL}/api/analytics/summary",
                headers=HEADERS,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            return json.dumps(resp.json(), indent=2)

        else:
            return json.dumps({"error": f"Unknown function: {name}"})

    except requests.HTTPError as e:
        error_body = {}
        try:
            error_body = e.response.json()
        except Exception:
            pass
        return json.dumps({"error": str(e), "details": error_body})
    except Exception as e:
        return json.dumps({"error": str(e)})


# ============================================================================
# Conversation Loop
# ============================================================================

def run_conversation(user_message: str):
    """Run a full function-calling conversation with GPT-4."""

    client = OpenAI()

    print(f"User: {user_message}")
    print()

    messages = [
        {
            "role": "system",
            "content": (
                "You are a social media management assistant. You help users "
                "manage their posts via BulkPublish. When asked to create or "
                "schedule posts, first list channels to get valid IDs, then "
                "create the post. Be concise."
            ),
        },
        {"role": "user", "content": user_message},
    ]

    # Keep looping until the model stops calling functions
    while True:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=FUNCTIONS,
            tool_choice="auto",
        )

        message = response.choices[0].message

        # If no tool calls, print the final response and break
        if not message.tool_calls:
            print(f"GPT-4: {message.content}")
            break

        # Add assistant message (with tool calls) to history
        messages.append(message)

        # Process each function call
        for tool_call in message.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)

            print(f"  [Function call: {fn_name}({json.dumps(fn_args, indent=2)})]")

            result = call_function(fn_name, fn_args)
            print(f"  [Result: {result[:200]}{'...' if len(result) > 200 else ''}]")

            # Add function result to messages
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    print()


# ============================================================================
# Main
# ============================================================================

def main():
    print("BulkPublish — OpenAI Function Calling Example")
    print("=" * 46)
    print()

    # Example 1: Create and publish a post
    print("--- Example 1: Create and publish a post ---")
    print()
    run_conversation(
        "Create a post saying 'Just shipped a major update! Thread below with details.' "
        "and publish it to all my channels immediately."
    )

    print("-" * 50)
    print()

    # Example 2: Get analytics
    print("--- Example 2: Get analytics ---")
    print()
    run_conversation(
        "How did my posts perform this month? Give me a summary."
    )

    print("=" * 50)
    print("Done.")


if __name__ == "__main__":
    main()
