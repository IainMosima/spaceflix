"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Channel } from "@/types";

const COMMON_HEADERS = ["Referer", "Origin", "User-Agent", "Cookie", "Authorization"];

type Row = { key: string; value: string };
type Draft = { name: string; url: string; rows: Row[] };

// Unsaved typing survives closing the dialog or reloading the page (this browser only).
const draftKey = (channel?: Channel) => `spaceflix:channel-draft:${channel?.id ?? "new"}`;

function fromChannel(channel?: Channel): Draft {
  return {
    name: channel?.name ?? "",
    url: channel?.url ?? "",
    rows: Object.entries(channel?.headers ?? {}).map(([key, value]) => ({ key, value })),
  };
}

function readDraft(channel?: Channel): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(channel));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(channel: Channel | undefined, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(channel), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(channel));
  } catch {
    // Private mode / storage blocked: the form still works, just without a draft.
  }
}

interface ChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit, absent = add. */
  channel?: Channel;
  onSave: (channel: Omit<Channel, "id">) => Promise<void>;
}

/** Mount with a `key` per channel so the form starts from that channel's values. */
export function ChannelDialog({ open, onOpenChange, channel, onSave }: ChannelDialogProps) {
  // Only mounted after a click, so reading localStorage here is safe (no SSR).
  const [initial] = useState(() => readDraft(channel) ?? fromChannel(channel));
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.url);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const dirty = JSON.stringify({ name, url, rows }) !== JSON.stringify(fromChannel(channel));

  useEffect(() => {
    writeDraft(channel, dirty ? { name, url, rows } : null);
  }, [channel, dirty, name, url, rows]);

  const discard = () => {
    const clean = fromChannel(channel);
    setName(clean.name);
    setUrl(clean.url);
    setRows(clean.rows);
    setError(null);
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const addRow = (key = "") => setRows((r) => [...r, { key, value: "" }]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const headers = Object.fromEntries(
        rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value.trim()]),
      );
      await onSave({ name: name.trim(), url: url.trim(), headers });
      writeDraft(channel, null);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const used = new Set(rows.map((r) => r.key.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Clicking outside doesn't close it; Esc / ✕ still do, and the draft is kept either way. */}
      <DialogContent
        className="bg-zinc-900 border-zinc-800"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{channel ? "Edit channel" : "Add channel"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label htmlFor="ch-name" className="text-sm text-zinc-400 mb-2 block">
              Name
            </label>
            <Input
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              id="ch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My channel"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div>
            <label htmlFor="ch-url" className="text-sm text-zinc-400 mb-2 block">
              Stream link (.m3u8)
            </label>
            <Input
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              id="ch-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/live/index.m3u8"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div>
            <p className="text-sm text-zinc-400 mb-2">Headers</p>
            <p className="text-xs text-zinc-600 mb-3">
              Sent with every playlist and segment request. Add only what the link needs.
            </p>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    aria-label="Header name"
                    value={row.key}
                    onChange={(e) => setRow(i, { key: e.target.value })}
                    placeholder="Header"
                    className="bg-zinc-800 border-zinc-700 w-36 shrink-0"
                  />
                  <Input
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    aria-label={`${row.key || "Header"} value`}
                    value={row.value}
                    onChange={(e) => setRow(i, { value: e.target.value })}
                    placeholder="Value"
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove header"
                    onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {COMMON_HEADERS.filter((h) => !used.has(h.toLowerCase())).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => addRow(h)}
                  className="text-xs px-2 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
                >
                  + {h}
                </button>
              ))}
              <button
                type="button"
                onClick={() => addRow()}
                className="text-xs px-2 py-1 rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Custom
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3">
          {dirty ? (
            <span className="text-xs text-zinc-500">
              Draft saved on this device ·{" "}
              <button type="button" onClick={discard} className="underline hover:text-zinc-300">
                {channel ? "Undo changes" : "Clear"}
              </button>
            </span>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={!name.trim() || !url.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {channel ? "Save" : "Add channel"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
