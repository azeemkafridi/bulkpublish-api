"""
Type definitions for the BulkPublish SDK.

All types are plain ``TypedDict`` subclasses — no Pydantic or other heavy
dependency required.  They exist purely for editor autocompletion, static
analysis, and documentation; at runtime every API response is a regular
``dict``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

# Python 3.8 compat: TypedDict lives in typing_extensions before 3.11
try:
    from typing import TypedDict, NotRequired  # type: ignore[attr-defined]
except ImportError:
    from typing_extensions import TypedDict, NotRequired  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Posts
# ---------------------------------------------------------------------------


class ChannelTarget(TypedDict):
    """Channel reference used when creating/updating a post."""

    channelId: str
    platform: str


class PlatformResult(TypedDict, total=False):
    """Per-platform result included in a post's ``platformResults``."""

    platform: str
    platformPostId: str
    url: str
    status: str
    error: str


class Post(TypedDict, total=False):
    """A social-media post object."""

    id: str
    content: str
    status: str
    scheduledAt: Optional[str]
    publishedAt: Optional[str]
    timezone: str
    channels: List[ChannelTarget]
    mediaFiles: List[str]
    labelIds: List[str]
    postFormat: str
    platformSpecific: Dict[str, Any]
    platformContent: Dict[str, Any]
    platformResults: List[PlatformResult]
    deleteMediaAfterPublish: bool
    threadParts: List[Dict[str, Any]]
    createdAt: str
    updatedAt: str


class PostList(TypedDict, total=False):
    """Paginated list of posts returned by ``posts.list()``."""

    posts: List[Post]
    total: int
    page: int
    limit: int
    totalPages: int


class PostMetrics(TypedDict, total=False):
    """Engagement metrics for a single post."""

    likes: int
    comments: int
    shares: int
    impressions: int
    reach: int
    clicks: int
    saves: int
    engagementRate: float


class QueueSlot(TypedDict, total=False):
    """Next optimal publishing slot."""

    suggestedTime: str
    channelId: str


class BulkOperationResult(TypedDict, total=False):
    """Result of a bulk post operation."""

    success: int
    failed: int
    errors: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Channels
# ---------------------------------------------------------------------------


class Channel(TypedDict, total=False):
    """A connected social-media channel."""

    id: str
    platform: str
    name: str
    username: str
    avatarUrl: str
    active: bool
    createdAt: str
    updatedAt: str


class ChannelHealth(TypedDict, total=False):
    """Health status for a connected channel."""

    healthy: bool
    lastChecked: str
    error: str


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------


class MediaFile(TypedDict, total=False):
    """An uploaded media file."""

    id: str
    filename: str
    mimeType: str
    size: int
    url: str
    thumbnailUrl: str
    width: int
    height: int
    labelIds: List[str]
    createdAt: str


class MediaUploadResponse(TypedDict, total=False):
    """Response from a media upload."""

    file: MediaFile


class MediaList(TypedDict, total=False):
    """Paginated list of media files."""

    files: List[MediaFile]
    total: int
    page: int
    limit: int
    totalPages: int


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------


class AnalyticsSummary(TypedDict, total=False):
    """High-level analytics summary."""

    totalPosts: int
    totalImpressions: int
    totalEngagements: int
    totalClicks: int
    avgEngagementRate: float
    topPost: Optional[Post]


class EngagementDataPoint(TypedDict, total=False):
    """A single data point in an engagement time series."""

    date: str
    impressions: int
    engagements: int
    clicks: int
    likes: int
    comments: int
    shares: int


class AccountMetrics(TypedDict, total=False):
    """Account-level metrics for a channel."""

    followers: int
    following: int
    totalPosts: int
    engagementRate: float


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------


class Label(TypedDict, total=False):
    """A label (tag) for organizing posts and media."""

    id: str
    name: str
    color: str
    createdAt: str
    updatedAt: str


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------


class Schedule(TypedDict, total=False):
    """A recurring publishing schedule."""

    id: str
    name: str
    channelIds: List[str]
    cronExpression: str
    timezone: str
    active: bool
    content: str
    templateId: str
    createdAt: str
    updatedAt: str


# ---------------------------------------------------------------------------
# API Keys
# ---------------------------------------------------------------------------


class ApiKey(TypedDict, total=False):
    """An API key."""

    id: str
    name: str
    prefix: str
    lastUsedAt: Optional[str]
    expiresAt: Optional[str]
    createdAt: str


class ApiKeyUsage(TypedDict, total=False):
    """Current API usage stats."""

    used: int
    limit: int
    remaining: int
    resetsAt: str


class ApiKeyUsageHistoryEntry(TypedDict, total=False):
    """A single day's usage record."""

    date: str
    count: int


# ---------------------------------------------------------------------------
# Quotas
# ---------------------------------------------------------------------------


class QuotaUsage(TypedDict, total=False):
    """Current plan quota usage."""

    posts: Dict[str, int]
    channels: Dict[str, int]
    media: Dict[str, int]
    plan: str


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class Notification(TypedDict, total=False):
    """A user notification."""

    id: str
    type: str
    title: str
    message: str
    read: bool
    createdAt: str


class NotificationPreferences(TypedDict, total=False):
    """Notification preference settings."""

    email: bool
    push: bool
    publishSuccess: bool
    publishFailure: bool
    weeklyDigest: bool


# ---------------------------------------------------------------------------
# Organizations
# ---------------------------------------------------------------------------


class Organization(TypedDict, total=False):
    """An organization."""

    id: str
    name: str
    slug: str
    role: str
    createdAt: str


# ---------------------------------------------------------------------------
# Link Preview
# ---------------------------------------------------------------------------


class LinkPreview(TypedDict, total=False):
    """Open Graph preview data for a URL."""

    title: str
    description: str
    image: str
    url: str
    siteName: str


# ---------------------------------------------------------------------------
# Activity
# ---------------------------------------------------------------------------


class ActivityEntry(TypedDict, total=False):
    """An activity log entry."""

    id: str
    action: str
    resourceType: str
    resourceId: str
    details: Dict[str, Any]
    createdAt: str
