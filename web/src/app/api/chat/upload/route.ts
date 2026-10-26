import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_FILE, filePrefix, roomFor, sameOrigin } from "@/lib/chat";
import { sb } from "@/lib/db";
import { currentMember } from "@/lib/session";

const Ask = z.object({ room: z.number().int().positive(), name: z.string().trim().min(1).max(200), size: z.number().int().min(1).max(MAX_FILE) });

/**
 * A one time link to upload one file straight to the private bucket, inside your folder for this room.
 * The file never passes through our server, so large files work and nothing is public.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const me = await currentMember();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const r = Ask.safeParse(await req.json().catch(() => null));
  if (!r.success) return NextResponse.json({ error: "Files can be up to 25 MB." }, { status: 400 });
  if (!(await roomFor(me, r.data.room))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const safe = r.data.name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "-").slice(-80) || "file";
  const path = `${filePrefix(r.data.room, me.id)}${Date.now()}-${safe}`;
  const s = await sb().storage.from("chat").createSignedUploadUrl(path);
  if (s.error) return NextResponse.json({ error: "Could not start the upload." }, { status: 500 });
  return NextResponse.json({ url: s.data.signedUrl, path });
}
