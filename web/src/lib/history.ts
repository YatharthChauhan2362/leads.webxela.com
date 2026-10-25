import "server-only";
import { sb } from "./db";
import { notify } from "./notify";

type Who = { id: string; name: string | null; email: string } | null;
type Kind = "created" | "status" | "assigned" | "follow_up" | "note" | "edited";

/** Writes one line in the lead's history: who did what, and when. Never throws. */
export async function recordEvent(leadId: number, who: Who, kind: Kind, from?: string | null, to?: string | null) {
  try {
    await sb()
      .from("lead_events")
      .insert({ lead_id: leadId, member_id: who?.id ?? null, member_name: who ? who.name || who.email.split("@")[0] : "System", kind, from_value: from ?? null, to_value: to ?? null });
  } catch {
    // History is best effort.
  }
}

/** Tells the lead's owner and the person who added it when someone else changes it. */
export async function tellOthers(lead: { id: number; author: string | null; assigned_to: string | null; captured_by: string | null }, who: Who, title: string, body?: string) {
  const others = [lead.assigned_to, lead.captured_by].filter((x): x is string => Boolean(x) && x !== who?.id);
  if (others.length) await notify(others, "system", title, body ?? null, lead.id);
}
