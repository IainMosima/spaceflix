// Self-check for lib/m3u8-extract.ts:  node scripts/m3u8-extract.check.mjs  (Node 22.18+ strips types)
import assert from "node:assert/strict";
import { findIframes, findM3u8, pageTitle, parseM3U, pickFresh } from "../lib/m3u8-extract.ts";

const html = `<html><title> Match Day </title>
<script>var cfg = {"src":"https:\\/\\/cdn.example.com\\/live\\/a.m3u8?token=1\\u0026e=2"};</script>
<video src="https://cdn2.example.com/b/index.m3u8"></video>
<a href="https://cdn2.example.com/b/index.m3u8">dup</a>
<iframe width=1 src="/embed/1"></iframe><iframe src='https://player.example.net/x?id=2&amp;k=3'></iframe>`;

assert.deepEqual(findM3u8(html), [
  "https://cdn.example.com/live/a.m3u8?token=1&e=2",
  "https://cdn2.example.com/b/index.m3u8",
]);
assert.deepEqual(findIframes(html, "https://site.example.org/watch"), [
  "https://site.example.org/embed/1",
  "https://player.example.net/x?id=2&k=3",
]);
assert.equal(pageTitle(html), "Match Day");

const list = parseM3U(
  [
    "#EXTM3U",
    '#EXTINF:-1 tvg-id="a" group-title="Sports",Sports One',
    "#EXTVLCOPT:http-referrer=https://ref.example/",
    "#EXTVLCOPT:http-user-agent=VLC/3",
    "https://s.example/one.m3u8",
    "#EXTINF:-1,Sports Two",
    "two/index.m3u8",
    "not a url at all",
  ].join("\n"),
  "https://lists.example/sports.m3u",
);
assert.equal(list.length, 2);
assert.deepEqual(list[0], {
  name: "Sports One",
  url: "https://s.example/one.m3u8",
  headers: { Referer: "https://ref.example/", "User-Agent": "VLC/3" },
});
assert.deepEqual(list[1], {
  name: "Sports Two",
  url: "https://lists.example/two/index.m3u8",
  headers: {},
});

assert.equal(pickFresh(list, "Sports Two").url, "https://lists.example/two/index.m3u8");
assert.equal(pickFresh(list, "Gone").url, "https://s.example/one.m3u8");
assert.equal(pickFresh([], "x"), null);
console.log("m3u8-extract: ok");
