import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_FILE, MESSAGE_COLS, filePrefix, nameOf, roomFor, sameOrigin, type ChatMessage } from "@/lib/chat";
import { must, sb } from "@/lib/db";
import { currentMember } from "@/lib/session";

const no = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** New messages in a room after a given id (or the latest page, or older ones before an id). Marks them read. */
export async function GET(req: Request) {
  const me = await currentMember();
  if (!me) return no("Sign in first.", 401);
  const u = new URL(req.url);
  const roomId = Number(u.searchParams.get("room"));
  const after = Number(u.searchParams.get("after") ?? 0) || 0;
  const before = Number(u.searchParams.get("before") ?? 0) || 0;
  if (!Number.isInteger(roomId) || roomId <= 0) return no("Pick a room.");
  const room = await roomFor(me, roomId);
  if (!room) return no("Not found.", 404);
  let q = sb().from("chat_messages").select(MESSAGE_COLS).eq("room_id", roomId);
  if (after) q = q.gt("id", after).order("id", { ascending: true }).limit(200);
  else if (before) q = q.lt("id", before).order("id", { ascending: false }).limit(50);
  else q = q.order("id", { ascending: false }).limit(50);
  let rows = must(await q) as ChatMessage[];
  if (!after) rows = rows.reverse();
  const last = rows.at(-1)?.id ?? 0;
  if (last > room.last_read_id) await sb().from("chat_members").update({ last_read_id: last }).eq("room_id", roomId).eq("member_id", me.id);
  // Deleted messages keep their place but lose their text and file.
  const items = rows.map((m) => (m.deleted_at ? { ...m, body: "", file_name: null, file_type: null, file_size: null } : m));
  return NextResponse.json({ items, me: me.id, more: !after && rows.length === 50 });
}

const Send = z.object({
  room: z.number().int().positive(),
  body: z.string().max(4000).default(""),
  file: z
    .object({
      path: z.string().max(400),
      name: z.string().trim().min(1).max(200),
      type: z.string().max(120),
      size: z.number().int().min(0).max(MAX_FILE),
    })
    .optional(),
});

/** Sends a message, with an optional file already uploaded to the room's folder. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return no("Not allowed.", 403);
  const me = await currentMember();
  if (!me) return no("Sign in first.", 401);
  const r = Send.safeParse(await req.json().catch(() => null));
  if (!r.success) return no("Message is too long or broken.");
  const { room: roomId, file } = r.data;
  const body = r.data.body.trim();
  if (!body && !file) return no("Write something or attach a file.");
  const room = await roomFor(me, roomId);
  if (!room) return no("Not found.", 404);
  if (file) {
    // The file must be one this person uploaded to this room, and it must really be there.
    const prefix = filePrefix(roomId, me.id);
    if (!file.path.startsWith(prefix) || file.path.includes("..")) return no("That file does not belong here.", 403);
    const listed = await sb().storage.from("chat").list(prefix.replace(/\/$/, ""), { search: file.path.slice(prefix.length) });
    if (!listed.data?.some((f) => f.name === file.path.slice(prefix.length))) return no("The file did not finish uploading. Try again.");
  }
  const row = must(
    await sb()
      .from("chat_messages")
      .insert({
        room_id: roomId,
        member_id: me.id,
        member_name: nameOf(me),
        body,
        ...(file ? { file_path: file.path, file_name: file.name, file_type: file.type || "application/octet-stream", file_size: file.size } : {}),
      })
      .select(MESSAGE_COLS)
      .single(),
  ) as ChatMessage;
  await Promise.all([
    sb().from("chat_rooms").update({ last_message_at: row.created_at }).eq("id", roomId),
    sb().from("chat_members").update({ last_read_id: row.id }).eq("room_id", roomId).eq("member_id", me.id),
  ]);
  return NextResponse.json({ item: row });
}

/** Deletes your own message (room admins can delete any in their group). The file goes too. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return no("Not allowed.", 403);
  const me = await currentMember();
  if (!me) return no("Sign in first.", 401);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return no("Pick a message.");
  const msg = must(await sb().from("chat_messages").select("id, room_id, member_id, file_path").eq("id", id).maybeSingle()) as { id: number; room_id: number; member_id: string | null; file_path: string | null } | null;
  const room = msg ? await roomFor(me, msg.room_id) : null;
  if (!msg || !room) return no("Not found.", 404);
  if (msg.member_id !== me.id && !(room.kind === "group" && room.is_admin)) return no("You can only delete your own messages.", 403);
  if (msg.file_path) await sb().storage.from("chat").remove([msg.file_path]);
  must(await sb().from("chat_messages").update({ deleted_at: new Date().toISOString(), body: "", file_path: null }).eq("id", id));
  return NextResponse.json({ ok: true });
}
