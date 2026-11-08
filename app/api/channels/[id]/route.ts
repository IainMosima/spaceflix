import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteChannel, getChannelById, updateChannel } from "@/lib/channels-store";
import { ChannelSchema } from "@/lib/live-proxy";
import { refreshChannel } from "@/lib/channel-refresh";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, { params }: Ctx) {
  const channel = getChannelById((await params).id);
  return channel
    ? NextResponse.json(channel)
    : NextResponse.json({ error: "Channel not found" }, { status: 404 });
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const updated = updateChannel(
      (await params).id,
      ChannelSchema.partial().parse(await request.json()),
    );
    return updated
      ? NextResponse.json(updated)
      : NextResponse.json({ error: "Channel not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    console.error("Failed to update channel:", error);
    return NextResponse.json({ error: "Failed to update channel" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: Ctx) {
  return deleteChannel((await params).id)
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Channel not found" }, { status: 404 });
}

// POST /api/channels/<id> → re-scan the source link for a fresh stream URL.
export async function POST(_: NextRequest, { params }: Ctx) {
  const channel = getChannelById((await params).id);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (!channel.sourceUrl)
    return NextResponse.json({ error: "No source link saved for this channel" }, { status: 400 });
  try {
    const fresh = await refreshChannel(channel);
    return fresh
      ? NextResponse.json(fresh)
      : NextResponse.json({ error: "No stream found on the source link" }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
