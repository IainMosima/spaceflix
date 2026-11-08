import { NextRequest, NextResponse } from "next/server";
import { getDataDir, getHostDataDir, getMediaRoot, setDataDir, toHostPath } from "@/lib/data-dir";
import { getDiskSpace } from "@/lib/storage-store";
import { getTorrentEngine } from "@/lib/torrent-engine";
import type { DataDirReport } from "@/types";

// GET /api/data-dir - current active data directory + free space there
export async function GET() {
  try {
    const disk = getDiskSpace();
    const report: DataDirReport = {
      activeDir: getDataDir(),
      hostDir: getHostDataDir(),
      docker: process.env.SPACEFLIX_DOCKER === "1",
      mediaRoot: toHostPath(getMediaRoot()),
      freeBytes: disk.freeBytes,
      totalBytes: disk.totalBytes,
    };
    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to get data dir:", error);
    return NextResponse.json(
      { error: "Failed to get data dir" },
      { status: 500 }
    );
  }
}

// POST /api/data-dir - switch the active data directory and restart the torrent worker
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const path = body?.path;
    if (typeof path !== "string" || path.trim().length === 0) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    let activeDir: string;
    try {
      activeDir = setDataDir(path);
    } catch (e) {
      // A folder that can't be used is the user's choice, not a server fault.
      return NextResponse.json({ error: e instanceof Error ? e.message : "Can't use that folder" }, { status: 400 });
    }
    await getTorrentEngine().restartWorker();

    return NextResponse.json({ success: true, activeDir: toHostPath(activeDir) });
  } catch (error) {
    console.error("Failed to switch data dir:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to switch data dir" },
      { status: 500 }
    );
  }
}
