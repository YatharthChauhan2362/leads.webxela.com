"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { nameOf, roomFor } from "@/lib/chat";
import { must, sb } from "@/lib/db";
import { requireMember, type Member } from "@/lib/session";

function go(room: number | null, msg: string, kind: "ok" | "error" = "ok"): never {
  revalidatePath("/chat");
  redirect(`/chat?${room ? `room=${room}&` : ""}${kind}=${encodeURIComponent(msg)}`);
}

async function signedIn(): Promise<Member> {
  const me = await requireMember();
  if (!me) redirect("/login");
  return me;
}

/** Only active teammates can be added. */
async function activeIds(ids: string[]) {
  if (!ids.length) return [];
  return (must(await sb().from("members").select("id").in("id", ids).eq("status", "active")) as { id: string }[]).map((m) => m.id);
}

async function systemNote(roomId: number, me: Member, text: string) {
  await sb().from("chat_messages").insert({ room_id: roomId, member_id: null, member_name: nameOf(me), body: text });
}

const People = (f: FormData) => z.array(z.string().uuid()).max(100).parse(f.getAll("people"));

/** A new group with a name and the people you pick. You are its admin. */
export async function createGroup(formData: FormData) {
  const me = await signedIn();
  const name = z.string().trim().min(1, "Give the group a name.").max(80).safeParse(formData.get("name"));
  if (!name.success) go(null, name.error.issues[0]?.message ?? "Give the group a name.", "error");
  const people = (await activeIds(People(formData))).filter((id) => id !== me.id);
  const room = must(await sb().from("chat_rooms").insert({ kind: "group", name: name.data, created_by: me.id }).select("id").single()) as { id: number };
  must(await sb().from("chat_members").insert([{ room_id: room.id, member_id: me.id, is_admin: true }, ...people.map((member_id) => ({ room_id: room.id, member_id, is_admin: false }))]));
  await systemNote(room.id, me, `${nameOf(me)} made the group ${name.data}.`);
  go(room.id, "Group made.");
}

/** Opens your one to one chat with a teammate, making it the first time. */
export async function startDirect(formData: FormData) {
  const me = await signedIn();
  const other = z.string().uuid().safeParse(formData.get("person"));
  if (!other.success || other.data === me.id) go(null, "Pick someone to message.", "error");
  if (!(await activeIds([other.data])).length) go(null, "That person is not on the team.", "error");
  const key = [me.id, other.data].sort().join(":");
  let room = must(await sb().from("chat_rooms").select("id").eq("direct_key", key).maybeSingle()) as { id: number } | null;
  if (!room) {
    room = must(await sb().from("chat_rooms").insert({ kind: "direct", direct_key: key, created_by: me.id }).select("id").single()) as { id: number };
    must(await sb().from("chat_members").insert([{ room_id: room.id, member_id: me.id }, { room_id: room.id, member_id: other.data }]));
  }
  revalidatePath("/chat");
  redirect(`/chat?room=${room.id}`);
}

/** Group admins add people. */
export async function addToGroup(formData: FormData) {
  const me = await signedIn();
  const roomId = z.coerce.number().int().positive().parse(formData.get("room"));
  const room = await roomFor(me, roomId);
  if (!room || room.kind !== "group") go(null, "Not found.", "error");
  if (!room.is_admin) go(roomId, "Only the group's admins can add people.", "error");
  const people = await activeIds(People(formData));
  if (!people.length) go(roomId, "Pick at least one person.", "error");
  await sb().from("chat_members").upsert(people.map((member_id) => ({ room_id: roomId, member_id })), { onConflict: "room_id,member_id", ignoreDuplicates: true });
  await systemNote(roomId, me, `${nameOf(me)} added ${people.length} ${people.length === 1 ? "person" : "people"}.`);
  go(roomId, "Added.");
}

/** Group admins remove someone, or anyone leaves. A group with no admin left passes admin to the longest member. */
export async function removeFromGroup(formData: FormData) {
  const me = await signedIn();
  const roomId = z.coerce.number().int().positive().parse(formData.get("room"));
  const who = z.string().uuid().parse(formData.get("person"));
  const room = await roomFor(me, roomId);
  if (!room || room.kind !== "group") go(null, "Not found.", "error");
  if (who !== me.id && !room.is_admin) go(roomId, "Only the group's admins can remove people.", "error");
  const gone = must(await sb().from("members").select("name, email").eq("id", who).maybeSingle()) as { name: string | null; email: string } | null;
  must(await sb().from("chat_members").delete().eq("room_id", roomId).eq("member_id", who));
  const left = must(await sb().from("chat_members").select("member_id, is_admin").eq("room_id", roomId).order("joined_at")) as { member_id: string; is_admin: boolean }[];
  if (!left.length) {
    await sb().from("chat_rooms").delete().eq("id", roomId);
    go(null, "You left. The group was empty, so it is gone.");
  }
  if (!left.some((l) => l.is_admin)) await sb().from("chat_members").update({ is_admin: true }).eq("room_id", roomId).eq("member_id", left[0].member_id);
  await systemNote(roomId, me, who === me.id ? `${nameOf(me)} left.` : `${nameOf(me)} removed ${gone ? nameOf(gone) : "someone"}.`);
  if (who === me.id) go(null, "You left the group.");
  go(roomId, "Removed.");
}

/** Group admins rename the group. */
export async function renameGroup(formData: FormData) {
  const me = await signedIn();
  const roomId = z.coerce.number().int().positive().parse(formData.get("room"));
  const name = z.string().trim().min(1).max(80).safeParse(formData.get("name"));
  const room = await roomFor(me, roomId);
  if (!room || room.kind !== "group") go(null, "Not found.", "error");
  if (!room.is_admin) go(roomId, "Only the group's admins can rename it.", "error");
  if (!name.success) go(roomId, "Give the group a name.", "error");
  must(await sb().from("chat_rooms").update({ name: name.data }).eq("id", roomId));
  await systemNote(roomId, me, `${nameOf(me)} renamed the group to ${name.data}.`);
  go(roomId, "Renamed.");
}

/** Group admins delete the group with all its messages and files. */
export async function deleteGroup(formData: FormData) {
  const me = await signedIn();
  const roomId = z.coerce.number().int().positive().parse(formData.get("room"));
  const room = await roomFor(me, roomId);
  if (!room || room.kind !== "group") go(null, "Not found.", "error");
  if (!room.is_admin) go(roomId, "Only the group's admins can delete it.", "error");
  const files = (must(await sb().from("chat_messages").select("file_path").eq("room_id", roomId).not("file_path", "is", null)) as { file_path: string }[]).map((f) => f.file_path);
  if (files.length) await sb().storage.from("chat").remove(files);
  must(await sb().from("chat_rooms").delete().eq("id", roomId));
  go(null, "Group deleted.");
}
