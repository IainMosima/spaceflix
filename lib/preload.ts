// How much of a file "Download" preloads (Settings → Storage Optimization).
// Shared by the downloads API and its self-check (scripts/preload.check.mjs).

/** Smallest preload worth starting; less than this and Download refuses. */
export const MIN_PRELOAD_BYTES = 200 * 1024 ** 2;

/**
 * `pct` of `size`, capped by what fits above the free-space reserve. `bytes`
 * equal to `size` means the whole file; `capped` = less than `pct` fitted.
 * null = not even MIN_PRELOAD_BYTES fits.
 */
export function preloadTarget(
  size: number,
  pct: number,
  free: number,
  floor: number
): { bytes: number; capped: boolean } | null {
  const pctBytes = pct >= 100 ? size : Math.ceil((size * Math.max(1, pct)) / 100);
  // Never ask for less than the minimum: the % of a small file can be tiny.
  const want = Math.max(pctBytes, Math.min(MIN_PRELOAD_BYTES, size));
  const bytes = Math.min(want, free - floor);
  if (bytes >= size) return { bytes: size, capped: false };
  if (bytes < Math.min(MIN_PRELOAD_BYTES, size)) return null;
  return { bytes, capped: bytes < want };
}

/** What Download was asked for: the whole file, Settings' %, or whatever fits. */
export type PreloadMode = "full" | "percent" | "fit";

/** The preload for a Download choice; null = it doesn't fit (full needs all of it). */
export function targetFor(
  mode: PreloadMode,
  size: number,
  pct: number,
  free: number,
  floor: number
): { bytes: number; capped: boolean } | null {
  if (mode === "full") return free - floor >= size ? { bytes: size, capped: false } : null;
  return preloadTarget(size, mode === "fit" ? 100 : pct, free, floor);
}
