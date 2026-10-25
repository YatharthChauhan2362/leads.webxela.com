import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getSettings, lines, must, sb, type Lead, type Profile } from "./db";
import { extractEmails, extractPhones, mergeList } from "./contacts";
import { scorePost } from "./score";
import { sendLeadEmail } from "./alerts";
import { assignTo, pickBde } from "./assign";
import { notifyHotLead } from "./notify";
import { contactsFromWebsites } from "./website";
import { fallbackPhoto, storePhoto } from "./photos";
import { companyFromHeadline, predictWorkEmail, type Prediction } from "./email-finder";

export const PostIn = z.object({
  source: z.string().min(1).max(40),
  postUrl: z.string().max(1000).nullish(),
  postId: z.string().max(200).nullish(),
  author: z.string().max(300).nullish(),
  authorUrl: z.string().max(1000).nullish(),
  headline: z.string().max(1000).nullish(),
  text: z.string().min(20).max(20000),
  postedAt: z.string().max(100).nullish(),
  authorPhoto: z.string().url().max(2000).nullish(),
});
export type PostIn = z.infer<typeof PostIn>;

export const ProfileIn = z.object({
  url: z.string().min(10).max(1000),
  name: z.string().max(300).nullish(),
  headline: z.string().max(1000).nullish(),
  company: z.string().max(300).nullish(),
  companyUrl: z.string().max(1000).nullish(),
  companyWebsite: z.string().max(1000).nullish(),
  location: z.string().max(300).nullish(),
  photo: z.string().url().max(2000).nullish(),
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

const STOP = new Set(["a", "an", "the", "for", "to", "of", "and", "or", "in", "on", "our", "my", "we", "i", "is", "are", "with", "need", "needs"]);

/** The first search phrase whose main words all appear in the post. "looking for a developer" matches "Looking for an experienced developer". */
export function matchPhrase(text: string, phrases: string[]): string | null {
  const lower = text.toLowerCase();
  for (const phrase of phrases) {
    const words = phrase.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 1 && !STOP.has(w));
    if (words.length && words.every((w) => lower.includes(w))) return phrase;
  }
  return null;
}

export async function ingestPosts(posts: PostIn[], opts: { force?: boolean; capturedBy?: string | null } = {}): Promise<{ found: number; added: number }> {
  if (!posts.length) return { found: 0, added: 0 };
  const settings = await getSettings();
  // The team's search phrases plus the capturing member's own.
  const memberSearches = opts.capturedBy
    ? ((await sb().from("members").select("searches").eq("id", opts.capturedBy).eq("auto_access", true).maybeSingle()).data?.searches ?? "")
    : "";
  const phrases = [...new Set([...lines(settings.searches), ...lines(memberSearches)])];
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
    // The admin's preferences: words that rule a post out, lead types we want, services and places we serve.
    const lowerText = `${p.text}\n${p.headline ?? ""}`.toLowerCase();
    if (!opts.force && lines(settings.pref_exclude).some((w) => lowerText.includes(w.toLowerCase()))) continue;
    const types = settings.pref_lead_types.split(",").map((t) => t.trim());
    if (!opts.force && s.intent === "selling") continue;
    if (!opts.force && s.intent === "job" && !types.includes("job")) continue;
    const services = lines(settings.pref_services).filter((w) => lowerText.includes(w.toLowerCase()));
    if (services.length) {
      s.score = Math.min(100, s.score + 10);
      s.skills = [...new Set([...s.skills, ...services])];
    }
    if (lines(settings.pref_locations).some((l) => lowerText.includes(l.toLowerCase()))) s.score = Math.min(100, s.score + 10);

    // Keep a post only if it matches a search phrase, scores at least the minimum, or was saved by hand.
    // Too old to chase, when we know the post date.
    const maxAge = (Number(settings.pref_max_age_hours) || 72) * 3600_000;
    if (!opts.force && p.postedAt && /^\d{4}-\d{2}-\d{2}/.test(p.postedAt) && Date.now() - Date.parse(p.postedAt) > maxAge) continue;
    const matched = matchPhrase(p.text, phrases);
    // Matching one of your searches is a strong sign, so it counts toward the score.
    if (matched) s.score = Math.min(100, s.score + 20);
    if (s.score < minScore && !matched && !opts.force) continue;

    const emails = extractEmails(p.text);
    const phones = extractPhones(p.text);
    const profile = authorUrl ? await getProfile(authorUrl) : null;
    const note = emails.length || phones.length ? "Written in the post" : profile && (profile.emails || profile.phones) ? "From their profile contact info" : null;

    // Predict a work email from the company in their headline ("Founder @ Acme").
    let guess: Prediction | null = null;
    if (p.source === "linkedin" && !emails.length) {
      guess = await predictWorkEmail({ name: p.author, company: companyFromHeadline(p.headline), knownEmails: [] }).catch(() => null);
    }

    const rows = must(
      await sb()
        .from("leads")
        .upsert(
          {
            captured_by: opts.capturedBy ?? null,
            matched_search: matched,
            work_email: profile?.work_email ?? guess?.email ?? null,
            work_email_status: (profile?.work_email_status ?? guess?.status ?? null) as Lead["work_email_status"],
            work_email_confidence: profile?.work_email_confidence ?? guess?.confidence ?? null,
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
      // Every LinkedIn post author also goes to People, so you do not have to open their profile first.
      if (p.source === "linkedin" && authorUrl && /linkedin\.com\/in\//.test(authorUrl) && !profile) {
        await sb()
          .from("profiles")
          .upsert(
            {
              url: authorUrl,
              name: p.author ?? null,
              headline: p.headline ?? null,
              company: companyFromHeadline(p.headline),
              company_domain: guess?.domain ?? null,
              work_email: guess?.email ?? null,
              work_email_status: guess?.status ?? null,
              work_email_confidence: guess?.confidence ?? null,
              email_alternatives: guess ? guess.alternatives.join(", ") : "",
              emails: emails.join(", "),
              phones: phones.join(", "),
              photo_url: p.authorPhoto ? await storePhoto(p.authorPhoto, authorUrl) : null,
              captured_by: opts.capturedBy ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "url", ignoreDuplicates: true },
          );
      } else if (profile && !profile.photo_url && p.authorPhoto && authorUrl) {
        const stored = await storePhoto(p.authorPhoto, authorUrl);
        if (stored) await sb().from("profiles").update({ photo_url: stored }).eq("url", authorUrl);
      }
      if (rows[0].score >= alertScore) hot.push(rows[0]);
    }
  }
  // Hand new hot leads to BDEs when the admin switched that on.
  if (hot.length && settings.auto_assign === "on") {
    for (const l of hot) {
      if (l.assigned_to) continue;
      const bde = await pickBde();
      if (!bde) break;
      await assignTo(l.id, bde.id);
    }
  }
  if (hot.length && settings.notify_hot === "on") {
    for (const l of hot) await notifyHotLead({ ...l, assigned_to: l.assigned_to }).catch(() => {});
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

export async function saveProfile(p: ProfileIn, capturedBy?: string | null) {
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

  // Their photo: our own lasting copy of the one LinkedIn showed, else GitHub or Gravatar.
  let photo = old?.photo_url ?? null;
  if (p.photo) photo = (await storePhoto(p.photo, url)) ?? photo;
  if (!photo) photo = await fallbackPhoto(url, old?.github_url ?? null, [...new Set([...(old?.emails ? old.emails.split(", ") : []), ...emails])]);

  // Predict their work email from their company (our own Apollo style finder).
  const company = p.company ?? old?.company ?? companyFromHeadline(p.headline ?? old?.headline);
  const known = [...new Set([...(old?.emails ? old.emails.split(", ") : []), ...emails, ...siteEmails])];
  const guess = await predictWorkEmail({ name: p.name ?? old?.name, company, companyWebsite: p.companyWebsite, companyLinkedin: p.companyUrl, knownEmails: known }).catch(
    () => null,
  );

  const prof = must(
    await sb()
      .from("profiles")
      .upsert({
        url,
        name: p.name ?? old?.name ?? null,
        headline: p.headline ?? old?.headline ?? null,
        company: company ?? null,
        location: p.location ?? old?.location ?? null,
        photo_url: photo,
        company_domain: guess?.domain ?? old?.company_domain ?? null,
        work_email: guess?.email ?? old?.work_email ?? null,
        work_email_status: guess?.status ?? old?.work_email_status ?? null,
        work_email_confidence: guess?.confidence ?? old?.work_email_confidence ?? null,
        email_alternatives: guess ? guess.alternatives.join(", ") : (old?.email_alternatives ?? ""),
        captured_by: old?.captured_by ?? capturedBy ?? null,
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
          work_email: prof.work_email,
          work_email_status: prof.work_email_status as Lead["work_email_status"],
          work_email_confidence: prof.work_email_confidence,
        })
        .eq("id", l.id),
    );
  }
  return { profile: prof, prediction: guess, leads: leads.length };
}

export async function logRun(kind: string, found: number, added: number, error?: string) {
  must(await sb().from("runs").insert({ kind, found, added, error: error ?? null }));
}
