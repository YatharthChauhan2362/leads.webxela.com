import { NextResponse, type NextRequest } from "next/server";

// One place that decides who gets in. Turned on by APP_PASSWORD (set on Vercel, usually empty locally).
//   Pages: browser password prompt (any user name, APP_PASSWORD as the password).
//   /api: the extension's API key (INGEST_KEY) or the same password.
export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (isApi && req.method === "OPTIONS") return NextResponse.next();

  const key = process.env.INGEST_KEY;
  const sentKey = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (isApi && key && sentKey === key) return NextResponse.next();

  const basic = req.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const decoded = atob(basic.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
  }

  return new NextResponse(isApi ? JSON.stringify({ error: "Wrong or missing API key." }) : "Sign in to Yatri Leads.", {
    status: 401,
    headers: {
      ...(isApi
        ? { "content-type": "application/json", "access-control-allow-origin": "*" }
        : { "www-authenticate": 'Basic realm="Yatri Leads", charset="UTF-8"' }),
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|icon.png).*)"],
};
