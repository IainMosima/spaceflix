"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { vlcLink } from "@/lib/vlc-link";

// The LAN origin, for display (useLanOrigin). Copied links never use this
// cached value directly: copyAppLink builds the address at tap time.
let lanOrigin: string | null = null;
let lanRequest: Promise<void> | null = null;

function loadLanOrigin() {
  lanRequest ??= fetch("/api/lan")
    .then((r) => r.json())
    .then((d: { origin?: string }) => {
      if (d.origin) lanOrigin = d.origin;
    })
    .catch(() => {
      lanRequest = null; // retry on next mount
    });
}

const OK = "VLC link copied — paste it in VLC → Open Network Stream";

// iOS/Android over plain http have no navigator.clipboard; execCommand("copy")
// works only on a focused, selected, editable field inside the tap gesture.
function copyViaTextarea(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  // 16px: smaller text makes iOS zoom the page on focus.
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px;";
  ta.readOnly = false;
  ta.contentEditable = "true";
  // Radix dialogs and dropdown menus trap focus: a field outside them is
  // un-focused instantly, so put it inside the topmost open one.
  const dialogs = document.querySelectorAll("[role=dialog],[role=menu]");
  (dialogs[dialogs.length - 1] ?? document.body).appendChild(ta);
  let ok = false;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

function failed(link: string) {
  toast("Long-press to copy", { description: link, duration: 15000 });
}

const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);

/** The Wi-Fi address right now — never a cached one (the Mac's IP can change). */
function freshLanOrigin(): Promise<string> {
  return fetch("/api/lan", { cache: "no-store" })
    .then((r) => r.json())
    .then((d: { origin?: string }) => {
      if (d.origin) lanOrigin = d.origin; // keeps useLanOrigin's display current too
      return d.origin || window.location.origin;
    });
}

/**
 * Copy a link to this app (`build` gets the origin). Built at tap time so it's
 * always fresh. On a phone/TV the page's own address is the one that just
 * worked; on the Mac (localhost) the Wi-Fi address is fetched now, and the
 * pending fetch is handed to the clipboard so it still counts as the tap.
 * Must be called synchronously from the tap handler — no await before it.
 */
function copyAppLink(build: (origin: string) => string, okMessage: string): void {
  if (!isLocal()) {
    copyText(build(window.location.origin), okMessage);
    return;
  }
  const link = freshLanOrigin().then(build, () => build(lanOrigin ?? window.location.origin));
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = link.then((l) => new Blob([l], { type: "text/plain" }));
    navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]).then(
      () => toast.success(okMessage),
      () => link.then((l) => copyText(l, okMessage)) // e.g. Firefox: plain writeText
    );
    return;
  }
  link.then((l) => copyText(l, okMessage));
}

/** Copy a VLC link. Must be called synchronously from the tap handler — no await before it. */
export function copyVlcLink(infoHash: string, fileIndex?: number, title?: string): void {
  copyAppLink((origin) => vlcLink(origin, infoHash, fileIndex, title), OK);
}

/** Copy a link to a path of this app, e.g. "/api/live/ch_1" (same fresh-address rule). */
export function copyLanLink(path: string, okMessage: string): void {
  copyAppLink((origin) => origin + path, okMessage);
}

export function useVlcCopy() {
  return copyVlcLink;
}

/** Copy any text from a tap handler (same phone-safe path as VLC links). */
export function copyText(text: string, okMessage: string): void {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(okMessage),
      () => failed(text)
    );
    return;
  }
  if (copyViaTextarea(text)) toast.success(okMessage);
  else failed(text);
}

/** The app's Wi-Fi address (e.g. http://192.168.8.4:8181), or null until known. */
export function useLanOrigin(): string | null {
  const [origin, setOrigin] = useState<string | null>(lanOrigin);
  useEffect(() => {
    loadLanOrigin();
    let alive = true;
    lanRequest?.then(() => alive && setOrigin(lanOrigin));
    return () => {
      alive = false;
    };
  }, []);
  return origin;
}
