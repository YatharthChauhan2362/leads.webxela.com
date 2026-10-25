"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { must, sb } from "@/lib/db";
import { can, newApiKey, requireMember, type Member } from "@/lib/session";

function done(msg: string, kind: "ok" | "error" = "ok"): never {
  revalidatePath("/team");
  redirect(`/team?${kind}=${encodeURIComponent(msg)}`);
}

const Role = z.enum(["owner", "admin", "member"]);
const TeamId = z.union([z.literal(""), z.string().uuid()]).transform((v) => v || null);

async function target(id: unknown): Promise<Member> {
  const m = must(await sb().from("members").select("*").eq("id", z.string().uuid().parse(id)).maybeSingle()) as Member | null;
  if (!m) done("That person is no longer on the team.", "error");
  return m;
}

/** Only the owner can make or change owners and admins. Admins manage members. */
function mayChange(me: Member | null, who: Member, newRole?: string) {
  if (!me) return true; // Sign in not set up yet: the app is in setup mode.
  if (who.role === "owner" && me.role !== "owner") return false;
  if (newRole && newRole !== "member" && me.role !== "owner") return false;
  if (who.role === "admin" && !can(me, "owner")) return false;
  return true;
}

export async function invite(formData: FormData) {
  const me = await requireMember("admin");
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().max(120), role: Role, team_id: TeamId })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) done("Enter a valid email address.", "error");
  const { email, name, role, team_id } = parsed.data;
  if (role !== "member" && me && me.role !== "owner") done("Only the owner can add admins.", "error");
  const exists = must(await sb().from("members").select("id").eq("email", email).maybeSingle());
  if (exists) done(`${email} is already on the team.`, "error");
  must(await sb().from("members").insert({ email, name: name || null, role, team_id, status: "invited", invited_by: me?.id ?? null }));
  done(`${email} can now sign in with Google or Zoho.`);
}

export async function updateMember(formData: FormData) {
  const me = await requireMember("admin");
  const who = await target(formData.get("id"));
  const role = Role.parse(formData.get("role"));
  const team_id = TeamId.parse(formData.get("team_id") ?? "");
  if (!mayChange(me, who, role)) done("Only the owner can change admins and owners.", "error");
  if (who.id === me?.id && role !== who.role) done("You cannot change your own role.", "error");
  must(await sb().from("members").update({ role, team_id }).eq("id", who.id));
  done(`Saved ${who.name || who.email}.`);
}

export async function setAccess(formData: FormData) {
  const me = await requireMember("admin");
  const who = await target(formData.get("id"));
  const on = formData.get("on") === "1";
  if (who.id === me?.id) done("You cannot turn off your own access.", "error");
  if (!mayChange(me, who)) done("Only the owner can change admins and owners.", "error");
  must(await sb().from("members").update({ status: on ? (who.last_login_at ? "active" : "invited") : "disabled" }).eq("id", who.id));
  done(on ? `${who.email} has access again.` : `${who.email} can no longer sign in.`);
}

export async function removeMember(formData: FormData) {
  const me = await requireMember("admin");
  const who = await target(formData.get("id"));
  if (who.id === me?.id) done("You cannot remove yourself.", "error");
  if (!mayChange(me, who)) done("Only the owner can remove admins and owners.", "error");
  must(await sb().from("members").delete().eq("id", who.id));
  done(`${who.email} was removed. Their leads stay, now unassigned.`);
}

export async function newKey(formData: FormData) {
  const me = await requireMember();
  const id = String(formData.get("id") ?? me?.id ?? "");
  if (me && id !== me.id && !can(me, "admin")) done("You can only change your own key.", "error");
  must(await sb().from("members").update({ api_key: newApiKey() }).eq("id", z.string().uuid().parse(id)));
  done("New extension key made. Paste it into the extension settings.");
}

export async function createTeam(formData: FormData) {
  await requireMember("admin");
  const name = z.string().trim().min(2).max(60).safeParse(formData.get("name"));
  if (!name.success) done("Team names need 2 to 60 characters.", "error");
  const r = await sb().from("teams").insert({ name: name.data });
  if (r.error) done(r.error.code === "23505" ? "A team with that name already exists." : r.error.message, "error");
  done(`Team ${name.data} created.`);
}

export async function renameTeam(formData: FormData) {
  await requireMember("admin");
  const id = z.string().uuid().parse(formData.get("id"));
  const name = z.string().trim().min(2).max(60).safeParse(formData.get("name"));
  if (!name.success) done("Team names need 2 to 60 characters.", "error");
  must(await sb().from("teams").update({ name: name.data }).eq("id", id));
  done("Team renamed.");
}

export async function deleteTeam(formData: FormData) {
  await requireMember("admin");
  const id = z.string().uuid().parse(formData.get("id"));
  must(await sb().from("teams").delete().eq("id", id));
  done("Team deleted. Its people are still on the team, without a group.");
}
