import { NextRequest, NextResponse } from "next/server";
import { getTorrentEngine } from "@/lib/torrent-engine";
import { getDiskSpace, formatBytes } from "@/lib/storage-store";
import { extractInfoHashFromMagnet } from "@/lib/torrent-cache-actions";
import {
  addDownload,
  downloadId,
  listDownloads,
  prefetchAccepted,
  removeDownload,
  setPaused,
  withTimeout,
  workerUnpin,
  workerPrefetch,
  type DownloadEntry,
} from "@/lib/downloads-store";
import { getSettings } from "@/lib/settings-store";
import { targetFor, type PreloadMode } from "@/lib/preload";
import type { TorrentInfo } from "@/types";

type DownloadState = "queued" | "downloading" | "paused" | "ready" | "error";

interface DownloadRow {
  id: string;
  infoHash: string;
  fileIndex: number;
  title: string;
  magnet: string;
  size: number;
  progress: number;
  state: DownloadState;
  speed: number;
  message?: string;
  /** Partial preload size; absent = whole file. */
  targetBytes?: number;
  /** Shown once after queueing, e.g. "Only room for 9%". */
  notice?: string;
}

const READY_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const RESUME_EVERY_MS = 3 * 60 * 1000;
const ADD_TIMEOUT_MS = 90_000;

// Last re-pin failure per download id; cleared when a pin succeeds.
const pinErrors = new Map<string, string>();

// ponytail: lazy resume on the first GET after a restart (then every few
// minutes while anything is unfinished); add instrumentation.ts if downloads
// must restart before anyone opens the app.
let resuming: Promise<void> | null = null;
let lastResume = 0;

function toRow(entry: DownloadEntry, torrent: TorrentInfo | undefined): DownloadRow {
  const id = downloadId(entry.infoHash, entry.fileIndex);
  const f = torrent?.files[entry.fileIndex];
  // A partial preload is measured against its target, from verified bytes.
  const progress = entry.targetBytes
    ? (f?.pinProgress ?? Math.min(1, (f?.downloaded ?? 0) / entry.targetBytes))
    : (f?.progress ?? 0);
  const speed = torrent?.downloadSpeed ?? 0;
  const base = {
    id,
    infoHash: entry.infoHash,
    fileIndex: entry.fileIndex,
    title: entry.title,
    magnet: entry.magnet,
    size: entry.size,
    progress,
    speed,
    ...(entry.targetBytes && { targetBytes: entry.targetBytes }),
  };
  if (progress >= 1) return { ...base, state: "ready" };
  if (entry.paused) return { ...base, speed: 0, state: "paused" };
  const message = pinErrors.get(id);
  if (message) return { ...base, state: "error", message };
  if (!torrent || (progress === 0 && !speed)) return { ...base, state: "queued" };
  return { ...base, state: "downloading" };
}

async function activeTorrents(): Promise<TorrentInfo[]> {
  try {
    const data = await withTimeout(getTorrentEngine().getActiveTorrents(), 3000, "Worker");
    return data.torrents ?? [];
  } catch {
    return [];
  }
}

function findTorrent(torrents: TorrentInfo[], hash: string): TorrentInfo | undefined {
  return torrents.find((t) => t.infoHash?.toLowerCase() === hash);
}

async function pin(
  entry: Pick<DownloadEntry, "infoHash" | "fileIndex" | "targetBytes">
): Promise<string | null> {
  const r = await workerPrefetch(entry.infoHash, entry.fileIndex, true, entry.targetBytes);
  const id = downloadId(entry.infoHash, entry.fileIndex);
  if (prefetchAccepted(r)) {
    pinErrors.delete(id);
    return null;
  }
  const message = `Couldn't start download (${r.reason ?? "worker error"})`;
  pinErrors.set(id, message);
  return message;
}

/** Re-add and re-pin every unfinished download. The worker forgets pins on restart. */
async function resume(entries: DownloadEntry[]): Promise<void> {
  const engine = getTorrentEngine();
  for (const entry of entries) {
    const id = downloadId(entry.infoHash, entry.fileIndex);
    try {
      const loaded = await withTimeout(engine.getTorrent(entry.infoHash), 5000, "Worker");
      if (!loaded) await withTimeout(engine.addTorrent(entry.magnet), ADD_TIMEOUT_MS, "Loading torrent");
      await pin(entry);
    } catch (e) {
      pinErrors.set(id, e instanceof Error ? e.message : "Couldn't resume download");
    }
  }
}

// GET /api/downloads
export async function GET() {
  const torrents = await activeTorrents();
  const now = Date.now();
  const rows: DownloadRow[] = [];
  const unfinished: DownloadEntry[] = [];

  for (const entry of listDownloads()) {
    const row = toRow(entry, findTorrent(torrents, entry.infoHash));
    if (row.state === "ready" && now - entry.addedAt > READY_KEEP_MS) {
      removeDownload(entry.infoHash, entry.fileIndex); // ponytail: it's just a list entry
      continue;
    }
    if (row.state !== "ready" && !entry.paused) unfinished.push(entry);
    rows.push(row);
  }

  if (!resuming && unfinished.length > 0 && now - lastResume > RESUME_EVERY_MS) {
    lastResume = now;
    resuming = resume(unfinished)
      .catch(() => {})
      .finally(() => {
        resuming = null;
      });
  }

  return NextResponse.json({ downloads: rows, free: getDiskSpace().freeBytes });
}

interface QueueItem {
  magnet?: unknown;
  infoHash?: unknown;
  fileIndex?: unknown;
  title?: unknown;
  size?: unknown;
  /** Download choice: "full" | "percent" (Settings' %, default) | "fit". */
  mode?: unknown;
}

type QueueResult =
  | { ok: true; row: DownloadRow & { notice?: string }; bytes: number }
  | { ok: false; status: number; error: string; message: string };

function mainVideoIndex(files: TorrentInfo["files"]): number | null {
  let best: number | null = null;
  let max = 0;
  for (const f of files) {
    if (/\.(mp4|mkv|avi|webm|mov|m4v|wmv|flv)$/i.test(f.name) && f.length > max) {
      max = f.length;
      best = f.index;
    }
  }
  return best;
}

/** Load, floor-check and pin one file. `committed` = bytes already accepted in this request. */
async function queue(item: QueueItem, committed: number): Promise<QueueResult> {
  if (typeof item.magnet !== "string" || !item.magnet) {
    return { ok: false, status: 400, error: "invalid", message: "Missing magnet" };
  }
  const magnet = item.magnet;
  const engine = getTorrentEngine();

  let torrent: TorrentInfo | null = null;
  try {
    const known =
      (typeof item.infoHash === "string" && item.infoHash.toLowerCase()) ||
      extractInfoHashFromMagnet(magnet);
    if (known) torrent = await withTimeout(engine.getTorrent(known), 5000, "Worker");
    if (!torrent) torrent = await withTimeout(engine.addTorrent(magnet), ADD_TIMEOUT_MS, "Loading torrent");
  } catch (e) {
    return {
      ok: false,
      status: 502,
      error: "load-failed",
      message: e instanceof Error ? e.message : "Couldn't load torrent",
    };
  }

  const hash = torrent.infoHash.toLowerCase();
  const fileIndex =
    typeof item.fileIndex === "number" ? item.fileIndex : mainVideoIndex(torrent.files);
  const file = fileIndex === null ? undefined : torrent.files[fileIndex];
  if (fileIndex === null || !file) {
    return { ok: false, status: 404, error: "no-file", message: "No video file in this torrent" };
  }
  const size = file.length || Number(item.size) || 0;
  const title = (typeof item.title === "string" && item.title) || file.name;

  // The Download choice: the whole file, Settings' %, or as much as fits —
  // never into the 8 GB reserve (against what this request already queued).
  // A finished file needs no space.
  const mode: PreloadMode = item.mode === "full" || item.mode === "fit" ? item.mode : "percent";
  let targetBytes: number | undefined;
  let notice: string | undefined;
  let needs = 0;
  if ((file.progress ?? 0) < 1) {
    const disk = getDiskSpace();
    const free = disk.freeBytes - committed;
    const pct = Number(getSettings().preloadPercent ?? 25);
    const target = targetFor(mode, size, pct, free, disk.floorBytes);
    if (!target) {
      const room = `${formatBytes(Math.max(0, free))} free, ${formatBytes(disk.floorBytes)} is kept in reserve`;
      return {
        ok: false,
        status: 507,
        error: "low-disk",
        message:
          mode === "full"
            ? `Not enough space for the whole file (${formatBytes(size)}; ${room}). Try "As much as fits".`
            : `Not enough space (${room})`,
      };
    }
    needs = target.bytes;
    if (target.bytes < size) targetBytes = target.bytes;
    if (target.capped) {
      notice = `Only room for ${Math.floor((target.bytes / size) * 100)}% (${formatBytes(target.bytes)}). The rest streams when you watch.`;
    }
  }

  const failed = await pin({ infoHash: hash, fileIndex, targetBytes });
  if (failed) return { ok: false, status: 502, error: "worker-error", message: failed };

  const entry = addDownload({ infoHash: hash, fileIndex, magnet, title, size, targetBytes });
  return { ok: true, row: { ...toRow(entry, torrent), notice }, bytes: needs };
}

// POST /api/downloads  { magnet, infoHash?, fileIndex?, title, size? } | { items: [...] }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid", message: "Invalid body" }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    const r = await queue(body, 0);
    return r.ok
      ? NextResponse.json(r.row)
      : NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
  }

  const downloads: DownloadRow[] = [];
  const errors: { title: string; message: string }[] = [];
  let committed = 0;
  for (const item of body.items as QueueItem[]) {
    const r = await queue(item ?? {}, committed);
    if (r.ok) {
      downloads.push(r.row);
      committed += r.bytes;
    } else {
      errors.push({ title: typeof item?.title === "string" ? item.title : "", message: r.message });
    }
  }
  return NextResponse.json({ downloads, errors });
}

// DELETE /api/downloads?id=<infoHash>:<fileIndex> — forgets the pin, keeps the bytes.
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const [hash, index] = id.split(":");
  const fileIndex = Number(index);
  if (!hash || index === undefined || !Number.isInteger(fileIndex)) {
    return NextResponse.json({ error: "invalid", message: "Missing or invalid id" }, { status: 400 });
  }
  removeDownload(hash, fileIndex);
  pinErrors.delete(downloadId(hash, fileIndex));
  return NextResponse.json({ ok: true });
}

// PATCH /api/downloads {id, action: "pause" | "resume"} — pause keeps the bytes.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const [hash, index] = String(body?.id ?? "").split(":");
  const fileIndex = Number(index);
  const action = body?.action;
  if (!hash || !Number.isInteger(fileIndex) || (action !== "pause" && action !== "resume")) {
    return NextResponse.json({ error: "invalid", message: "Need id and action" }, { status: 400 });
  }
  const entry = setPaused(hash, fileIndex, action === "pause");
  if (!entry) return NextResponse.json({ error: "not-found", message: "No such download" }, { status: 404 });

  if (action === "pause") {
    await workerUnpin(entry.infoHash, entry.fileIndex);
    pinErrors.delete(downloadId(entry.infoHash, entry.fileIndex));
  } else {
    // The torrent may have been dropped since; load it again before pinning.
    try {
      const engine = getTorrentEngine();
      const loaded = await withTimeout(engine.getTorrent(entry.infoHash), 5000, "Worker");
      if (!loaded) await withTimeout(engine.addTorrent(entry.magnet), ADD_TIMEOUT_MS, "Loading torrent");
    } catch {
      // pin() below records the failure for the row
    }
    const message = await pin(entry);
    if (message) return NextResponse.json({ error: "worker-error", message }, { status: 502 });
  }
  const torrent = findTorrent(await activeTorrents(), entry.infoHash);
  return NextResponse.json(toRow(entry, torrent));
}
