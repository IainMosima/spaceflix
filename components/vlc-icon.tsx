import { TrafficCone } from "lucide-react";
import { cn } from "@/lib/utils";

/** VLC's traffic cone, in VLC orange — used on every "Copy VLC link" button. */
export function VlcIcon({ className }: { className?: string }) {
  return <TrafficCone className={cn("text-[#ff8800]", className)} aria-hidden />;
}
