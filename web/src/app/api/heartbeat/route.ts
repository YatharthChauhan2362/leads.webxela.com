import { NextResponse } from "next/server";
import { z } from "zod";
import { CORS, checkKey, preflight } from "@/lib/api";
import { must, sb } from "@/lib/db";

const Beat = z.object({
  version: z.string().max(20),
  linkedin: z.enum(["signed-in", "signed-out"]),
  watch: z.boolean(),
  pagesToday: z.number().int().min(0).max(10000),
  dailyCap: z.number().int().min(0).max(10000),
  lastWatch: z.object({ at: z.number(), pages: z.number(), added: z.number(), profiles: z.number().optional() }).nullable(),
  pausedUntil: z.number(),
  lastError: z.string().max(500),
});
export type ExtensionStatus = z.infer<typeof Beat> & { seenAt: string };

export const OPTIONS = preflight;

/** The extension reports in every 5 minutes so the app knows it is connected. */
export async function POST(req: Request) {
  const denied = checkKey(req);
  if (denied) return denied;
  const r = Beat.safeParse(await req.json().catch(() => null));
  if (!r.success) return NextResponse.json({ error: "Bad status." }, { status: 400, headers: CORS });
  const value = JSON.stringify({ ...r.data, seenAt: new Date().toISOString() });
  must(await sb().from("settings").upsert({ key: "extension_status", value }, { onConflict: "key" }));
  return NextResponse.json({ ok: true }, { headers: CORS });
}
