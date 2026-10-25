import "server-only";
import dns from "node:dns/promises";
import { must, sb } from "./db";
import { companyWebsite } from "./google-search";

// Our own email finder, the same idea Apollo uses:
// 1. find the company's email domain, 2. check it receives mail (MX),
// 3. learn the company's email pattern from real emails we have collected,
// 4. predict this person's work email and say how sure we are.

export type Prediction = {
  email: string;
  status: "found" | "likely" | "guess";
  confidence: number;
  pattern: string;
  domain: string;
  alternatives: string[];
  note: string;
};

type Name = { first: string; last: string };

const PATTERNS: Record<string, (n: Name) => string> = {
  "first.last": (n) => `${n.first}.${n.last}`,
  firstlast: (n) => `${n.first}${n.last}`,
  flast: (n) => `${n.first[0]}${n.last}`,
  first: (n) => n.first,
  "first_last": (n) => `${n.first}_${n.last}`,
  "f.last": (n) => `${n.first[0]}.${n.last}`,
  firstl: (n) => `${n.first}${n.last[0]}`,
  "last.first": (n) => `${n.last}.${n.first}`,
  lastf: (n) => `${n.last}${n.first[0]}`,
  "first-last": (n) => `${n.first}-${n.last}`,
};
// How common each pattern is across companies, used when we have not learned one yet.
const PRIOR = ["first.last", "first", "flast", "firstlast", "f.last", "first_last", "firstl", "last.first", "lastf", "first-last"];

const FREE_MAIL = /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|me|aol|proton|protonmail|rediffmail|zoho|gmx|mail|yandex)\./i;
const LEGAL = /\b(private|pvt|limited|ltd|llc|llp|inc|incorporated|corp|corporation|co|company|gmbh|plc|sa|ag|bv|pte|pty|group|holdings?)\b\.?/gi;

export function parseName(full: string | null | undefined): Name | null {
  if (!full) return null;
  const cleaned = full
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .split(/[,|]/)[0]
    .replace(/^(dr|mr|mrs|ms|er|prof|ca|cs|adv)\.?\s+/i, "")
    .replace(/[^A-Za-z\s'-]/g, " ")
    .toLowerCase();
  const parts = cleaned.split(/\s+/).map((p) => p.replace(/['-]/g, "")).filter((p) => p.length > 1 || cleaned.split(/\s+/).length <= 2);
  if (!parts.length) return null;
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : "" };
}

export function companyKey(name: string) {
  return name.toLowerCase().replace(LEGAL, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Company from a LinkedIn headline like "Engineer @ Hitachi Systems" or "CEO at Acme | ...". */
export function companyFromHeadline(headline: string | null | undefined): string | null {
  const m = headline?.match(/(?:@|\bat\b)\s+([A-Z0-9][^|,•·\n@]{1,60})/);
  return m ? m[1].trim() : null;
}

async function hasMx(domain: string) {
  try {
    return (await dns.resolveMx(domain)).length > 0;
  } catch {
    return false;
  }
}

async function domainFromName(name: string): Promise<string | null> {
  const key = companyKey(name);
  if (!key) return null;
  try {
    const res = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const list = (await res.json()) as { name: string; domain: string }[];
      const words = key.split(" ").filter((w) => w.length > 2);
      // Take the first match whose name shares the company's main word.
      const hit = list.find((c) => words.some((w) => companyKey(c.name).includes(w)));
      if (hit) return hit.domain.toLowerCase();
    }
  } catch {
    // Fall through to guessing.
  }
  // The company's own LinkedIn page usually lists its website.
  const site = await companyWebsite(name).catch(() => null);
  const fromLinkedIn = site ? new URL(site).hostname.replace(/^www\./, "").toLowerCase() : null;
  if (fromLinkedIn && (await hasMx(fromLinkedIn))) return fromLinkedIn;
  const slug = key.replace(/\s+/g, "");
  for (const tld of [".com", ".co.in", ".in", ".io", ".co"]) {
    if (await hasMx(slug + tld)) return slug + tld;
  }
  return null;
}

function hostOf(url: string | null | undefined) {
  try {
    return url ? new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Finds and caches a company's email domain and whether it receives mail. */
export async function companyDomain(name: string, website?: string | null, linkedinUrl?: string | null) {
  const key = companyKey(name);
  if (!key) return null;
  const cached = must(await sb().from("companies").select("*").eq("name_key", key).maybeSingle()) as {
    domain: string | null;
    has_mx: boolean | null;
    updated_at: string;
  } | null;
  const fromSite = hostOf(website);
  if (cached?.domain && !fromSite) return { domain: cached.domain, mx: Boolean(cached.has_mx) };
  if (cached && !cached.domain && !fromSite && Date.now() - Date.parse(cached.updated_at) < 7 * 86400_000) return null;

  const domain = fromSite ?? (await domainFromName(name));
  const mx = domain ? await hasMx(domain) : false;
  must(
    await sb()
      .from("companies")
      .upsert({ name_key: key, name, domain, has_mx: mx, linkedin_url: linkedinUrl ?? null, updated_at: new Date().toISOString() }),
  );
  return domain ? { domain, mx } : null;
}

/** Which pattern an email follows for a given person, if any. */
export function patternOf(email: string, name: Name): string | null {
  const local = email.split("@")[0].toLowerCase();
  if (!name.first) return null;
  for (const [id, make] of Object.entries(PATTERNS)) {
    if ((id.includes("last") || id.includes("l")) && !name.last) continue;
    if (make(name) === local) return id;
  }
  return null;
}

/** Learns a domain's pattern from every real email at that domain whose owner's name we know. */
async function learnPattern(domain: string): Promise<{ pattern: string; examples: number } | null> {
  const [people, posts] = await Promise.all([
    sb().from("profiles").select("name, emails").ilike("emails", `%@${domain}%`).limit(200),
    sb().from("leads").select("author, emails").ilike("emails", `%@${domain}%`).limit(200),
  ]);
  const rows = [
    ...(must(people) as { name: string | null; emails: string }[]),
    ...(must(posts) as { author: string | null; emails: string }[]).map((r) => ({ name: r.author, emails: r.emails })),
  ];
  const counts = new Map<string, number>();
  for (const r of rows) {
    const n = parseName(r.name);
    if (!n) continue;
    for (const e of r.emails.split(", ")) {
      if (!e.toLowerCase().endsWith(`@${domain}`)) continue;
      const p = patternOf(e, n);
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { pattern: best[0], examples: best[1] } : null;
}

/** Predicts someone's work email. Returns null when we cannot find their company's domain. */
export async function predictWorkEmail(input: {
  name: string | null | undefined;
  company: string | null | undefined;
  companyWebsite?: string | null;
  companyLinkedin?: string | null;
  knownEmails?: string[];
}): Promise<Prediction | null> {
  const name = parseName(input.name);
  if (!name?.first || !input.company) return null;
  const co = await companyDomain(input.company, input.companyWebsite, input.companyLinkedin);
  if (!co || FREE_MAIL.test(co.domain)) return null;

  // A real email at the company domain beats any prediction.
  const real = (input.knownEmails ?? []).find((e) => e.toLowerCase().endsWith(`@${co.domain}`));
  const learned = await learnPattern(co.domain);
  if (learned) {
    must(await sb().from("companies").update({ pattern: learned.pattern, pattern_examples: learned.examples }).eq("domain", co.domain));
  }

  const order = [...new Set([...(learned ? [learned.pattern] : []), ...PRIOR])].filter((id) => !(/last|l$/.test(id) && !name.last));
  const emails = order.map((id) => `${PATTERNS[id](name)}@${co.domain}`);
  if (real) {
    return { email: real.toLowerCase(), status: "found", confidence: 100, pattern: patternOf(real, name) ?? "seen", domain: co.domain, alternatives: [], note: "Seen in public" };
  }
  if (!co.mx) {
    return { email: emails[0], status: "guess", confidence: 15, pattern: order[0], domain: co.domain, alternatives: emails.slice(1, 4), note: `${co.domain} does not seem to receive email` };
  }
  if (learned) {
    const confidence = Math.min(95, 60 + learned.examples * 10);
    return {
      email: emails[0],
      status: "likely",
      confidence,
      pattern: learned.pattern,
      domain: co.domain,
      alternatives: emails.slice(1, 4),
      note: `${co.domain} uses ${learned.pattern}, learned from ${learned.examples} real email${learned.examples > 1 ? "s" : ""}`,
    };
  }
  return {
    email: emails[0],
    status: "guess",
    confidence: 40,
    pattern: order[0],
    domain: co.domain,
    alternatives: emails.slice(1, 4),
    note: `Most common pattern at ${co.domain}. It receives email, but we have not seen a real address there yet`,
  };
}
