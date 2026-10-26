"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { must, sb } from "@/lib/db";
import { CATEGORIES, MAX_RESOURCE_FILE, RESOURCE_PREFIX, type Category } from "@/lib/resources";
import { requireMember } from "@/lib/session";
import type { TablesInsert } from "@/lib/database.types";

function done(msg: string, kind: "ok" | "error" = "ok"): never {
  revalidatePath("/resources");
  redirect(`/resources?${kind}=${encodeURIComponent(msg)}`);
}

const Item = z.object({
  id: z.coerce.number().int().positive().optional(),
  category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]),
  title: z.string().trim().min(1, "Give it a name.").max(200),
  value: z.string().trim().max(5000).default(""),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => !u || /^https?:\/\/[^\s]+$/i.test(u), "Links must start with https://")
    .default(""),
  note: z.string().trim().max(2000).default(""),
  admins_only: z.string().optional(),
  file_path: z.string().max(400).default(""),
  file_name: z.string().trim().max(200).default(""),
  file_type: z.string().trim().max(200).default(""),
  file_size: z.coerce.number().int().min(0).max(MAX_RESOURCE_FILE).default(0),
  remove_file: z.string().optional(),
});

/** Admins add or change a resource. A new file replaces the old one, which is deleted from storage. */
export async function saveResource(formData: FormData) {
  const me = await requireMember("admin");
  const r = Item.safeParse(Object.fromEntries(formData));
  if (!r.success) done(r.error.issues[0]?.message ?? "Check the form.", "error");
  const d = r.data;
  if (d.file_path && (!d.file_path.startsWith(RESOURCE_PREFIX) || d.file_path.includes(".."))) done("That file did not upload. Try again.", "error");

  const old = d.id ? (must(await sb().from("resources").select("file_path").eq("id", d.id).maybeSingle()) as { file_path: string | null } | null) : null;
  if (d.id && !old) done("That item is gone.", "error");
  if (!d.value && !d.url && !d.file_path && !(old?.file_path && !d.remove_file)) done("Add some details, a link or a file.", "error");

  const row: TablesInsert<"resources"> = {
    category: d.category,
    title: d.title,
    value: d.value,
    url: d.url || null,
    note: d.note || null,
    admins_only: d.admins_only === "on",
    updated_at: new Date().toISOString(),
  };
  const replacing = Boolean(d.file_path) || Boolean(d.remove_file);
  if (d.file_path) Object.assign(row, { file_path: d.file_path, file_name: d.file_name || "file", file_type: d.file_type || null, file_size: d.file_size || null });
  else if (d.remove_file) Object.assign(row, { file_path: null, file_name: null, file_type: null, file_size: null });

  if (d.id) must(await sb().from("resources").update(row).eq("id", d.id));
  else must(await sb().from("resources").insert({ ...row, created_by: me?.id ?? null }));
  if (replacing && old?.file_path && old.file_path !== d.file_path) await sb().storage.from("resources").remove([old.file_path]);

  await logActivity(me, "settings", { detail: `${d.id ? "Changed" : "Added"} resource: ${d.title}` });
  done(d.id ? "Saved." : "Added.");
}

/** Admins remove a resource and its file for good. */
export async function deleteResource(formData: FormData) {
  const me = await requireMember("admin");
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const row = must(await sb().from("resources").select("title, file_path").eq("id", id).maybeSingle()) as { title: string; file_path: string | null } | null;
  if (!row) done("That item is gone.", "error");
  must(await sb().from("resources").delete().eq("id", id));
  if (row.file_path) await sb().storage.from("resources").remove([row.file_path]);
  await logActivity(me, "settings", { detail: `Removed resource: ${row.title}` });
  done("Removed.");
}
