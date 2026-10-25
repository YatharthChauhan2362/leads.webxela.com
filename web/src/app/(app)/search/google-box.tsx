"use client";

import { useEffect, useRef, useState } from "react";
import { saveHitAsLead } from "./actions";
import { normUrl, urlHash } from "@/lib/url-hash";
import { clientIntent } from "@/lib/client-intent";
import { Card, EmptyState } from "@/components/ui/layout";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { COUNTRIES } from "@/lib/places";
import { SubmitButton } from "@/components/ui/submit-button";

type Hit = { title: string; link: string; snippet: string; photo: string | null };
type Ranked = Hit & { confirmed: boolean; points: number; why: string[] };

// Who can sign a deal, and what shows they want to buy now.
const DECIDERS = /\b(founder|co-?founder|owner|ceo|cto|cmo|coo|cfo|managing director|director|head of|vp|vice president|partner|president|proprietor|chief)\b/i;
const BUYING = /\b(looking for|need(s|ed)?( a| an| some)?|hiring (a )?(freelancer|agency|developer|contractor)|outsourc\w*|rfp|request for proposal|budget|quote|vendor|partner with|build (our|my|an?) )/i;
const NOT_BUYERS = /\b(student|intern|fresher|open to work|seeking (a )?(job|role|opportunit)|job seeker|freelancer available|hire me)\b/i;

/** Points for how likely this result is to become paid work, with the reasons in plain words. */
function rank(h: Hit, kind: string, services: string[], places: string[]) {
  const text = `${h.title} ${h.snippet}`;
  const lower = text.toLowerCase();
  let points = 0;
  const why: string[] = [];
  const role = text.match(DECIDERS)?.[0];
  if (role) {
    points += 40;
    why.push(role.replace(/^./, (c) => c.toUpperCase()));
  }
  const want = text.match(BUYING)?.[0];
  if (want) {
    points += kind === "posts" ? 40 : 20;
    why.push(`says "${want.trim()}"`);
  }
  const service = services.find((s) => s && lower.includes(s.toLowerCase()));
  if (service) {
    points += 15;
    why.push(`mentions ${service}`);
  }
  if (places.some((p) => p && lower.includes(p.toLowerCase()))) points += 10;
  if (NOT_BUYERS.test(text)) {
    points -= 50;
    why.push("looks like a job seeker or student");
  }
  return { points, why };
}

function sortRanked(list: Ranked[]) {
  return [...list].sort((a, b) => b.points - a.points);
}

function PriorityBadge({ h }: { h: Ranked }) {
  const level = h.points >= 50 ? "High" : h.points >= 20 ? "Medium" : "Low";
  const tone = level === "High" ? "bg-success text-white" : level === "Medium" ? "bg-warning text-white" : "bg-muted text-foreground ring-1 ring-border";
  return (
    <div>
      <span className={`inline-flex rounded-full px-3 py-0.5 text-[13px] font-semibold ${tone}`}>{level}</span>
      {h.why.length ? <p className="mt-1 text-[12.5px] text-muted-foreground">{h.why.join(", ")}</p> : null}
    </div>
  );
}

/** Google's box can lock page scrolling. Undo it every time. */
function unlockScroll() {
  for (const el of [document.documentElement, document.body]) {
    el.classList.remove("gsc-overflow-hidden");
    el.style.removeProperty("overflow");
  }
}

/** The profile photo Google keeps for the page, when it has one. */
function photoOf(r: GoogleResult) {
  const src = r.richSnippet?.metatags?.["og:image"] || r.richSnippet?.cse_image?.src || r.richSnippet?.cse_thumbnail?.src || r.thumbnailImage?.url || null;
  return src && /^https:/.test(src) && !/static\.licdn\.com\/aero|default|ghost/i.test(src) ? src : null;
}

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

type GoogleResult = {
  titleNoFormatting?: string;
  unescapedUrl?: string;
  url?: string;
  contentNoFormatting?: string;
  thumbnailImage?: { url?: string };
  richSnippet?: { cse_thumbnail?: { src?: string }; cse_image?: { src?: string }; metatags?: Record<string, string> };
};

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
  known = [],
  onlyNew = true,
  clientsOnly = false,
  services = [],
  places = [],
}: {
  cx: string;
  q: string;
  back: string;
  kind: string;
  count?: number;
  confirmTerms?: string[];
  confirmedOnly?: boolean;
  newest?: boolean;
  known?: string[];
  onlyNew?: boolean;
  clientsOnly?: boolean;
  services?: string[];
  places?: string[];
}) {
  const [hits, setHits] = useState<Ranked[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [notClients, setNotClients] = useState(0);
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
    const kept: Ranked[] = [];
    // Already saved, or shown before for this same search on this browser: skip those.
    const norm = normUrl;
    // "known" holds hashes of links the team already has.
    const savedSet = new Set(known);
    const memoryKey = `search-seen:${cx}:${q}`;
    let shownBefore = new Set<string>();
    try {
      shownBefore = new Set(JSON.parse(localStorage.getItem(memoryKey) || "[]"));
    } catch {
      // Private window: nothing remembered.
    }
    let skippedCount = 0;
    let notClientCount = 0;
    const remember = () => {
      try {
        const all = [...shownBefore, ...kept.map((k) => norm(k.link))].slice(-1000);
        localStorage.setItem(memoryKey, JSON.stringify(all));
      } catch {
        // Ignore.
      }
    };
    let page = 1;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setHits([...kept]);
      setProgress("");
      unlockScroll();
      // Tidy Google's page marker out of the address.
      history.replaceState(history.state, "", `${location.pathname}${location.search}`);
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
            const keepY = window.scrollY;
            requestAnimationFrame(() => {
              unlockScroll();
              window.scrollTo(0, keepY);
            });
            const list = (results ?? [])
              .map((r) => ({ title: r.titleNoFormatting ?? "", link: realUrl(r.unescapedUrl ?? r.url ?? ""), snippet: r.contentNoFormatting ?? "", photo: photoOf(r) }))
              .filter((h) => h.link && !seen.has(h.link));
            for (const h of list) {
              seen.add(h.link);
              const key = norm(h.link);
              if (onlyNew && (savedSet.has(urlHash(h.link)) || shownBefore.has(key))) {
                skippedCount++;
                continue;
              }
              // Strict: only people asking to hire a developer, freelancer or agency.
              const check = clientsOnly ? clientIntent(`${h.title} ${h.snippet}`) : null;
              if (check && !check.client) {
                notClientCount++;
                continue;
              }
              const confirmed = confirmedIn(h);
              if (!confirmedOnly || confirmed) kept.push({ ...h, confirmed, ...rank(h, kind, services, places) });
            }
            setSkipped(skippedCount);
            setNotClients(notClientCount);
            setHits(sortRanked(kept).slice(0, count));
            // Google gives 10 a page and at most 10 pages. Keep going until we have enough.
            if (kept.length >= count || (results ?? []).length < 10 || page >= 10) {
              const best = sortRanked(kept).slice(0, count);
              kept.splice(0, kept.length, ...best);
              remember();
              finish();
            } else {
              page++;
              setProgress(`Fetching page ${page} of up to 10. ${kept.length} of ${count} so far...`);
              // Ask Google for the next page without moving the screen: change the address quietly,
              // then tell Google it changed. Your scroll position stays where it is.
              setTimeout(() => {
                const y = window.scrollY;
                const before = location.href;
                history.replaceState(history.state, "", `${location.pathname}${location.search}#gsc.tab=0&gsc.q=${encodeURIComponent(q)}&gsc.page=${page}`);
                window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: before, newURL: location.href }));
                requestAnimationFrame(() => window.scrollTo(0, y));
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
    const t = setTimeout(() => {
      remember();
      finish();
    }, 60000);
    return () => {
      clearTimeout(t);
      unlockScroll();
    };
  }, [cx, q, count, confirmTerms, confirmedOnly, newest, known, onlyNew, clientsOnly, services, places, kind]);

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
          {hits.length} new result{hits.length === 1 ? "" : "s"}, best first
          {confirmTerms.length ? `, ${hits.filter((h) => h.confirmed).length} with the location confirmed` : ""}
          {skipped ? `. Skipped ${skipped} you already saved or saw before.` : ""}
          {notClients ? `. Hid ${notClients} that were not clients: job ads, sellers, job seekers or tips.` : ""}
        </p>
      ) : null}
      {hits === null ? null : hits.length === 0 ? (
        <EmptyState
          title={skipped || notClients ? "No new clients" : "No results"}
          description={
            notClients && !skipped
              ? `Hid ${notClients} results that were job ads, sellers, job seekers or tips. Try words clients use, like "looking for a developer" or "need an agency", or tick Show every post.`
              : skipped
              ? `All ${skipped} results were already saved or shown before. Change the words or filters, or tick Show results I have already seen.`
              : confirmedOnly
                ? "Nothing mentioned that place. Untick Confirmed location only, or try a bigger city."
                : "Try fewer or different words."
          }
        />
      ) : kind === "profiles" || kind === "companies" ? (
        <Table>
          <THead>
            <tr>
              <Th>Priority</Th>
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
                  <Td className="min-w-[150px] align-top">
                    <PriorityBadge h={h} />
                  </Td>
                  <Td className="min-w-[200px] align-top">
                    <div className="flex items-center gap-3">
                      {h.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={h.photo} alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-[13px] font-bold text-muted-foreground">
                          {(p.name || h.title).split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                        </span>
                      )}
                      <span className="font-semibold">{p.name || h.title}</span>
                    </div>
                  </Td>
                  <Td className="min-w-[200px] align-top text-[14px]">{kind === "profiles" ? p.title : h.snippet.slice(0, 160)}</Td>
                  {kind === "profiles" ? <Td className="min-w-[140px] align-top text-[14px]">{p.company}</Td> : null}
                  <Td className="min-w-[140px] align-top text-[14px]">
                    {p.place || <span className="text-muted-foreground">Not shown</span>}
                    {confirmTerms.length ? (
                      <p className={`text-[12.5px] font-semibold ${h.confirmed ? "text-success" : "text-warning"}`}>{h.confirmed ? "Location confirmed" : "Location not confirmed"}</p>
                    ) : null}
                  </Td>
                  <Td className="align-top">
                    <a href={h.link} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center" aria-label={`Open ${p.name || "this"} on LinkedIn`}>
                      {/linkedin\.com/.test(h.link) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src="/logos/linkedin.svg" alt="LinkedIn" width={24} height={24} />
                      ) : (
                        <span className="text-[14px] font-medium text-primary hover:underline">Open</span>
                      )}
                    </a>
                  </Td>
                  <Td className="align-top">
                    <SaveButtons h={h} back={back} />
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
                  <div className="mb-1">
                    <PriorityBadge h={h} />
                  </div>
                  <a href={h.link} target="_blank" rel="noreferrer" className="text-[16px] font-semibold break-words hover:text-primary hover:underline">
                    {h.title}
                  </a>
                  <p className="mt-0.5 text-[13px] break-all text-muted-foreground">{h.link}</p>
                  {h.snippet ? <p className="mt-2 text-[15px] text-foreground">{h.snippet}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <SaveButtons h={h} back={back} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/** Saves the result as a lead. A LinkedIn person is also added to People with their photo. */
function SaveButtons({ h, back }: { h: Hit; back: string }) {
  return (
    <form action={saveHitAsLead}>
      <input type="hidden" name="title" value={h.title.slice(0, 500)} />
      <input type="hidden" name="link" value={h.link.slice(0, 1000)} />
      <input type="hidden" name="snippet" value={h.snippet.slice(0, 2000)} />
      <input type="hidden" name="photo" value={h.photo ?? ""} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton size="sm" pendingText="Saving...">
        Save as lead
      </SubmitButton>
    </form>
  );
}
