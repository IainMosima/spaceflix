"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { isValidTorrentInput } from "@/lib/torrent-utils";

/** See an item's magnet link: copy it, or paste a new one in its place. */
export function MagnetDialog({
  open,
  onOpenChange,
  name,
  magnet,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  magnet: string;
  onSave: (magnet: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(magnet);
  const [saving, setSaving] = useState(false);
  const changed = value.trim() !== magnet;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.trim());
      toast.success("Magnet link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it by hand.");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(value.trim());
      toast.success(`Link changed for "${name}"`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change link");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setValue(magnet);
        onOpenChange(o);
      }}
    >
      <DialogContent className="bg-zinc-900 border-zinc-800" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Magnet link</DialogTitle>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="Paste magnet link or .torrent URL"
          className="bg-zinc-800 border-zinc-700 font-mono text-xs h-11"
        />
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button variant="ghost" onClick={copy} className="h-11">
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button onClick={save} disabled={!changed || !isValidTorrentInput(value) || saving} className="h-11">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save new link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
