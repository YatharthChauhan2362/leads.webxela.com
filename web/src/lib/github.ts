import "server-only";

// Public GitHub profiles, through GitHub's official API. Many developers and founders list a public
// email, website and company there. We only read what the person chose to make public.
// GITHUB_TOKEN (optional, no scopes needed) raises the limit from 10 to 30 searches a minute.

type GhUser = { login: string; html_url: string; name: string | null; email: string | null; blog: string | null; company: string | null; location: string | null };

const headers = () => ({
  accept: "application/vnd.github+json",
  "user-agent": "leads-app",
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Finds the person's GitHub profile by name, and only accepts it when the name matches exactly
 * and, when we know them, the company or location matches too. Returns null when unsure.
 */
export async function githubProfile(name: string | null | undefined, company?: string | null, location?: string | null) {
  const n = norm(name);
  if (!n || n.split(" ").length < 2) return null;
  try {
    const res = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(`${n} in:name`)}&per_page=5`, { headers: headers(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const { items } = (await res.json()) as { items: { login: string }[] };
    const co = norm(company).split(" ").filter((w) => w.length > 3);
    const place = norm(location).split(" ").filter((w) => w.length > 3);
    for (const it of items.slice(0, 3)) {
      const u = await fetch(`https://api.github.com/users/${it.login}`, { headers: headers(), signal: AbortSignal.timeout(8000) });
      if (!u.ok) continue;
      const user = (await u.json()) as GhUser;
      if (norm(user.name) !== n) continue;
      const about = norm(`${user.company} ${user.location} ${user.blog}`);
      // With only a name, many people share it. Require a second sign when we have one to check.
      const confirmed = (!co.length && !place.length) || co.some((w) => about.includes(w)) || place.some((w) => about.includes(w));
      if (!confirmed) continue;
      return {
        url: user.html_url,
        email: user.email?.toLowerCase() ?? null,
        website: user.blog ? (/^https?:/.test(user.blog) ? user.blog : `https://${user.blog}`) : null,
        company: user.company?.replace(/^@/, "") ?? null,
      };
    }
  } catch {
    // GitHub busy or limit reached: skip quietly.
  }
  return null;
}

const FREE = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|me|aol|proton|protonmail|rediffmail|zohomail|gmx|mail|yandex)\./i;

/** Gmail, Outlook and the like are personal; everything else is a work address. */
export function splitEmails(emails: string[]) {
  return { personal: emails.filter((e) => FREE.test(e)), work: emails.filter((e) => !FREE.test(e)) };
}
