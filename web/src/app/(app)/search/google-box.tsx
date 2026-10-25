"use client";

import { useEffect, useRef, useState } from "react";
import { saveHitAsLead, saveHitAsPerson } from "./actions";
import { Card, EmptyState } from "@/components/ui/layout";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { COUNTRIES } from "@/lib/places";
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
  return { name, title: at ? at[1] : rest, company: at ? at[2] : parts[2] ?? "", place: readPlace(h) };
}

const hasWord = (text: string, word: string) => new RegExp(`(^|[^A-Za-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z]|$)`).test(text);

/** Only real place names from our country and city list, for example "Bengaluru, India". Never a guess. */
function readPlace(h: Hit) {
  const text = `${h.title} ${h.snippet}`;
  for (const c of Object.values(COUNTRIES)) {
    const found = c.terms.filter((t) => hasWord(text, t));
    if (!found.length) continue;
    const city = found.find((t) => t !== c.name && t.length > 3 && !/^(UAE|USA|UK|KSA)$/.test(t));
    return city ? `${city}, ${c.name}` : c.name;
  }
  return "";
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
export function GoogleBox({
  cx,
  q,
  back,
  kind,
  count = 20,
  confirmTerms = [],
  confirmedOnly = false,
  newest = false,
}: {
  cx: string;
  q: string;
  back: string;
  kind: string;
  count?: number;
  confirmTerms?: string[];
  confirmedOnly?: boolean;
  newest?: boolean;
}) {
  const [hits, setHits] = useState<(Hit & { confirmed: boolean })[] | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!q || started.current) return;
    started.current = true;
    const terms = confirmTerms.map((t) => t.toLowerCase());
    // A place counts as confirmed only when it appears as a whole word in the result.
    const confirmedIn = (h: Hit) => !terms.length || terms.some((t) => new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(`${h.title} ${h.snippet}`));
    const seen = new Set<string>();
    const kept: (Hit & { confirmed: boolean })[] = [];
    let page = 1;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setHits([...kept]);
      setProgress("");
    };

    const run = () => {
      const el = window.google?.search?.cse?.element;
      if (!el) return setError("Google search did not load. Check your connection, or turn off an ad blocker for this site.");
      el.render({ div: "gcse-hidden", tag: "searchresults-only", gname: "leads", attributes: newest ? { sort_by: "date" } : {} });
      el.getElement("leads")?.execute(q);
    };
    window.__gcse = {
      parsetags: "explicit",
      initializationCallback: run,
      searchCallbacks: {
        web: {
          // Returning true tells Google not to draw its own results. We draw ours.
          ready: (_name: string, _q: string, _promos: unknown, results: GoogleResult[] | undefined) => {
            const list = (results ?? [])
              .map((r) => ({ title: r.titleNoFormatting ?? "", link: realUrl(r.unescapedUrl ?? r.url ?? ""), snippet: r.contentNoFormatting ?? "" }))
              .filter((h) => h.link && !seen.has(h.link));
            for (const h of list) {
              seen.add(h.link);
              const confirmed = confirmedIn(h);
              if (!confirmedOnly || confirmed) kept.push({ ...h, confirmed });
            }
            setHits([...kept].slice(0, count));
            // Google gives 10 a page and at most 10 pages. Keep going until we have enough.
            if (kept.length >= count || (results ?? []).length < 10 || page >= 10) {
              kept.splice(count);
              finish();
            } else {
              page++;
              setProgress(`Fetching page ${page} of up to 10. ${kept.length} of ${count} so far...`);
              setTimeout(() => {
                location.hash = `gsc.tab=0&gsc.q=${encodeURIComponent(q)}&gsc.page=${page}`;
              }, 250);
            }
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
    // If Google stops answering, show what we have.
    const t = setTimeout(finish, 60000);
    return () => clearTimeout(t);
  }, [cx, q, count, confirmTerms, confirmedOnly, newest]);

  if (!q) return null;
  if (error) return <EmptyState title="Search did not load" description={error} />;
  return (
    <>
      <div id="gcse-hidden" className="hidden" aria-hidden />
      {progress || hits === null ? (
        <p className="mb-3 text-[15px] text-muted-foreground" role="status">
          {progress || "Searching..."}
        </p>
      ) : null}
      {hits && hits.length ? (
        <p className="mb-3 text-[13px] text-muted-foreground">
          {hits.length} result{hits.length === 1 ? "" : "s"}
          {confirmTerms.length ? `, ${hits.filter((h) => h.confirmed).length} with the location confirmed` : ""}
        </p>
      ) : null}
      {hits === null ? null : hits.length === 0 ? (
        <EmptyState title="No results" description={confirmedOnly ? "Nothing mentioned that place. Untick Confirmed location only, or try a bigger city." : "Try fewer or different words."} />
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
                  <Td className="min-w-[140px] align-top text-[14px]">
                    {p.place || <span className="text-muted-foreground">Not shown</span>}
                    {confirmTerms.length ? (
                      <p className={`text-[12.5px] font-semibold ${h.confirmed ? "text-success" : "text-warning"}`}>{h.confirmed ? "Location confirmed" : "Location not confirmed"}</p>
                    ) : null}
                  </Td>
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
