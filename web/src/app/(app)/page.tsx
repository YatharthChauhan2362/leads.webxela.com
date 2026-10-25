import Link from "next/link";
import { checkNow, setStatus } from "@/app/actions";
import { ContactCell, SOURCES, STATUS_WORDS, ScoreBadge } from "@/components/leads";
import { timeAgo } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Input, Select } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, Stat, Tabs } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getSetting, hoursAgo, must, sb, type Lead } from "@/lib/db";
import { currentMember } from "@/lib/session";
import { myLeadsFilter, seesAll } from "@/lib/access";

type SP = { [key: string]: string | string[] | undefined };

const STATUS_TABS = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "all", label: "All" },
];

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function Inbox({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = str(sp.status) || "new";
  const source = str(sp.source);
  const q = str(sp.q).trim();
  // Cold posts are hidden unless "Any score" is picked.
  const min = sp.min === undefined ? 40 : Number(str(sp.min)) || 0;
  const matchesOnly = str(sp.matches) === "1";
  const contact = str(sp.contact) === "1";
  const sort = str(sp.sort) === "newest" ? "newest" : "best";
  const who = str(sp.who);
  const me = await currentMember();
  const all = seesAll(me);
  const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  let query = sb().from("leads").select("*").gte("score", min);
  // Members only ever see leads assigned to them or captured by them.
  if (!all && me) query = query.or(myLeadsFilter(me));
  if (status !== "all") query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (who === "me" && me) query = query.eq("assigned_to", me.id);
  else if (who === "followups" && me) query = query.eq("assigned_to", me.id).lte("follow_up_at", todayDate);
  else if (who === "none" && all) query = query.is("assigned_to", null);
  else if (/^[0-9a-f-]{36}$/.test(who)) query = query.eq("assigned_to", who);
  if (contact) query = query.or("emails.neq.,phones.neq.,work_email.not.is.null");
  if (matchesOnly) query = query.not("matched_search", "is", null);
  if (q) {
    // Characters that mean something in PostgREST filters are dropped from the search text.
    const term = q.replace(/[,()*%\\"]/g, " ").trim();
    if (term) query = query.or(`text.ilike.*${term}*,author.ilike.*${term}*,headline.ilike.*${term}*,skills.ilike.*${term}*`);
  }
  query =
    sort === "newest"
      ? query.order("captured_at", { ascending: false })
      : query.order("captured_day", { ascending: false }).order("score", { ascending: false }).order("captured_at", { ascending: false });

  type Stats = { today: number; hot: number; with_contact: number; total: number; by_status: Record<string, number> };
  const [leads, stats, people] = await Promise.all([
    query.limit(300).then((r) => must(r) as Lead[]),
    getSetting("alert_score").then(async (alert): Promise<Stats> => {
      if (all) return must(await sb().rpc("lead_stats", { p_since: hoursAgo(24), p_alert: Number(alert) || 70 })) as Stats;
      // A member's numbers count only their own leads.
      const mine = must(await sb().from("leads").select("status, score, captured_at, emails, phones, work_email").or(myLeadsFilter(me!))) as Pick<
        Lead,
        "status" | "score" | "captured_at" | "emails" | "phones" | "work_email"
      >[];
      const since = hoursAgo(24);
      const by_status: Record<string, number> = {};
      for (const l of mine) by_status[l.status] = (by_status[l.status] ?? 0) + 1;
      return {
        today: mine.filter((l) => l.captured_at >= since).length,
        hot: mine.filter((l) => l.captured_at >= since && l.score >= (Number(alert) || 70)).length,
        with_contact: mine.filter((l) => l.emails || l.phones || l.work_email).length,
        total: mine.length,
        by_status,
      };
    }),
    all
      ? sb().from("members").select("id, name, email").neq("status", "disabled").order("name").then((r) => must(r) as { id: string; name: string | null; email: string }[])
      : Promise.resolve([] as { id: string; name: string | null; email: string }[]),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name || p.email.split("@")[0]]));
  if (me) nameOf.set(me.id, "You");
  const counts = stats.by_status;
  const { total, today, hot, with_contact: withContact } = stats;

  const here = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const all = { status, source, q, min: String(min), contact: contact ? "1" : "", matches: matchesOnly ? "1" : "", sort: sort === "newest" ? "newest" : "", who, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const backTo = here({});

  return (
    <>
      <PageHeader
        title="Leads"
        description="Posts that match your searches or score warm, from LinkedIn, Reddit and Hacker News. Hot ones sit at the top. Press a name to see the full post and reply."
        actions={
          <>
            <form action={checkNow}>
              <input type="hidden" name="back" value={backTo} />
              <SubmitButton pendingText="Checking...">Check now</SubmitButton>
            </form>
            {all ? (
              <a href="/api/export" className={buttonClass("secondary")}>
                Download CSV
              </a>
            ) : null}
          </>
        }
      />
      <Flash searchParams={sp} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Last 24 hours" value={today} note="Leads saved" />
        <Stat label="Hot today" value={hot} note="At or above your alert score" href={here({ min: "70", status: "all" })} />
        <Stat label="With contact" value={withContact} note="Email or phone found" href={here({ contact: "1" })} />
        <Stat label="All leads" value={total} note={`${counts.won ?? 0} won so far`} href={here({ status: "all" })} />
      </div>

      <Tabs
        active={status}
        label="Lead status"
        tabs={STATUS_TABS.map((t) => ({ ...t, href: here({ status: t.key }), count: t.key === "all" ? total : (counts[t.key] ?? 0) }))}
      />

      <form className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_150px_140px_150px_140px_auto_auto_auto]" action="/">
        <input type="hidden" name="status" value={status} />
        <label className="sr-only" htmlFor="q">Search</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Search posts, names, skills" />
        <label className="sr-only" htmlFor="source">Source</label>
        <Select id="source" name="source" defaultValue={source}>
          <option value="">All sources</option>
          {Object.entries(SOURCES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="min">Score</label>
        <Select id="min" name="min" defaultValue={String(min)}>
          <option value="0">Any score</option>
          <option value="40">Hide cold</option>
          <option value="50">Warm and hot</option>
          <option value="70">Hot only</option>
        </Select>
        <label className="sr-only" htmlFor="who">Assigned to</label>
        <Select id="who" name="who" defaultValue={who}>
          <option value="">{all ? "Anyone" : "All my leads"}</option>
          {me ? <option value="me">Assigned to me</option> : null}
          {me ? <option value="followups">Follow-ups due</option> : null}
          {all ? <option value="none">Not assigned</option> : null}
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || p.email}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="sort">Sort</label>
        <Select id="sort" name="sort" defaultValue={sort}>
          <option value="best">Best first</option>
          <option value="newest">Newest first</option>
        </Select>
        <label className="flex h-12 items-center gap-2 rounded-xl border border-input bg-background px-3 text-[15px] whitespace-nowrap">
          <input type="checkbox" name="contact" value="1" defaultChecked={contact} className="size-5 accent-primary" />
          Has contact
        </label>
        <label className="flex h-12 items-center gap-2 rounded-xl border border-input bg-background px-3 text-[15px] whitespace-nowrap">
          <input type="checkbox" name="matches" value="1" defaultChecked={matchesOnly} className="size-5 accent-primary" />
          Matches my searches
        </label>
        <button className={buttonClass("secondary", "md", "h-12")}>Filter</button>
      </form>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads here yet"
          description="Browse LinkedIn with the extension on, or press Check now to pull Reddit and Hacker News."
          action={
            <Link href="/extension" className={buttonClass("primary")}>
              Set up the extension
            </Link>
          }
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
            Showing {leads.length} lead{leads.length === 1 ? "" : "s"}
          </p>
          <Table>
            <THead>
              <tr>
                <Th>Score</Th>
                <Th>Person</Th>
                <Th>What they need</Th>
                <Th>Contact</Th>
                <Th>Found</Th>
                <Th>Assigned</Th>
                <Th>Status</Th>
              </tr>
            </THead>
            <tbody>
              {leads.map((l) => (
                <Tr key={l.id}>
                  <Td className="align-top">
                    <div className="flex flex-col items-start gap-1">
                      <ScoreBadge score={l.score} />
                      {l.urgency === "urgent" ? <Badge tone="red">Urgent</Badge> : l.urgency === "soon" ? <Badge tone="amber">Soon</Badge> : null}
                    </div>
                  </Td>
                  <Td className="min-w-[200px] align-top">
                    <Link href={`/leads/${l.id}`} className="font-semibold hover:text-primary hover:underline">
                      {l.author || "Unknown"}
                    </Link>
                    {l.headline ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{l.headline}</p> : null}
                  </Td>
                  <Td className="min-w-[280px] max-w-[420px] align-top">
                    <Link href={`/leads/${l.id}`} className="block hover:text-primary">
                      {l.reason ? <p className="font-medium">{l.reason}</p> : null}
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{l.text}</p>
                    </Link>
                    {l.matched_search ? (
                      <p className="mt-1">
                        <Badge tone="blue">Matches: {l.matched_search}</Badge>
                      </p>
                    ) : null}
                    {l.budget || l.skills ? <p className="mt-1 text-[13px]">{[l.budget, l.skills].filter(Boolean).join(" · ")}</p> : null}
                  </Td>
                  <Td className="min-w-[220px] align-top text-[14px]">
                    <ContactCell emails={l.emails} phones={l.phones} workEmail={l.work_email} workStatus={l.work_email_status} workConfidence={l.work_email_confidence} />
                  </Td>
                  <Td className="align-top text-[14px] whitespace-nowrap">
                    <p>{timeAgo(l.captured_at)}</p>
                    <p className="text-[13px] text-muted-foreground">{SOURCES[l.source] ?? l.source}</p>
                    {l.post_url ? (
                      <a href={l.post_url} target="_blank" rel="noreferrer" className="text-[13px] text-primary hover:underline">
                        Open post
                      </a>
                    ) : null}
                  </Td>
                  <Td className="align-top text-[14px] whitespace-nowrap">
                    {l.assigned_to ? (nameOf.get(l.assigned_to) ?? (all ? "Former member" : "A teammate")) : <span className="text-muted-foreground">Nobody</span>}
                    {l.follow_up_at ? (
                      <p className={`text-[13px] ${l.follow_up_at <= todayDate ? "font-semibold text-danger" : "text-muted-foreground"}`}>
                        Follow up {new Date(l.follow_up_at + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="align-top">
                    <form action={setStatus} className="flex flex-col gap-1.5">
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="back" value={backTo} />
                      <label className="sr-only" htmlFor={`status-${l.id}`}>
                        Status for {l.author}
                      </label>
                      <select id={`status-${l.id}`} name="status" defaultValue={l.status} className="h-11 rounded-xl border border-input bg-background px-2 text-[14px]">
                        {Object.entries(STATUS_WORDS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="secondary" size="sm" pendingText="Saving...">
                        Save
                      </SubmitButton>
                    </form>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </>
  );
}
