---
name: performance-review
description: Find which BulkPublish posts did better or worse than the account's usual, what they have in common, and how their figures grew, using each account's own median rather than raw totals. Use when the user asks what is working, which posts underperformed, why reach dropped, or what to post more or less of.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# Performance Review

Raw totals mislead: a post on a 50,000-follower account always beats one on a
500-follower account, and networks report different figures. This skill judges
each post against **its own account's usual** and only then looks for patterns.

## Tools

| Tool | Use for |
|---|---|
| `get_analytics` | Totals for the window, and with `compare: true` the previous window of the same length (windows of 15 days or fewer) |
| `get_engagement_analytics` | Every published post in the window with its figures per account. `vsMedian: true` adds the comparison with that account's usual |
| `get_post_metrics_history` | How one post's figures grew since it was published |
| `get_link_analytics` | Clicks on the short links in the window's posts |
| `get_post` | One post's text, accounts and status |
| `list_labels` | Label names, to group results by campaign or theme |

Windows are at most 30 days. Figures older than that are not kept, so never
promise a 90-day or year-on-year view.

## Reading `vsMedian`

`get_engagement_analytics` with `vsMedian: true` adds `vsMedian` to every entry
of each post's `platformMetrics`:

- `engagements` and `impressions`: the post's figure divided by the median of
  the same account's posts in the window. `1` is a typical post for that
  account, `0.5` is half, `2` is twice.
- `basis`: how many of that account's posts the median comes from.
- `null` means no comparison is possible: the network does not report that
  figure, fewer than 3 posts report it, the median is 0, or the post has not
  been measured yet. It is never a zero. YouTube is always `null`.

Rules that keep the review honest:

1. Compare a post only with its own account. Never rank posts from different
   accounts against each other by raw figures.
2. Call something an underperformer only when `basis` is at least 5 and the
   ratio is at or below 0.5; a standout at 2 or above. Between those, it is
   ordinary variation. With a smaller basis, say there is not enough history.
3. Read `supportedMetrics` before quoting any figure. A figure the network does
   not report is stored as 0; say "not reported", not "zero".
4. A post published in the last day may simply not be measured yet. Figures
   refresh about every 6 hours; X channels with metrics turned on refresh at
   most weekly.

## Recipe: what is working

1. Agree the window with the user (default: the last 30 days, ending today) and
   their timezone.
2. `get_engagement_analytics` with `from`, `to`, `tz` and `vsMedian: true`.
   Filter with `channelIds`, `platforms` or `labelIds` if the user named any.
3. From `allPosts`, collect each `platformMetrics` entry with its `vsMedian`.
   Sort into standouts, ordinary and underperformers using the rules above.
4. Look for what the standouts share and the underperformers lack. Each post
   carries `labels`, `mediaType` (text, image, video), `postFormat` (post or
   thread), `publishedAt` and `content`. Name a pattern only when at least 3
   posts show it, and say how many.
5. For the two or three most interesting posts, `get_post_metrics_history`
   shows whether a post was slow to start or stopped early. Its series are per
   destination, oldest reading first.
6. If the posts carried links, `get_link_analytics` for the same window gives
   tracked clicks per link. Report them separately: never add them to the
   network's own `clicks`.
7. Report in plain words: the 3 to 5 findings, the evidence for each (post
   count, typical ratio), and one concrete suggestion per finding. Mark which
   findings are solid and which rest on few posts.

## Recipe: why did reach drop

1. `get_analytics` with `compare: true` over a window of 15 days or fewer to
   confirm the drop and size it.
2. `get_engagement_analytics` for the same window. Check `unmeasuredPlatforms`
   and `metricsDisabledChannels` first: a network that stopped reporting, or X
   metrics that are switched off, looks exactly like a drop.
3. Check how many posts went out: fewer posts is the most common cause.
4. Then compare `vsMedian` for the recent posts. If the ratios are normal, the
   account is posting less, not doing worse.

## What not to claim

- No follower-level or demographic insights: these tools return post and link
  figures only.
- No figures for networks that report nothing per post (Google Business,
  Telegram, Tumblr, LinkedIn personal profiles). Say they cannot be measured.
- No cause you cannot show. "Video posts averaged 1.8 times the account's usual
  across 6 posts" is a finding; "the algorithm prefers video" is a guess.
