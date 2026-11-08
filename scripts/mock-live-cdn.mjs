// Local stand-in for a header-locked live CDN, to test the Live feature end to end.
//   node scripts/mock-live-cdn.mjs        (needs ffmpeg)
// It encodes a real live HLS stream (test pattern + tone) and serves it only when a request has:
//   Origin:  https://www.example-sports.test
//   Referer: https://www.example-sports.test/...
//   User-Agent containing "Chrome/"
// and the playlist link has a valid, unexpired ?sign=…&t=… (sign = md5(SECRET + t)).
// Anything else gets a 403 that says why, just like the real thing would.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFile, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

const PORT = Number(process.env.PORT ?? 8383);
const ORIGIN = "https://www.example-sports.test";
const SECRET = "spaceflix-mock";
const dir = mkdtempSync(join(tmpdir(), "spaceflix-mock-live-"));

// Rolling 6 x 2s window, old segments deleted, so disk use stays at a few MB.
const ffmpeg = spawn(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-re",
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25",
    "-f", "lavfi", "-i", "sine=frequency=440",
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-g", "50", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "96k",
    "-f", "hls", "-hls_time", "2", "-hls_list_size", "6", "-hls_flags", "delete_segments",
    join(dir, "playlist.m3u8"),
  ],
  { stdio: ["ignore", "inherit", "inherit"] }
);

const cleanup = () => {
  ffmpeg.kill("SIGKILL");
  rmSync(dir, { recursive: true, force: true });
};
process.on("SIGINT", () => (cleanup(), process.exit(0)));
process.on("SIGTERM", () => (cleanup(), process.exit(0)));
ffmpeg.on("exit", (code) => code && (console.error(`ffmpeg exited (${code})`), cleanup(), process.exit(1)));

const md5 = (s) => createHash("md5").update(s).digest("hex");

function why(req, url) {
  const h = req.headers;
  if (h.origin !== ORIGIN) return `Origin must be ${ORIGIN} (got ${h.origin ?? "none"})`;
  if (!h.referer?.startsWith(`${ORIGIN}/`)) return `Referer must start with ${ORIGIN}/ (got ${h.referer ?? "none"})`;
  if (!/Chrome\//.test(h["user-agent"] ?? "")) return "User-Agent must look like Chrome";
  if (url.pathname.endsWith("/playlist.m3u8")) {
    const t = Number(url.searchParams.get("t"));
    if (!t || t * 1000 < Date.now()) return "link expired (t)";
    if (url.searchParams.get("sign") !== md5(SECRET + t)) return "bad sign";
  }
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const denied = why(req, url);
  const tag = `${req.method} ${url.pathname}`;
  if (denied) {
    console.log(`403 ${tag}  ← ${denied}`);
    res.writeHead(403, { "content-type": "text/plain" }).end(`Forbidden: ${denied}\n`);
    return;
  }
  const file = basename(url.pathname); // flat dir: no path traversal
  readFile(join(dir, file), (err, body) => {
    if (err) return res.writeHead(404).end();
    console.log(`200 ${tag}`);
    res
      .writeHead(200, {
        "content-type": file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t",
        "cache-control": "no-store",
      })
      .end(body);
  });
}).listen(PORT, () => {
  const t = Math.floor(Date.now() / 1000) + 3600;
  console.log(`\nMock live CDN on http://localhost:${PORT} (wait ~6s for the first segments)\n`);
  console.log("Channel link (valid 1 hour):");
  console.log(`  http://localhost:${PORT}/moviebox/device01/playlist.m3u8?sign=${md5(SECRET + t)}&t=${t}\n`);
  console.log("Headers to add on the channel:");
  console.log(`  Origin      ${ORIGIN}`);
  console.log(`  Referer     ${ORIGIN}/`);
  console.log("  User-Agent  Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36\n");
});
