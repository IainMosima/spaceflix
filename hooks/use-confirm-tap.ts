"use client";

import { useEffect, useState } from "react";

/**
 * Two-tap confirm for bulk actions: the first tap arms (show a warning badge),
 * a second tap within `ms` runs the action, otherwise it quietly disarms.
 * No window.confirm — that blocks TV browsers and is easy to tap through.
 */
export function useConfirmTap(ms = 5000) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), ms);
    return () => clearTimeout(t);
  }, [armed, ms]);

  const tap = (action: () => void) => {
    if (!armed) return setArmed(true);
    setArmed(false);
    action();
  };

  return { armed, tap, arm: () => setArmed(true) };
}
