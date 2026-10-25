import "server-only";
import { extractEmails } from "./contacts";
import { must, sb } from "./db";
import { cleanProfileUrl } from "./ingest";

export type Duplicate = { id: number; author: string | null; status: string; owner: string };

/**
 * Other leads for the same person: same email, same LinkedIn profile or same post.
 * Says who owns each one, so two people do not work the same lead without knowing.
 */
export async function findDuplicates(p: { emails?: string | null; authorUrl?: string | null; postUrl?: string | null; excludeId?: number }): Promise<Duplicate[]> {
  const ors: string[] = [];
  const clean = (v: string) => v.replace(/[,()*%\\"]/g, "");
  for (const e of extractEmails(p.emails ?? "").slice(0, 5)) ors.push(`emails.ilike.*${clean(e)}*`, `work_email.eq.${clean(e)}`);
  const profile = p.authorUrl ? cleanProfileUrl(p.authorUrl) : null;
  if (profile) ors.push(`author_url.eq.${clean(profile)}`);
  if (p.postUrl) ors.push(`post_url.eq.${clean(p.postUrl)}`);
  if (!ors.length) return [];
  let q = sb().from("leads").select("id, author, status, assigned_to, captured_by").eq("is_lead", true).or(ors.join(",")).limit(5);
  if (p.excludeId) q = q.neq("id", p.excludeId);
  const rows = must(await q) as { id: number; author: string | null; status: string; assigned_to: string | null; captured_by: string | null }[];
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.assigned_to ?? r.captured_by).filter((x): x is string => Boolean(x)))];
  const people = ids.length ? (must(await sb().from("members").select("id, name, email").in("id", ids)) as { id: string; name: string | null; email: string }[]) : [];
  const name = (id: string | null) => {
    const m = people.find((x) => x.id === id);
    return m ? m.name || m.email.split("@")[0] : "nobody yet";
  };
  return rows.map((r) => ({ id: r.id, author: r.author, status: r.status, owner: name(r.assigned_to ?? r.captured_by) }));
}
