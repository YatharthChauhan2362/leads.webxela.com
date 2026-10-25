import { NextResponse } from "next/server";
import { z } from "zod";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { contactsFromWeb } from "@/lib/google-search";
import type { Profile } from "@/lib/db";
import { PostIn, ProfileIn, cleanProfileUrl, getProfile, ingestPosts, saveProfile } from "@/lib/ingest";

const split = (s: string | null | undefined) => (s ? s.split(", ").filter(Boolean) : []);

function toContacts(p: Profile) {
  return { emails: split(p.emails), phones: split(p.phones), websites: split(p.websites) };
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

  let contacts = null;
  let workEmail = null;
  if (profile) {
    let r = await saveProfile(profile, (await apiMember(req))?.id);
    // Nothing public on LinkedIn or their website: search the web for their name and company.
    if (!r.profile.emails && !r.profile.phones) {
      const web = await contactsFromWeb(r.profile.name, r.profile.company, r.profile.company_domain);
      if (web.emails.length || web.phones.length) {
        r = await saveProfile({ ...profile, emails: web.emails, phones: web.phones, websites: [] }, (await apiMember(req))?.id);
      }
    }
    await logActivity(await apiMember(req), "lookup", { target: profile.url, detail: [profile.name, r.profile.emails, r.profile.phones, r.prediction?.email].filter(Boolean).join(" | ") });
    contacts = toContacts(r.profile);
    workEmail = r.prediction ? { ...r.prediction, alternatives: r.prediction.alternatives } : workEmailOf(r.profile);
  }
  return NextResponse.json({ saved, contacts, workEmail }, { headers: CORS });
}

/** Contact details already found for one LinkedIn profile, so the popup can show them at once. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const url = cleanProfileUrl(new URL(req.url).searchParams.get("url"));
  if (!url) return NextResponse.json({ error: "Send ?url=" }, { status: 400, headers: CORS });
  const p = await getProfile(url);
  return NextResponse.json({ contacts: p ? toContacts(p) : null, workEmail: p ? workEmailOf(p) : null, checkedAt: p?.updated_at ?? null }, { headers: CORS });
}
