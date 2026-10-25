import { NextResponse, type NextRequest } from "next/server";

// Fast first check: once Google or Zoho sign in is set up, pages need a session cookie.
// The real check (signature, active member, role) runs on every page and action through requireMember().
// /api routes check the extension key or the session themselves.
const PUBLIC = [/^\/login/, /^\/auth\//, /^\/api\//, /^\/yatri-leads-extension\.zip$/];

export function proxy(req: NextRequest) {
  const authOn = Boolean(process.env.GOOGLE_CLIENT_ID || process.env.ZOHO_CLIENT_ID);
  const path = req.nextUrl.pathname;
  if (!authOn || PUBLIC.some((r) => r.test(path))) return NextResponse.next();
  if (req.cookies.get("yl_session")) return NextResponse.next();
  const login = new URL("/login", req.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png).*)"],
};
