"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { must, sb } from "@/lib/db";
import { requireMember } from "@/lib/session";

function done(msg: string, kind: "ok" | "error" = "ok"): never {
  revalidatePath("/engines");
  redirect(`/engines?${kind}=${encodeURIComponent(msg)}`);
}

const Kind = z.enum(["profiles", "posts", "companies", "contacts", "elsewhere"]);

/** Asks Google one tiny search, to check a key and engine really work together. */
async function tryGoogle(apiKey: string, cx: string) {
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${new URLSearchParams({ key: apiKey, cx, q: "linkedin", num: "1" })}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res) return "Google did not answer. Try again.";
  if (res.ok) return null;
  const body = await res.text();
  if (/API_KEY_INVALID|API key not valid/i.test(body)) return "Google says this API key is not valid.";
  if (/has not been used|disabled|SERVICE_DISABLED/i.test(body)) return "Custom Search API is not switched on in this key's Google Cloud project.";
  if (/quota|rateLimit|dailyLimit/i.test(body) || res.status === 429) return "This key has used today's free searches. It will work again tomorrow.";
  if (/cx|invalid argument/i.test(body)) return "Google did not accept this engine ID.";
  return `Google said ${res.status}.`;
}

export async function addKey(formData: FormData) {
  const me = await requireMember("admin");
  const r = z
    .object({ label: z.string().trim().min(1).max(60), api_key: z.string().trim().regex(/^AIza[0-9A-Za-z_-]{30,}$/), daily_limit: z.coerce.number().int().min(1).max(10000) })
    .safeParse(Object.fromEntries(formData));
  if (!r.success) done("Check the key. Google API keys start with AIza.", "error");
  const engine = must(await sb().from("search_engines").select("cx").eq("active", true).limit(1).maybeSingle()) as { cx: string } | null;
  if (engine) {
    const problem = await tryGoogle(r.data.api_key, engine.cx);
    if (problem && !/used today/.test(problem)) done(`Not added. ${problem}`, "error");
  }
  const ins = await sb().from("search_keys").insert(r.data);
  if (ins.error) done(ins.error.code === "23505" ? "That key is already added." : ins.error.message, "error");
  await logActivity(me, "settings", { detail: `Added search key ${r.data.label}` });
  done(`Key ${r.data.label} added${engine ? " and tested" : ""}.`);
}

export async function addEngine(formData: FormData) {
  const me = await requireMember("admin");
  const r = z
    .object({ label: z.string().trim().min(1).max(60), kind: Kind, cx: z.string().trim().regex(/^[a-z0-9:_-]{6,60}$/i) })
    .safeParse(Object.fromEntries(formData));
  if (!r.success) done("Check the Search engine ID. It looks like 667ebfd0a83944a86.", "error");
  const key = must(await sb().from("search_keys").select("api_key").eq("active", true).limit(1).maybeSingle()) as { api_key: string } | null;
  const apiKey = key?.api_key ?? process.env.GOOGLE_CSE_KEY;
  if (apiKey) {
    const problem = await tryGoogle(apiKey, r.data.cx);
    if (problem && /engine ID/.test(problem)) done(`Not added. ${problem}`, "error");
  }
  const ins = await sb().from("search_engines").insert(r.data);
  if (ins.error) done(ins.error.code === "23505" ? "That engine is already added." : ins.error.message, "error");
  await logActivity(me, "settings", { detail: `Added ${r.data.kind} engine ${r.data.label}` });
  done(`Engine ${r.data.label} added${apiKey ? " and tested" : ""}.`);
}

export async function toggle(formData: FormData) {
  const me = await requireMember("admin");
  const table = z.enum(["search_keys", "search_engines"]).parse(formData.get("table"));
  const id = z.string().uuid().parse(formData.get("id"));
  const on = formData.get("on") === "1";
  // Turning a key back on also clears its "used up" mark, in case Google reset it early.
  if (table === "search_keys") must(await sb().from("search_keys").update({ active: on, ...(on ? { last_error: null, exhausted_on: null } : {}) }).eq("id", id));
  else must(await sb().from("search_engines").update({ active: on, ...(on ? { last_error: null } : {}) }).eq("id", id));
  await logActivity(me, "settings", { detail: `${on ? "Turned on" : "Paused"} a ${table === "search_keys" ? "search key" : "search engine"}` });
  done(on ? "Turned on." : "Paused.");
}

export async function remove(formData: FormData) {
  const me = await requireMember("admin");
  const table = z.enum(["search_keys", "search_engines"]).parse(formData.get("table"));
  const id = z.string().uuid().parse(formData.get("id"));
  must(await sb().from(table).delete().eq("id", id));
  await logActivity(me, "settings", { detail: `Removed a ${table === "search_keys" ? "search key" : "search engine"}` });
  done("Removed.");
}

export async function testEngine(formData: FormData) {
  await requireMember("admin");
  const id = z.string().uuid().parse(formData.get("id"));
  const engine = must(await sb().from("search_engines").select("cx, label").eq("id", id).single()) as { cx: string; label: string };
  const keys = must(await sb().from("search_keys").select("api_key, label").eq("active", true)) as { api_key: string; label: string }[];
  if (!keys.length) done("Add an API key first.", "error");
  for (const k of keys) {
    const problem = await tryGoogle(k.api_key, engine.cx);
    if (!problem) {
      await sb().from("search_engines").update({ last_error: null }).eq("id", id);
      done(`${engine.label} works with key ${k.label}.`);
    }
    if (/engine ID/.test(problem)) {
      await sb().from("search_engines").update({ last_error: problem }).eq("id", id);
      done(`${engine.label}: ${problem}`, "error");
    }
  }
  done(`${engine.label} could not be checked: every key has a problem. See the keys below.`, "error");
}
