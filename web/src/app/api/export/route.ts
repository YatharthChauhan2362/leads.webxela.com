import { must, sb, type Lead } from "@/lib/db";

const COLS: (keyof Lead)[] = [
  "score", "urgency", "intent", "status", "source", "author", "author_url", "headline", "emails", "phones", "websites", "contact_note",
  "budget", "skills", "reason", "posted_at", "captured_at", "post_url", "notes", "text",
];

function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const rows = must(await sb().from("leads").select("*").order("captured_at", { ascending: false }).limit(10000));
  const csv = [COLS.join(","), ...rows.map((r) => COLS.map((c) => cell(r[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
