"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { must, sb } from "@/lib/db";
import { adminIds, notify } from "@/lib/notify";
import { requireMember } from "@/lib/session";

function done(msg: string, kind: "ok" | "error" = "ok"): never {
  revalidatePath("/feedback");
  redirect(`/feedback?${kind}=${encodeURIComponent(msg)}`);
}

const KIND_WORDS: Record<string, string> = { bug: "Bug", idea: "Idea", other: "Feedback" };
const STATUS_WORDS: Record<string, string> = { open: "Open", planned: "Planned", done: "Done", wont: "Not doing" };

const NewFeedback = z.object({
  kind: z.enum(["bug", "idea", "other"]),
  title: z.string().trim().min(3, "Give it a short title.").max(200),
  details: z.string().trim().max(5000).default(""),
  page: z.string().trim().max(500).optional(),
});

/** Anyone on the team reports a bug or suggests an idea. Admins get a notification. */
export async function sendFeedback(formData: FormData) {
  const me = await requireMember();
  const r = NewFeedback.safeParse(Object.fromEntries(formData));
  if (!r.success) done(r.error.issues[0]?.message ?? "Check the form.", "error");
  const d = r.data;
  const name = me ? me.name || me.email.split("@")[0] : "Setup";
  must(await sb().from("feedback").insert({ member_id: me?.id ?? null, member_name: name, kind: d.kind, title: d.title, details: d.details, page: d.page || null }));
  const admins = (await adminIds()).filter((id) => id !== me?.id);
  await notify(admins, "system", `${KIND_WORDS[d.kind]} from ${name}: ${d.title}`, d.details.slice(0, 300) || null);
  await logActivity(me, "settings", { detail: `Sent ${d.kind}: ${d.title}` });
  done("Thanks. The admins have it.");
}

/** Admins set where a report stands. The person who sent it is told. */
export async function setFeedbackStatus(formData: FormData) {
  const me = await requireMember("admin");
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const status = z.enum(["open", "planned", "done", "wont"]).parse(formData.get("status"));
  const note = z.string().trim().max(2000).parse(formData.get("admin_note") ?? "");
  const row = must(await sb().from("feedback").select("member_id, title, status").eq("id", id).maybeSingle()) as { member_id: string | null; title: string; status: string } | null;
  if (!row) done("That report is gone.", "error");
  must(await sb().from("feedback").update({ status, admin_note: note || null, updated_at: new Date().toISOString() }).eq("id", id));
  if (row.member_id && row.member_id !== me?.id) await notify([row.member_id], "system", `Your report is now ${STATUS_WORDS[status]}: ${row.title}`, note || null);
  done("Saved.");
}

/** Admins remove a report for good. */
export async function deleteFeedback(formData: FormData) {
  await requireMember("admin");
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  must(await sb().from("feedback").delete().eq("id", id));
  done("Removed.");
}
