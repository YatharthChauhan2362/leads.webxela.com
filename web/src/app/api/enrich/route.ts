import { NextResponse } from "next/server";
import { CORS, checkKey, preflight } from "@/lib/api";
import { getSetting, must, sb } from "@/lib/db";

export const OPTIONS = preflight;

/** LinkedIn profiles of hot leads that have no email or phone yet and have not been looked up. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const limit = Math.min(20, Math.max(0, Number(new URL(req.url).searchParams.get("limit")) || 5));
  const min = Number(await getSetting("alert_score")) || 70;
  const profiles = must(await sb().rpc("enrich_queue", { p_min: min, p_limit: limit }));
  return NextResponse.json({ profiles }, { headers: CORS });
}
