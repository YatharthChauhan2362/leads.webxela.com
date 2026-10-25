import "server-only";
import { extractEmails, extractPhones, uniq } from "./contacts";

const UA = "YatriLeads/0.1 (contact lookup; +https://yatricloud.com)";
const SKIP = /(linkedin|twitter|x\.com|facebook|instagram|youtube|tiktok|calendly|medium|github|wa\.me|whatsapp|t\.me|linktr\.ee|google)\./i;

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    return (await res.text()).slice(0, 800_000);
  } catch {
    return null;
  }
}

function readContacts(html: string) {
  const mailto = [...html.matchAll(/href=["']mailto:([^"'?]+)/gi)].map((m) => decodeURIComponent(m[1]));
  const tel = [...html.matchAll(/href=["']tel:([^"']+)/gi)].map((m) => decodeURIComponent(m[1]).trim());
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  // Real tel: links beat numbers guessed from page text.
  const tels = uniq(tel.flatMap((t) => extractPhones(t)));
  return { emails: uniq([...mailto.flatMap(extractEmails), ...extractEmails(text)]), phones: (tels.length ? tels : extractPhones(text)).slice(0, 3) };
}

/** Reads a lead's own website (home page plus a contact or about page) for a public email or phone. */
export async function contactsFromWebsites(sites: string[]): Promise<{ emails: string[]; phones: string[] }> {
  const emails: string[] = [];
  const phones: string[] = [];
  for (const site of sites.filter((s) => /^https?:\/\//.test(s) && !SKIP.test(new URL(s).hostname)).slice(0, 2)) {
    const home = await get(site);
    if (!home) continue;
    const found = readContacts(home);
    const base = new URL(site);
    const links = [...home.matchAll(/href=["']([^"'#]+)["']/gi)]
      .map((m) => m[1])
      .filter((h) => /contact|about|impressum|reach/i.test(h))
      .map((h) => {
        try {
          return new URL(h, base).href;
        } catch {
          return null;
        }
      })
      .filter((h): h is string => Boolean(h) && new URL(h!).hostname === base.hostname);
    for (const link of uniq(links).slice(0, 2)) {
      const html = await get(link);
      if (!html) continue;
      const more = readContacts(html);
      found.emails.push(...more.emails);
      found.phones.push(...more.phones);
    }
    emails.push(...found.emails);
    phones.push(...found.phones);
  }
  return { emails: uniq(emails).slice(0, 5), phones: uniq(phones).slice(0, 3) };
}
