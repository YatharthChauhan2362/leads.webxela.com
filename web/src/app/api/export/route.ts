import { apiMember, checkKey } from "@/lib/api";
import { authEnabled, can } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { must, sb, type Lead } from "@/lib/db";

const COLS: (keyof Lead)[] = [
  "score", "urgency", "intent", "status", "source", "author", "author_url", "headline", "emails", "phones", "websites", "contact_note",
  "budget", "skills", "reason", "posted_at", "captured_at", "post_url", "notes", "text",
];

function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const rows = must(await sb().from("leads").select("*").order("captured_at", { ascending: false }).limit(10000));
  const who = await apiMember(req);
  // Everyone's leads with emails and phones: admins only, or the shared server key that only admins hold.
  const sharedKey = Boolean(process.env.INGEST_KEY) && req.headers.get("x-api-key") === process.env.INGEST_KEY;
  if (authEnabled() && !sharedKey && !can(who, "admin")) {
    await logActivity(who, "export_csv", { detail: "Refused: only admins can download all leads" });
    return new Response("Only admins can download all leads.", { status: 403 });
  }
  await logActivity(who, "export_csv", { detail: `${rows.length} leads with emails and phones` });
  const csv = [COLS.join(","), ...rows.map((r) => COLS.map((c) => cell(r[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
