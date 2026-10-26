"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { must, sb, setSettings, type Lead } from "@/lib/db";
import { aiEnabled, aiText } from "@/lib/ai";
import { scorePost } from "@/lib/score";
import { requireLeadAccess, seesAll } from "@/lib/access";
import { extractEmails } from "@/lib/contacts";
import { cleanProfileUrl, ingestPosts } from "@/lib/ingest";
import { requireMember } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { whiteContrast } from "@/lib/brand";
import { assignTo, pickBde } from "@/lib/assign";
import { recordEvent, tellOthers } from "@/lib/history";
import { findDuplicates } from "@/lib/duplicates";
import { STATUS_WORDS, money } from "@/components/leads";
import { pollSources } from "@/lib/sources";

const STATUSES = ["new", "contacted", "interested", "proposal", "contract", "paid", "lost"] as const;

type LeadOwners = { id: number; author: string | null; status: string; assigned_to: string | null; captured_by: string | null; follow_up_at: string | null; deal_value: number | null; deal_currency: string | null; lost_reason: string | null };
async function owners(id: number) {
  return must(await sb().from("leads").select("id, author, status, assigned_to, captured_by, follow_up_at, deal_value, deal_currency, lost_reason").eq("id", id).single()) as LeadOwners;
}
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

/**
 * Changes a lead's status straight from the picker, without reloading the page.
 * Lost needs a reason. Returns a short message for the picker to show.
 */
export async function changeStatus(input: { id: number; status: string; lostReason?: string }): Promise<{ ok: boolean; message: string }> {
  const me = await requireMember();
  const id = Id.parse(input.id);
  await requireLeadAccess(me, id);
  const parsed = z.enum(STATUSES).safeParse(input.status);
  if (!parsed.success) return { ok: false, message: "Pick a status." };
  const status = parsed.data;
  const reason = (input.lostReason ?? "").trim().slice(0, 500);
  if (status === "lost" && !reason) return { ok: false, message: "Say in a few words why it was lost." };
  const before = await owners(id);
  if (before.status === status && !(status === "lost" && reason !== before.lost_reason)) return { ok: true, message: "No change." };
  const now = new Date().toISOString();
  must(
    await sb()
      .from("leads")
      .update({
        status,
        is_lead: true,
        ...(status === "contacted" ? { contacted_at: now } : {}),
        ...(status === "paid" ? { won_at: now } : {}),
        ...(status === "lost" ? { lost_reason: reason } : {}),
      })
      .eq("id", id),
  );
  await recordEvent(id, me, "status", before.status, status === "lost" ? `lost:${reason}` : status);
  await tellOthers(before, me, `${me?.name || "Someone"} moved ${before.author ?? "a lead"} to ${STATUS_WORDS[status]}`, status === "lost" ? reason : undefined);
  await logActivity(me, "status", { target: `lead ${id}`, detail: `${before.status} to ${status}` });
  revalidatePath("/");
  revalidatePath(`/leads/${id}`);
  return { ok: true, message: `Saved: ${STATUS_WORDS[status]}` };
}

/** What a signed deal is worth, in rupees. Empty clears it. */
export async function setDealValue(formData: FormData) {
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
  const raw = String(formData.get("deal_value") ?? "").replace(/[^0-9.]/g, "");
  const value = raw ? z.coerce.number().min(0).max(1e12).safeParse(raw) : null;
  if (value && !value.success) back(formData, "Deal value must be a number.", "error");
  // A value always comes with its currency.
  const currency = String(formData.get("deal_currency") ?? "").toUpperCase();
  const next = value?.success ? value.data : null;
  if (next !== null && !(/^[A-Z]{3}$/.test(currency) && Intl.supportedValuesOf("currency").includes(currency))) back(formData, "Pick the currency for the deal value.", "error");
  const before = await owners(id);
  if (Number(before.deal_value ?? -1) === Number(next ?? -1) && (next === null || before.deal_currency === currency)) back(formData, "No change.");
  must(await sb().from("leads").update({ deal_value: next, deal_currency: next === null ? null : currency }).eq("id", id));
  await recordEvent(
    id,
    me,
    "deal",
    before.deal_value === null ? null : `${before.deal_currency ?? "INR"} ${before.deal_value}`,
    next === null ? "cleared" : `${currency} ${next}`,
  );
  await logActivity(me, "status", { target: `lead ${id}`, detail: `Deal value ${next ?? "cleared"}` });
  back(formData, "Deal value saved.");
}

export async function saveNotes(formData: FormData) {
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
  const notes = z.string().max(5000).parse(formData.get("notes") ?? "");
  must(await sb().from("leads").update({ notes }).eq("id", id));
  await recordEvent(id, me, "note", null, notes.slice(0, 200));
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
  if (aiEnabled() && (!me || me.auto_access)) {
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
  // Anyone working the lead can hand it to a teammate.
  const toName = to ? ((must(await sb().from("members").select("name, email").eq("id", to).neq("status", "disabled").maybeSingle()) as { name: string | null; email: string } | null) ?? null) : null;
  if (to && !toName) back(formData, "That person is not on the team.", "error");
  await assignTo(id, to);
  await recordEvent(id, me, "assigned", null, toName ? toName.name || toName.email.split("@")[0] : "Nobody");
  await logActivity(me, "assign", { target: `lead ${id}`, detail: to ?? "nobody" });
  back(formData, to ? "Lead assigned." : "Lead is now unassigned.");
}

/** Brand name, company, colour and logo. Admins only. */
export async function saveBranding(formData: FormData) {
  const me = await requireMember("admin");
  if (formData.get("reset") === "1") {
    await setSettings({ brand_first: "Yatri", brand_second: "Leads", company_name: "Yatri Cloud", brand_color: "#0080FF", logo_url: "/logo.png", favicon_url: "", tab_title: "" });
    await logActivity(me, "settings", { detail: "Branding reset" });
    back(formData, "Branding is back to the original.");
  }
  const r = z
    .object({
      brand_first: z.string().trim().min(1).max(30),
      brand_second: z.string().trim().max(30),
      company_name: z.string().trim().min(1).max(60),
      brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      tab_title: z.string().trim().max(60).default(""),
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
  // The browser tab icon. No SVG: it can carry scripts.
  let favicon_url: string | undefined;
  const icon = formData.get("favicon");
  if (icon instanceof File && icon.size > 0) {
    const types: Record<string, string> = { "image/png": "png", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "image/jpeg": "jpg", "image/webp": "webp" };
    if (!types[icon.type]) back(formData, "The tab icon must be a PNG, ICO, JPG or WebP image.", "error");
    if (icon.size > 256 * 1024) back(formData, "The tab icon must be under 256 KB.", "error");
    const path = `favicon-${Date.now()}.${types[icon.type]}`;
    const up = await sb().storage.from("brand").upload(path, icon, { contentType: icon.type, upsert: false });
    if (up.error) back(formData, `Could not upload the tab icon: ${up.error.message}`, "error");
    favicon_url = sb().storage.from("brand").getPublicUrl(path).data.publicUrl;
  }
  if (formData.get("favicon_reset") === "1") favicon_url = "";
  await setSettings({ ...r.data, brand_color: r.data.brand_color.toUpperCase(), ...(logo_url ? { logo_url } : {}), ...(favicon_url !== undefined ? { favicon_url } : {}) });
  await logActivity(me, "settings", { detail: `Branding: ${r.data.brand_first} ${r.data.brand_second}, ${r.data.brand_color}${logo_url ? ", new logo" : ""}${favicon_url ? ", new tab icon" : ""}` });
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
  must(await sb().from("leads").update({ follow_up_at: date, ...(date ? { is_lead: true } : {}) }).eq("id", id));
  await recordEvent(id, me, "follow_up", null, date ?? "cleared");
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
    strict_clients: on("strict_clients"),
    auto_assign: on("auto_assign"),
  });
  await logActivity(me, "settings", { detail: "Changed preferences" });
  back(formData, "Preferences saved. They apply to every new post from now on.");
}

const LeadFields = z.object({
  author: z.string().trim().min(1, "Add their name.").max(200),
  author_url: z.union([z.literal(""), z.string().trim().url().max(1000)]),
  headline: z.string().trim().max(300),
  emails: z.string().trim().max(500),
  phones: z.string().trim().max(200),
  text: z.string().trim().min(5, "Write what they need.").max(5000),
  post_url: z.union([z.literal(""), z.string().trim().url().max(1000)]),
  source: z.enum(["manual", "linkedin", "referral", "email", "call", "event", "website", "other"]).default("manual"),
  // Their budget, if they said one. An amount always needs its currency.
  budget_amount: z.string().trim().max(20).optional(),
  budget_currency: z.string().trim().max(3).optional(),
});

const listOf = (v: string) =>
  v
    .split(/[,\n;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");

/** A lead you add by hand: from a call, an email, a referral or anywhere else. */
export async function createLead(formData: FormData) {
  const me = await requireMember();
  const r = LeadFields.safeParse(Object.fromEntries(formData));
  if (!r.success) back(formData, r.error.issues[0]?.message ?? "Check the form.", "error");
  const d = r.data;
  const amount = (d.budget_amount ?? "").replace(/[^0-9.]/g, "");
  const currency = (d.budget_currency ?? "").toUpperCase();
  if (amount && !(Number(amount) > 0)) back(formData, "Budget must be a number.", "error");
  if (amount && !Intl.supportedValuesOf("currency").includes(currency)) back(formData, "Pick the currency for the budget.", "error");
  const budget = amount ? money(Number(amount), currency) : null;
  const res = await ingestPosts(
    [
      {
        source: d.source,
        postId: `manual:${Date.now()}:${d.author}`,
        postUrl: d.post_url || null,
        author: d.author,
        authorUrl: d.author_url || null,
        headline: d.headline || null,
        text: d.text.padEnd(20, "."),
      },
    ],
    { force: true, capturedBy: me?.id },
  );
  const lead = must(await sb().from("leads").select("id").eq("author", d.author).order("captured_at", { ascending: false }).limit(1).maybeSingle()) as { id: number } | null;
  if (lead) {
    // Contact details typed in by hand are known for sure.
    must(
      await sb()
        .from("leads")
        .update({ emails: listOf(d.emails), phones: listOf(d.phones), contact_note: d.emails || d.phones ? "Added by hand" : null, ...(budget ? { budget } : {}) })
        .eq("id", lead.id),
    );
    await recordEvent(lead.id, me, "created", null, d.source);
  }
  await logActivity(me, "add_post", { detail: `Added a lead by hand: ${d.author}` });
  if (!res.added || !lead) back(formData, "Could not add the lead.", "error");
  // Warn when someone on the team already has this person, and tell them.
  const dups = await findDuplicates({ emails: d.emails, authorUrl: d.author_url, postUrl: d.post_url, excludeId: lead.id });
  if (dups.length) {
    await recordEvent(lead.id, me, "duplicate", null, dups.map((x) => x.owner).join(", "));
    for (const x of dups) {
      const other = await owners(x.id);
      await tellOthers(other, me, `${me?.name || "Someone"} also added ${d.author}`, "The same person is now a lead twice. Agree who works it.");
    }
  }
  const msg = dups.length ? `Lead added. Heads up: ${dups.map((x) => x.owner).join(", ")} already ${dups.length === 1 ? "has" : "have"} this person.` : "Lead added.";
  redirect(`/leads/${lead.id}?${dups.length ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

/** Edit a lead's details. */
export async function updateLead(formData: FormData) {
  const me = await requireMember();
  const id = Id.parse(formData.get("id"));
  await requireLeadAccess(me, id);
  const r = LeadFields.omit({ source: true }).safeParse(Object.fromEntries(formData));
  if (!r.success) back(formData, r.error.issues[0]?.message ?? "Check the form.", "error");
  const d = r.data;
  const emails = listOf(d.emails);
  if (emails && extractEmails(emails).length !== emails.split(", ").length) back(formData, "One of the emails does not look right.", "error");
  must(
    await sb()
      .from("leads")
      .update({
        author: d.author,
        author_url: d.author_url ? (cleanProfileUrl(d.author_url) ?? d.author_url) : null,
        headline: d.headline || null,
        emails,
        phones: listOf(d.phones),
        text: d.text,
        post_url: d.post_url || null,
      })
      .eq("id", id),
  );
  await recordEvent(id, me, "edited");
  await logActivity(me, "notes", { target: `lead ${id}`, detail: "Edited lead details" });
  back(formData, "Lead updated.");
}

/** Delete several leads. Admins delete any; members only the ones they captured. */
export async function deleteLeads(formData: FormData) {
  const me = await requireMember();
  const ids = formData.getAll("ids").map((v) => Id.parse(v));
  if (!ids.length) back(formData, "Tick the leads to delete first.", "error");
  let q = sb().from("leads").delete().in("id", ids);
  if (!seesAll(me) && me) q = q.eq("captured_by", me.id);
  const gone = must(await q.select("id")) as { id: number }[];
  await logActivity(me, "delete_lead", { detail: `Deleted ${gone.length} lead${gone.length === 1 ? "" : "s"}` });
  back(formData, gone.length === ids.length ? `Deleted ${gone.length}.` : `Deleted ${gone.length}. The others were not yours to delete.`);
}

/** Delete people from People. Their leads stay. */
export async function deletePeople(formData: FormData) {
  const me = await requireMember();
  const urls = formData.getAll("urls").map((v) => z.string().url().max(1000).parse(v));
  if (!urls.length) back(formData, "Tick the people to delete first.", "error");
  let q = sb().from("profiles").delete().in("url", urls);
  if (!seesAll(me) && me) q = q.eq("captured_by", me.id);
  const gone = must(await q.select("url")) as { url: string }[];
  await logActivity(me, "delete_lead", { detail: `Deleted ${gone.length} ${gone.length === 1 ? "person" : "people"} from People` });
  back(formData, gone.length === urls.length ? `Deleted ${gone.length}.` : `Deleted ${gone.length}. The others were not yours to delete.`);
}

/** Clear your notifications: one, or all of them. */
export async function deleteNotifications(formData: FormData) {
  const me = await requireMember();
  if (!me) back(formData, "Sign in first.", "error");
  const id = formData.get("id");
  let q = sb().from("notifications").delete().eq("member_id", me.id);
  if (id) q = q.eq("id", Id.parse(id));
  must(await q);
  back(formData, id ? "Removed." : "All cleared.");
}

/** Moves daily finds into Leads. */
export async function addToLeads(formData: FormData) {
  const me = await requireMember();
  const ids = formData.getAll("ids").map((v) => Id.parse(v));
  if (!ids.length) back(formData, "Tick the finds to add first.", "error");
  for (const id of ids) await requireLeadAccess(me, id);
  const moved = must(await sb().from("leads").update({ is_lead: true }).in("id", ids).select("id")) as { id: number }[];
  await logActivity(me, "add_post", { detail: `Added ${moved.length} daily find${moved.length === 1 ? "" : "s"} to leads` });
  back(formData, `Added ${moved.length} to leads.`);
}

/** Admins switch the hourly Claude routine on or off. When off it gets nothing to search and its finds are ignored. */
export async function setClaudeAuto(formData: FormData) {
  const me = await requireMember("admin");
  const on = formData.get("on") === "on";
  await setSettings({ claude_auto: on ? "on" : "off" });
  await logActivity(me, "settings", { detail: `Claude routine turned ${on ? "on" : "off"}` });
  back(formData, on ? "Claude routine is on." : "Claude routine is off. It stops on its next run.");
}
