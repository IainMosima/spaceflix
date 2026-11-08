import { NextRequest } from "next/server";
import { getChannelById } from "@/lib/channels-store";
import { refreshChannel } from "@/lib/channel-refresh";
import { isPlaylist, rewritePlaylist, verify } from "@/lib/live-proxy";

export const dynamic = "force-dynamic";

const PASS_THROUGH = ["content-type", "content-length", "content-range", "accept-ranges"];

// GET /api/live/<id>            → the channel's playlist
// GET /api/live/<id>?u=…&s=…    → a playlist/segment/key URL this proxy signed earlier
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let channel = getChannelById(id);
  if (!channel) return new Response("Channel not found", { status: 404 });

  const u = request.nextUrl.searchParams.get("u");
  const s = request.nextUrl.searchParams.get("s") ?? "";
  if (u && !verify(id, u, s)) return new Response("Bad signature", { status: 403 });
  const range = request.headers.get("range");
  const open = (target: string, h: Record<string, string>) => {
    const headers = new Headers(h);
    if (range) headers.set("range", range);
    return fetch(target, {
      headers,
      redirect: "follow",
      signal: request.signal,
      cache: "no-store",
    });
  };

  let target = u ?? channel.url;
  let upstream: Response;
  try {
    upstream = await open(target, channel.headers);
    // Expired token on the channel link: re-scan its source page once and retry.
    if (!u && channel.sourceUrl && [401, 403, 404, 410].includes(upstream.status)) {
      const fresh = await refreshChannel(channel).catch(() => null);
      if (fresh && fresh.url !== channel.url) {
        upstream.body?.cancel();
        channel = fresh;
        target = fresh.url;
        upstream = await open(target, fresh.headers);
      }
    }
  } catch (err) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return new Response(`Upstream unreachable: ${(err as Error).message}`, { status: 502 });
  }

  if (!upstream.ok) {
    upstream.body?.cancel();
    return new Response(`Upstream said ${upstream.status} ${upstream.statusText}`, {
      status: upstream.status,
    });
  }

  // res.url is the post-redirect URL, so relative segment paths resolve correctly.
  const finalUrl = upstream.url || target;
  if (isPlaylist(upstream.headers.get("content-type"), finalUrl)) {
    const text = await upstream.text();
    return new Response(rewritePlaylist(text, finalUrl, id), {
      headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
    });
  }

  const out = new Headers({ "cache-control": "no-store" });
  for (const h of PASS_THROUGH) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  // fetch already decompressed the body, so the upstream length would be wrong.
  if (upstream.headers.get("content-encoding")) out.delete("content-length");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
