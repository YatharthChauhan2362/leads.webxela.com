"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps every page live. Asks the server every 3 seconds whether anything changed and refreshes the page's data
 * when it did, without a reload and without losing your place. Waits while you type or pick something.
 */
export function Pulse() {
  const router = useRouter();
  const path = usePathname();
  const last = useRef<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    const busy = () => {
      const el = document.activeElement as HTMLElement | null;
      return Boolean(el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) || document.querySelector("details[open] form"));
    };
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          // The chat page fetches its own messages, so chat traffic does not refresh it.
          const r = await fetch(`/api/pulse${path.startsWith("/chat") ? "?chat=0" : ""}`, { cache: "no-store" });
          if (r.ok) {
            const { v } = (await r.json()) as { v: string };
            if (last.current !== null && v !== last.current) pending.current = true;
            last.current = v;
          }
        } catch {
          // Offline for a moment: try again next time.
        }
        if (pending.current && !busy()) {
          pending.current = false;
          router.refresh();
        }
      }
      if (!stop) timer = window.setTimeout(tick, 3000);
    };
    tick();
    const wake = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [router, path]);
  return null;
}
