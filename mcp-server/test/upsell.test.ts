import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutUpsell } from "../src/index.ts";

// OpenAI's plugin guidelines: a plugin "must not ... promote upgrades". The
// API's refusals are written for the web app, so the server drops the
// upgrade sentence and keeps the reason.
test("drops the upgrade sentence and keeps the reason", () => {
  assert.equal(
    withoutUpsell("This feature is not available on the Free plan. Upgrade to Pro to use it."),
    "This feature is not available on the Free plan.",
  );
  assert.equal(
    withoutUpsell("Instagram is not available on your plan. Upgrade to Pro or Business to post to it."),
    "Instagram is not available on your plan.",
  );
  assert.equal(withoutUpsell("Paused: your plan does not include RSS feeds. Upgrade to resume this feed."), "Paused: your plan does not include RSS feeds.");
});

test("keeps the other way out when the sentence offers one", () => {
  assert.equal(
    withoutUpsell("Upgrade to Pro for more storage, or free space by removing unused media from your Media Library."),
    "Free space by removing unused media from your Media Library.",
  );
});

test("other phrasings of ours are dropped too", () => {
  assert.equal(withoutUpsell("Feed limit reached. Upgrade, or turn off another feed, to resume it."), "Feed limit reached. Turn off another feed to resume it.");
  assert.equal(withoutUpsell("You have used all 10. Upgrade for a higher limit."), "You have used all 10.");
  assert.equal(withoutUpsell("Drafts only on Free. Upgrade to enable auto-publish."), "Drafts only on Free.");
});

test("a network's own upgrade advice is not ours and stays", () => {
  const t = "Hashnode refused the post. Upgrade the publication in its Hashnode dashboard under Billing, then try again.";
  assert.equal(withoutUpsell(t), t);
  assert.equal(withoutUpsell("Click Upgrade in Settings first."), "Click Upgrade in Settings first.");
});

test("a hint that is only an upsell becomes empty, so it is not appended", () => {
  assert.equal(withoutUpsell("Upgrade to Pro to use it."), "");
});

test("leaves text without an upgrade sentence alone", () => {
  for (const t of ["Post not found", "Upgrades are great", "Choose a different name or edit the existing label instead."]) {
    assert.equal(withoutUpsell(t), t);
  }
});
