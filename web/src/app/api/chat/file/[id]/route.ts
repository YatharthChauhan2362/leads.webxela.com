import { NextResponse } from "next/server";
import { roomFor } from "@/lib/chat";
import { must, sb } from "@/lib/db";
import { currentMember } from "@/lib/session";

// Pictures may show inline. Everything else downloads, so a file can never run as a page.
const INLINE = /^image\/(png|jpe?g|gif|webp|avif)$/;

/** Opens a chat file for members of its room, through a link that works for one minute. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMember();
  if (!me) return new NextResponse("Sign in first.", { status: 401 });
  const id = Number((await params).id);
  const msg = Number.isInteger(id)
    ? (must(await sb().from("chat_messages").select("room_id, file_path, file_name, file_type, deleted_at").eq("id", id).maybeSingle()) as {
        room_id: number;
        file_path: string | null;
        file_name: string | null;
        file_type: string | null;
        deleted_at: string | null;
      } | null)
    : null;
  if (!msg || !msg.file_path || msg.deleted_at || !(await roomFor(me, msg.room_id))) return new NextResponse("Not found.", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1" || !INLINE.test(msg.file_type ?? "");
  const s = await sb().storage.from("chat").createSignedUrl(msg.file_path, 60, download ? { download: msg.file_name ?? "file" } : undefined);
  if (s.error) return new NextResponse("Could not open the file.", { status: 500 });
  return NextResponse.redirect(s.data.signedUrl, { headers: { "cache-control": "private, no-store" } });
}
