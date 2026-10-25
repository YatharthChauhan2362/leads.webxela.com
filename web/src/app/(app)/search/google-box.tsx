"use client";

import { useEffect, useRef, useState } from "react";
import { saveHitAsLead, saveHitAsPerson } from "./actions";
import { Card, EmptyState } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";

type Hit = { title: string; link: string; snippet: string };

type GoogleResult = { titleNoFormatting?: string; unescapedUrl?: string; url?: string; contentNoFormatting?: string };

declare global {
  interface Window {
    __gcse?: unknown;
    google?: { search?: { cse?: { element?: { render: (o: object) => void; getElement: (name: string) => { execute: (q: string) => void } | undefined } } } };
  }
}

/**
 * Google's free Programmable Search box, which needs only the engine ID (no API key).
 * Google fetches the results; we hide its own result box and its ads, and show the results in our design.
 */
export function GoogleBox({ cx, q, back }: { cx: string; q: string; back: string }) {
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!q || started.current) return;
    started.current = true;
    const run = () => {
      const el = window.google?.search?.cse?.element;
      if (!el) return setError("Google search did not load. Check your connection, or turn off an ad blocker for this site.");
      el.render({ div: "gcse-hidden", tag: "searchresults-only", gname: "leads" });
      el.getElement("leads")?.execute(q);
    };
    window.__gcse = {
      parsetags: "explicit",
      initializationCallback: run,
      searchCallbacks: {
        web: {
          // Returning true tells Google not to draw its own results. We draw ours.
          ready: (_name: string, _q: string, _promos: unknown, results: GoogleResult[] | undefined) => {
            setHits(
              (results ?? []).map((r) => ({
                title: r.titleNoFormatting ?? "",
                link: r.unescapedUrl ?? r.url ?? "",
                snippet: r.contentNoFormatting ?? "",
              })),
            );
            return true;
          },
        },
      },
    };
    const s = document.createElement("script");
    s.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`;
    s.async = true;
    s.onerror = () => setError("Google search did not load. Check your connection, or turn off an ad blocker for this site.");
    document.head.appendChild(s);
    const t = setTimeout(() => setHits((h) => h ?? []), 15000);
    return () => clearTimeout(t);
  }, [cx, q]);

  if (!q) return null;
  if (error) return <EmptyState title="Search did not load" description={error} />;
  return (
    <>
      <div id="gcse-hidden" className="hidden" aria-hidden />
      {hits === null ? (
        <p className="text-[15px] text-muted-foreground" role="status">
          Searching...
        </p>
      ) : hits.length === 0 ? (
        <EmptyState title="No results" description="Try fewer or different words." />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {hits.map((h) => (
            <Card key={h.link}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <a href={h.link} target="_blank" rel="noreferrer" className="text-[16px] font-semibold break-words hover:text-primary hover:underline">
                    {h.title}
                  </a>
                  <p className="mt-0.5 text-[13px] break-all text-muted-foreground">{h.link}</p>
                  {h.snippet ? <p className="mt-2 text-[15px] text-foreground">{h.snippet}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {[saveHitAsLead, ...(/linkedin\.com\/in\//.test(h.link) ? [saveHitAsPerson] : [])].map((action, i) => (
                    <form key={i} action={action}>
                      <input type="hidden" name="title" value={h.title.slice(0, 500)} />
                      <input type="hidden" name="link" value={h.link.slice(0, 1000)} />
                      <input type="hidden" name="snippet" value={h.snippet.slice(0, 2000)} />
                      <input type="hidden" name="back" value={back} />
                      <SubmitButton variant={i === 0 ? "primary" : "secondary"} size="sm" pendingText="Saving...">
                        {i === 0 ? "Save as lead" : "Save to People"}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
