import { NextResponse } from "next/server";
import { z } from "zod";
import { CORS, checkKey, preflight } from "@/lib/api";
import { PostIn, ProfileIn, ingestPosts, logRun, saveProfile } from "@/lib/ingest";

const Body = z.object({
  posts: z.array(z.unknown()).max(200).default([]),
  profiles: z.array(z.unknown()).max(50).default([]),
});

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const denied = checkKey(req);
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { posts: [], profiles: [] }." }, { status: 400, headers: CORS });

  // Skip bad items one by one so a single odd post does not drop the whole batch.
  const posts = parsed.data.posts.flatMap((p) => {
    const r = PostIn.safeParse(p);
    return r.success ? [r.data] : [];
  });
  let profiles = 0;
  for (const p of parsed.data.profiles) {
    const r = ProfileIn.safeParse(p);
    if (r.success) {
      await saveProfile(r.data);
      profiles++;
    }
  }

  const res = await ingestPosts(posts);
  if (posts.length) await logRun("extension", res.found, res.added);
  return NextResponse.json({ ...res, profiles }, { headers: CORS });
}
