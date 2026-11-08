// Self-check for lib/live-proxy.ts:  node scripts/live-proxy.check.mjs  (Node 22.18+ strips types)
import assert from "node:assert/strict";
import { ChannelSchema, isPlaylist, proxied, rewritePlaylist, verify } from "../lib/live-proxy.ts";

const base = "https://cdn.example.com/live/chan/index.m3u8?token=abc";
const out = rewritePlaylist(
  [
    "#EXTM3U",
    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x1',
    '#EXT-X-MAP:URI="/init.mp4"',
    "#EXTINF:6.0,",
    "seg1.ts",
    "",
    "https://other.cdn/seg2.ts",
  ].join("\n"),
  base,
  "ch_1",
);
const lines = out.split("\n");
const target = (l) => {
  const u = new URL(l.match(/\/api\/live\/[^"]+/)[0], "http://x");
  const url = u.searchParams.get("u");
  assert.ok(verify("ch_1", url, u.searchParams.get("s")), `bad sig for ${url}`);
  return url;
};
assert.equal(lines[0], "#EXTM3U");
assert.equal(target(lines[1]), "https://cdn.example.com/live/chan/key.bin");
assert.ok(lines[1].endsWith(",IV=0x1"));
assert.equal(target(lines[2]), "https://cdn.example.com/init.mp4");
assert.equal(lines[3], "#EXTINF:6.0,");
assert.equal(target(lines[4]), "https://cdn.example.com/live/chan/seg1.ts");
assert.equal(lines[5], "");
assert.equal(target(lines[6]), "https://other.cdn/seg2.ts");

// Signatures are bound to the channel and the URL.
const p = new URL(proxied("ch_1", "https://a/x.ts"), "http://x");
assert.ok(!verify("ch_2", "https://a/x.ts", p.searchParams.get("s")));
assert.ok(!verify("ch_1", "https://evil.local/", p.searchParams.get("s")));
assert.ok(!verify("ch_1", "https://a/x.ts", "x"));

assert.ok(isPlaylist("application/vnd.apple.mpegurl", "https://a/b"));
assert.ok(isPlaylist(null, "https://a/b/index.m3u8?t=1"));
assert.ok(!isPlaylist("video/mp2t", "https://a/b/seg.ts"));

assert.ok(
  ChannelSchema.safeParse({ name: "a", url: "https://a/b.m3u8", headers: { Referer: "https://x" } })
    .success,
);
assert.ok(!ChannelSchema.safeParse({ name: "a", url: "file:///etc/passwd" }).success);
assert.ok(
  !ChannelSchema.safeParse({ name: "a", url: "https://a", headers: { Host: "x" } }).success,
);
assert.ok(
  !ChannelSchema.safeParse({ name: "a", url: "https://a", headers: { "X-A": "1\r\nX-B: 2" } })
    .success,
);
console.log("live-proxy: ok");
