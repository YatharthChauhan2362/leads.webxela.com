import { NextResponse } from "next/server";
import { z } from "zod";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { assignTo, pickBde } from "@/lib/assign";
import { must, sb } from "@/lib/db";
import { cleanProfileUrl, getProfile, ingestPosts } from "@/lib/ingest";
import { appUrl } from "@/lib/oauth";

const Body = z.object({
  action: z.enum(["save", "bde", "follow_up", "mine"]),
  url: z.string().url().max(1000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const OPTIONS = preflight;

/** The extension's "Actions with profile" menu. Always works on this person's lead, creating it first if needed. */
export async function POST(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const r = Body.safeParse(await req.json().catch(() => null));
  if (!r.success) return NextResponse.json({ error: "Bad request." }, { status: 400, headers: CORS });
  const me = await apiMember(req);
  const url = cleanProfileUrl(r.data.url)!;
  const p = await getProfile(url);

  // Their latest lead, or a new one made from the profile.
  let lead = must(await sb().from("leads").select("id, assigned_to").eq("author_url", url).order("captured_at", { ascending: false }).limit(1).maybeSingle()) as {
    id: number;
    assigned_to: string | null;
  } | null;
  if (!lead) {
    const text = [p?.headline, p?.company ? `Works at ${p.company}` : null, `Saved from LinkedIn profile: ${p?.name ?? url}`].filter(Boolean).join("\n\n");
    await ingestPosts([{ source: "linkedin", postId: `profile:${url}`, postUrl: url, author: p?.name ?? null, authorUrl: url, headline: p?.headline ?? null, text: text.padEnd(20, ".") }], {
      force: true,
      capturedBy: me?.id,
    });
    lead = must(await sb().from("leads").select("id, assigned_to").eq("author_url", url).order("captured_at", { ascending: false }).limit(1).maybeSingle()) as {
      id: number;
      assigned_to: string | null;
    } | null;
  }
  if (!lead) return NextResponse.json({ error: "Could not save this person." }, { status: 500, headers: CORS });
  const link = `${appUrl()}/leads/${lead.id}`;

  if (r.data.action === "bde") {
    const bde = await pickBde();
    if (!bde) return NextResponse.json({ error: "There are no BDEs yet. An admin sets someone's job to BDE on the Team page.", link }, { headers: CORS });
    await assignTo(lead.id, bde.id);
    await logActivity(me, "assign", { target: `lead ${lead.id}`, detail: `From extension, to BDE ${bde.email}` });
    return NextResponse.json({ ok: true, message: `Saved and given to ${bde.name || bde.email}.`, link }, { headers: CORS });
  }
  if (r.data.action === "mine" && me) {
    await assignTo(lead.id, me.id);
    await logActivity(me, "assign", { target: `lead ${lead.id}`, detail: "From extension, took it myself" });
    return NextResponse.json({ ok: true, message: "Saved and assigned to you.", link }, { headers: CORS });
  }
  if (r.data.action === "follow_up") {
    if (!r.data.date) return NextResponse.json({ error: "Pick a date." }, { status: 400, headers: CORS });
    must(await sb().from("leads").update({ follow_up_at: r.data.date }).eq("id", lead.id));
    if (!lead.assigned_to && me) await assignTo(lead.id, me.id);
    await logActivity(me, "status", { target: `lead ${lead.id}`, detail: `Follow up on ${r.data.date}, from extension` });
    return NextResponse.json({ ok: true, message: `Follow up set for ${r.data.date}.`, link }, { headers: CORS });
  }
  await logActivity(me, "add_post", { detail: `Saved profile as lead from extension: ${url}` });
  return NextResponse.json({ ok: true, message: "Saved as a lead.", link }, { headers: CORS });
}
