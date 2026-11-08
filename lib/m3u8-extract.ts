// Find .m3u8 streams behind a link you paste: a direct .m3u8, an M3U playlist, or a web page.
// ponytail: regex only, no JS execution; pages that build the URL in JS need a headless browser.

export interface StreamCandidate {
  name: string;
  url: string;
  headers: Record<string, string>;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_IFRAMES = 5;
const TIMEOUT_MS = 10_000;

const decode = (s: string) =>
  s
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/g, "&");

/** `#EXTINF:-1 …,Name` + URL lines; `#EXTVLCOPT:http-referrer/user-agent` become headers. */
export function parseM3U(text: string, base: string): StreamCandidate[] {
  const out: StreamCandidate[] = [];
  let name = "";
  let headers: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXTINF")) {
      name = line.slice(line.lastIndexOf(",") + 1).trim();
    } else if (line.startsWith("#EXTVLCOPT:")) {
      const [k, ...v] = line.slice(11).split("=");
      const value = v.join("=").trim();
      if (/^http-referr?er$/i.test(k)) headers.Referer = value;
      else if (/^http-user-agent$/i.test(k)) headers["User-Agent"] = value;
      else if (/^http-origin$/i.test(k)) headers.Origin = value;
    } else if (!line.startsWith("#") && !/\s/.test(line)) {
      try {
        const url = new URL(line, base).href;
        if (/^https?:/.test(url))
          out.push({ name: name || `Channel ${out.length + 1}`, url, headers });
      } catch {
        // not a URL line
      }
      name = "";
      headers = {};
    }
  }
  return out;
}

/** Absolute or JSON-escaped .m3u8 URLs anywhere in a page. */
export function findM3u8(html: string): string[] {
  const hits = html.match(/https?:(?:\\?\/){2}[^"'\s<>()]+?\.m3u8[^"'\s<>()]*/gi) ?? [];
  return [...new Set(hits.map(decode))];
}

export function findIframes(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<iframe[^>]+src\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const u = new URL(decode(m[1]), base).href;
      if (/^https?:/.test(u)) out.push(u);
    } catch {
      // bad src
    }
  }
  return [...new Set(out)].slice(0, MAX_IFRAMES);
}

export const pageTitle = (html: string) =>
  html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";

/** The headers a player on `page` would send. */
const playerHeaders = (page: string) => ({
  Referer: page,
  Origin: new URL(page).origin,
  "User-Agent": UA,
});

async function get(url: string, referer?: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, ...(referer ? { Referer: referer } : {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).host} said ${res.status}`);
  // Cap the body so a huge or endless response can't eat memory.
  const reader = res.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf-8"), finalUrl: res.url || url };
}

export async function extractStreams(link: string): Promise<StreamCandidate[]> {
  const url = new URL(link.trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http(s) links");

  const { text, finalUrl } = await get(url.href);
  // A stream playlist (#EXT-X-…) is the stream itself; #EXTM3U + #EXTINF channels is a channel list.
  if (/^\s*#EXTM3U/.test(text)) {
    if (/#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/.test(text))
      return [{ name: "", url: finalUrl, headers: {} }];
    return parseM3U(text, finalUrl);
  }

  const title = pageTitle(text);
  const seen = new Set<string>();
  const out: StreamCandidate[] = [];
  const collect = (html: string, page: string) => {
    for (const u of findM3u8(html)) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({ name: title, url: u, headers: playerHeaders(page) });
    }
  };
  collect(text, finalUrl);
  const frames = await Promise.allSettled(findIframes(text, finalUrl).map((f) => get(f, finalUrl)));
  for (const f of frames) if (f.status === "fulfilled") collect(f.value.text, f.value.finalUrl);
  return out;
}

/** Same channel after a refresh: same name in a playlist, else the first stream found. */
export const pickFresh = (found: StreamCandidate[], name: string) =>
  found.find((c) => c.name && c.name === name) ?? found[0] ?? null;
