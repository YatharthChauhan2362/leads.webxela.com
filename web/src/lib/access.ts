import "server-only";
import { notFound } from "next/navigation";
import { must, sb } from "./db";
import { can, type Member } from "./session";

// Admins and the owner see everything. Members (BDEs, lead generators) see only their own work:
// leads assigned to them or captured by them, and profiles they saved.

export function seesAll(me: Member | null) {
  return !me || can(me, "admin");
}

/** PostgREST filter for "my leads". */
export function myLeadsFilter(me: Member) {
  return `assigned_to.eq.${me.id},captured_by.eq.${me.id}`;
}

/** Stops a member from reading or changing a lead that is not theirs. Shows "not found" so nothing leaks. */
export async function requireLeadAccess(me: Member | null, leadId: number) {
  if (seesAll(me)) return;
  const lead = must(await sb().from("leads").select("assigned_to, captured_by").eq("id", leadId).maybeSingle()) as {
    assigned_to: string | null;
    captured_by: string | null;
  } | null;
  if (!lead || (lead.assigned_to !== me!.id && lead.captured_by !== me!.id)) notFound();
}

/** PostgREST filter for the leads a person owns: given to them, or added by them and not given to anyone. */
export function ownedByFilter(memberId: string) {
  return `assigned_to.eq.${memberId},and(assigned_to.is.null,captured_by.eq.${memberId})`;
}
