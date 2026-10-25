"use client";

import { useEffect, useRef, useState } from "react";
import { saveHitAsLead, saveHitAsPerson } from "./actions";
import { Card, EmptyState } from "@/components/ui/layout";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { SubmitButton } from "@/components/ui/submit-button";

type Hit = { title: string; link: string; snippet: string };

/** Google sometimes hands back its own redirect (google.com/url?q=...). Use the real address inside it. */
function realUrl(u: string) {
  try {
    const url = new URL(u);
    if (/google\./.test(url.hostname) && url.pathname === "/url") return url.searchParams.get("q") || url.searchParams.get("url") || "";
    return u;
  } catch {
    return "";
  }
}

/** "Karandeep Kamboj - Former Software Engineer at Google - LinkedIn" into name, title and company, plus a place from the snippet. */
function readPerson(h: Hit) {
  const parts = h.title.replace(/\s*[|\-–]\s*LinkedIn\s*$/i, "").split(/\s+[-–|]\s+/);
  const name = parts[0] ?? "";
  const rest = parts.slice(1).join(" - ");
  const at = rest.match(/^(.*?)\s+(?:at|@)\s+(.+)$/i);
  const place = h.snippet.match(/(?:Location:\s*)?([A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?)/)?.[1] ?? "";
  return { name, title: at ? at[1] : rest, company: at ? at[2] : parts[2] ?? "", place: place.length < 60 ? place : "" };
}

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
export function GoogleBox({ cx, q, back, kind }: { cx: string; q: string; back: string; kind: string }) {
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
              (results ?? [])
                .map((r) => ({
                  title: r.titleNoFormatting ?? "",
                  link: realUrl(r.unescapedUrl ?? r.url ?? ""),
                  snippet: r.contentNoFormatting ?? "",
                }))
                .filter((h) => h.link),
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
      ) : kind === "profiles" || kind === "companies" ? (
        <Table>
          <THead>
            <tr>
              <Th>{kind === "profiles" ? "Name" : "Company"}</Th>
              <Th>{kind === "profiles" ? "Title" : "About"}</Th>
              {kind === "profiles" ? <Th>Company</Th> : null}
              <Th>Location</Th>
              <Th>Link</Th>
              <Th>Save</Th>
            </tr>
          </THead>
          <tbody>
            {hits.map((h) => {
              const p = readPerson(h);
              return (
                <Tr key={h.link}>
                  <Td className="min-w-[180px] align-top font-semibold">{p.name || h.title}</Td>
                  <Td className="min-w-[200px] align-top text-[14px]">{kind === "profiles" ? p.title : h.snippet.slice(0, 160)}</Td>
                  {kind === "profiles" ? <Td className="min-w-[140px] align-top text-[14px]">{p.company}</Td> : null}
                  <Td className="min-w-[140px] align-top text-[14px]">{p.place || <span className="text-muted-foreground">Not shown</span>}</Td>
                  <Td className="align-top">
                    <a href={h.link} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-primary hover:underline">
                      {kind === "profiles" ? "LinkedIn" : "Open"}
                    </a>
                  </Td>
                  <Td className="align-top">
                    <SaveButtons h={h} back={back} personFirst={kind === "profiles"} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
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
                  <SaveButtons h={h} back={back} personFirst={false} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/** People go to People first; posts become leads. Each result can still be saved the other way. */
function SaveButtons({ h, back, personFirst }: { h: Hit; back: string; personFirst: boolean }) {
  const profile = /linkedin\.com\/in\//.test(h.link);
  const order = personFirst && profile ? [saveHitAsPerson, saveHitAsLead] : [saveHitAsLead, ...(profile ? [saveHitAsPerson] : [])];
  return (
    <div className="flex flex-wrap gap-2">
      {order.map((action, i) => (
        <form key={i} action={action}>
          <input type="hidden" name="title" value={h.title.slice(0, 500)} />
          <input type="hidden" name="link" value={h.link.slice(0, 1000)} />
          <input type="hidden" name="snippet" value={h.snippet.slice(0, 2000)} />
          <input type="hidden" name="back" value={back} />
          <SubmitButton variant={i === 0 ? "primary" : "secondary"} size="sm" pendingText="Saving...">
            {action === saveHitAsPerson ? "Save to People" : "Save as lead"}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}
