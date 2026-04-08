#!/usr/bin/env python3
"""
Claude Tool Use — BulkPublish Post Scheduler
=============================================

Uses the Anthropic Python SDK with tool_use to let Claude schedule
social media posts via the BulkPublish API.

The script:
  1. Defines tool schemas for list_channels, create_post, and list_posts
  2. Sends a user message asking Claude to schedule a post
  3. Claude calls the tools, we execute them, and return results
  4. Claude produces the final response

Usage:
    export BULKPUBLISH_API_KEY=bp_your_key
    export ANTHROPIC_API_KEY=sk-ant-your_key
    pip install anthropic requests
    python claude_tool_use.py

Requirements:
    pip install anthropic requests
"""

import os
import sys
import json
import requests

API_KEY = os.environ.get("BULKPUBLISH_API_KEY")
BASE_URL = os.environ.get("BULKPUBLISH_BASE_URL", "https://app.bulkpublish.com")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

if not API_KEY:
    print("Error: Set the BULKPUBLISH_API_KEY environment variable.")
    sys.exit(1)

if not ANTHROPIC_API_KEY:
    print("Error: Set the ANTHROPIC_API_KEY environment variable.")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

try:
    import anthropic
except ImportError:
    print("Error: Install required packages:")
    print("  pip install anthropic requests")
    sys.exit(1)


# ============================================================================
# Tool Definitions (Anthropic format)
# ============================================================================

TOOLS = [
    {
        "name": "list_channels",
        "description": (
            "List all connected social media channels on BulkPublish. "
            "Returns channel IDs, platform names, account names, and token status."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "active": {
                    "type": "boolean",
                    "description": "Filter by active status. Defaults to true.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "create_post",
        "description": (
            "Create a social media post on BulkPublish. Can be a draft or scheduled. "
            "Requires content and at least one channel. Get channel IDs from list_channels first."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The post text content.",
                },
                "channels": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "channelId": {"type": "integer", "description": "Channel ID."},
                            "platform": {"type": "string", "description": "Platform name."},
                        },
                        "required": ["channelId", "platform"],
                    },
                    "description": "Array of channels to post to.",
                },
                "status": {
                    "type": "string",
                    "enum": ["draft", "scheduled"],
                    "description": "Post status. Default: draft.",
                },
                "scheduledAt": {
                    "type": "string",
                    "description": "ISO 8601 datetime for scheduling.",
                },
                "timezone": {
                    "type": "string",
                    "description": "Timezone, e.g. America/New_York.",
                },
            },
            "required": ["content", "channels"],
        },
    },
    {
        "name": "list_posts",
        "description": (
            "List posts on BulkPublish with optional filters. "
            "Returns paginated results with platform statuses."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["draft", "scheduled", "publishing", "published", "failed", "partial"],
                    "description": "Filter by post status.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Results per page (default 20).",
                },
            },
            "required": [],
        },
    },
]


# ============================================================================
# Tool Execution
# ============================================================================

def execute_tool(tool_name: str, tool_input: dict) -> str:
    """Execute a tool call and return the result as a string."""

    if tool_name == "list_channels":
        active = tool_input.get("active", True)
        params = {"active": str(active).lower()}
        resp = requests.get(f"{BASE_URL}/api/channels", headers=HEADERS, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        channels = data.get("channels", [])
        result = [
            {
                "id": ch["id"],
                "platform": ch["platform"],
                "accountName": ch["accountName"],
                "tokenStatus": ch.get("tokenStatus", "unknown"),
            }
            for ch in channels
        ]
        return json.dumps(result, indent=2)

    elif tool_name == "create_post":
        payload = {
            "content": tool_input["content"],
            "channels": tool_input["channels"],
            "status": tool_input.get("status", "draft"),
        }
        if "scheduledAt" in tool_input:
            payload["scheduledAt"] = tool_input["scheduledAt"]
        if "timezone" in tool_input:
            payload["timezone"] = tool_input["timezone"]

        resp = requests.post(f"{BASE_URL}/api/posts", headers=HEADERS, json=payload, timeout=30)
        resp.raise_for_status()
        post = resp.json()
        return json.dumps({
            "id": post.get("id"),
            "status": post.get("status"),
            "scheduledAt": post.get("scheduledAt"),
            "platforms": [p["platform"] for p in post.get("postPlatforms", [])],
        }, indent=2)

    elif tool_name == "list_posts":
        params = {}
        if "status" in tool_input:
            params["status"] = tool_input["status"]
        if "limit" in tool_input:
            params["limit"] = str(tool_input["limit"])

        resp = requests.get(f"{BASE_URL}/api/posts", headers=HEADERS, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        posts = data.get("posts", [])
        result = [
            {
                "id": p["id"],
                "status": p["status"],
                "content": (p.get("content") or "")[:80],
                "scheduledAt": p.get("scheduledAt"),
            }
            for p in posts[:10]
        ]
        return json.dumps({"total": data.get("total", 0), "posts": result}, indent=2)

    else:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})


# ============================================================================
# Conversation Loop
# ============================================================================

def run_conversation(user_message: str):
    """Run a full tool-use conversation with Claude."""

    client = anthropic.Anthropic()

    print(f"User: {user_message}")
    print()

    messages = [{"role": "user", "content": user_message}]

    # Keep looping until Claude stops requesting tools
    while True:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=(
                "You are a helpful social media assistant. You manage posts via BulkPublish. "
                "When the user asks to schedule or create posts, first check their channels, "
                "then create the post with appropriate settings. Be concise and clear."
            ),
            tools=TOOLS,
            messages=messages,
        )

        # Check if Claude wants to use tools
        tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

        if not tool_use_blocks:
            # No tool calls — print the final text response
            for block in response.content:
                if hasattr(block, "text"):
                    print(f"Claude: {block.text}")
            break

        # Process each tool call
        tool_results = []
        for tool_block in tool_use_blocks:
            tool_name = tool_block.name
            tool_input = tool_block.input

            print(f"  [Tool call: {tool_name}({json.dumps(tool_input, indent=2)})]")

            try:
                result = execute_tool(tool_name, tool_input)
                print(f"  [Tool result: {result[:200]}{'...' if len(result) > 200 else ''}]")
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_block.id,
                    "content": result,
                })
            except Exception as e:
                error_msg = f"Tool error: {e}"
                print(f"  [Tool error: {error_msg}]")
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_block.id,
                    "content": error_msg,
                    "is_error": True,
                })

        # Add assistant response and tool results to messages
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    print()


# ============================================================================
# Main
# ============================================================================

def main():
    print("BulkPublish — Claude Tool Use Example")
    print("=" * 38)
    print()

    # Example 1: Schedule a post
    print("--- Example 1: Schedule a post ---")
    print()
    run_conversation(
        "Schedule a post for tomorrow at 10am Eastern saying "
        "'Big announcement coming this Friday! Stay tuned.' "
        "to all my channels."
    )

    print("-" * 50)
    print()

    # Example 2: Check existing posts
    print("--- Example 2: Check scheduled posts ---")
    print()
    run_conversation("Show me my scheduled posts.")

    print("=" * 50)
    print("Done.")


if __name__ == "__main__":
    main()
