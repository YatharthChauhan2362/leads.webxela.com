import { NextResponse } from "next/server";
import { z } from "zod";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { sb } from "@/lib/db";

// Things only the browser or the extension can see: page views, copying, opening links.
const Event = z.object({
  action: z.enum(["online", "page_view", "copy", "open_link", "email_link", "phone_link"]),
  target: z.string().max(500).nullish(),
  detail: z.string().max(2000).nullish(),
  path: z.string().max(500).nullish(),
});

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const text = await req.text();
  const r = Event.safeParse((() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })());
  if (!r.success) return NextResponse.json({ error: "Bad event." }, { status: 400, headers: CORS });
  const m = await apiMember(req);
  if (m && r.data.action === "online") await sb().from("members").update({ last_seen_at: new Date().toISOString() }).eq("id", m.id);
  await logActivity(m ? { id: m.id, email: m.email } : null, r.data.action, r.data);
  return NextResponse.json({ ok: true }, { headers: CORS });
}
