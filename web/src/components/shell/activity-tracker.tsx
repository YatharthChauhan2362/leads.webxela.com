"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function send(event: { action: string; target?: string; detail?: string; path?: string }) {
  const body = JSON.stringify({ path: location.pathname + location.search, ...event });
  // sendBeacon still delivers when the page is closing or a link opens a new app.
  if (!navigator.sendBeacon?.("/api/activity", new Blob([body], { type: "application/json" }))) {
    fetch("/api/activity", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  }
}

/** Tells the Activity log which pages people open, what they copy and which outside links they follow. */
export function ActivityTracker() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    send({ action: "page_view", target: pathname + (search.size ? `?${search}` : "") });
  }, [pathname, search]);

  useEffect(() => {
    const onCopy = () => {
      const text = String(document.getSelection() ?? "").trim();
      if (text) send({ action: "copy", detail: text.slice(0, 500) });
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("mailto:")) send({ action: "email_link", target: href.slice(7) });
      else if (href.startsWith("tel:")) send({ action: "phone_link", target: href.slice(4) });
      else if (/^https?:/.test(href) && new URL(href).host !== location.host) send({ action: "open_link", target: href });
      else if (href.startsWith("/api/export")) send({ action: "open_link", target: "CSV download" });
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("click", onClick, true);
    // Once a minute while the app is on screen, so admins see who is online and for how long.
    const beat = () => {
      if (document.visibilityState === "visible") send({ action: "online" });
    };
    beat();
    const timer = setInterval(beat, 60_000);
    return () => {
      clearInterval(timer);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
