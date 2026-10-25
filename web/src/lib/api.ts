import "server-only";
import { NextResponse } from "next/server";

// The Chrome extension calls the API from its own origin.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-api-key, authorization",
};

/** When INGEST_KEY is set, the extension and cron must send it as x-api-key or a Bearer token. */
export function checkKey(req: Request): NextResponse | null {
  const key = process.env.INGEST_KEY;
  if (!key) return null;
  const sent = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (sent === key) return null;
  return NextResponse.json({ error: "Wrong or missing API key." }, { status: 401, headers: CORS });
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
