import { NextResponse } from "next/server";
import { CORS, apiMember, checkKey, preflight } from "@/lib/api";
import { getBrand } from "@/lib/brand";
import { appUrl } from "@/lib/oauth";

export const OPTIONS = preflight;

/** Who the extension is connected as, and the app's name and colour so the extension matches it. */
export async function GET(req: Request) {
  const denied = await checkKey(req);
  if (denied) return denied;
  const [me, b] = await Promise.all([apiMember(req), getBrand()]);
  const logo = b.logo.startsWith("http") ? b.logo : `${appUrl()}${b.logo}`;
  return NextResponse.json(
    {
      member: me ? { name: me.name || me.email.split("@")[0], email: me.email, role: me.role, job: me.job } : null,
      brand: { first: b.first, second: b.second, color: b.color, logo },
    },
    { headers: CORS },
  );
}
