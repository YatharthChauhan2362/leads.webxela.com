import Link from "next/link";
import { STATUS_WORDS, money } from "@/components/leads";
import { setClaudeAuto } from "@/app/actions";
import { Flash } from "@/components/ui/flash";
import { LiveRefresh } from "@/components/status-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import { timeAgo } from "@/components/shell/app-shell";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/layout";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getSettings, must, sb } from "@/lib/db";
import { requireMember } from "@/lib/session";

type Row = { status: string; assigned_to: string | null; captured_by: string | null; follow_up_at: string | null; deal_value: number | null };
type Event = { id: number; lead_id: number; member_name: string | null; kind: string; from_value: string | null; to_value: string | null; at: string };

const KINDS: Record<string, string> = { created: "added", status: "changed status of", assigned: "reassigned", follow_up: "set a follow up on", note: "wrote notes on", edited: "edited", deal: "set the deal value of", duplicate: "added a duplicate of" };

/** Admin view: every person's leads by status. Click a number to open those leads. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMember("admin");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [leads, people, events, s, lastClaude] = await Promise.all([
    sb().from("leads").select("status, assigned_to, captured_by, follow_up_at, deal_value").eq("is_lead", true).limit(20000).then((r) => must(r) as Row[]),
    sb().from("members").select("id, name, email").neq("status", "disabled").order("name").then((r) => must(r) as { id: string; name: string | null; email: string }[]),
    sb().from("lead_events").select("id, lead_id, member_name, kind, from_value, to_value, at").order("at", { ascending: false }).limit(15).then((r) => must(r) as Event[]),
    getSettings(),
    sb().from("runs").select("at, found, added").eq("kind", "claude").order("id", { ascending: false }).limit(1).maybeSingle().then((r) => must(r) as { at: string; found: number; added: number } | null),
  ]);
  const claudeOn = s.claude_auto !== "off";
  const signed = (l: Row) => (l.status === "contract" || l.status === "paid") && l.deal_value !== null;
  const value = (list: Row[]) => list.filter(signed).reduce((a, l) => a + Number(l.deal_value), 0);
  const statuses = Object.keys(STATUS_WORDS);
  // A lead belongs to whoever it was given to, or to the person who added it while nobody has it.
  const ownerOf = (l: Row) => l.assigned_to ?? l.captured_by ?? "none";
  const rows = [...people.map((p) => ({ id: p.id, name: p.name || p.email.split("@")[0] })), { id: "none", name: "Nobody" }]
    .map((p) => {
      const mine = leads.filter((l) => ownerOf(l) === p.id);
      const by: Record<string, number> = {};
      for (const l of mine) by[l.status] = (by[l.status] ?? 0) + 1;
      const due = mine.filter((l) => l.follow_up_at && l.follow_up_at <= today && l.status !== "paid" && l.status !== "lost").length;
      return { ...p, by, due, total: mine.length, value: value(mine) };
    })
    .filter((r) => r.total > 0 || r.id !== "none");
  const count = (s: string) => leads.filter((l) => l.status === s).length;
  const link = (who: string, status = "all") => `/?who=${who}&status=${status}`;

  return (
    <>
      <PageHeader title="Dashboard" description="Every person's leads by status. Click a number to open those leads." />
      <Flash searchParams={searchParams} />
      <LiveRefresh seconds={30} />
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[17px] font-semibold">Claude routine is {claudeOn ? "on" : "off"}</p>
            <p className="text-[14px] text-muted-foreground">
              Searches LinkedIn every hour from 8 am to 10 pm and puts what it finds in Daily finds.{" "}
              {lastClaude ? `Last run ${timeAgo(lastClaude.at)}: ${lastClaude.found} found, ${lastClaude.added} new.` : "It has not sent anything yet."}
            </p>
          </div>
          <form action={setClaudeAuto}>
            <input type="hidden" name="back" value="/dashboard" />
            <input type="hidden" name="on" value={claudeOn ? "off" : "on"} />
            <SubmitButton variant={claudeOn ? "secondary" : "primary"} pendingText="Saving...">
              {claudeOn ? "Turn off" : "Turn on"}
            </SubmitButton>
          </form>
        </div>
      </Card>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="All leads" value={leads.length} href="/?status=all" />
        <Stat label="In progress" value={count("contacted") + count("interested") + count("proposal")} note="Contacted to proposal sent" />
        <Stat label="Contract signed" value={count("contract")} href="/?status=contract" />
        <Stat label="Payment received" value={count("paid")} note={`${money(value(leads))} signed in total`} href="/?status=paid" />
      </div>

      <Card padded={false} className="mb-6">
        <div className="p-5 pb-0">
          <CardHeader title="By person" />
        </div>
        <Table>
          <THead>
            <tr>
              <Th>Person</Th>
              {statuses.map((s) => (
                <Th key={s} align="right">
                  {STATUS_WORDS[s]}
                </Th>
              ))}
              <Th align="right">Follow ups due</Th>
              <Th align="right">Total</Th>
              <Th align="right">Signed value</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>
                  {r.id === "none" ? (
                    <Link href="/?who=none&status=all" className="font-semibold hover:text-primary hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <Link href={link(r.id)} className="font-semibold hover:text-primary hover:underline">
                      {r.name}
                    </Link>
                  )}
                </Td>
                {statuses.map((s) => (
                  <Td key={s} align="right" className="tabular-nums">
                    {r.by[s] && r.id !== "none" ? (
                      <Link href={link(r.id, s)} className="font-medium text-primary hover:underline">
                        {r.by[s]}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{r.by[s] ?? 0}</span>
                    )}
                  </Td>
                ))}
                <Td align="right" className={`tabular-nums ${r.due ? "font-semibold text-danger" : "text-muted-foreground"}`}>
                  {r.due}
                </Td>
                <Td align="right" className="font-semibold tabular-nums">
                  {r.total}
                </Td>
                <Td align="right" className="tabular-nums whitespace-nowrap">
                  {r.value ? money(r.value) : <span className="text-muted-foreground">0</span>}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Latest updates" description="The last 15 changes across all leads." />
        {events.length ? (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
                <p className="text-[15px]">
                  <span className="font-semibold">{e.member_name ?? "Someone"}</span> {KINDS[e.kind] ?? "updated"}{" "}
                  <Link href={`/leads/${e.lead_id}`} className="text-primary hover:underline">
                    a lead
                  </Link>
                  {e.kind === "status" && e.to_value ? (e.to_value.startsWith("lost:") ? `, now Lost: ${e.to_value.slice(5)}` : `, now ${STATUS_WORDS[e.to_value] ?? e.to_value}`) : ""}
                  {e.kind === "deal" && e.to_value ? `, worth ${money(Number(e.to_value))}` : ""}
                  {e.kind === "assigned" && e.to_value ? `, now with ${e.to_value}` : ""}
                </p>
                <span className="text-[13px] text-muted-foreground">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-muted-foreground">No changes yet.</p>
        )}
      </Card>
    </>
  );
}
