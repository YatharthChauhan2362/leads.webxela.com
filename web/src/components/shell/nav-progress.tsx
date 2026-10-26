"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar at the top that starts the moment you tap a link to another page and finishes when it opens.
 * You always see that the tap worked, even while the page loads.
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "going" | "done">("idle");

  // Finish when the new page is on screen.
  const [seen, setSeen] = useState(`${path}?${search}`);
  if (seen !== `${path}?${search}`) {
    setSeen(`${path}?${search}`);
    if (state === "going") setState("done");
  }

  useEffect(() => {
    if (state !== "done") return;
    const t = window.setTimeout(() => setState("idle"), 300);
    return () => window.clearTimeout(t);
  }, [state]);

  useEffect(() => {
    const start = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState("going");
    };
    const submit = () => setState("going");
    document.addEventListener("click", start, true);
    document.addEventListener("submit", submit, true);
    return () => {
      document.removeEventListener("click", start, true);
      document.removeEventListener("submit", submit, true);
    };
  }, []);

  // A form that stays on the same page never changes the address: stop after a while.
  useEffect(() => {
    if (state !== "going") return;
    const t = window.setTimeout(() => setState("done"), 8000);
    return () => window.clearTimeout(t);
  }, [state]);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--color-primary)] transition-[width,opacity] ease-out"
        style={state === "going" ? { width: "80%", animation: "nav-grow 2.5s ease-out" } : { width: "100%", opacity: 0, transitionDuration: "250ms" }}
      />
    </div>
  );
}
