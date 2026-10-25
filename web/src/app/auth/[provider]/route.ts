import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl, providerEnabled, type Provider } from "@/lib/oauth";

/** Starts sign in: remembers a random state in a cookie, then sends you to Google or Zoho. */
export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = (await params).provider as Provider;
  if ((p !== "google" && p !== "zoho") || !providerEnabled(p)) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent("That sign in option is not set up yet.")}`, _req.url));
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(p, state));
  res.cookies.set("yl_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
