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

test("a hint that is only an upsell becomes empty, so it is not appended", () => {
  assert.equal(withoutUpsell("Upgrade to Pro to use it."), "");
});

test("leaves text without an upgrade sentence alone", () => {
  for (const t of ["Post not found", "Upgrades are great", "Choose a different name or edit the existing label instead."]) {
    assert.equal(withoutUpsell(t), t);
  }
});
