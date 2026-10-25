import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { must, sb } from "./db";
import type { Database } from "./database.types";

export type Member = Database["public"]["Tables"]["members"]["Row"];
export type Role = "owner" | "admin" | "member";

export const SESSION_COOKIE = "yl_session";
const MAX_AGE = 30 * 24 * 3600; // 30 days

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (at least 32 characters).");
  return s;
}

/** Sign in is required once Google or Zoho keys are set. Until then the app stays open, as before. */
export function authEnabled() {
  return Boolean((process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) || (process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET));
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function makeSessionToken(memberId: string) {
  const payload = Buffer.from(JSON.stringify({ m: memberId, e: Math.floor(Date.now() / 1000) + MAX_AGE })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { m, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof m === "string" && e > Date.now() / 1000 ? m : null;
  } catch {
    return null;
  }
}

export const sessionCookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: MAX_AGE };

export function newApiKey() {
  return `yl_${randomBytes(24).toString("hex")}`;
}

/** The signed in, active member, or null. */
export async function currentMember(): Promise<Member | null> {
  const id = readToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const m = must(await sb().from("members").select("*").eq("id", id).maybeSingle()) as Member | null;
  return m && m.status === "active" ? m : null;
}

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function can(m: Pick<Member, "role"> | null, role: Role) {
  return Boolean(m && RANK[m.role as Role] >= RANK[role]);
}

/**
 * Guard for every page and action. Returns the member, or a stand in owner while sign in is not set up yet.
 * Sends people who are not signed in to /login.
 */
export async function requireMember(role: Role = "member"): Promise<Member | null> {
  if (!authEnabled()) return null;
  const m = await currentMember();
  if (!m) redirect("/login");
  if (!can(m, role)) redirect("/?error=" + encodeURIComponent(`Only ${role === "owner" ? "the owner" : "admins"} can do that.`));
  return m;
}

/** Member that owns an extension API key, if any. */
export async function memberByApiKey(key: string | null | undefined): Promise<Member | null> {
  if (!key || !key.startsWith("yl_")) return null;
  const m = must(await sb().from("members").select("*").eq("api_key", key).maybeSingle()) as Member | null;
  return m && m.status === "active" ? m : null;
}
