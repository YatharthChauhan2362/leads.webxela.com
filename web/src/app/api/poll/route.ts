import { NextResponse } from "next/server";
import { CORS, checkKey, preflight } from "@/lib/api";
import { pollSources } from "@/lib/sources";

export const OPTIONS = preflight;

/** Runs the Reddit and Hacker News check. Called by the built in timer or any outside cron. */
export async function POST(req: Request) {
  const denied = checkKey(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await pollSources(), { headers: CORS });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers: CORS });
  }
}

export const GET = POST;
