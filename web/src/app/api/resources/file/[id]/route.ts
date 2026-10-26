import { NextResponse } from "next/server";
import { sb } from "@/lib/db";
import { resourceFor } from "@/lib/resources";
import { authEnabled, currentMember } from "@/lib/session";

// Pictures and PDFs may show in the browser. Everything else downloads, so a file can never run as a page.
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf)$/;

/** Opens a resource file for the team, through a link that works for one minute. Admins only items stay hidden from members. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentMember();
  if (authEnabled() && !me) return new NextResponse("Sign in first.", { status: 401 });
  const r = await resourceFor(me, Number((await params).id));
  if (!r?.file_path) return new NextResponse("Not found.", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1" || !INLINE.test(r.file_type ?? "");
  const s = await sb().storage.from("resources").createSignedUrl(r.file_path, 60, download ? { download: r.file_name ?? "file" } : undefined);
  if (s.error) return new NextResponse("Could not open the file.", { status: 500 });
  return NextResponse.redirect(s.data.signedUrl, { headers: { "cache-control": "private, no-store" } });
}
