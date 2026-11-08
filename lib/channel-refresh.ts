import "server-only";
import { updateChannel } from "@/lib/channels-store";
import { extractStreams, pickFresh } from "@/lib/m3u8-extract";
import type { Channel } from "@/types";

/** Re-scan the channel's source page/playlist and save the fresh link + headers. */
export async function refreshChannel(channel: Channel): Promise<Channel | null> {
  if (!channel.sourceUrl) return null;
  const fresh = pickFresh(await extractStreams(channel.sourceUrl), channel.name);
  if (!fresh) return null;
  return updateChannel(channel.id, { url: fresh.url, headers: fresh.headers });
}
