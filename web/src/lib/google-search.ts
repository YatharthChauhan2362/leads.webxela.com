import "server-only";
import { getSetting, must, setSettings, sb } from "./db";
import { extractEmails, extractPhones, uniq } from "./contacts";
import type { PostIn } from "./ingest";

// Google Programmable Search (Custom Search JSON API), shown with our own screens.
// Admins add API keys (from as many Google accounts as they like) and engines (one per kind of page)
// on the Search engines page. Each key has 100 free searches a day; when one runs out, the next takes over.

export type Engine = "profiles" | "posts" | "companies" | "contacts" | "elsewhere";
export const ENGINE_KINDS: Engine[] = ["posts", "profiles", "companies", "contacts", "elsewhere"];

type Item = { title: string; link: string; snippet?: string; pagemap?: { metatags?: Record<string, string>[] } };
type Key = { id: string; label: string; api_key: string; daily_limit: number; used_on: string | null; used_today: number; exhausted_on: string | null; active: boolean };
type Eng = { id: string; kind: string; cx: string; active: boolean; used_on: string | null; used_today: number };

/** India date, since the team works on India time. Google resets free searches at midnight Pacific; this is close enough to plan by. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const usedToday = (r: { used_on: string | null; used_today: number }) => (r.used_on === today() ? r.used_today : 0);

async function pool(kind: Engine) {
  const [keys, engines] = await Promise.all([
    sb().from("search_keys").select("*").eq("active", true).order("created_at").then((r) => must(r) as Key[]),
    sb().from("search_engines").select("*").eq("active", true).eq("kind", kind).then((r) => must(r) as Eng[]),
  ]);
  // Keys and engines set in the server settings still work, as a fallback.
  if (process.env.GOOGLE_CSE_KEY) keys.push({ id: "env", label: "Server setting", api_key: process.env.GOOGLE_CSE_KEY, daily_limit: Number(process.env.GOOGLE_CSE_DAILY) || 90, used_on: null, used_today: 0, exhausted_on: null, active: true });
  const envCx = process.env[`GOOGLE_CSE_CX_${kind.toUpperCase()}`] || process.env.GOOGLE_CSE_CX;
  if (envCx && !engines.some((e) => e.cx === envCx)) engines.push({ id: "env", kind, cx: envCx, active: true, used_on: null, used_today: 0 });
  const usable = keys.filter((k) => k.exhausted_on !== today() && usedToday(k) < k.daily_limit);
  // Spread searches across engines of the same kind.
  engines.sort((a, b) => usedToday(a) - usedToday(b));
  return { keys: usable, engines };
}

export async function searchEnabled(kind?: Engine): Promise<boolean> {
  if (!kind) return (await Promise.all(ENGINE_KINDS.map((k) => searchEnabled(k)))).some(Boolean);
  const p = await pool(kind);
  return p.keys.length > 0 && p.engines.length > 0;
}

/** Free searches left today across every key. */
export async function searchesLeftToday() {
  const keys = must(await sb().from("search_keys").select("*").eq("active", true)) as Key[];
  return keys.filter((k) => k.exhausted_on !== today()).reduce((n, k) => n + Math.max(0, k.daily_limit - usedToday(k)), 0);
}

async function count(table: "search_keys" | "search_engines", row: { id: string; used_on: string | null; used_today: number }, error: string | null = null) {
  if (row.id === "env") return;
  await sb()
    .from(table)
    .update({ used_on: today(), used_today: usedToday(row) + 1, last_error: error })
    .eq("id", row.id);
}

/** One search, trying each key in turn until one works. A key that hits Google's daily limit is parked until tomorrow. */
async function search(kind: Engine, q: string, extra: Record<string, string> = {}): Promise<Item[]> {
  const { keys, engines } = await pool(kind);
  const engine = engines[0];
  if (!engine) return [];
  for (const key of keys) {
    const params = new URLSearchParams({ key: key.api_key, cx: engine.cx, q, num: "10", ...extra });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res) continue;
    if (res.ok) {
      await Promise.all([count("search_keys", key), count("search_engines", engine)]);
      return ((await res.json()) as { items?: Item[] }).items ?? [];
    }
    const body = (await res.text()).slice(0, 300);
    const quota = res.status === 429 || /quota|rateLimitExceeded|dailyLimitExceeded/i.test(body);
    if (key.id !== "env") {
      await sb()
        .from("search_keys")
        .update(quota ? { exhausted_on: today(), last_error: "Daily limit reached. Next key is used until tomorrow." } : { last_error: body.slice(0, 200) })
        .eq("id", key.id);
    }
    if (!quota && /cx|Request contains an invalid argument|not found/i.test(body) && engine.id !== "env") {
      await sb().from("search_engines").update({ last_error: "Google did not accept this engine ID." }).eq("id", engine.id);
      return [];
    }
    console.warn("[google search]", key.label, res.status, body.slice(0, 120));
  }
  return [];
}

/** New LinkedIn posts for the search phrases, from the last day. Runs at most every 3 hours to stay in the free tier. */
export async function linkedinPostsFromSearch(phrases: string[]): Promise<PostIn[]> {
  if (!(await searchEnabled("posts"))) return [];
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
  if (!name || !(await searchEnabled("contacts"))) return { emails: [] as string[], phones: [] as string[], source: null as string | null };
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
  if (!(await searchEnabled("companies"))) return null;
  for (const it of await search("companies", `"${company}"`)) {
    const text = `${it.snippet ?? ""} ${JSON.stringify(it.pagemap?.metatags?.[0] ?? {})}`;
    const site = text.match(/https?:\/\/(?!www\.linkedin|lnkd\.in)[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
    if (site) return site;
  }
  return null;
}

/** A person's LinkedIn profile from their name and company, when a post did not link it. */
export async function findProfile(name: string, company?: string | null): Promise<string | null> {
  if (!(await searchEnabled("profiles"))) return null;
  const items = await search("profiles", `"${name}"${company ? ` "${company}"` : ""}`);
  return items.find((it) => /linkedin\.com\/in\//.test(it.link))?.link.split("?")[0] ?? null;
}

export type SearchHit = { title: string; link: string; snippet: string; image: string | null; emails: string[]; phones: string[] };

/** Search page: one search on one engine, shown with our own screens. Uses one of today's free searches. */
export async function searchEngine(engine: Engine, q: string, page = 1): Promise<{ hits: SearchHit[]; used: boolean; enabled: boolean }> {
  if (!(await searchEnabled(engine))) return { hits: [], used: false, enabled: false };
  const items = await search(engine, q, { start: String((page - 1) * 10 + 1) });
  return {
    enabled: true,
    used: true,
    hits: items.map((it) => {
      const meta = it.pagemap?.metatags?.[0] ?? {};
      const text = `${it.title}\n${it.snippet ?? ""}\n${meta["og:description"] ?? ""}`;
      return {
        title: it.title,
        link: it.link,
        snippet: (meta["og:description"] || it.snippet || "").slice(0, 400),
        image: meta["og:image"] ?? null,
        emails: extractEmails(text).slice(0, 3),
        phones: extractPhones(text).filter((p) => p.startsWith("+")).slice(0, 2),
      };
    }),
  };
}

export async function engineReady(e: Engine) {
  return searchEnabled(e);
}
