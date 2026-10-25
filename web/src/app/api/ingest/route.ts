import { NextResponse } from "next/server";
import { z } from "zod";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { PostIn, ProfileIn, ingestPosts, logRun, saveProfile } from "@/lib/ingest";
import { getSetting } from "@/lib/db";

const Body = z.object({
  posts: z.array(z.unknown()).max(200).default([]),
  profiles: z.array(z.unknown()).max(50).default([]),
});

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { posts: [], profiles: [] }." }, { status: 400, headers: CORS });

  // Skip bad items one by one so a single odd post does not drop the whole batch.
  const posts = parsed.data.posts.flatMap((p) => {
    const r = PostIn.safeParse(p);
    return r.success ? [r.data] : [];
  });
  const who = await apiMember(req);
  // The Claude routine posts with its own member key. When an admin turned it off, ignore what it sends.
  const claude = Boolean(who?.email.startsWith("claude-routine@"));
  if (claude && (await getSetting("claude_auto")) === "off") return NextResponse.json({ found: 0, added: 0, profiles: 0, paused: true, message: "An admin turned the Claude routine off." }, { headers: CORS });
  let profiles = 0;
  for (const p of parsed.data.profiles) {
    const r = ProfileIn.safeParse(p);
    if (r.success) {
      await saveProfile(r.data, who?.id);
      profiles++;
    }
  }

  const res = await ingestPosts(posts, { capturedBy: who?.id });
  if (res.added || profiles) await logActivity(who, "capture", { detail: `${res.added} new posts, ${profiles} profiles` });
  if (posts.length || claude) await logRun(claude ? "claude" : "extension", res.found, res.added);
  return NextResponse.json({ ...res, profiles }, { headers: CORS });
}
