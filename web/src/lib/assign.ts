import "server-only";
import { must, sb } from "./db";

const OPEN = ["new", "contacted", "replied"];

/** The active BDE with the fewest open leads, so work is spread evenly. Null when there are no BDEs. */
export async function pickBde(): Promise<{ id: string; email: string; name: string | null } | null> {
  const bdes = must(await sb().from("members").select("id, email, name").eq("job", "bde").neq("status", "disabled")) as { id: string; email: string; name: string | null }[];
  if (!bdes.length) return null;
  const open = must(await sb().from("leads").select("assigned_to").in("assigned_to", bdes.map((b) => b.id)).in("status", OPEN)) as { assigned_to: string }[];
  const load = new Map(bdes.map((b) => [b.id, 0]));
  for (const l of open) load.set(l.assigned_to, (load.get(l.assigned_to) ?? 0) + 1);
  return [...bdes].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0];
}

export async function assignTo(leadId: number, memberId: string | null) {
  must(await sb().from("leads").update({ assigned_to: memberId, assigned_at: memberId ? new Date().toISOString() : null }).eq("id", leadId));
}
