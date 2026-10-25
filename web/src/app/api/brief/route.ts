import { NextResponse } from "next/server";
import { CORS, checkKey, preflight } from "@/lib/api";
import { getSettings, lines, must, sb } from "@/lib/db";

export const OPTIONS = preflight;

/** What to look for right now: the team's and every member's search phrases, plus the admin's preferences.
 *  Read by the hourly Claude routine before it searches. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const [s, members] = await Promise.all([getSettings(), sb().from("members").select("searches, watched_profiles").neq("status", "disabled").then((r) => must(r) as { searches: string; watched_profiles: string }[])]);
  const phrases = [...new Set([...lines(s.searches), ...members.flatMap((m) => lines(m.searches))])];
  const watched = [...new Set([...lines(s.watched_profiles), ...members.flatMap((m) => lines(m.watched_profiles))])];
  return NextResponse.json(
    {
      phrases,
      watched_profiles: watched,
      services: lines(s.pref_services),
      never_if_post_says: lines(s.pref_exclude),
      places: lines(s.pref_locations),
      keep_job_posts: s.pref_lead_types.includes("job"),
      max_age_hours: Number(s.pref_max_age_hours) || 72,
      send_to: "POST /api/ingest with x-api-key, body { posts: [{ source, postUrl, author, authorUrl, headline, text, postedAt }] }",
    },
    { headers: CORS },
  );
}
