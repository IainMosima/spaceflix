import { TrafficCone } from "lucide-react";
import { cn } from "@/lib/utils";

/** VLC's traffic cone on every "Copy VLC link" button. Takes the button's text
 *  color so a list isn't a column of orange; buttons may add VLC orange on hover. */
export function VlcIcon({ className }: { className?: string }) {
  return <TrafficCone className={cn(className)} aria-hidden />;
}
