import { NextResponse } from "next/server";
import { CORS, checkKey, preflight } from "@/lib/api";
import { getLines } from "@/lib/db";
import { linkedinSearchUrl } from "@/lib/linkedin";

export const OPTIONS = preflight;

/** Pages the extension opens in watch mode: LinkedIn post searches (latest first) and watched profiles' activity. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const searches = (await getLines("searches")).map(linkedinSearchUrl);
  const profiles = (await getLines("watched_profiles")).map((u: string) => u.replace(/\/?(\?.*)?$/, "/") + "recent-activity/all/");
  return NextResponse.json({ urls: [...profiles, ...searches] }, { headers: CORS });
}
