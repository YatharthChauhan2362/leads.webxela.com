"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { must, sb, setSettings, type Lead } from "@/lib/db";
import { aiEnabled, aiText } from "@/lib/ai";
import { scorePost } from "@/lib/score";
import { requireLeadAccess, seesAll } from "@/lib/access";
import { requireMember } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { whiteContrast } from "@/lib/brand";
import { assignTo, pickBde } from "@/lib/assign";
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
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
  const status = z.enum(STATUSES).parse(formData.get("status"));
  const now = new Date().toISOString();
  must(
    await sb()
      .from("leads")
      .update({ status, ...(status === "contacted" ? { contacted_at: now } : {}), ...(status === "won" ? { won_at: now } : {}) })
      .eq("id", id),
  );
  await logActivity(me, "status", { target: `lead ${id}`, detail: status });
  back(formData, `Moved to ${status}.`);
}

export async function saveNotes(formData: FormData) {
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
  const notes = z.string().max(5000).parse(formData.get("notes") ?? "");
  must(await sb().from("leads").update({ notes }).eq("id", id));
  await logActivity(me, "notes", { target: `lead ${id}`, detail: notes.slice(0, 300) });
  back(formData, "Notes saved.");
}

export async function deleteLead(formData: FormData) {
  const me = await requireMember("admin");
  const id = Id.parse(formData.get("id"));
  must(await sb().from("leads").delete().eq("id", id));
  await logActivity(me, "delete_lead", { target: `lead ${id}` });
  back(formData, "Lead removed.");
}

export async function draftReply(formData: FormData) {
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
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
  await logActivity(me, "reply", { target: `lead ${id}`, detail: reply.slice(0, 300) });
  back(formData, "Reply drafted.");
}

function template(first: string, lead: Lead) {
  const what = lead.skills ? ` We work with ${lead.skills.split(", ").slice(0, 3).join(", ")} every day.` : "";
  return `Hi ${first}, I saw your post about this and it sounds like something our team at Yatri Cloud can take on.${what} Happy to share a rough plan and timeline after a 15 minute call. Would tomorrow work for you?\n\nYatharth, Yatri Cloud`;
}

export async function rescoreAll(formData: FormData) {
  const me = await requireMember("admin");
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
  await logActivity(me, "rescore", { detail: `${rows.length} leads` });
  back(formData, `Scored ${rows.length} leads again.`);
}

export async function checkNow(formData: FormData) {
  const me = await requireMember();
  let msg: string;
  try {
    const r = await pollSources();
    msg = "skipped" in r ? "A check is already running." : `Checked ${r.found} posts, ${r.added} new leads.`;
  } catch (err) {
    back(formData, `The check failed: ${(err as Error).message}`, "error");
  }
  await logActivity(me, "check_now", { detail: msg });
  back(formData, msg);
}

const Settings = z.object({
  searches: z.string().max(5000),
  watched_profiles: z.string().max(5000),
  subreddits: z.string().max(2000),
});

export async function saveSettings(formData: FormData) {
  const me = await requireMember("admin");
  const r = Settings.safeParse(Object.fromEntries(formData));
  if (!r.success) back(formData, "Scores must be numbers from 0 to 100.", "error");
  await setSettings(Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, String(v).replace(/\r/g, "").trim()])));
  await logActivity(me, "settings", { detail: Object.keys(r.data).join(", ") });
  back(formData, "Settings saved.");
}

export async function assignLead(formData: FormData) {
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
  const raw = String(formData.get("member") ?? "");
  const to = raw === "me" ? (me?.id ?? null) : raw ? z.string().uuid().parse(raw) : null;
  if (!seesAll(me) && to && to !== me?.id) back(formData, "Only admins can give a lead to a named person. Use Give to a BDE.", "error");
  await assignTo(id, to);
  await logActivity(me, "assign", { target: `lead ${id}`, detail: to ?? "nobody" });
  back(formData, to ? "Lead assigned." : "Lead is now unassigned.");
}

/** Brand name, company, colour and logo. Admins only. */
export async function saveBranding(formData: FormData) {
  const me = await requireMember("admin");
  if (formData.get("reset") === "1") {
    await setSettings({ brand_first: "Yatri", brand_second: "Leads", company_name: "Yatri Cloud", brand_color: "#0080FF", logo_url: "/logo.png" });
    await logActivity(me, "settings", { detail: "Branding reset" });
    back(formData, "Branding is back to the original.");
  }
  const r = z
    .object({
      brand_first: z.string().trim().min(1).max(30),
      brand_second: z.string().trim().max(30),
      company_name: z.string().trim().min(1).max(60),
      brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .safeParse(Object.fromEntries(formData));
  if (!r.success) back(formData, "Fill in the app name and company, and pick a colour.", "error");
  if (whiteContrast(r.data.brand_color) < 3) back(formData, "That colour is too light for white text. Pick a darker shade.", "error");

  let logo_url: string | undefined;
  const file = formData.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) back(formData, "The logo must be a PNG, JPG or WebP image.", "error");
    if (file.size > 1024 * 1024) back(formData, "The logo must be under 1 MB.", "error");
    const path = `logo-${Date.now()}.${file.type.split("/")[1]}`;
    const up = await sb().storage.from("brand").upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) back(formData, `Could not upload the logo: ${up.error.message}`, "error");
    logo_url = sb().storage.from("brand").getPublicUrl(path).data.publicUrl;
  }
  await setSettings({ ...r.data, brand_color: r.data.brand_color.toUpperCase(), ...(logo_url ? { logo_url } : {}) });
  await logActivity(me, "settings", { detail: `Branding: ${r.data.brand_first} ${r.data.brand_second}, ${r.data.brand_color}${logo_url ? ", new logo" : ""}` });
  back(formData, "Branding saved.");
}

/** Gives the lead to the BDE with the fewest open leads. */
export async function handToBde(formData: FormData) {
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
  const bde = await pickBde();
  if (!bde) back(formData, "There are no BDEs yet. Set someone's job to BDE on the Team page.", "error");
  await assignTo(id, bde.id);
  await logActivity(me, "assign", { target: `lead ${id}`, detail: `Handed to BDE ${bde.email}` });
  back(formData, `Given to ${bde.name || bde.email}.`);
}

/** Date to follow up on this lead. Empty clears it. */
export async function setFollowUp(formData: FormData) {
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
  const raw = String(formData.get("follow_up_at") ?? "");
  const date = raw ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(raw) : null;
  must(await sb().from("leads").update({ follow_up_at: date }).eq("id", id));
  await logActivity(me, "status", { target: `lead ${id}`, detail: date ? `Follow up on ${date}` : "Follow up cleared" });
  back(formData, date ? "Follow up date saved." : "Follow up date cleared.");
}

/** A member's own search phrases and watched profiles, checked by their extension on top of the team's. */
export async function saveMySearches(formData: FormData) {
  const me = await requireMember();
  if (!me) back(formData, "Sign in to save your own searches.", "error");
  const r = z.object({ searches: z.string().max(3000), watched_profiles: z.string().max(3000) }).safeParse({
    searches: formData.get("searches") ?? "",
    watched_profiles: formData.get("watched_profiles") ?? "",
  });
  if (!r.success) back(formData, "That list is too long.", "error");
  const clean = (v: string) => v.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30).join("\n");
  const bad = clean(r.data.watched_profiles).split("\n").filter((u) => u && !/^https:\/\/(www\.)?linkedin\.com\/in\/[^/]+\/?/.test(u));
  if (bad.length) back(formData, `These are not LinkedIn profile links: ${bad.slice(0, 2).join(", ")}`, "error");
  must(await sb().from("members").update({ searches: clean(r.data.searches), watched_profiles: clean(r.data.watched_profiles) }).eq("id", me.id));
  await logActivity(me, "settings", { detail: "Updated my own searches" });
  back(formData, "Your searches are saved. Your extension uses them from its next check.");
}

const Prefs = z.object({
  pref_services: z.string().max(3000),
  pref_exclude: z.string().max(3000),
  pref_locations: z.string().max(2000),
  pref_max_age_hours: z.coerce.number().int().min(1).max(720),
  fetch_minutes: z.coerce.number().int().min(15).max(1440),
  ext_minutes: z.coerce.number().int().min(15).max(240),
  ext_daily_cap: z.coerce.number().int().min(10).max(300),
  digest_hour: z.coerce.number().int().min(0).max(23),
  alert_score: z.coerce.number().int().min(0).max(100),
  min_score: z.coerce.number().int().min(0).max(100),
});

/** Lead preferences and schedules. Admins only; members and their extensions follow them. */
export async function savePreferences(formData: FormData) {
  const me = await requireMember("admin");
  const r = Prefs.safeParse(Object.fromEntries(formData));
  if (!r.success) back(formData, "Check the numbers: server every 15 to 1440 minutes, extension every 15 to 240, daily pages 10 to 300.", "error");
  const tidy = (v: string) => v.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  const on = (k: string) => (formData.get(k) === "on" ? "on" : "off");
  const types = ["project", ...(formData.get("type_job") === "on" ? ["job"] : [])].join(",");
  await setSettings({
    pref_services: tidy(r.data.pref_services),
    pref_exclude: tidy(r.data.pref_exclude),
    pref_locations: tidy(r.data.pref_locations),
    pref_max_age_hours: String(r.data.pref_max_age_hours),
    pref_lead_types: types,
    fetch_minutes: String(r.data.fetch_minutes),
    ext_minutes: String(r.data.ext_minutes),
    ext_daily_cap: String(r.data.ext_daily_cap),
    digest_hour: String(r.data.digest_hour),
    alert_score: String(r.data.alert_score),
    min_score: String(r.data.min_score),
    src_google: on("src_google"),
    src_reddit: on("src_reddit"),
    src_hn: on("src_hn"),
    notify_hot: on("notify_hot"),
    auto_assign: on("auto_assign"),
  });
  await logActivity(me, "settings", { detail: "Changed preferences" });
  back(formData, "Preferences saved. They apply to every new post from now on.");
}
