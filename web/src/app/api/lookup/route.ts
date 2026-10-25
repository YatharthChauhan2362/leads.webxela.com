import { NextResponse } from "next/server";
import { z } from "zod";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { contactsFromWeb } from "@/lib/google-search";
import { sb, type Profile } from "@/lib/db";
import { githubProfile, splitEmails } from "@/lib/github";
import { PostIn, ProfileIn, cleanProfileUrl, getProfile, ingestPosts, saveProfile } from "@/lib/ingest";

const split = (s: string | null | undefined) => (s ? s.split(", ").filter(Boolean) : []);

/** Everything the extension's profile card shows: who they are, their links, and contacts split into work and personal. */
function card(p: Profile) {
  const emails = split(p.emails);
  const { personal, work } = splitEmails(emails);
  return {
    person: { name: p.name, headline: p.headline, company: p.company, location: p.location, photo: p.photo_url, linkedin: p.url, github: p.github_url, website: split(p.websites)[0] ?? null },
    contacts: { emails, personal_emails: personal, work_emails: work, phones: split(p.phones), websites: split(p.websites) },
  };
}

function workEmailOf(p: Profile) {
  if (!p.work_email) return null;
  return {
    email: p.work_email,
    status: p.work_email_status,
    confidence: p.work_email_confidence,
    domain: p.company_domain,
    alternatives: split(p.email_alternatives),
    note: p.company ? `Works at ${p.company}` : "",
  };
}

const Body = z.object({ profile: ProfileIn.optional(), post: PostIn.optional() });

export const OPTIONS = preflight;

/** The extension's buttons: save one post as a lead, and look up one person's email and phone. */
export async function POST(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { profile } or { post }." }, { status: 400, headers: CORS });
  const { profile, post } = parsed.data;

  let saved = 0;
  if (post) saved = (await ingestPosts([post], { force: true, capturedBy: (await apiMember(req))?.id })).added;

  let result: ReturnType<typeof card> | null = null;
  let workEmail = null;
  if (profile) {
    const me = (await apiMember(req))?.id;
    let r = await saveProfile(profile, me);
    // Their public GitHub profile: often a personal email, a website and their company.
    if (!r.profile.github_url) {
      const gh = await githubProfile(r.profile.name, r.profile.company, r.profile.location);
      if (gh) {
        await sb().from("profiles").update({ github_url: gh.url }).eq("url", r.profile.url);
        r = await saveProfile({ ...profile, emails: gh.email ? [gh.email] : [], phones: [], websites: gh.website ? [gh.website] : [] }, me);
      }
    }
    // Nothing public on LinkedIn or their website: search the web for their name and company.
    if (!r.profile.emails && !r.profile.phones) {
      const web = await contactsFromWeb(r.profile.name, r.profile.company, r.profile.company_domain);
      if (web.emails.length || web.phones.length) {
        r = await saveProfile({ ...profile, emails: web.emails, phones: web.phones, websites: [] }, me);
      }
    }
    await logActivity(await apiMember(req), "lookup", { target: profile.url, detail: [profile.name, r.profile.emails, r.profile.phones, r.prediction?.email].filter(Boolean).join(" | ") });
    const fresh = (await getProfile(r.profile.url)) ?? r.profile;
    result = card(fresh);
    workEmail = r.prediction ? { ...r.prediction, alternatives: r.prediction.alternatives } : workEmailOf(fresh);
  }
  return NextResponse.json({ saved, ...(result ?? { contacts: null, person: null }), workEmail }, { headers: CORS });
}

/** Contact details already found for one LinkedIn profile, so the popup can show them at once. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const url = cleanProfileUrl(new URL(req.url).searchParams.get("url"));
  if (!url) return NextResponse.json({ error: "Send ?url=" }, { status: 400, headers: CORS });
  const p = await getProfile(url);
  return NextResponse.json({ ...(p ? card(p) : { contacts: null, person: null }), workEmail: p ? workEmailOf(p) : null, checkedAt: p?.updated_at ?? null }, { headers: CORS });
}
