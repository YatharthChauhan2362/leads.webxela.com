import { NextResponse } from "next/server";
import { appUrl } from "@/lib/oauth";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const res = NextResponse.redirect(`${appUrl()}/login?ok=${encodeURIComponent("You are signed out.")}`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
