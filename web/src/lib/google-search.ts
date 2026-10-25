import "server-only";
import { getSetting, setSettings } from "./db";
import { extractEmails, extractPhones, uniq } from "./contacts";
import type { PostIn } from "./ingest";

// Google Programmable Search (Custom Search JSON API), shown with our own screens.
// Free tier: 100 searches a day, so we keep a daily count and stop before it.
const KEY = process.env.GOOGLE_CSE_KEY;
const DAILY = Number(process.env.GOOGLE_CSE_DAILY) || 90;

// One search engine per job, each set up with its own sites in Programmable Search.
// Any engine left empty falls back to GOOGLE_CSE_CX.
export type Engine = "profiles" | "posts" | "companies" | "contacts" | "elsewhere";
const ENGINES: Record<Engine, string | undefined> = {
  profiles: process.env.GOOGLE_CSE_CX_PROFILES,
  posts: process.env.GOOGLE_CSE_CX_POSTS,
  companies: process.env.GOOGLE_CSE_CX_COMPANIES,
  contacts: process.env.GOOGLE_CSE_CX_CONTACTS,
  elsewhere: process.env.GOOGLE_CSE_CX_ELSEWHERE,
};
const cx = (e: Engine) => ENGINES[e] || process.env.GOOGLE_CSE_CX;

type Item = { title: string; link: string; snippet?: string; pagemap?: { metatags?: Record<string, string>[] } };

export function searchEnabled(e?: Engine) {
  return Boolean(KEY && (e ? cx(e) : Object.keys(ENGINES).some((k) => cx(k as Engine))));
}

const today = () => new Date().toISOString().slice(0, 10);

/** Takes one search from today's allowance. False when today's searches are used up. */
async function spend(n = 1) {
  const [day, used] = (await getSetting("cse_quota")).split(":");
  const count = day === today() ? Number(used) || 0 : 0;
  if (count + n > DAILY) return false;
  await setSettings({ cse_quota: `${today()}:${count + n}` });
  return true;
}

export async function searchesLeftToday() {
  const [day, used] = (await getSetting("cse_quota")).split(":");
  return DAILY - (day === today() ? Number(used) || 0 : 0);
}

async function search(engine: Engine, q: string, extra: Record<string, string> = {}): Promise<Item[]> {
  if (!searchEnabled(engine) || !(await spend())) return [];
  const params = new URLSearchParams({ key: KEY!, cx: cx(engine)!, q, num: "10", ...extra });
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    console.warn("[google search]", res.status, (await res.text()).slice(0, 200));
    return [];
  }
  return ((await res.json()) as { items?: Item[] }).items ?? [];
}

/** New LinkedIn posts for the search phrases, from the last day. Runs at most every 3 hours to stay in the free tier. */
export async function linkedinPostsFromSearch(phrases: string[]): Promise<PostIn[]> {
  if (!searchEnabled("posts")) return [];
  const last = Number(await getSetting("cse_last_posts")) || 0;
  if (Date.now() - last < 3 * 3600_000) return [];
  await setSettings({ cse_last_posts: String(Date.now()) });
  const out: PostIn[] = [];
  for (const phrase of phrases.slice(0, 8)) {
    for (const it of await search("posts", `"${phrase}"`, { dateRestrict: "d1" })) {
      const meta = it.pagemap?.metatags?.[0] ?? {};
      const text = [meta["og:description"], it.snippet, it.title].filter(Boolean).join("\n\n");
      const slug = it.link.match(/linkedin\.com\/posts\/([^_/]+)_/)?.[1];
      out.push({
        source: "linkedin",
        postUrl: it.link.split("?")[0],
        postId: it.link.match(/activity-(\d{15,})/)?.[1] ? `urn:li:activity:${it.link.match(/activity-(\d{15,})/)![1]}` : it.link.split("?")[0],
        author: it.title.split(/ on LinkedIn| posted on|'s Post| \| /)[0].trim() || null,
        authorUrl: slug ? `https://www.linkedin.com/in/${slug}/` : null,
        headline: null,
        text: text.slice(0, 5000),
        postedAt: null,
      });
    }
  }
  return out.filter((p) => p.text.length >= 20);
}

/** Looks for a person's public email and phone on the web: pages, PDFs, talks, team pages. */
export async function contactsFromWeb(name: string | null | undefined, company: string | null | undefined, domain: string | null | undefined) {
  if (!searchEnabled("contacts") || !name) return { emails: [] as string[], phones: [] as string[], source: null as string | null };
  const items = await search("contacts", `"${name}"${company ? ` "${company}"` : ""} (email OR contact OR phone)`);
  const parts = name.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
  const emails: string[] = [];
  const phones: string[] = [];
  let source: string | null = null;
  for (const it of items) {
    const text = `${it.title}\n${it.snippet ?? ""}`;
    const lower = text.toLowerCase();
    // Only trust results that mention the person.
    if (!parts.every((p) => lower.includes(p))) continue;
    for (const e of extractEmails(text)) {
      const local = e.split("@")[0];
      // Keep emails at their company, or that carry their name.
      if ((domain && e.endsWith(`@${domain}`)) || parts.some((p) => local.includes(p))) {
        emails.push(e);
        source ??= it.link;
      }
    }
    for (const ph of extractPhones(text)) {
      if (ph.startsWith("+")) {
        phones.push(ph);
        source ??= it.link;
      }
    }
  }
  return { emails: uniq(emails).slice(0, 3), phones: uniq(phones).slice(0, 2), source };
}

/** A company's website from its LinkedIn company page, for the email finder. */
export async function companyWebsite(company: string): Promise<string | null> {
  if (!searchEnabled("companies")) return null;
  for (const it of await search("companies", `"${company}"`)) {
    const text = `${it.snippet ?? ""} ${JSON.stringify(it.pagemap?.metatags?.[0] ?? {})}`;
    const site = text.match(/https?:\/\/(?!www\.linkedin|lnkd\.in)[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
    if (site) return site;
  }
  return null;
}

/** A person's LinkedIn profile from their name and company, when a post did not link it. */
export async function findProfile(name: string, company?: string | null): Promise<string | null> {
  if (!searchEnabled("profiles")) return null;
  const items = await search("profiles", `"${name}"${company ? ` "${company}"` : ""}`);
  return items.find((it) => /linkedin\.com\/in\//.test(it.link))?.link.split("?")[0] ?? null;
}
