import { NextResponse } from "next/server";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { getLines, lines } from "@/lib/db";
import { linkedinSearchUrl } from "@/lib/linkedin";

export const OPTIONS = preflight;

/** Pages the extension opens in watch mode: LinkedIn post searches (latest first) and watched profiles' activity. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  // The team's searches plus this member's own, so each person's extension also checks what they care about.
  const me = await apiMember(req);
  // A member's own phrases count only while their automatic features are on.
  const mine = (s: string | undefined) => (me && !me.auto_access ? [] : lines(s ?? ""));
  const phrases = [...new Set([...(await getLines("searches")), ...mine(me?.searches)])];
  const watched = [...new Set([...(await getLines("watched_profiles")), ...mine(me?.watched_profiles)])];
  const searches = phrases.map(linkedinSearchUrl);
  const profiles = watched.map((u: string) => u.replace(/\/?(\?.*)?$/, "/") + "recent-activity/all/");
  return NextResponse.json({ urls: [...profiles, ...searches] }, { headers: CORS });
}
