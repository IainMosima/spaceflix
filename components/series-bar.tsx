"use client";

import { useState } from "react";
import { Play, X } from "lucide-react";

export interface SeriesEpisode {
  key: string;
  code: string; // "S01E04", or a short name when there's no code
  state: "watched" | "watching" | "unwatched";
  pct: number;
  timeLeft?: string; // "22 min left", for "watching"
  updatedAt?: number; // when last watched, to find where you are
}

const ring = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400";
const hiddenKey = (id: string) => `seriesBarHidden:${id}`;

/**
 * One slim row at the top of a folder or season pack: play where you are.
 * ✕ hides it for this show on this device.
 */
export function SeriesBar({
  id,
  episodes,
  onPlay,
}: {
  /** Stable per show (folder id or infoHash), to remember a ✕. */
  id: string;
  episodes: SeriesEpisode[];
  onPlay: (key: string) => void;
}) {
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(hiddenKey(id)) === "1";
    } catch {
      return false;
    }
  });
  if (hidden || episodes.length < 2) return null;

  // Where you are: the most recent half-watched episode, else the first unwatched.
  const watching = episodes
    .filter((e) => e.state === "watching")
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
  const current = watching ?? episodes.find((e) => e.state === "unwatched") ?? episodes[0];

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(hiddenKey(id), "1");
    } catch {
      // still hidden for now
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onPlay(current.key)}
        className={`h-11 flex-1 min-w-0 rounded-full bg-purple-600 hover:bg-purple-500 active:scale-[0.99] px-5 flex items-center gap-2 text-sm text-white transition-[background-color,transform] motion-reduce:transition-none ${ring}`}
      >
        <Play className="h-4 w-4 shrink-0 fill-current" />
        <span className="font-medium">{watching ? "Continue" : "Play"}</span>
        <span className="tabular-nums">{current.code}</span>
        {watching?.timeLeft && (
          <span className="truncate text-purple-200/80">· {watching.timeLeft}</span>
        )}
      </button>
      <button
        onClick={hide}
        className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 ${ring}`}
        aria-label="Hide"
        title="Hide"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
