import { NextResponse } from "next/server";
import { getSettings, must, setSettings, sb, type Lead } from "@/lib/db";
import { emailPerson, notify } from "@/lib/notify";
import { pollSources } from "@/lib/sources";

// Called every 15 minutes by Supabase's own timer (pg_cron). Each step decides whether it is due,
// so admins control timing on the Preferences page and nobody else can change it.
export const maxDuration = 300;

const ist = (d = new Date()) => new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const s = await getSettings();
  const now = ist();
  const today = day(now);
  const out: Record<string, unknown> = {};

  // 1. Fetch new posts when the admin's interval has passed.
  const every = Math.max(15, Number(s.fetch_minutes) || 60) * 60_000;
  if (Date.now() - (Number(s.last_server_run) || 0) >= every - 60_000) {
    await setSettings({ last_server_run: String(Date.now()) });
    out.fetch = await pollSources().catch((e) => ({ error: (e as Error).message }));
  }

  // 2. Follow up reminders: once a day per lead that is due and still open.
  const due = must(
    await sb().from("leads").select("id, author, reason, assigned_to, captured_by, follow_up_at").eq("is_lead", true).lte("follow_up_at", today).not("status", "in", "(paid,lost)"),
  ) as Pick<Lead, "id" | "author" | "reason" | "assigned_to" | "captured_by" | "follow_up_at">[];
  if (due.length) {
    const sent = must(
      await sb().from("notifications").select("lead_id").eq("kind", "follow_up").gte("created_at", `${today}T00:00:00+05:30`).in("lead_id", due.map((d) => d.id)),
    ) as { lead_id: number }[];
    const done = new Set(sent.map((x) => x.lead_id));
    let n = 0;
    for (const l of due.filter((d) => !done.has(d.id) && (d.assigned_to ?? d.captured_by))) {
      // The owner: who it was given to, or who added it if nobody was.
      await notify([l.assigned_to ?? l.captured_by], "follow_up", `Follow up today: ${l.author ?? "a lead"}`, l.reason, l.id);
      n++;
    }
    out.followUps = n;
  }

  // 3. Daily summary email at the admin's hour, once a day.
  if (s.last_digest !== today && now.getHours() >= (Number(s.digest_hour) || 9)) {
    await setSettings({ last_digest: today });
    out.digest = await dailyDigest(today);
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), ...out });
}

async function dailyDigest(today: string) {
  const people = must(await sb().from("members").select("id, email, name, role").eq("status", "active")) as { id: string; email: string; name: string | null; role: string }[];
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [open, fresh] = await Promise.all([
    sb().from("leads").select("id, author, assigned_to, captured_by, follow_up_at, status, score").eq("is_lead", true).in("status", ["new", "contacted", "interested", "proposal", "contract"]).then((r) => must(r) as Lead[]),
    sb().from("leads").select("id, score, status").gte("captured_at", since).then((r) => must(r) as Pick<Lead, "id" | "score" | "status">[]),
  ]);
  let sentCount = 0;
  for (const p of people) {
    const mine = open.filter((l) => (l.assigned_to ?? l.captured_by) === p.id);
    const dueToday = mine.filter((l) => l.follow_up_at && l.follow_up_at <= today);
    const lines = [`Good morning ${(p.name || p.email).split(/[ @]/)[0]}.`];
    if (dueToday.length) lines.push(`Follow up today: ${dueToday.map((l) => l.author ?? "a lead").join(", ")}.`);
    lines.push(`You have ${mine.length} open lead${mine.length === 1 ? "" : "s"}.`);
    if (p.role !== "member") {
      lines.push(`Team, last 24 hours: ${fresh.length} new leads, ${fresh.filter((l) => l.score >= 70).length} hot.`);
    }
    if (!dueToday.length && !mine.length && p.role === "member") continue;
    if (await emailPerson(p.email, `Your leads for ${today}`, lines, dueToday.map((l) => l.id).slice(0, 10))) sentCount++;
  }
  return { emails: sentCount };
}
