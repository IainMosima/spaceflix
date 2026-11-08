"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Channel } from "@/types";
import type { StreamCandidate } from "@/lib/m3u8-extract";

const COMMON_HEADERS = ["Referer", "Origin", "User-Agent", "Cookie", "Authorization"];

type Row = { key: string; value: string };
type Draft = { name: string; url: string; rows: Row[]; sourceUrl?: string };

// Unsaved typing survives closing the dialog or reloading the page (this browser only).
const draftKey = (channel?: Channel) => `spaceflix:channel-draft:${channel?.id ?? "new"}`;

function fromChannel(channel?: Channel): Draft {
  return {
    name: channel?.name ?? "",
    url: channel?.url ?? "",
    rows: Object.entries(channel?.headers ?? {}).map(([key, value]) => ({ key, value })),
    sourceUrl: channel?.sourceUrl,
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
  /** Saved channels offered as a "Copy from" template when adding. */
  templates?: Channel[];
  /** Save a found stream straight away as a new channel (dialog stays open). */
  onAdd?: (channel: Omit<Channel, "id">) => Promise<void>;
}

/** Mount with a `key` per channel so the form starts from that channel's values. */
export function ChannelDialog({
  open,
  onOpenChange,
  channel,
  onSave,
  templates = [],
  onAdd,
}: ChannelDialogProps) {
  // Only mounted after a click, so reading localStorage here is safe (no SSR).
  const [initial] = useState(() => readDraft(channel) ?? fromChannel(channel));
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.url);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const dirty =
    JSON.stringify({ name, url, rows, sourceUrl }) !== JSON.stringify(fromChannel(channel));

  useEffect(() => {
    writeDraft(channel, dirty ? { name, url, rows, sourceUrl } : null);
  }, [channel, dirty, name, url, rows, sourceUrl]);

  // "Paste a page or playlist link" finder.
  const [link, setLink] = useState("");
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<(StreamCandidate & { added?: boolean })[]>([]);
  const [findError, setFindError] = useState<string | null>(null);

  const find = async () => {
    setFinding(true);
    setFindError(null);
    setFound([]);
    try {
      const res = await fetch("/api/channels/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setFound(data.candidates);
    } catch (err) {
      setFindError((err as Error).message);
    } finally {
      setFinding(false);
    }
  };
  const patchFound = (i: number, patch: Partial<StreamCandidate & { added: boolean }>) =>
    setFound((f) => f.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setFoundHeader = (i: number, key: string, value: string | null) => {
    const headers = { ...found[i].headers };
    if (value === null) delete headers[key];
    else headers[key] = value;
    patchFound(i, { headers });
  };
  // The source to re-scan later; a direct .m3u8 link has nothing to re-scan.
  const sourceFor = (c: StreamCandidate) => (c.url === link.trim() ? undefined : link.trim());
  const takeFound = (c: StreamCandidate) => {
    setUrl(c.url);
    setRows(Object.entries(c.headers).map(([key, value]) => ({ key, value })));
    setSourceUrl(sourceFor(c));
    if (!name.trim() && c.name) setName(c.name);
    setError(null);
  };
  const addFound = async (i: number) => {
    const c = found[i];
    if (!onAdd || c.added) return;
    try {
      await onAdd({
        name: c.name || `Channel ${i + 1}`,
        url: c.url,
        headers: c.headers,
        sourceUrl: sourceFor(c),
      });
      patchFound(i, { added: true });
    } catch (err) {
      setFindError((err as Error).message);
    }
  };
  const addAll = async () => {
    for (let i = 0; i < found.length; i++) await addFound(i);
  };

  const discard = () => {
    const clean = fromChannel(channel);
    setName(clean.name);
    setUrl(clean.url);
    setRows(clean.rows);
    setSourceUrl(clean.sourceUrl);
    setError(null);
  };
  // Template: take its link and headers, keep whatever name is typed.
  const copyFrom = (id: string) => {
    const t = templates.find((c) => c.id === id);
    if (!t) return;
    setUrl(t.url);
    setRows(fromChannel(t).rows);
    setSourceUrl(t.sourceUrl);
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
      await onSave({ name: name.trim(), url: url.trim(), headers, sourceUrl });
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
        className="bg-zinc-900 border-zinc-800 max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{channel ? "Edit channel" : "Add channel"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <label htmlFor="ch-find" className="text-sm text-zinc-400 mb-2 block">
              Paste a page or playlist link
            </label>
            <div className="flex gap-2">
              <Input
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                id="ch-find"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && link.trim() && !finding && find()}
                placeholder="https://… page, .m3u playlist or .m3u8"
                className="bg-zinc-800 border-zinc-700"
              />
              <Button onClick={find} disabled={!link.trim() || finding} className="gap-2 shrink-0">
                {finding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Find stream
              </Button>
            </div>
            {findError && <p className="text-sm text-red-400 mt-2">{findError}</p>}

            {found.length > 0 && (
              <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">
                    Found {found.length} stream{found.length > 1 ? "s" : ""}
                  </p>
                  {onAdd && found.length > 1 && (
                    <button
                      type="button"
                      onClick={addAll}
                      className="text-xs text-purple-300 hover:text-white"
                    >
                      Add all
                    </button>
                  )}
                </div>
                {found.map((c, i) => (
                  <div key={c.url} className="rounded-md border border-zinc-800 p-2 space-y-2">
                    {c.name && <p className="text-sm font-medium truncate">{c.name}</p>}
                    <p className="text-xs text-zinc-400 break-all font-mono">{c.url}</p>
                    {Object.entries(c.headers).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 w-24 shrink-0 truncate">{k}</span>
                        <Input
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                          aria-label={`${k} value`}
                          value={v}
                          onChange={(e) => setFoundHeader(i, k, e.target.value)}
                          className="bg-zinc-800 border-zinc-700 h-7 text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label={`Remove ${k}`}
                          onClick={() => setFoundHeader(i, k, null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => takeFound(c)}>
                        Use this
                      </Button>
                      {onAdd && (
                        <Button size="sm" disabled={c.added} onClick={() => addFound(i)}>
                          {c.added ? "Added" : "Add as channel"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!channel && templates.length > 0 && (
            <div>
              <label htmlFor="ch-template" className="text-sm text-zinc-400 mb-2 block">
                Copy from
              </label>
              <select
                id="ch-template"
                value=""
                onChange={(e) => copyFrom(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200"
              >
                <option value="">
                  Start blank, or pick a channel to copy its link and headers…
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
