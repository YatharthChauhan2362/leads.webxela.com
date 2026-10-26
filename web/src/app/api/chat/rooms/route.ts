import { NextResponse } from "next/server";
import { myRooms } from "@/lib/chat";
import { currentMember } from "@/lib/session";

/** Your rooms with unread counts, for the chat sidebar to stay current. */
export async function GET() {
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const rooms = await myRooms(me);
  return NextResponse.json({ rooms: rooms.map((r) => ({ id: r.id, kind: r.kind, title: r.title, unread: r.unread, people: r.people, last_message_at: r.last_message_at })) });
}
