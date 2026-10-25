"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { must, sb, setSettings, type Lead } from "@/lib/db";
import { aiEnabled, aiText } from "@/lib/ai";
import { scorePost } from "@/lib/score";
import { pollSources } from "@/lib/sources";

const STATUSES = ["new", "contacted", "replied", "won", "lost"] as const;
const Id = z.coerce.number().int().positive();

function back(formData: FormData, msg: string, kind: "ok" | "error" = "ok"): never {
  const raw = String(formData.get("back") ?? "/");
  const path = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const url = new URL(path, "http://x");
  url.searchParams.delete("ok");
  url.searchParams.delete("error");
  url.searchParams.set(kind, msg);
  revalidatePath("/");
  redirect(`${url.pathname}${url.search}${url.hash}`);
}

export async function setStatus(formData: FormData) {
  const id = Id.parse(formData.get("id"));
  const status = z.enum(STATUSES).parse(formData.get("status"));
  must(await sb().from("leads").update({ status }).eq("id", id));
  back(formData, `Moved to ${status}.`);
}

export async function saveNotes(formData: FormData) {
  const id = Id.parse(formData.get("id"));
  const notes = z.string().max(5000).parse(formData.get("notes") ?? "");
  must(await sb().from("leads").update({ notes }).eq("id", id));
  back(formData, "Notes saved.");
}

export async function deleteLead(formData: FormData) {
  const id = Id.parse(formData.get("id"));
  must(await sb().from("leads").delete().eq("id", id));
  back(formData, "Lead removed.");
}

export async function draftReply(formData: FormData) {
  const id = Id.parse(formData.get("id"));
  const lead = must(await sb().from("leads").select("*").eq("id", id).maybeSingle()) as Lead | null;
  if (!lead) back(formData, "That lead is gone.", "error");
  const first = (lead.author ?? "").replace(/^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i, "").split(/\s+/)[0] || "there";
  let reply: string;
  if (aiEnabled()) {
    try {
      reply = await aiText(
        `You write short first replies from Yatri Cloud, a team that builds websites, apps, SaaS, AI and cloud projects.
Write 3 to 5 plain sentences. Mention one specific detail from their post. Offer a quick call or a rough plan.
No hype words, no emojis, no dashes as punctuation, no lists. Sign off as "Yatharth, Yatri Cloud".`,
        `Their name: ${lead.author}\nTheir headline: ${lead.headline ?? ""}\nTheir post:\n${lead.text.slice(0, 3000)}`,
      );
    } catch {
      reply = template(first, lead);
    }
  } else {
    reply = template(first, lead);
  }
  must(await sb().from("leads").update({ reply }).eq("id", id));
  back(formData, "Reply drafted.");
}

function template(first: string, lead: Lead) {
  const what = lead.skills ? ` We work with ${lead.skills.split(", ").slice(0, 3).join(", ")} every day.` : "";
  return `Hi ${first}, I saw your post about this and it sounds like something our team at Yatri Cloud can take on.${what} Happy to share a rough plan and timeline after a 15 minute call. Would tomorrow work for you?\n\nYatharth, Yatri Cloud`;
}

export async function rescoreAll(formData: FormData) {
  const rows = must(await sb().from("leads").select("id, text, author, headline"));
  for (const r of rows) {
    const s = await scorePost(r.text, r.author, r.headline);
    must(
      await sb()
        .from("leads")
        .update({ score: s.score, intent: s.intent, urgency: s.urgency, reason: s.reason, budget: s.budget, skills: s.skills.join(", ") })
        .eq("id", r.id),
    );
  }
  back(formData, `Scored ${rows.length} leads again.`);
}

export async function checkNow(formData: FormData) {
  let msg: string;
  try {
    const r = await pollSources();
    msg = "skipped" in r ? "A check is already running." : `Checked ${r.found} posts, ${r.added} new leads.`;
  } catch (err) {
    back(formData, `The check failed: ${(err as Error).message}`, "error");
  }
  back(formData, msg);
}

const Settings = z.object({
  searches: z.string().max(5000),
  watched_profiles: z.string().max(5000),
  subreddits: z.string().max(2000),
  min_score: z.coerce.number().int().min(0).max(100),
  alert_score: z.coerce.number().int().min(0).max(100),
});

export async function saveSettings(formData: FormData) {
  const r = Settings.safeParse(Object.fromEntries(formData));
  if (!r.success) back(formData, "Scores must be numbers from 0 to 100.", "error");
  await setSettings(Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, String(v).replace(/\r/g, "").trim()])));
  back(formData, "Settings saved.");
}

export async function addManual(formData: FormData) {
  const { ingestPosts } = await import("@/lib/ingest");
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 20) back(formData, "Paste the full post text, at least 20 characters.", "error");
  const res = await ingestPosts([
    {
      source: "manual",
      text,
      author: String(formData.get("author") ?? "") || null,
      authorUrl: String(formData.get("author_url") ?? "") || null,
      postUrl: String(formData.get("post_url") ?? "") || null,
    },
  ]);
  back(formData, res.added ? "Lead added." : "Not added. It scored below your minimum, or it is already in the list.", res.added ? "ok" : "error");
}
