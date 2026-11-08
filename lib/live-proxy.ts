import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Per-process secret: the proxy only fetches URLs it signed itself, so it can't
// be used as an open proxy into the LAN. Restart = playlists re-sign on next poll.
const SECRET = randomBytes(32);

export function sign(id: string, url: string): string {
  return createHmac("sha256", SECRET).update(`${id}|${url}`).digest("base64url");
}

export function verify(id: string, url: string, sig: string): boolean {
  const want = Buffer.from(sign(id, url));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function proxied(id: string, url: string): string {
  return `/api/live/${encodeURIComponent(id)}?u=${encodeURIComponent(url)}&s=${sign(id, url)}`;
}

/** Point every URI in an m3u8 (segment lines and URI="…" attributes) at the proxy. */
export function rewritePlaylist(text: string, base: string, id: string): string {
  const abs = (u: string) => proxied(id, new URL(u, base).href);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${abs(u)}"`);
      return abs(t);
    })
    .join("\n");
}

export function isPlaylist(contentType: string | null, url: string): boolean {
  // ponytail: no body sniffing for #EXTM3U, add it if a CDN serves playlists as octet-stream without .m3u8
  return /mpegurl/i.test(contentType ?? "") || /\.m3u8?$/i.test(new URL(url).pathname);
}

// Header names Node's fetch must not be given / that would break proxying.
const BLOCKED = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
]);
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export const ChannelSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  url: z
    .string()
    .trim()
    .url("Invalid URL")
    .refine((u) => /^https?:\/\//i.test(u), "Only http(s) links"),
  headers: z
    .record(z.string(), z.string())
    .default({})
    .superRefine((h, ctx) => {
      const bad = Object.keys(h).filter((k) => !TOKEN.test(k) || BLOCKED.has(k.toLowerCase()));
      if (bad.length)
        ctx.addIssue({
          code: "custom",
          message: `Remove ${bad.join(", ")}: the app sets ${bad.length > 1 ? "these" : "this"} itself`,
        });
    })
    .refine(
      (h) => Object.values(h).every((v) => !/[\r\n]/.test(v)),
      "Header values can't contain line breaks",
    ),
});
