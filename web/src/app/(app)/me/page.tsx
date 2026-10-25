import Link from "next/link";
import { ContactCell, JOB_WORDS, STATUS_WORDS, ScoreBadge } from "@/components/leads";
import { timeAgo } from "@/components/shell/app-shell";
import { saveMySearches } from "@/app/actions";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Field, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card, CardEmpty, CardHeader, PageHeader, Stat } from "@/components/ui/layout";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { seesAll } from "@/lib/access";
import { hoursAgo, must, sb, type Lead } from "@/lib/db";
import { currentMember } from "@/lib/session";

type Score = { id: string; name: string | null; email: string; job: string };

export default async function MyWork({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await currentMember();
  const all = seesAll(me);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const week = hoursAgo(7 * 24);

  const [due, open, captured, board] = await Promise.all([
    me
      ? sb().from("leads").select("*").eq("assigned_to", me.id).lte("follow_up_at", today).not("status", "in", "(won,lost)").order("follow_up_at").then((r) => must(r) as Lead[])
      : Promise.resolve([] as Lead[]),
    me
      ? sb().from("leads").select("*").eq("assigned_to", me.id).in("status", ["new", "contacted", "replied"]).order("score", { ascending: false }).limit(50).then((r) => must(r) as Lead[])
      : Promise.resolve([] as Lead[]),
    me ? sb().from("leads").select("id", { count: "exact", head: true }).eq("captured_by", me.id).gte("captured_at", week).then((r) => r.count ?? 0) : Promise.resolve(0),
    all ? scoreboard(week) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={me ? `Hi ${(me.name || me.email).split(/[ @]/)[0]}` : "My work"}
        description={me ? `${JOB_WORDS[me.job] ?? "Team member"}. Here is what needs you today.` : "Sign in is not switched on, so there is no personal list yet."}
        actions={
          <Link href="/?who=me" className={buttonClass("secondary")}>
            All my leads
          </Link>
        }
      />

      <Flash searchParams={searchParams} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Follow-ups due" value={due.length} note="Today or earlier" href="/?who=followups&status=all" />
        <Stat label="My open leads" value={open.length} note="New, contacted or replied" href="/?who=me" />
        <Stat label="Captured this week" value={captured} note="With your extension" />
        <Stat label="Hot among mine" value={open.filter((l) => l.score >= 70).length} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card padded={false}>
          <div className="p-5 sm:p-6">
            <CardHeader title="Follow up today" description="Leads you planned to contact today or earlier." />
          </div>
          {due.length ? (
            <ul className="divide-y divide-border border-t border-border">
              {due.map((l) => (
                <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <Link href={`/leads/${l.id}`} className="font-semibold hover:text-primary hover:underline">
                      {l.author || "Unknown"}
                    </Link>
                    <p className="line-clamp-1 text-[14px] text-muted-foreground">{l.reason}</p>
                    <div className="mt-1 text-[14px]">
                      <ContactCell emails={l.emails} phones={l.phones} workEmail={l.work_email} workStatus={l.work_email_status} workConfidence={l.work_email_confidence} />
                    </div>
                  </div>
                  <p className={`text-[13px] font-semibold ${l.follow_up_at! < today ? "text-danger" : "text-foreground"}`}>
                    {l.follow_up_at! < today ? "Overdue" : "Today"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <CardEmpty title="Nothing due" description="Set a follow up date on a lead and it shows here on that day." />
          )}
        </Card>

        <Card padded={false}>
          <div className="p-5 sm:p-6">
            <CardHeader title="My open leads" description="Best first." />
          </div>
          {open.length ? (
            <ul className="divide-y divide-border border-t border-border">
              {open.slice(0, 12).map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <Link href={`/leads/${l.id}`} className="font-semibold hover:text-primary hover:underline">
                      {l.author || "Unknown"}
                    </Link>
                    <p className="line-clamp-1 text-[14px] text-muted-foreground">{l.reason}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ScoreBadge score={l.score} />
                    <span className="text-[13px] text-muted-foreground">{STATUS_WORDS[l.status]}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <CardEmpty title="No open leads" description="Leads given to you show up here." />
          )}
        </Card>
      </div>

      {me ? (
        <Card className="mt-6">
          <CardHeader
            title="My searches"
            description="Your own phrases and LinkedIn profiles to watch, checked by your extension on top of the team's list. Leads it finds are saved under your name."
          />
          <form action={saveMySearches} className="space-y-4">
            <input type="hidden" name="back" value="/me" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Field label="My search phrases" htmlFor="my-searches" hint="One per line, for example: need a shopify developer">
                <Textarea id="my-searches" name="searches" defaultValue={me.searches} className="min-h-40" />
              </Field>
              <Field label="LinkedIn profiles I watch" htmlFor="my-watched" hint="One profile link per line, for example a founder who often posts projects.">
                <Textarea id="my-watched" name="watched_profiles" defaultValue={me.watched_profiles} className="min-h-40" placeholder="https://www.linkedin.com/in/someone/" />
              </Field>
            </div>
            <SubmitButton>Save my searches</SubmitButton>
          </form>
        </Card>
      ) : null}

      {all ? (
        <div className="mt-6">
          <h2 className="mb-3 text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            Team this week
          </h2>
          {board.length ? (
            <Table>
              <THead>
                <tr>
                  <Th>Person</Th>
                  <Th>Job</Th>
                  <Th align="right">Captured</Th>
                  <Th align="right">Given to them</Th>
                  <Th align="right">Contacted</Th>
                  <Th align="right">Won</Th>
                  <Th>Last active</Th>
                </tr>
              </THead>
              <tbody>
                {board.map((r) => (
                  <Tr key={r.id}>
                    <Td>
                      <Link href={`/activity?who=${r.id}`} className="font-semibold hover:text-primary hover:underline">
                        {r.name || r.email}
                      </Link>
                    </Td>
                    <Td>{JOB_WORDS[r.job]}</Td>
                    <Td align="right">{r.captured}</Td>
                    <Td align="right">{r.assigned}</Td>
                    <Td align="right">{r.contacted}</Td>
                    <Td align="right">{r.won}</Td>
                    <Td className="text-[14px]">{r.last ? timeAgo(r.last) : "Not yet"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Card>
              <CardEmpty title="No team members yet" description="Invite people on the Team page." />
            </Card>
          )}
        </div>
      ) : null}
    </>
  );
}

/** Per person, this week: leads captured, given to them, contacted and won. */
async function scoreboard(since: string) {
  const [people, leads, last] = await Promise.all([
    sb().from("members").select("id, name, email, job").neq("status", "disabled").then((r) => must(r) as Score[]),
    sb().from("leads").select("captured_by, assigned_to, assigned_at, contacted_at, won_at, captured_at").or(`captured_at.gte.${since},assigned_at.gte.${since},contacted_at.gte.${since},won_at.gte.${since}`).then(
      (r) => must(r) as Pick<Lead, "captured_by" | "assigned_to" | "assigned_at" | "contacted_at" | "won_at" | "captured_at">[],
    ),
    sb().from("activity").select("member_id, at").gte("at", since).order("at", { ascending: false }).limit(2000).then((r) => must(r) as { member_id: string | null; at: string }[]),
  ]);
  const lastSeen = new Map<string, string>();
  for (const a of last) if (a.member_id && !lastSeen.has(a.member_id)) lastSeen.set(a.member_id, a.at);
  return people
    .map((p) => ({
      ...p,
      captured: leads.filter((l) => l.captured_by === p.id && l.captured_at >= since).length,
      assigned: leads.filter((l) => l.assigned_to === p.id && (l.assigned_at ?? "") >= since).length,
      contacted: leads.filter((l) => l.assigned_to === p.id && (l.contacted_at ?? "") >= since).length,
      won: leads.filter((l) => l.assigned_to === p.id && (l.won_at ?? "") >= since).length,
      last: lastSeen.get(p.id) ?? null,
    }))
    .sort((a, b) => b.won - a.won || b.contacted - a.contacted || b.captured - a.captured);
}
