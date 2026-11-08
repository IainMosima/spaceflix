"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, MonitorPlay, Pencil, Plus, Radio, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelDialog } from "@/components/channel-dialog";
import { copyText, useLanOrigin } from "@/hooks/use-vlc-copy";
import type { Channel } from "@/types";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export default function LivePage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  // undefined = closed, null = adding, Channel = editing
  const [editing, setEditing] = useState<Channel | null | undefined>(undefined);
  // Wi-Fi address, so the VLC link also works from a phone or TV.
  const lanOrigin = useLanOrigin();

  const load = useCallback(() => {
    send("/api/channels", "GET")
      .then((d) => setChannels(d.channels))
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(load, [load]);

  const save = async (data: Omit<Channel, "id">) => {
    if (editing) await send(`/api/channels/${editing.id}`, "PUT", data);
    else await send("/api/channels", "POST", data);
    toast.success(editing ? "Channel saved" : "Channel added");
    load();
  };

  const remove = async (ch: Channel) => {
    try {
      await send(`/api/channels/${ch.id}`, "DELETE");
      toast.success(`Removed ${ch.name}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <main className="min-h-screen pt-14">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Live</h1>
            <p className="text-zinc-500 text-sm mt-1">Your HLS (.m3u8) channels</p>
          </div>
          <Button className="gap-2" onClick={() => setEditing(null)}>
            <Plus className="h-4 w-4" />
            Add channel
          </Button>
        </div>

        {channels === null && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        )}

        {channels?.length === 0 && (
          <div className="text-center py-12 bg-zinc-900/30 rounded-xl border border-zinc-800">
            <Radio className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="font-medium text-zinc-400 mb-2">No channels yet</h3>
            <p className="text-sm text-zinc-600">
              Add a .m3u8 link, plus any headers it needs (Referer, User-Agent, token).
            </p>
          </div>
        )}

        <div className="space-y-3">
          {channels?.map((ch) => (
            <div
              key={ch.id}
              className="flex items-center gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
            >
              <Link href={`/live/${ch.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-lg bg-red-600/15 text-red-400 flex items-center justify-center">
                  <Radio className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium truncate">{ch.name}</span>
                  <span className="block text-xs text-zinc-500 truncate">
                    {new URL(ch.url).host}
                    {Object.keys(ch.headers).length > 0 &&
                      ` · ${Object.keys(ch.headers).join(", ")}`}
                  </span>
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Copy VLC link for ${ch.name}`}
                title="Copy VLC link"
                onClick={() =>
                  copyText(
                    `${lanOrigin ?? window.location.origin}/api/live/${encodeURIComponent(ch.id)}`,
                    "VLC link copied — paste it in VLC → Open Network Stream",
                  )
                }
              >
                <MonitorPlay className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${ch.name}`}
                onClick={() => setEditing(ch)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${ch.name}`}
                onClick={() => remove(ch)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {editing !== undefined && (
        <ChannelDialog
          key={editing?.id ?? "new"}
          open
          onOpenChange={(o) => !o && setEditing(undefined)}
          channel={editing ?? undefined}
          onSave={save}
        />
      )}
    </main>
  );
}
