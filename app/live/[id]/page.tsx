"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoPlayer } from "@/components/video-player";
import { ChannelDialog } from "@/components/channel-dialog";
import { copyText, useLanOrigin } from "@/hooks/use-vlc-copy";
import type { Channel } from "@/types";

export default function LiveWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const lanOrigin = useLanOrigin();
  const [editing, setEditing] = useState(false);
  // Bumped after an edit so the player reconnects with the new link/headers.
  const [rev, setRev] = useState(0);

  const load = () =>
    fetch("/api/channels")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setChannels(d?.channels ?? []))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const save = async (data: Omit<Channel, "id">) => {
    const res = await fetch(`/api/channels/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
    await load();
    setRev((r) => r + 1);
  };

  const i = channels.findIndex((c) => c.id === id);
  // Flip channels like episodes; wraps around at the ends.
  const go = (step: number) =>
    router.replace(`/live/${channels[(i + step + channels.length) % channels.length].id}`);
  const canSurf = i !== -1 && channels.length > 1;
  const label = (step: number) =>
    canSurf ? `CH ${((i + step + channels.length) % channels.length) + 1}` : undefined;

  return (
    <main className="fixed inset-0 bg-black">
      <VideoPlayer
        key={`${id}:${rev}`}
        live
        src={`/api/live/${encodeURIComponent(id)}`}
        title={i === -1 ? undefined : `${i + 1} · ${channels[i].name}`}
        onClose={() => router.push("/live")}
        onEdit={i === -1 ? undefined : () => setEditing(true)}
        onPrev={canSurf ? () => go(-1) : undefined}
        prevLabel={label(-1)}
        nextLabel={label(1)}
        onNext={canSurf ? () => go(1) : undefined}
        onVlc={() =>
          copyText(
            `${lanOrigin ?? window.location.origin}/api/live/${encodeURIComponent(id)}`,
            "VLC link copied — paste it in VLC → Open Network Stream",
          )
        }
      />
      {editing && i !== -1 && (
        <ChannelDialog
          key={channels[i].id}
          open
          onOpenChange={(o) => !o && setEditing(false)}
          channel={channels[i]}
          onSave={save}
        />
      )}
    </main>
  );
}
