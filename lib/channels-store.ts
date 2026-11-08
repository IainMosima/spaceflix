import "server-only";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { getDataDir } from "@/lib/data-dir";
import type { Channel, ChannelsData } from "@/types";

const path = () => join(getDataDir(), "channels.json");

function load(): ChannelsData {
  if (!existsSync(path())) return { channels: [] };
  return JSON.parse(readFileSync(path(), "utf-8")) as ChannelsData;
}

const save = (data: ChannelsData) => writeFileSync(path(), JSON.stringify(data, null, 2));

export const getChannels = (): Channel[] => load().channels;

export const getChannelById = (id: string): Channel | null =>
  load().channels.find((c) => c.id === id) ?? null;

export function addChannel(channel: Omit<Channel, "id">): Channel {
  const data = load();
  const created = { ...channel, id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  data.channels.push(created);
  save(data);
  return created;
}

export function updateChannel(id: string, updates: Partial<Omit<Channel, "id">>): Channel | null {
  const data = load();
  const i = data.channels.findIndex((c) => c.id === id);
  if (i === -1) return null;
  data.channels[i] = { ...data.channels[i], ...updates };
  save(data);
  return data.channels[i];
}

export function deleteChannel(id: string): boolean {
  const data = load();
  const next = data.channels.filter((c) => c.id !== id);
  if (next.length === data.channels.length) return false;
  save({ channels: next });
  return true;
}
