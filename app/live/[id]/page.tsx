"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VideoPlayer } from "@/components/video-player";

export default function LiveWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [name, setName] = useState<string>();

  useEffect(() => {
    fetch(`/api/channels/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((ch) => setName(ch?.name))
      .catch(() => {});
  }, [id]);

  return (
    <main className="fixed inset-0 bg-black">
      <VideoPlayer
        live
        src={`/api/live/${encodeURIComponent(id)}`}
        title={name}
        onClose={() => router.push("/live")}
      />
    </main>
  );
}
