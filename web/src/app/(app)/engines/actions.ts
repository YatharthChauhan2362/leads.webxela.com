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

/** Google answers 200 for a real engine ID and 400 for a wrong one. No API key needed. */
async function engineWorks(cx: string) {
  const res = await fetch(`https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res) return "Google did not answer. Try again.";
  return res.ok ? null : "Google does not know this engine ID. Copy it again from the engine's Overview page.";
}

export async function addEngine(formData: FormData) {
  const me = await requireMember("admin");
  const r = z
    .object({ label: z.string().trim().min(1).max(60), kind: Kind, cx: z.string().trim().regex(/^[a-z0-9:_-]{6,60}$/i) })
    .safeParse(Object.fromEntries(formData));
  if (!r.success) done("Check the Search engine ID. It looks like 667ebfd0a83944a86.", "error");
  const problem = await engineWorks(r.data.cx);
  if (problem) done(`Not added. ${problem}`, "error");
  const ins = await sb().from("search_engines").insert(r.data);
  if (ins.error) done(ins.error.code === "23505" ? "That engine is already added." : ins.error.message, "error");
  await logActivity(me, "settings", { detail: `Added ${r.data.kind} engine ${r.data.label}` });
  done(`${r.data.label} works and is added. Its tab is now on the Search page.`);
}

export async function testEngine(formData: FormData) {
  await requireMember("admin");
  const id = z.string().uuid().parse(formData.get("id"));
  const engine = must(await sb().from("search_engines").select("cx, label").eq("id", id).single()) as { cx: string; label: string };
  const problem = await engineWorks(engine.cx);
  must(await sb().from("search_engines").update({ last_error: problem }).eq("id", id));
  done(problem ? `${engine.label}: ${problem}` : `${engine.label} works.`, problem ? "error" : "ok");
}

export async function setKind(formData: FormData) {
  const me = await requireMember("admin");
  const id = z.string().uuid().parse(formData.get("id"));
  const kind = Kind.parse(formData.get("kind"));
  must(await sb().from("search_engines").update({ kind }).eq("id", id));
  await logActivity(me, "settings", { detail: `Changed an engine to ${kind}` });
  done("Saved.");
}

export async function toggle(formData: FormData) {
  const me = await requireMember("admin");
  const id = z.string().uuid().parse(formData.get("id"));
  const on = formData.get("on") === "1";
  must(await sb().from("search_engines").update({ active: on, ...(on ? { last_error: null } : {}) }).eq("id", id));
  await logActivity(me, "settings", { detail: `${on ? "Turned on" : "Paused"} a search engine` });
  done(on ? "Turned on." : "Paused.");
}

export async function remove(formData: FormData) {
  const me = await requireMember("admin");
  const id = z.string().uuid().parse(formData.get("id"));
  must(await sb().from("search_engines").delete().eq("id", id));
  await logActivity(me, "settings", { detail: "Removed a search engine" });
  done("Removed.");
}
