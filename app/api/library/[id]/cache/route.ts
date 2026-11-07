import { NextRequest, NextResponse } from "next/server";
import { getItemById } from "@/lib/library-store";
import { extractInfoHashFromMagnet, deleteFromWorker } from "@/lib/torrent-cache-actions";
import { deleteCacheForLibraryItem } from "@/lib/storage-store";
import { removeDownload } from "@/lib/downloads-store";
import { purgeWhenNextReady } from "@/lib/purge-rule";

// DELETE /api/library/[id]/cache[?after=<seconds>][&whenReady=<infoHash>[&file=<index>]]
// Next uses `whenReady`: the episode you just finished is cleared only once the
// next one (file `file`, else that torrent's main video) is ready by the user's
// rule — watched N minutes, or P% downloaded (Settings) — so clearing never
// competes with starting it and you can still go back until then. If the next
// one never gets there (6 h), the old one is kept. `after` is a plain delay.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = getItemById(id);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const whenReady = req.nextUrl.searchParams.get("whenReady")?.toLowerCase();
  if (whenReady && /^[a-f0-9]{40}$/.test(whenReady)) {
    const file = req.nextUrl.searchParams.get("file");
    const fileIndex = file !== null && /^\d+$/.test(file) ? Number(file) : undefined;
    const prevHash = item.infoHash ?? extractInfoHashFromMagnet(item.magnet);
    purgeWhenNextReady(
      prevHash ? { infoHash: prevHash, fileIndex: item.fileIndex } : null,
      { infoHash: whenReady, fileIndex },
      () => clearItem(id),
      item.name
    );
    return NextResponse.json({ scheduled: true, whenReady }, { status: 202 });
  }

  const after = Math.min(120, Math.max(0, Number(req.nextUrl.searchParams.get("after")) || 0));
  if (after > 0) {
    setTimeout(() => clearItem(id).catch((e) => console.error("Deferred clear failed:", e)), after * 1000);
    return NextResponse.json({ scheduled: true, after }, { status: 202 });
  }
  await clearItem(id);
  return NextResponse.json({ success: true });
}

async function clearItem(id: string): Promise<void> {
  const item = getItemById(id);
  if (!item) return;
  const infoHash = extractInfoHashFromMagnet(item.magnet);
  if (infoHash) await deleteFromWorker(infoHash, item.name);

  // Filesystem fallback: clear cached bytes even if the worker isn't running.
  try {
    deleteCacheForLibraryItem(id);
  } catch (e) {
    console.error("Cache fs-fallback failed:", e);
  }

  const hash = item.infoHash ?? infoHash;
  if (hash) removeDownload(hash);
}
