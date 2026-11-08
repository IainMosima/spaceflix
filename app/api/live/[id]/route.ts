import { NextRequest } from "next/server";
import { getChannelById } from "@/lib/channels-store";
import { isPlaylist, rewritePlaylist, verify } from "@/lib/live-proxy";

export const dynamic = "force-dynamic";

const PASS_THROUGH = ["content-type", "content-length", "content-range", "accept-ranges"];

// GET /api/live/<id>            → the channel's playlist
// GET /api/live/<id>?u=…&s=…    → a playlist/segment/key URL this proxy signed earlier
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = getChannelById(id);
  if (!channel) return new Response("Channel not found", { status: 404 });

  const u = request.nextUrl.searchParams.get("u");
  const s = request.nextUrl.searchParams.get("s") ?? "";
  if (u && !verify(id, u, s)) return new Response("Bad signature", { status: 403 });
  const target = u ?? channel.url;

  const headers = new Headers(channel.headers);
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers,
      redirect: "follow",
      signal: request.signal,
      cache: "no-store",
    });
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
