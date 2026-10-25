import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSettings, must, sb, type Lead, type Profile } from "./db";
import { extractEmails, extractPhones, mergeList } from "./contacts";
import { scorePost } from "./score";
import { sendLeadEmail } from "./alerts";
import { contactsFromWebsites } from "./website";

export const PostIn = z.object({
  source: z.string().min(1).max(40),
  postUrl: z.string().max(1000).nullish(),
  postId: z.string().max(200).nullish(),
  author: z.string().max(300).nullish(),
  authorUrl: z.string().max(1000).nullish(),
  headline: z.string().max(1000).nullish(),
  text: z.string().min(20).max(20000),
  postedAt: z.string().max(100).nullish(),
});
export type PostIn = z.infer<typeof PostIn>;

export const ProfileIn = z.object({
  url: z.string().min(10).max(1000),
  name: z.string().max(300).nullish(),
  headline: z.string().max(1000).nullish(),
  emails: z.array(z.string().max(300)).max(20).default([]),
  phones: z.array(z.string().max(60)).max(20).default([]),
  websites: z.array(z.string().max(1000)).max(20).default([]),
});
export type ProfileIn = z.infer<typeof ProfileIn>;

/** LinkedIn profile links come in many shapes. Keep only https://www.linkedin.com/in/<slug>/ */
export function cleanProfileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/(in|company)\/([^/?#]+)/i);
  if (m) return `https://www.linkedin.com/${m[1].toLowerCase()}/${decodeURIComponent(m[2]).toLowerCase()}/`;
  return url.split("?")[0];
}

function postKey(p: PostIn) {
  // The extension, the API sources and pasted links all name LinkedIn posts differently. Reduce them to the activity id.
  const activity = `${p.postId ?? ""} ${p.postUrl ?? ""}`.match(/activity[:-](\d{15,})/)?.[1];
  const id = activity ? `urn:li:activity:${activity}` : (p.postId ?? p.postUrl);
  if (id) return `${p.source}:${id}`;
  return `${p.source}:${createHash("sha1").update(`${p.author}|${p.text.slice(0, 300)}`).digest("hex")}`;
}

export async function ingestPosts(posts: PostIn[], opts: { force?: boolean } = {}): Promise<{ found: number; added: number }> {
  if (!posts.length) return { found: 0, added: 0 };
  const settings = await getSettings();
  const minScore = Number(settings.min_score) || 0;
  const alertScore = Number(settings.alert_score) || 70;

  // Skip posts we already have in one query.
  const keyed = posts.map((p) => ({ p, key: postKey(p) }));
  const known = new Set(
    must(await sb().from("leads").select("post_key").in("post_key", [...new Set(keyed.map((k) => k.key))])).map((r) => r.post_key),
  );
  const hot: Lead[] = [];
  let added = 0;

  for (const { p, key } of keyed) {
    if (known.has(key)) continue;
    known.add(key);
    const authorUrl = p.source === "linkedin" ? cleanProfileUrl(p.authorUrl) : (p.authorUrl ?? null);
    const s = await scorePost(p.text, p.author, p.headline);
    // A post you save by hand is kept whatever its score.
    if (s.score < minScore && !opts.force) continue;

    const emails = extractEmails(p.text);
    const phones = extractPhones(p.text);
    const profile = authorUrl ? await getProfile(authorUrl) : null;
    const note = emails.length || phones.length ? "Written in the post" : profile && (profile.emails || profile.phones) ? "From their profile contact info" : null;

    const rows = must(
      await sb()
        .from("leads")
        .upsert(
          {
            source: p.source,
            post_key: key,
            post_url: p.postUrl ?? null,
            author: p.author ?? null,
            author_url: authorUrl,
            headline: p.headline ?? null,
            text: p.text,
            posted_at: p.postedAt ?? null,
            score: s.score,
            intent: s.intent,
            urgency: s.urgency,
            reason: s.reason,
            budget: s.budget,
            skills: s.skills.join(", "),
            emails: mergeList(profile?.emails ?? "", emails),
            phones: mergeList(profile?.phones ?? "", phones),
            websites: profile?.websites ?? "",
            contact_note: note,
          },
          { onConflict: "post_key", ignoreDuplicates: true },
        )
        .select(),
    );
    if (rows.length) {
      added++;
      if (rows[0].score >= alertScore) hot.push(rows[0]);
    }
  }
  if (hot.length && (await sendLeadEmail(hot))) {
    must(await sb().from("leads").update({ alerted: true }).in("id", hot.map((l) => l.id)));
  }
  return { found: posts.length, added };
}

export async function getProfile(url: string): Promise<Profile | null> {
  const r = await sb().from("profiles").select("*").eq("url", url).maybeSingle();
  if (r.error) throw new Error(`Database: ${r.error.message}`);
  return r.data;
}

export async function saveProfile(p: ProfileIn) {
  const url = cleanProfileUrl(p.url)!;
  const emails = p.emails.flatMap(extractEmails);
  const phones = p.phones.flatMap((x) => (extractPhones(x).length ? extractPhones(x) : [x.trim()])).filter(Boolean);
  const old = await getProfile(url);
  const websites = mergeList(old?.websites ?? "", p.websites);
  let note = emails.length || phones.length ? "From their LinkedIn contact info" : null;

  // No email on LinkedIn: try the website they list there.
  let siteEmails: string[] = [];
  let sitePhones: string[] = [];
  if (!emails.length && !old?.emails && websites) {
    const found = await contactsFromWebsites(websites.split(", "));
    siteEmails = found.emails;
    sitePhones = found.phones;
    if (siteEmails.length || sitePhones.length) note ??= "From their website";
  }

  const prof = must(
    await sb()
      .from("profiles")
      .upsert({
        url,
        name: p.name ?? old?.name ?? null,
        headline: p.headline ?? old?.headline ?? null,
        emails: mergeList(old?.emails ?? "", [...emails, ...siteEmails]),
        phones: mergeList(old?.phones ?? "", [...phones, ...sitePhones]),
        websites,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single(),
  ) as Profile;

  // Copy the contact details onto every lead from this person, and mark them as looked up.
  const leads = must(await sb().from("leads").select("id, emails, phones, contact_note").eq("author_url", url));
  const now = new Date().toISOString();
  for (const l of leads) {
    must(
      await sb()
        .from("leads")
        .update({
          emails: mergeList(l.emails, prof.emails.split(", ")),
          phones: mergeList(l.phones, prof.phones.split(", ")),
          contact_note: l.contact_note ?? note,
          websites: prof.websites,
          contact_checked_at: now,
        })
        .eq("id", l.id),
    );
  }
}

export async function logRun(kind: string, found: number, added: number, error?: string) {
  must(await sb().from("runs").insert({ kind, found, added, error: error ?? null }));
}
