import { NextRequest, NextResponse } from "next/server";
import { extractStreams } from "@/lib/m3u8-extract";

export const dynamic = "force-dynamic";

// POST { url } → { candidates: [{ name, url, headers }] }
export async function POST(request: NextRequest) {
  const { url } = (await request.json().catch(() => ({}))) as { url?: unknown };
  if (typeof url !== "string" || !url.trim())
    return NextResponse.json({ error: "Paste a link first" }, { status: 400 });
  try {
    const candidates = await extractStreams(url);
    if (!candidates.length)
      return NextResponse.json(
        { error: "No .m3u8 found on that page. Add the stream link by hand below." },
        { status: 404 },
      );
    return NextResponse.json({ candidates });
  } catch (err) {
    const e = err as Error;
    const msg = e.name === "TimeoutError" ? "That site took too long to answer" : e.message;
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
