import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addChannel, getChannels } from "@/lib/channels-store";
import { ChannelSchema } from "@/lib/live-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ channels: getChannels() });
}

export async function POST(request: NextRequest) {
  try {
    const channel = addChannel(ChannelSchema.parse(await request.json()));
    return NextResponse.json(channel, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    console.error("Failed to add channel:", error);
    return NextResponse.json({ error: "Failed to add channel" }, { status: 500 });
  }
}
