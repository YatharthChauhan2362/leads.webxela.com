import { NextResponse } from "next/server";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { must, sb } from "@/lib/db";
import { appUrl } from "@/lib/oauth";

export const OPTIONS = preflight;

/** New notifications for the extension to show as desktop popups. Each one is handed out once. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const me = await apiMember(req);
  if (!me) return NextResponse.json({ items: [] }, { headers: CORS });
  const items = must(
    await sb().from("notifications").select("id, kind, title, body, lead_id, created_at").eq("member_id", me.id).is("pushed_at", null).order("created_at").limit(10),
  ) as { id: number; kind: string; title: string; body: string | null; lead_id: number | null; created_at: string }[];
  if (items.length) must(await sb().from("notifications").update({ pushed_at: new Date().toISOString() }).in("id", items.map((i) => i.id)));
  return NextResponse.json({ items: items.map((i) => ({ ...i, url: i.lead_id ? `${appUrl()}/leads/${i.lead_id}` : `${appUrl()}/me` })) }, { headers: CORS });
}
