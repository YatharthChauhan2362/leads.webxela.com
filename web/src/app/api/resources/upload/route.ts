import { NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/chat";
import { MAX_RESOURCE_FILE, RESOURCE_PREFIX } from "@/lib/resources";
import { sb } from "@/lib/db";
import { authEnabled, can, currentMember } from "@/lib/session";

const Ask = z.object({ name: z.string().trim().min(1).max(200), size: z.number().int().min(1).max(MAX_RESOURCE_FILE) });

/** A one time link for an admin to upload one resource file straight to the private bucket. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const me = await currentMember();
  if (authEnabled() && !can(me, "admin")) return NextResponse.json({ error: "Only admins can add files." }, { status: 403 });
  const r = Ask.safeParse(await req.json().catch(() => null));
  if (!r.success) return NextResponse.json({ error: "Files can be up to 50 MB." }, { status: 400 });
  const safe = r.data.name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "-").slice(-80) || "file";
  const path = `${RESOURCE_PREFIX}${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe}`;
  const s = await sb().storage.from("resources").createSignedUploadUrl(path);
  if (s.error) return NextResponse.json({ error: "Could not start the upload." }, { status: 500 });
  return NextResponse.json({ url: s.data.signedUrl, path });
}
