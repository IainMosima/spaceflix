import "server-only";
import { getSettings } from "@/lib/settings-store";
import { getRecord } from "@/lib/watch-store";
import { getTorrentEngine } from "@/lib/torrent-engine";
import type { EngineSettings, WatchRecord } from "@/types";

// After Next, the previous episode is deleted once the next one is "ready" by
// the user's rule (Settings → Storage): watched N minutes of it, or P% of it
// downloaded. Used by both cache routes (folder items and season-pack files).

const POLL_MS = 15_000;
const GIVE_UP_MS = 6 * 60 * 60 * 1000; // never got there: keep it
// A late progress save from the page just left isn't "went back".
const WENT_BACK_GRACE_MS = 30_000;
const VIDEO = /\.(mkv|mp4|m4v|mov|webm|avi|wmv|flv)$/i;

export function nextEpisodeReady(
  s: Pick<EngineSettings, "purgePreviousMode" | "purgePreviousMinutes" | "purgePreviousPercent">,
  record: Pick<WatchRecord, "positionSec" | "finished"> | null | undefined,
  progress: number | undefined
): boolean {
  if (s.purgePreviousMode === "downloaded") {
    return (progress ?? 0) >= (s.purgePreviousPercent ?? 20) / 100;
  }
  return !!record?.finished || (record?.positionSec ?? 0) >= (s.purgePreviousMinutes ?? 7) * 60;
}

type Episode = { infoHash: string; fileIndex?: number };

/**
 * Poll until `next` is ready, then run `purge`. Keeps `prev` (gives up) if it
 * was watched again since scheduling, or after 6 h. `next.fileIndex` missing or
 * not a video → that torrent's main video.
 */
export function purgeWhenNextReady(
  prev: Episode | null,
  next: Episode,
  purge: () => Promise<void>,
  label: string
): void {
  const started = Date.now();
  const check = async () => {
    try {
      if (prev && (getRecord(prev.infoHash, prev.fileIndex ?? 0)?.updatedAt ?? 0) > started + WENT_BACK_GRACE_MS) {
        return; // went back to it
      }
      const t = await getTorrentEngine().getTorrent(next.infoHash);
      const videos = t?.files.filter((f) => VIDEO.test(f.name)) ?? [];
      const file =
        videos.find((f) => f.index === next.fileIndex) ??
        videos.reduce<(typeof videos)[number] | undefined>(
          (a, f) => (!a || f.length > a.length ? f : a),
          undefined
        );
      const s = getSettings();
      const idx = next.fileIndex ?? file?.index;
      const rec = idx === undefined ? null : getRecord(next.infoHash, idx);
      if (nextEpisodeReady(s, rec, file?.progress)) {
        await purge();
        console.log(`Cleared previous episode (next ready, ${s.purgePreviousMode}): ${label}`);
        return;
      }
    } catch {
      // engine busy or restarting — keep waiting
    }
    if (Date.now() - started < GIVE_UP_MS) setTimeout(check, POLL_MS);
  };
  setTimeout(check, POLL_MS);
}
