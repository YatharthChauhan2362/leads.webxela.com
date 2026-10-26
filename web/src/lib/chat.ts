import "server-only";
import { must, sb } from "./db";
import type { Member } from "./session";

// Team chat. Every read and write goes through these checks: you only ever see rooms you are in.
// "Everyone" includes every active member; groups and one to one rooms list their people in chat_members.

export type Room = { id: number; kind: "everyone" | "group" | "direct"; name: string | null; direct_key: string | null; last_message_at: string };
export type ChatMessage = {
  id: number;
  room_id: number;
  member_id: string | null;
  member_name: string | null;
  body: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  deleted_at: string | null;
};

export const MAX_FILE = 25 * 1024 * 1024;
export const MESSAGE_COLS = "id, room_id, member_id, member_name, body, file_name, file_type, file_size, created_at, deleted_at";

export const nameOf = (m: Pick<Member, "name" | "email">) => m.name || m.email.split("@")[0];

/** The Everyone room, made on first use if the migration's row was removed. */
export async function everyoneRoom(): Promise<Room> {
  const found = must(await sb().from("chat_rooms").select("*").eq("kind", "everyone").order("id").limit(1).maybeSingle()) as Room | null;
  if (found) return found;
  return must(await sb().from("chat_rooms").insert({ kind: "everyone", name: "Everyone" }).select("*").single()) as Room;
}

/**
 * Puts you in the Everyone room so your unread count works there too.
 * Messages from before you joined the team start as read, so a new person does not get the whole history as unread.
 */
export async function joinEveryone(me: Member) {
  const room = await everyoneRoom();
  const have = must(await sb().from("chat_members").select("member_id").eq("room_id", room.id).eq("member_id", me.id).maybeSingle());
  if (!have) {
    const before = must(await sb().from("chat_messages").select("id").eq("room_id", room.id).lt("created_at", me.created_at).order("id", { ascending: false }).limit(1).maybeSingle()) as { id: number } | null;
    await sb().from("chat_members").upsert({ room_id: room.id, member_id: me.id, last_read_id: before?.id ?? 0 }, { onConflict: "room_id,member_id", ignoreDuplicates: true });
  }
  return room;
}

/** The room, if you may see it. Null otherwise, so nothing leaks. */
export async function roomFor(me: Member, roomId: number): Promise<(Room & { is_admin: boolean; last_read_id: number }) | null> {
  const room = must(await sb().from("chat_rooms").select("*").eq("id", roomId).maybeSingle()) as Room | null;
  if (!room) return null;
  const mine = must(await sb().from("chat_members").select("is_admin, last_read_id").eq("room_id", roomId).eq("member_id", me.id).maybeSingle()) as {
    is_admin: boolean;
    last_read_id: number;
  } | null;
  if (room.kind === "everyone") {
    if (!mine) await joinEveryone(me);
    return { ...room, is_admin: false, last_read_id: mine?.last_read_id ?? 0 };
  }
  return mine ? { ...room, ...mine } : null;
}

export type RoomRow = Room & { title: string; unread: number; people: number; is_admin: boolean };

/** Your rooms, newest activity first, with a title and unread count each. */
export async function myRooms(me: Member): Promise<RoomRow[]> {
  await joinEveryone(me);
  const links = must(await sb().from("chat_members").select("room_id, is_admin, last_read_id").eq("member_id", me.id)) as { room_id: number; is_admin: boolean; last_read_id: number }[];
  if (!links.length) return [];
  const ids = links.map((l) => l.room_id);
  const [rooms, members] = await Promise.all([
    sb().from("chat_rooms").select("*").in("id", ids).order("last_message_at", { ascending: false }).then((r) => must(r) as Room[]),
    sb().from("chat_members").select("room_id, member_id, members(name, email, status)").in("room_id", ids).then((r) => must(r) as unknown as { room_id: number; member_id: string; members: { name: string | null; email: string; status: string } | null }[]),
  ]);
  const unread = await Promise.all(
    links.map(async (l) => {
      const r = await sb().from("chat_messages").select("id", { count: "exact", head: true }).eq("room_id", l.room_id).gt("id", l.last_read_id).neq("member_id", me.id).is("deleted_at", null);
      return [l.room_id, r.count ?? 0] as const;
    }),
  );
  const unreadOf = new Map(unread);
  return rooms.map((room) => {
    const people = members.filter((m) => m.room_id === room.id);
    const other = people.find((p) => p.member_id !== me.id)?.members;
    const title = room.kind === "direct" ? (other ? nameOf(other) : "Former member") : room.name || "Group";
    const link = links.find((l) => l.room_id === room.id)!;
    return { ...room, title, unread: unreadOf.get(room.id) ?? 0, people: people.length, is_admin: link.is_admin };
  });
}

/** Unread messages across all your rooms, for the menu. */
export async function unreadTotal(me: Member) {
  await joinEveryone(me);
  const links = must(await sb().from("chat_members").select("room_id, last_read_id").eq("member_id", me.id)) as { room_id: number; last_read_id: number }[];
  let n = 0;
  for (const l of links) {
    n += (await sb().from("chat_messages").select("id", { count: "exact", head: true }).eq("room_id", l.room_id).gt("id", l.last_read_id).neq("member_id", me.id).is("deleted_at", null)).count ?? 0;
  }
  return n;
}

/** Where a file for this room and person is stored. Only paths under it are accepted back. */
export const filePrefix = (roomId: number, memberId: string) => `room-${roomId}/${memberId}/`;

/** Same site requests only: blocks other sites from posting with your cookie. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host || new URL(origin).host === req.headers.get("x-forwarded-host") || new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
