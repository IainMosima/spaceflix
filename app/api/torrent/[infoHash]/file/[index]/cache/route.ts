import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { clearFileFromWorker } from "@/lib/torrent-cache-actions";
import {
  getCachePath,
  allocatedSize,
  deleteCacheFile,
  formatBytes,
} from "@/lib/storage-store";
import { removeDownload } from "@/lib/downloads-store";
import { purgeWhenNextReady } from "@/lib/purge-rule";

// GET /api/torrent/[infoHash]/file/[index]/cache?path=<relative cache path>
// How much disk this one file is holding right now.
export async function GET(req: NextRequest) {
  const relPath = req.nextUrl.searchParams.get("path");
  const cachedBytes = relPath ? allocatedSize(join(getCachePath(), relPath)) : 0;
  return NextResponse.json({
    cachedBytes,
    cachedFormatted: formatBytes(cachedBytes),
  });
}

// DELETE /api/torrent/[infoHash]/file/[index]/cache?path=<relative cache path>
// Clears one episode's cached bytes. Prefers the worker (it also resets the
// piece bitfield so the file re-downloads cleanly), and falls back to deleting
// the file directly when the worker is down or the torrent isn't active.
//
// With `whenReady=1&next=<file index>` (Next in a season pack) it answers 202
// and clears [index] only once episode `next` of the same torrent is ready by
// the user's rule (watched N minutes / P% downloaded). Kept if you go back to
// it, or if that doesn't happen within 6 h.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ infoHash: string; index: string }> }
) {
  const { infoHash, index } = await params;
  const fileIndex = parseInt(index, 10);
  if (Number.isNaN(fileIndex)) {
    return NextResponse.json({ error: "Invalid index" }, { status: 400 });
  }
  const relPath = req.nextUrl.searchParams.get("path");

  if (req.nextUrl.searchParams.get("whenReady") === "1") {
    const next = req.nextUrl.searchParams.get("next") ?? "";
    if (!/^\d+$/.test(next) || Number(next) === fileIndex) {
      return NextResponse.json({ error: "Invalid next index" }, { status: 400 });
    }
    const hash = infoHash.toLowerCase();
    purgeWhenNextReady(
      { infoHash: hash, fileIndex },
      { infoHash: hash, fileIndex: Number(next) },
      async () => {
        await clearFile(infoHash, fileIndex, relPath);
      },
      `${hash} file ${fileIndex}`
    );
    return NextResponse.json({ scheduled: true, next: Number(next) }, { status: 202 });
  }

  try {
    const { viaWorker, reclaimedBytes } = await clearFile(infoHash, fileIndex, relPath);
    return NextResponse.json({
      success: true,
      viaWorker,
      reclaimedBytes,
      reclaimedFormatted: formatBytes(reclaimedBytes),
    });
  } catch (e) {
    console.error("Episode cache fs-fallback failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clear episode cache" },
      { status: 500 }
    );
  }
}

async function clearFile(
  infoHash: string,
  fileIndex: number,
  relPath: string | null
): Promise<{ viaWorker: boolean; reclaimedBytes: number }> {
  const diskPath = relPath ? join(getCachePath(), relPath) : null;
  const before = diskPath ? allocatedSize(diskPath) : 0;

  const viaWorker = await clearFileFromWorker(infoHash, fileIndex);

  let reclaimedBytes = 0;
  if (diskPath && relPath) {
    const after = allocatedSize(diskPath);
    reclaimedBytes = Math.max(0, before - after);
    if (!viaWorker && after > 0) reclaimedBytes = deleteCacheFile(relPath); // throws → 500
  }

  // The bytes are gone, so stop re-pinning them after a restart.
  removeDownload(infoHash, fileIndex);
  return { viaWorker, reclaimedBytes };
}
