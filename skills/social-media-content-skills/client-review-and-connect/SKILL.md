---
name: client-review-and-connect
description: Send BulkPublish posts to a client for review through a link that needs no account, and let a client connect their own social account through a one-time link. Use when the user works with clients, wants approval from someone outside the team, or needs a client's account connected.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish — Client Review and Connect Links

Both kinds of link are on the Pro and Business plans; Free and Lifetime answer
**403** `FEATURE_DISABLED`. BulkPublish sends nothing to the client: give the
user the URL to pass on.

## Review links

- **One post**: `share_post` (`postId`). It returns the same link each time;
  `regenerate: true` makes a new one and stops the old one. `unshare_post`
  revokes it.
- **Several posts**: `create_review_link` with up to 50 `postIds` and an
  optional `name` that only your team sees. Every call makes a new link, even
  for the same posts.
- `list_review_links` pages 50 at a time (up to 100); ask for the next page
  while page × limit < total. `delete_review_link` revokes one; the posts are
  untouched.

Find the posts first with `list_posts` (`scheduledFrom` / `scheduledTo`,
`search`, `labelIds`) and confirm the set with the user.

## Client connect links

`create_client_connect_link` with `name`, your own label for the client, which
they never see and which is applied to the channel they connect.

Tell the user:
- The link works once and expires in 7 days, or as soon as an account is
  connected through it. Creating again always makes a new link.
- The client picks the platform: Bluesky, Facebook, Instagram, X, TikTok,
  YouTube, Threads, Pinterest, Google Business, LinkedIn, Mastodon, Discord,
  Tumblr or Snapchat. A Telegram account has to be connected by the user's own
  team.
- On Bluesky the client approves access without giving a password; on Facebook
  they pick one of their Pages; on Mastodon they enter their server first.

`list_client_connect_links` shows whether each was used;
`delete_client_connect_link` revokes an unused one (an account it already
connected stays).

## Onboarding a client

1. A connect link for their accounts.
2. `create_label` for the client, so their posts can be filtered and reported.
3. Once their accounts appear in `list_channels`, a channel set with them
   (content-organisation skill).
4. A few draft posts with that label, then a review link for them.

Confirm each step before taking it.
