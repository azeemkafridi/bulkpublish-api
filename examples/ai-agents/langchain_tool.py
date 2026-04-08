#!/usr/bin/env python3
"""
LangChain Tool Wrapper for BulkPublish
=======================================

Defines LangChain-compatible tools for creating posts and listing channels
via the BulkPublish API, then runs an agent conversation that uses them.

Usage:
    export BULKPUBLISH_API_KEY=bp_your_key
    export OPENAI_API_KEY=sk_your_key
    pip install langchain langchain-openai requests
    python langchain_tool.py

Requirements:
    pip install langchain langchain-openai requests
"""

import os
import sys
import json
import requests
from typing import Optional

API_KEY = os.environ.get("BULKPUBLISH_API_KEY")
BASE_URL = os.environ.get("BULKPUBLISH_BASE_URL", "https://app.bulkpublish.com")

if not API_KEY:
    print("Error: Set the BULKPUBLISH_API_KEY environment variable.")
    sys.exit(1)

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


# ============================================================================
# Tool Definitions
# ============================================================================

try:
    from langchain.tools import tool
    from langchain_openai import ChatOpenAI
    from langchain.agents import AgentExecutor, create_openai_tools_agent
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
except ImportError:
    print("Error: Install required packages:")
    print("  pip install langchain langchain-openai requests")
    sys.exit(1)


@tool
def list_channels() -> str:
    """List all connected social media channels.

    Returns a JSON list of channels with their IDs, platform names,
    account names, and token status.
    """
    try:
        resp = requests.get(f"{BASE_URL}/api/channels", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        channels = data.get("channels", [])

        result = []
        for ch in channels:
            result.append({
                "id": ch["id"],
                "platform": ch["platform"],
                "accountName": ch["accountName"],
                "tokenStatus": ch.get("tokenStatus", "unknown"),
            })

        return json.dumps(result, indent=2)
    except requests.RequestException as e:
        return f"Error fetching channels: {e}"


@tool
def create_post(
    content: str,
    channel_ids: str,
    status: str = "draft",
    scheduled_at: Optional[str] = None,
    timezone: str = "UTC",
) -> str:
    """Create a social media post on BulkPublish.

    Args:
        content: The post text content.
        channel_ids: Comma-separated channel IDs and platforms, e.g. "1:x,2:linkedin".
                    Get IDs from list_channels.
        status: "draft" (default) or "scheduled".
        scheduled_at: ISO datetime for scheduling, e.g. "2025-02-01T14:00:00Z".
                     Required when status is "scheduled".
        timezone: Timezone string, e.g. "America/New_York". Defaults to "UTC".

    Returns:
        JSON response with the created post details.
    """
    # Parse channel_ids string into channel entries
    channels = []
    for entry in channel_ids.split(","):
        entry = entry.strip()
        if ":" in entry:
            cid, platform = entry.split(":", 1)
            channels.append({"channelId": int(cid.strip()), "platform": platform.strip()})
        else:
            return f"Error: Invalid channel format '{entry}'. Use 'id:platform' format, e.g. '1:x,2:linkedin'"

    payload = {
        "content": content,
        "channels": channels,
        "status": status,
    }

    if scheduled_at:
        payload["scheduledAt"] = scheduled_at
    if timezone:
        payload["timezone"] = timezone

    try:
        resp = requests.post(
            f"{BASE_URL}/api/posts", headers=HEADERS, json=payload, timeout=30
        )
        resp.raise_for_status()
        post = resp.json()

        return json.dumps({
            "id": post.get("id"),
            "status": post.get("status"),
            "content": post.get("content", "")[:100],
            "scheduledAt": post.get("scheduledAt"),
            "platforms": [p.get("platform") for p in post.get("postPlatforms", [])],
        }, indent=2)
    except requests.RequestException as e:
        try:
            error_body = e.response.json() if hasattr(e, "response") and e.response else {}
        except Exception:
            error_body = {}
        return f"Error creating post: {e}\nDetails: {json.dumps(error_body)}"


@tool
def get_quota_usage() -> str:
    """Check current BulkPublish quota usage.

    Returns plan limits and current usage for posts, channels,
    media storage, and API calls.
    """
    try:
        resp = requests.get(f"{BASE_URL}/api/quotas/usage", headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return json.dumps(resp.json(), indent=2)
    except requests.RequestException as e:
        return f"Error fetching quota: {e}"


# ============================================================================
# Agent Setup & Conversation
# ============================================================================

def main():
    print("BulkPublish — LangChain Agent Example")
    print("=" * 38)
    print()

    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: Set the OPENAI_API_KEY environment variable.")
        print("This example uses OpenAI as the LLM backend for the LangChain agent.")
        sys.exit(1)

    # Define the tools
    tools = [list_channels, create_post, get_quota_usage]

    # Create the LLM
    llm = ChatOpenAI(model="gpt-4o", temperature=0)

    # Create the prompt
    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a helpful social media assistant. You help users manage "
            "their social media posts using BulkPublish. You can list their "
            "connected channels, create posts, and check quota usage. "
            "Always confirm with the user before publishing or scheduling posts."
        ),
        MessagesPlaceholder(variable_name="chat_history", optional=True),
        ("human", "{input}"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ])

    # Create the agent
    agent = create_openai_tools_agent(llm, tools, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

    # Run a sample conversation
    print("Running sample conversation...\n")
    print("-" * 50)

    # Turn 1: List channels
    print("\nUser: What channels do I have connected?\n")
    result = agent_executor.invoke({"input": "What channels do I have connected?"})
    print(f"\nAssistant: {result['output']}\n")

    print("-" * 50)

    # Turn 2: Create a draft post
    print("\nUser: Create a draft post saying 'Excited about our Q2 launch!' to all my channels.\n")
    result = agent_executor.invoke({
        "input": "Create a draft post saying 'Excited about our Q2 launch!' to all my channels."
    })
    print(f"\nAssistant: {result['output']}\n")

    print("-" * 50)

    # Turn 3: Check quotas
    print("\nUser: How much of my quota have I used?\n")
    result = agent_executor.invoke({"input": "How much of my quota have I used?"})
    print(f"\nAssistant: {result['output']}\n")

    print("=" * 50)
    print("Agent conversation complete.")


if __name__ == "__main__":
    main()
