import { NextResponse } from "next/server";
import { appUrl } from "@/lib/oauth";
import { logActivity } from "@/lib/activity";
import { SESSION_COOKIE, currentMember } from "@/lib/session";

export async function POST() {
  const me = await currentMember();
  if (me) await logActivity(me, "sign_out");
  const res = NextResponse.redirect(`${appUrl()}/login?ok=${encodeURIComponent("You are signed out.")}`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
