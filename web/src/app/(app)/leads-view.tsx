import Link from "next/link";
import { addToLeads, checkNow, deleteLeads } from "@/app/actions";
import { StatusPicker } from "@/components/status-picker";
import { MobileFold } from "@/components/ui/fold";
import { ContactCell, SOURCES, ScoreBadge } from "@/components/leads";
import { timeAgo } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Input, Select } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, Stat, Tabs } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { getSetting, hoursAgo, must, sb, type Lead } from "@/lib/db";
import { currentMember } from "@/lib/session";
import { myLeadsFilter, ownedByFilter, seesAll } from "@/lib/access";

type SP = { [key: string]: string | string[] | undefined };

const STATUS_TABS = [
  { key: "new", label: "Not contacted yet" },
  { key: "contacted", label: "Contacted" },
  { key: "interested", label: "Interested" },
  { key: "proposal", label: "Proposal sent" },
  { key: "contract", label: "Contract signed" },
  { key: "paid", label: "Payment received" },
  { key: "lost", label: "Lost" },
  { key: "all", label: "All" },
];

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

/**
 * Two lists from the same table:
 * Leads, the ones your team chose, and Daily finds, everything collected automatically to review.
 */
export async function LeadsView({ searchParams, mode }: { searchParams: Promise<SP>; mode: "leads" | "finds" }) {
  const sp = await searchParams;
  const finds = mode === "finds";
  const base = finds ? "/finds" : "/";
  const status = finds ? "all" : str(sp.status) || "all";
  const source = str(sp.source);
  const q = str(sp.q).trim();
  // Cold finds are hidden unless "Any score" is picked. Leads are picked by people, so score does not filter them.
  const min = finds ? (sp.min === undefined ? 40 : Number(str(sp.min)) || 0) : 0;
  const matchesOnly = finds && str(sp.matches) === "1";
  const contact = str(sp.contact) === "1";
  const sort = str(sp.sort) === "newest" ? "newest" : "best";
  const who = str(sp.who);
  const me = await currentMember();
  const all = seesAll(me);
  const todayDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  let query = sb().from("leads").select("*").eq("is_lead", !finds).gte("score", min);
  // Members only ever see leads assigned to them or captured by them.
  if (!all && me) query = query.or(myLeadsFilter(me));
  if (status !== "all") query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (who === "me" && me) query = query.eq("assigned_to", me.id);
  else if (who === "added" && me) query = query.eq("captured_by", me.id);
  else if (who === "followups") query = query.lte("follow_up_at", todayDate).not("status", "in", "(paid,lost)");
  else if (who === "none" && all) query = query.is("assigned_to", null);
  else if (/^[0-9a-f-]{36}$/.test(who) && all) query = query.or(ownedByFilter(who));
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

  type Stats = { today: number; hot: number; with_contact: number; due: number; total: number; by_status: Record<string, number> };
  const [leads, stats, people] = await Promise.all([
    query.limit(300).then((r) => must(r) as Lead[]),
    getSetting("alert_score").then(async (alert): Promise<Stats> => {
      // Numbers for this list only, with the same score filter, so they match what is shown. A member's numbers count only their own.
      let statsQuery = sb().from("leads").select("status, score, captured_at, emails, phones, work_email, follow_up_at").eq("is_lead", !finds).gte("score", min).limit(20000);
      if (!all && me) statsQuery = statsQuery.or(myLeadsFilter(me));
      const mine = must(await statsQuery) as Pick<
        Lead,
        "status" | "score" | "captured_at" | "emails" | "phones" | "work_email" | "follow_up_at"
      >[];
      const since = hoursAgo(24);
      const by_status: Record<string, number> = {};
      for (const l of mine) by_status[l.status] = (by_status[l.status] ?? 0) + 1;
      return {
        today: mine.filter((l) => l.captured_at >= since).length,
        hot: mine.filter((l) => l.captured_at >= since && l.score >= (Number(alert) || 70)).length,
        with_contact: mine.filter((l) => l.emails || l.phones || l.work_email).length,
        due: mine.filter((l) => l.follow_up_at && l.follow_up_at <= todayDate && l.status !== "paid" && l.status !== "lost").length,
        total: mine.length,
        by_status,
      };
    }),
    // Names only, so everyone can see who owns a lead.
    sb().from("members").select("id, name, email").neq("status", "disabled").order("name").then((r) => must(r) as { id: string; name: string | null; email: string }[]),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name || p.email.split("@")[0]]));
  if (me) nameOf.set(me.id, "You");
  const counts = stats.by_status;
  const { total, today, hot, due, with_contact: withContact } = stats;

  const here = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const all = { status, source, q, min: String(min), contact: contact ? "1" : "", matches: matchesOnly ? "1" : "", sort: sort === "newest" ? "newest" : "", who, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const backTo = here({});

  return (
    <>
      <PageHeader
        title={finds ? "Daily finds" : "Leads"}
        description={
          finds
            ? "Posts from people asking for a developer or agency, collected by the server and the Claude routine. Add the good ones to Leads."
            : all
              ? "Every lead your team is working. Pick a person to see only theirs."
              : "Leads you added and leads given to you. Update the status as you go."
        }
        actions={
          <>
            {finds ? (
              <form action={checkNow}>
                <input type="hidden" name="back" value={backTo} />
                <SubmitButton pendingText="Checking...">Check now</SubmitButton>
              </form>
            ) : (
              <Link href="/leads/new" className={buttonClass("primary")}>
                New lead
              </Link>
            )}
            {all ? (
              <a href="/api/export" className={buttonClass("secondary")}>
                Download CSV
              </a>
            ) : null}
          </>
        }
      />
      <Flash searchParams={sp} />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3 lg:grid-cols-4">
        <Stat label="Last 24 hours" value={today} note={finds ? "New finds" : "Leads added"} />
        {finds ? (
          <Stat label="Hot today" value={hot} note="At or above your alert score" href={here({ min: "70", status: "all" })} />
        ) : (
          <Stat label="Follow ups due" value={due} note="Today or overdue" href={here({ who: "followups", status: "all" })} />
        )}
        {finds ? (
          <Stat label="With contact" value={withContact} note="Email or phone found" href={here({ contact: "1" })} />
        ) : (
          <Stat label="Contract signed" value={(counts.contract ?? 0) + (counts.paid ?? 0)} note={`${counts.paid ?? 0} paid`} href={here({ status: "contract" })} />
        )}
        <Stat label={finds ? "All finds" : "All leads"} value={total} note={finds ? "Collected so far" : `${counts.lost ?? 0} lost`} href={here({ status: "all" })} />
      </div>

      {finds ? null : (
      <Tabs
        active={status}
        label="Lead status"
        tabs={STATUS_TABS.map((t) => ({ ...t, href: here({ status: t.key }), count: t.key === "all" ? total : (counts[t.key] ?? 0) }))}
      />
      )}

      <MobileFold label="Search and filter" active={Boolean(q || source || who || contact || matchesOnly)}>
      <form className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_150px_140px_150px_140px_auto_auto_auto]" action={base}>
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
        {finds ? (
          <>
            <label className="sr-only" htmlFor="min">Score</label>
            <Select id="min" name="min" defaultValue={String(min)}>
              <option value="0">Any score</option>
              <option value="40">Hide cold</option>
              <option value="50">Warm and hot</option>
              <option value="70">Hot only</option>
            </Select>
          </>
        ) : null}
        <label className="sr-only" htmlFor="who">Assigned to</label>
        <Select id="who" name="who" defaultValue={who}>
          <option value="">{all ? "Everyone" : "All my leads"}</option>
          {me ? <option value="me">Given to me</option> : null}
          {me ? <option value="added">Added by me</option> : null}
          <option value="followups">Follow ups due</option>
          {all ? <option value="none">Not assigned</option> : null}
          {all
            ? people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email}
                </option>
              ))
            : null}
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
        {finds ? (
          <label className="flex h-12 items-center gap-2 rounded-xl border border-input bg-background px-3 text-[15px] whitespace-nowrap">
            <input type="checkbox" name="matches" value="1" defaultChecked={matchesOnly} className="size-5 accent-primary" />
            Matches my searches
          </label>
        ) : null}
        <button className={buttonClass("secondary", "md", "h-12")}>Filter</button>
      </form>
      </MobileFold>

      {leads.length === 0 ? (
        <EmptyState
          title={finds ? "No daily finds here" : "No leads here yet"}
          description={finds ? "The server and the Claude routine add posts here as they find clients." : "Add a lead from a call, an email or LinkedIn, or change the filters above."}
          action={
            <Link href={finds ? "/search" : "/leads/new"} className={buttonClass("primary")}>
              {finds ? "Open search" : "New lead"}
            </Link>
          }
        />
      ) : (
        <>
          {/* The checkboxes in the table belong to this form, so ticked leads can be deleted together. */}
          <form id="bulk" action={deleteLeads} className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <input type="hidden" name="back" value={backTo} />
            <p className="text-sm text-muted-foreground">
              {leads.length} {finds ? "find" : "lead"}
              {leads.length === 1 ? "" : "s"}. Tick to act on several at once.
            </p>
            <div className="flex flex-wrap gap-2">
              {finds ? (
                <button formAction={addToLeads} className={buttonClass("primary", "sm")}>
                  Add selected to leads
                </button>
              ) : null}
              <SubmitButton variant="danger" size="sm" pendingText="Deleting..." confirm="Delete the ticked ones for good?">
                Delete selected
              </SubmitButton>
            </div>
          </form>
          {/* Phones: one card per lead, the actions a thumb needs. */}
          <ul className="space-y-3 md:hidden">
            {leads.map((l) => {
              const phone = l.phones.split(",")[0]?.trim();
              const email = (l.emails.split(",")[0]?.trim() || l.work_email) ?? "";
              const owner = l.assigned_to ?? l.captured_by;
              const due = l.follow_up_at && l.follow_up_at <= todayDate;
              return (
                <li key={l.id} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-start gap-3">
                    <label className="-m-2 flex size-11 shrink-0 items-center justify-center">
                      <span className="sr-only">Select {l.author}</span>
                      <input type="checkbox" name="ids" value={l.id} form="bulk" className="size-5 accent-primary" />
                    </label>
                    <Link href={`/leads/${l.id}`} className="min-w-0 flex-1 active:opacity-70">
                      <p className="truncate text-[17px] font-semibold">{l.author || "Unknown"}</p>
                      {l.headline ? <p className="truncate text-[13px] text-muted-foreground">{l.headline}</p> : null}
                      <p className="mt-1.5 line-clamp-2 text-[14px] leading-snug">{l.reason || l.text}</p>
                    </Link>
                    {finds ? <ScoreBadge score={l.score} /> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-8 text-[13px] text-muted-foreground">
                    <span>{owner ? (nameOf.get(owner) ?? "Former member") : "Nobody"}</span>
                    <span>{timeAgo(l.captured_at)}</span>
                    {l.budget ? <span>{l.budget}</span> : null}
                    {l.follow_up_at ? (
                      <span className={due ? "font-semibold text-danger" : ""}>
                        Follow up {new Date(l.follow_up_at + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 pl-8">
                    {finds ? (
                      <form action={addToLeads}>
                        <input type="hidden" name="ids" value={l.id} />
                        <input type="hidden" name="back" value={backTo} />
                        <SubmitButton size="sm" pendingText="Adding...">
                          Add to leads
                        </SubmitButton>
                      </form>
                    ) : (
                      <StatusPicker id={l.id} status={l.status} label={`Status for ${l.author ?? "lead"}`} wide idPrefix="m-" />
                    )}
                  </div>
                  {phone || email || l.author_url ? (
                    <div className="mt-1 grid auto-cols-fr grid-flow-col gap-2 pl-8">
                      {phone ? (
                        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={buttonClass("secondary", "sm", "w-full")}>
                          Call
                        </a>
                      ) : null}
                      {phone ? (
                        <a href={`https://wa.me/${phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm", "w-full")}>
                          WhatsApp
                        </a>
                      ) : null}
                      {email ? (
                        <a href={`mailto:${email}`} className={buttonClass("secondary", "sm", "w-full")}>
                          Email
                        </a>
                      ) : null}
                      {l.author_url ? (
                        <a href={l.author_url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm", "w-full")}>
                          Profile
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
          <Table>
            <THead>
              <tr>
                <Th className="w-10">
                  <span className="sr-only">Select</span>
                </Th>
                {finds ? <Th>Score</Th> : null}
                <Th>Person</Th>
                <Th>What they need</Th>
                <Th>Contact</Th>
                <Th>{finds ? "Found" : "Added"}</Th>
                <Th>Owner</Th>
                <Th>{finds ? "Action" : "Status"}</Th>
              </tr>
            </THead>
            <tbody>
              {leads.map((l) => (
                <Tr key={l.id}>
                  <Td className="align-top">
                    <label className="flex size-11 items-center justify-center">
                      <span className="sr-only">Select {l.author}</span>
                      <input type="checkbox" name="ids" value={l.id} form="bulk" className="size-5 accent-primary" />
                    </label>
                  </Td>
                  {finds ? (
                    <Td className="align-top">
                      <div className="flex flex-col items-start gap-1">
                        <ScoreBadge score={l.score} />
                        {l.urgency === "urgent" ? <Badge tone="red">Urgent</Badge> : l.urgency === "soon" ? <Badge tone="amber">Soon</Badge> : null}
                      </div>
                    </Td>
                  ) : null}
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
                    {(l.assigned_to ?? l.captured_by) ? (nameOf.get((l.assigned_to ?? l.captured_by)!) ?? "Former member") : <span className="text-muted-foreground">Nobody</span>}
                    {l.follow_up_at ? (
                      <p className={`text-[13px] ${l.follow_up_at <= todayDate ? "font-semibold text-danger" : "text-muted-foreground"}`}>
                        Follow up {new Date(l.follow_up_at + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="align-top">
                    {finds ? (
                      <form action={addToLeads}>
                        <input type="hidden" name="ids" value={l.id} />
                        <input type="hidden" name="back" value={backTo} />
                        <SubmitButton size="sm" pendingText="Adding...">
                          Add to leads
                        </SubmitButton>
                      </form>
                    ) : (
                    <StatusPicker id={l.id} status={l.status} label={`Status for ${l.author ?? "lead"}`} />
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          </div>
        </>
      )}
    </>
  );
}
