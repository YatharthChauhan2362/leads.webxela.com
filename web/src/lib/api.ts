import "server-only";
import { NextResponse } from "next/server";
import { authEnabled, currentMember, memberByApiKey, type Member } from "./session";

// The Chrome extension calls the API from its own origin.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-api-key, authorization",
};

function sentKey(req: Request) {
  return req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
}

/**
 * The extension and cron send a key as x-api-key or a Bearer token: the shared INGEST_KEY,
 * or a team member's own key (yl_...). A signed in browser session also works.
 */
export async function checkKey(req: Request): Promise<NextResponse | null> {
  const key = process.env.INGEST_KEY;
  const sent = sentKey(req);
  if (key && sent === key) return null;
  if (await memberByApiKey(sent)) return null;
  if (authEnabled() && (await currentMember())) return null;
  if (!key && !authEnabled()) return null;
  return NextResponse.json({ error: "Wrong or missing API key. Copy your key from the Chrome extension page." }, { status: 401, headers: CORS });
}

/** The team member behind this request, for "captured by". */
export async function apiMember(req: Request): Promise<Member | null> {
  return (await memberByApiKey(sentKey(req))) ?? (authEnabled() ? await currentMember() : null);
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
