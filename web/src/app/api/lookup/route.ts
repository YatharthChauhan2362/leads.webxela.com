import { NextResponse } from "next/server";
import { z } from "zod";
import { CORS, checkKey, preflight } from "@/lib/api";
import { PostIn, ProfileIn, cleanProfileUrl, getProfile, ingestPosts, saveProfile } from "@/lib/ingest";

const Body = z.object({ profile: ProfileIn.optional(), post: PostIn.optional() });

export const OPTIONS = preflight;

/** The extension's buttons: save one post as a lead, and look up one person's email and phone. */
export async function POST(req: Request) {
  const denied = checkKey(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { profile } or { post }." }, { status: 400, headers: CORS });
  const { profile, post } = parsed.data;

  let saved = 0;
  if (post) saved = (await ingestPosts([post], { force: true })).added;

  let contacts = null;
  if (profile) {
    await saveProfile(profile);
    const p = await getProfile(cleanProfileUrl(profile.url)!);
    contacts = {
      emails: p?.emails ? p.emails.split(", ") : [],
      phones: p?.phones ? p.phones.split(", ") : [],
      websites: p?.websites ? p.websites.split(", ") : [],
    };
  }
  return NextResponse.json({ saved, contacts }, { headers: CORS });
}

/** Contact details already found for one LinkedIn profile, so the popup can show them at once. */
export async function GET(req: Request) {
  const denied = checkKey(req);
  if (denied) return denied;
  const url = cleanProfileUrl(new URL(req.url).searchParams.get("url"));
  if (!url) return NextResponse.json({ error: "Send ?url=" }, { status: 400, headers: CORS });
  const p = await getProfile(url);
  const contacts = p
    ? { emails: p.emails ? p.emails.split(", ") : [], phones: p.phones ? p.phones.split(", ") : [], websites: p.websites ? p.websites.split(", ") : [] }
    : null;
  return NextResponse.json({ contacts, checkedAt: p?.updated_at ?? null }, { headers: CORS });
}
