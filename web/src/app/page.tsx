import Link from "next/link";
import { checkNow, deleteLead, draftReply, saveNotes, setStatus } from "./actions";
import { timeAgo } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, EmptyState, PageHeader, Stat, Tabs } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { getSetting, hoursAgo, must, sb, type Lead } from "@/lib/db";

type SP = { [key: string]: string | string[] | undefined };

const STATUS_TABS = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "all", label: "All" },
];

const SOURCES: Record<string, string> = { linkedin: "LinkedIn", reddit: "Reddit", hackernews: "Hacker News", manual: "Added by hand" };

function str(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function Inbox({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const status = str(sp.status) || "new";
  const source = str(sp.source);
  const q = str(sp.q).trim();
  const min = Number(str(sp.min)) || 0;
  const contact = str(sp.contact) === "1";

  let query = sb().from("leads").select("*").gte("score", min);
  if (status !== "all") query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (contact) query = query.or("emails.neq.,phones.neq.");
  if (q) {
    // Characters that mean something in PostgREST filters are dropped from the search text.
    const term = q.replace(/[,()*%\\"]/g, " ").trim();
    if (term) query = query.or(`text.ilike.*${term}*,author.ilike.*${term}*,headline.ilike.*${term}*`);
  }
  const [leads, stats] = await Promise.all([
    query
      .order("captured_day", { ascending: false })
      .order("score", { ascending: false })
      .order("captured_at", { ascending: false })
      .limit(200)
      .then((r) => must(r) as Lead[]),
    getSetting("alert_score").then(async (alert) =>
      must(await sb().rpc("lead_stats", { p_since: hoursAgo(24), p_alert: Number(alert) || 70 })) as {
        today: number;
        hot: number;
        with_contact: number;
        total: number;
        by_status: Record<string, number>;
      },
    ),
  ]);
  const counts = stats.by_status;
  const { total, today, hot, with_contact: withContact } = stats;

  const here = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const all = { status, source, q, min: min ? String(min) : "", contact: contact ? "1" : "", ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const backTo = here({});

  return (
    <>
      <PageHeader
        title="Lead inbox"
        description="People asking for a project to be built. New posts come in every 30 minutes and as you browse LinkedIn."
        actions={
          <>
            <form action={checkNow}>
              <input type="hidden" name="back" value={backTo} />
              <SubmitButton pendingText="Checking...">Check now</SubmitButton>
            </form>
            <a href="/api/export" className={buttonClass("secondary")}>
              Download CSV
            </a>
          </>
        }
      />
      <Flash searchParams={sp} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Last 24 hours" value={today} note="New leads found" />
        <Stat label="Hot today" value={hot} note="At or above your alert score" />
        <Stat label="With contact" value={withContact} note="Email or phone found" />
        <Stat label="All leads" value={total} note={`${counts.won ?? 0} won so far`} />
      </div>

      <Tabs
        active={status}
        label="Lead status"
        tabs={STATUS_TABS.map((t) => ({ ...t, href: here({ status: t.key }), count: t.key === "all" ? total : (counts[t.key] ?? 0) }))}
      />

      <form className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px_auto_auto]" action="/">
        <input type="hidden" name="status" value={status} />
        <label className="sr-only" htmlFor="q">Search</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Search posts, names, skills" />
        <label className="sr-only" htmlFor="source">Source</label>
        <Select id="source" name="source" defaultValue={source}>
          <option value="">All sources</option>
          {Object.entries(SOURCES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="min">Minimum score</label>
        <Select id="min" name="min" defaultValue={String(min || "")}>
          <option value="">Any score</option>
          <option value="50">50 and up</option>
          <option value="70">70 and up</option>
          <option value="85">85 and up</option>
        </Select>
        <label className="flex h-12 items-center gap-2 rounded-xl border border-input bg-background px-3 text-[15px]">
          <input type="checkbox" name="contact" value="1" defaultChecked={contact} className="size-5 accent-primary" />
          Has contact
        </label>
        <button className={buttonClass("secondary", "md", "h-12")}>Filter</button>
      </form>

      {leads.length === 0 ? (
        <EmptyState
          title="No leads here yet"
          description="Press Check now to pull Reddit and Hacker News, or install the Chrome extension and open LinkedIn."
          action={
            <Link href="/extension" className={buttonClass("primary")}>
              Set up the extension
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {leads.map((l) => (
            <li key={l.id}>
              <LeadCard lead={l} back={backTo} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function scoreTone(score: number) {
  return score >= 70 ? "green" : score >= 50 ? "amber" : "neutral";
}

function LeadCard({ lead: l, back }: { lead: Lead; back: string }) {
  const emails = l.emails ? l.emails.split(", ") : [];
  const phones = l.phones ? l.phones.split(", ") : [];
  return (
    <Card id={`lead-${l.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold break-words">
            {l.author_url ? (
              <a href={l.author_url} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">
                {l.author || "Unknown"}
              </a>
            ) : (
              l.author || "Unknown"
            )}
          </p>
          {l.headline ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{l.headline}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={scoreTone(l.score)}>Score {l.score}</Badge>
          {l.urgency === "urgent" ? <Badge tone="red">Urgent</Badge> : l.urgency === "soon" ? <Badge tone="amber">Soon</Badge> : null}
          {l.intent && l.intent !== "project" ? <Badge>{l.intent === "job" ? "Job post" : l.intent === "selling" ? "Selling" : "Unclear"}</Badge> : null}
          <Badge>{SOURCES[l.source] ?? l.source}</Badge>
        </div>
      </div>

      {l.reason ? <p className="mt-3 text-[15px] font-medium">{l.reason}</p> : null}

      <details className="group mt-3">
        <summary className="text-[15px] leading-relaxed whitespace-pre-line text-foreground">
          <span className="line-clamp-4 group-open:line-clamp-none">{l.text}</span>
          <span className="mt-1 inline-block text-sm font-medium text-primary group-open:hidden">Read full post</span>
        </summary>
      </details>

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-border pt-4 text-[15px] sm:grid-cols-2">
        <div>
          <dt className="text-[13px] text-muted-foreground">Email</dt>
          <dd className="break-words">
            {emails.length ? emails.map((e) => <a key={e} href={`mailto:${e}`} className="mr-3 text-primary hover:underline">{e}</a>) : <span className="text-muted-foreground">Not found yet</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-muted-foreground">Phone</dt>
          <dd className="break-words">
            {phones.length ? phones.map((p) => <a key={p} href={`tel:${p.replace(/[^\d+]/g, "")}`} className="mr-3 text-primary hover:underline">{p}</a>) : <span className="text-muted-foreground">Not found yet</span>}
          </dd>
        </div>
        {l.contact_note ? (
          <div>
            <dt className="text-[13px] text-muted-foreground">Contact found</dt>
            <dd>{l.contact_note}</dd>
          </div>
        ) : null}
        {l.budget || l.skills ? (
          <div>
            <dt className="text-[13px] text-muted-foreground">Budget and skills</dt>
            <dd>{[l.budget, l.skills].filter(Boolean).join(" · ")}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[13px] text-muted-foreground">Found</dt>
          <dd>
            {timeAgo(l.captured_at)}
            {l.posted_at ? <span className="text-muted-foreground"> · posted {/^\d{4}-/.test(l.posted_at) ? timeAgo(l.posted_at) : l.posted_at}</span> : null}
          </dd>
        </div>
      </dl>

      {l.reply ? (
        <div className="mt-4 rounded-xl border border-border px-4 py-3">
          <p className="text-[13px] font-semibold text-primary">Reply draft</p>
          <p className="mt-1 text-[15px] whitespace-pre-line select-all">{l.reply}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {l.post_url ? (
          <a href={l.post_url} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
            Open post
          </a>
        ) : null}
        <form action={draftReply}>
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="back" value={`${back}#lead-${l.id}`} />
          <SubmitButton variant="secondary" pendingText="Writing...">{l.reply ? "Write again" : "Draft a reply"}</SubmitButton>
        </form>
        <form action={setStatus} className="flex gap-2">
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="back" value={back} />
          <label className="sr-only" htmlFor={`status-${l.id}`}>Status</label>
          <select id={`status-${l.id}`} name="status" defaultValue={l.status} className="h-11 rounded-xl border border-input bg-background px-3 text-[15px]">
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="replied">Replied</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
          <SubmitButton variant="secondary" pendingText="Moving...">Move</SubmitButton>
        </form>
        <form action={deleteLead} className="ml-auto">
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="back" value={back} />
          <SubmitButton variant="danger" pendingText="Removing...">Remove</SubmitButton>
        </form>
      </div>

      <details className="mt-3">
        <summary className="inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground hover:text-primary">
          {l.notes ? "Notes" : "Add notes"}
        </summary>
        <form action={saveNotes} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={l.id} />
          <input type="hidden" name="back" value={back} />
          <label className="sr-only" htmlFor={`notes-${l.id}`}>Notes</label>
          <Textarea id={`notes-${l.id}`} name="notes" defaultValue={l.notes} />
          <SubmitButton variant="secondary">Save notes</SubmitButton>
        </form>
      </details>
    </Card>
  );
}
