"use client";

import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettings } from "@/hooks/use-settings";
import { FLOOR_BYTES } from "@/hooks/use-download-progress";
import { targetFor, type PreloadMode } from "@/lib/preload";

function fmt(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/**
 * The Download button's choices: the whole file, Settings' preload %, or as
 * much as fits above the 8 GB reserve. Each shows what it will take; ones that
 * don't fit are greyed out. `size` = bytes still to get (0/unknown = just ask).
 */
export function DownloadMenu({
  size,
  free,
  onPick,
  enabled = true,
  children,
}: {
  /** false: just the button (e.g. pause/resume stays one tap). */
  enabled?: boolean;
  size: number;
  free: number | null;
  onPick: (mode: PreloadMode) => void;
  /** The trigger: the existing Download icon button. */
  children: ReactNode;
}) {
  const { settings } = useSettings();
  const pct = settings?.preloadPercent ?? 25;
  const room = free ?? Infinity; // unknown free space: let the server decide

  if (!enabled) return <>{children}</>;

  const options: { mode: PreloadMode; label: string; hint: string }[] = [
    { mode: "full", label: "Full movie", hint: "Watch it offline" },
    ...(pct < 100
      ? [{ mode: "percent" as const, label: `Preload ${pct}%`, hint: "Starts instantly, the rest streams" }]
      : []),
    { mode: "fit", label: "As much as fits", hint: "Fills free space, keeps the 8 GB reserve" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 max-w-[calc(100vw-2rem)] bg-zinc-900 border-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel className="text-sm text-zinc-300">Download</DropdownMenuLabel>
        {options.map(({ mode, label, hint }) => {
          const t = size > 0 ? targetFor(mode, size, pct, room, FLOOR_BYTES) : { bytes: 0, capped: false };
          // "As much as fits" that turns out to be the whole file reads as such.
          const whole = t && size > 0 && t.bytes >= size;
          if (mode === "fit" && whole) return null;
          return (
            <DropdownMenuItem
              key={mode}
              disabled={!t}
              onSelect={() => t && onPick(mode)}
              // 44px+ rows: this is picked with a TV remote too.
              className="min-h-12 items-start justify-between gap-3 py-2 focus:bg-zinc-800"
            >
              <span className="min-w-0">
                <span className="block text-zinc-100">{label}</span>
                <span className="block text-xs text-zinc-500">{hint}</span>
              </span>
              <span className="shrink-0 pt-0.5 text-xs tabular-nums text-zinc-400">
                {!t ? "Doesn't fit" : size > 0 ? fmt(t.bytes) : ""}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
