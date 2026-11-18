import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rememberMediaTypes, knownMediaTypes, clearMediaTypes } from "../src/media-types.ts";

beforeEach(() => clearMediaTypes());

test("remembers types from finalize ({ file }) and list ({ files }) responses", () => {
  rememberMediaTypes("key-a", { file: { id: 72228, mimeType: "image/jpeg" } });
  rememberMediaTypes("key-a", {
    files: [
      { id: 72229, mimeType: "image/jpeg" },
      { id: 72230, mimeType: "video/mp4" },
    ],
    page: 1,
  });
  assert.deepEqual(knownMediaTypes("key-a", [72228, 72229, 72230]), [
    { id: 72228, mimeType: "image/jpeg" },
    { id: 72229, mimeType: "image/jpeg" },
    { id: 72230, mimeType: "video/mp4" },
  ]);
});

test("returns null, never a partial answer, when any file is unknown", () => {
  rememberMediaTypes("key-a", { file: { id: 1, mimeType: "image/jpeg" } });
  assert.equal(knownMediaTypes("key-a", [1, 2]), null);
});

test("keeps each API key's files apart", () => {
  rememberMediaTypes("key-a", { file: { id: 5, mimeType: "video/mp4" } });
  assert.equal(knownMediaTypes("key-b", [5]), null);
  assert.deepEqual(knownMediaTypes("key-a", [5]), [{ id: 5, mimeType: "video/mp4" }]);
});

test("ignores error bodies and records without a type", () => {
  rememberMediaTypes("key-a", { error: { message: "Daily API quota exceeded (11/10)." } });
  rememberMediaTypes("key-a", { file: { id: 9 } });
  rememberMediaTypes("key-a", null);
  assert.equal(knownMediaTypes("key-a", [9]), null);
});

test("empty id list is known (nothing to check)", () => {
  assert.deepEqual(knownMediaTypes("key-a", []), []);
});
