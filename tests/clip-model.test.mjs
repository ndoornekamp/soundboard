import assert from "node:assert/strict";
import test from "node:test";
import {
  formatTimestamp,
  normalizeClip,
  parseTimestamp,
  parseYouTubeUrl,
  validateClipDraft,
} from "../js/clip-model.mjs";

test("parses short and long timestamps", () => {
  assert.equal(parseTimestamp("0:08"), 8);
  assert.equal(parseTimestamp("0:07.5"), 7.5);
  assert.equal(parseTimestamp("7.125"), 7.125);
  assert.equal(parseTimestamp("1:02:14"), 3734);
  assert.equal(parseTimestamp("12.5"), 12.5);
  assert.equal(formatTimestamp(3734), "1:02:14");
  assert.equal(formatTimestamp(7.5), "0:07.5");
  assert.equal(formatTimestamp(7.125), "0:07.125");
});

test("rejects malformed timestamps", () => {
  assert.throws(() => parseTimestamp("1:60"), /seconds must be less than 60/);
  assert.throws(() => parseTimestamp("1:60:00"), /minutes must be less than 60/);
  assert.throws(() => parseTimestamp(""), /required/);
});

test("normalizes common YouTube URL shapes", () => {
  assert.equal(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ").videoId, "dQw4w9WgXcQ");
  assert.equal(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=1m20s").suggestedStart, 80);
  assert.equal(parseYouTubeUrl("youtube.com/shorts/dQw4w9WgXcQ").canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.throws(() => parseYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), /must point to YouTube/);
});

test("validates a clip draft and preserves imported records", () => {
  const clip = validateClipDraft({
    title: "A moment",
    url: "https://youtu.be/dQw4w9WgXcQ",
    start: "0:04",
    end: "0:12",
  }, "fixed-id");

  assert.deepEqual(clip, {
    id: "fixed-id",
    title: "A moment",
    videoId: "dQw4w9WgXcQ",
    start: 4,
    end: 12,
    order: 0,
  });
  assert.throws(() => validateClipDraft({
    title: "Backwards",
    url: "https://youtu.be/dQw4w9WgXcQ",
    start: "0:12",
    end: "0:04",
  }), /after start/);

  const imported = normalizeClip({ ...clip, id: "imported-id", order: undefined }, 7);
  assert.equal(imported.id, "imported-id");
  assert.equal(imported.order, 7);

  const legacy = normalizeClip({
    ...clip,
    id: 42,
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    color: "mint",
    order: 8,
    createdAt: "2024-01-01T00:00:00.000Z",
  });
  assert.equal(legacy.id, "42");
  assert.equal(typeof legacy.id, "string");
  assert.deepEqual(Object.keys(legacy), ["id", "title", "videoId", "start", "end", "order"]);
});