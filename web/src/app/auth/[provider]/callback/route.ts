import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { must, sb } from "@/lib/db";
import { appUrl, exchangeCode, type Provider } from "@/lib/oauth";
import { SESSION_COOKIE, makeSessionToken, newApiKey, sessionCookie, type Member } from "@/lib/session";

function fail(msg: string) {
  return NextResponse.redirect(`${appUrl()}/login?error=${encodeURIComponent(msg)}`);
}

/** Back from Google or Zoho: check the state, read the email, and let in only invited people. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = (await params).provider as Provider;
  if (p !== "google" && p !== "zoho") return fail("Unknown sign in option.");
  const url = new URL(req.url);
  const jar = await cookies();
  const state = jar.get("yl_oauth_state")?.value;
  jar.delete("yl_oauth_state");
  if (url.searchParams.get("error")) return fail("Sign in was cancelled.");
  if (!state || state !== url.searchParams.get("state")) return fail("Sign in expired. Please try again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("Sign in did not finish. Please try again.");

  let user;
  try {
    user = await exchangeCode(p, code, url.searchParams.get("accounts-server"));
  } catch (err) {
    return fail((err as Error).message);
  }

  let member = must(await sb().from("members").select("*").eq("email", user.email).maybeSingle()) as Member | null;
  const owners = (process.env.OWNER_EMAILS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (!member && owners.includes(user.email)) {
    member = must(await sb().from("members").insert({ email: user.email, role: "owner", status: "active", login_with: p }).select().single()) as Member;
  }
  if (!member) {
    await logActivity({ id: "", email: user.email }, "sign_in_refused", { detail: `Not invited, tried ${p}` });
    return fail(`${user.email} is not on the team yet. Ask the owner or an admin to invite you.`);
  }
  const who = { id: member.id, email: member.email };
  if (member.status === "disabled") {
    await logActivity(who, "sign_in_refused", { detail: "Access is turned off" });
    return fail("Your access was turned off. Ask the owner or an admin.");
  }
  // Each person signs in only the way their admin chose. Owners may use either.
  if (member.login_with !== p && !owners.includes(user.email)) {
    await logActivity(who, "sign_in_refused", { detail: `Tried ${p}, must use ${member.login_with}` });
    return fail(`Please use Continue with ${member.login_with === "zoho" ? "Zoho" : "Google"}. That is how your admin set up your access.`);
  }
  // The owner email always stays owner, even if someone changed it.
  const role = owners.includes(user.email) ? "owner" : member.role;

  const updated = must(
    await sb()
      .from("members")
      .update({
        status: "active",
        role,
        name: member.name || user.name,
        avatar_url: user.avatar ?? member.avatar_url,
        provider: p,
        api_key: member.api_key ?? newApiKey(),
        last_login_at: new Date().toISOString(),
      })
      .eq("id", member.id)
      .select()
      .single(),
  ) as Member;

  await logActivity(who, "sign_in", { detail: `With ${p === "zoho" ? "Zoho" : "Google"}` });
  const res = NextResponse.redirect(`${appUrl()}/`);
  res.cookies.set(SESSION_COOKIE, makeSessionToken(updated.id), sessionCookie);
  return res;
}
