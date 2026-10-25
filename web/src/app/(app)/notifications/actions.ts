"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { must, sb } from "@/lib/db";
import { requireMember } from "@/lib/session";

export async function markAllRead() {
  const me = await requireMember();
  if (me) must(await sb().from("notifications").update({ read_at: new Date().toISOString() }).eq("member_id", me.id).is("read_at", null));
  revalidatePath("/", "layout");
  redirect("/notifications");
}
