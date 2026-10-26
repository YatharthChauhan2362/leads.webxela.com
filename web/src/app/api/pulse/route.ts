import { NextResponse } from "next/server";
import { sb } from "@/lib/db";
import { currentMember } from "@/lib/session";

// A tiny fingerprint of everything that can change on screen. Open pages ask every few seconds
// and refresh only when it changes, so the whole app stays live without reloading.
// It says only that something changed, never what.

const top = async (table: string, col: string) => {
  const r = await sb().from(table as "leads").select(col as "id").order(col as "id", { ascending: false }).limit(1).maybeSingle();
  return String((r.data as Record<string, unknown> | null)?.[col] ?? "");
};

export async function GET(req: Request) {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const withChat = new URL(req.url).searchParams.get("chat") !== "0";
  const parts = await Promise.all([
    top("leads", "id"),
    sb().from("leads").select("id", { count: "exact", head: true }).then((r) => String(r.count ?? 0)),
    top("lead_events", "id"),
    sb().from("notifications").select("id", { count: "exact", head: true }).eq("member_id", me.id).is("read_at", null).then((r) => String(r.count ?? 0)),
    top("notifications", "id"),
    top("feedback", "updated_at"),
    top("runs", "id"),
    sb().from("members").select("id", { count: "exact", head: true }).eq("status", "active").then((r) => String(r.count ?? 0)),
    sb().from("settings").select("value").in("key", ["claude_auto", "strict_clients", "brand_color", "brand_first", "brand_second", "company_name", "tab_title", "favicon_url", "logo_url"]).order("key").then((r) => (r.data ?? []).map((x) => x.value).join("|").length + (r.data ?? []).map((x) => x.value).join("|").slice(0, 300)),
    withChat ? top("chat_messages", "id") : Promise.resolve(""),
  ]);
  return NextResponse.json({ v: parts.join(":") }, { headers: { "cache-control": "no-store" } });
}
