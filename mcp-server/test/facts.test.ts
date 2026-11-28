import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error -- plain .mjs helper shared by the check scripts, no types
import { xLimitProblems } from "../scripts/lib/facts.mjs";

// X allows 280 characters only on a standard account; a paid X subscription
// raises it to 25,000. The skill and prompt checks flag a line that states
// 280 for X without that condition.
const stale = [
  "X has a 280-character limit for tweets.",
  "X limit is 280 characters.",
  "X: 280 characters max.",
  "| X | 280 |",
  "| X | 280 | yes |",
  "| X / Twitter | 280 |",
  "Keep it short for X (280).",
  "Twitter's limit is 280.",
  "Captions are capped at 280 characters on X.",
  "a 280-character limit for X",
];

test("flags every unconditional statement of X's limit as 280", () => {
  for (const line of stale) {
    assert.equal(xLimitProblems(line).length, 1, line);
  }
});

const fine = [
  "| X | 280, or 25,000 with a paid X subscription (`metadata.xSubscription` is `Basic`, `Premium` or `PremiumPlus`); a post to several X accounts uses the smallest of their limits; a link counts as 23 |",
  "| X | 280 (25,000 with a paid X subscription; several X accounts use the smallest limit) | yes |",
  "so on X (280 on a standard account) or Bluesky (300) tracking may silently not apply.",
  "X allows 280 characters, or 25,000 when every X channel on the post has a paid X subscription.",
  "| Char limit | 280 |", // a table cell with no platform on the line
  "Bluesky allows 300 characters and Threads 500.",
  "Upload a 1080x1920 video; 280 frames is fine.",
  "X and Threads post a poll on any part; durations run 5 to 10080 minutes.",
];

test("passes conditional prose and lines that are not about X's limit", () => {
  for (const line of fine) assert.deepEqual(xLimitProblems(line), [], line);
});
