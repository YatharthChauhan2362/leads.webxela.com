import { NextResponse } from "next/server";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { getBrand } from "@/lib/brand";
import { getSettings } from "@/lib/db";
import { appUrl } from "@/lib/oauth";

export const OPTIONS = preflight;

/** Who the extension is connected as, and the app's name and colour so the extension matches it. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const [me, b, s] = await Promise.all([apiMember(req), getBrand(), getSettings()]);
  const logo = b.logo.startsWith("http") ? b.logo : `${appUrl()}${b.logo}`;
  return NextResponse.json(
    {
      member: me ? { name: me.name || me.email.split("@")[0], email: me.email, role: me.role, job: me.job } : null,
      brand: { first: b.first, second: b.second, color: b.color, logo },
      // Set by admins on Preferences. The extension follows these and members cannot change them.
      schedule: { minutes: Number(s.ext_minutes) || 30, dailyCap: Number(s.ext_daily_cap) || 80, allowed: me ? me.auto_access : true },
    },
    { headers: CORS },
  );
}
