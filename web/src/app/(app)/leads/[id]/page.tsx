import { notFound } from "next/navigation";
import { addToLeads, assignLead, deleteLeads, saveNotes, setDealValue, setFollowUp, updateLead } from "@/app/actions";
import { CURRENCIES, ContactCell, SOURCES, STATUS_WORDS, ScoreBadge, dealWords, money } from "@/components/leads";
import { timeAgo } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Field, FormGrid, Input, Textarea } from "@/components/ui/form";
import { Badge, Callout, Card, CardHeader, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { LiveRefresh, StatusPicker } from "@/components/status-picker";
import { requireLeadAccess, seesAll } from "@/lib/access";
import { findDuplicates } from "@/lib/duplicates";
import { must, sb, type Lead } from "@/lib/db";
import { currentMember } from "@/lib/session";

type Event = { id: number; member_name: string | null; kind: string; from_value: string | null; to_value: string | null; at: string };

/** One line of history in plain words. */
function said(e: Event) {
  const word = (s: string | null) => (s ? (STATUS_WORDS[s] ?? s) : "");
  switch (e.kind) {
    case "created":
      return `added this lead${e.to_value ? ` (${SOURCES[e.to_value] ?? e.to_value})` : ""}`;
    case "status":
      if (e.to_value?.startsWith("lost:")) return `marked it Lost: ${e.to_value.slice(5)}`;
      return `moved it from ${word(e.from_value?.split(":")[0] ?? null)} to ${word(e.to_value)}`;
    case "deal":
      return e.to_value === "cleared" ? "cleared the deal value" : `set the deal value to ${dealWords(e.to_value)}`;
    case "duplicate":
      return `added it, but ${e.to_value} already had this person`;
    case "assigned":
      return e.to_value === "Nobody" ? "removed the owner" : `gave it to ${e.to_value}`;
    case "follow_up":
      return e.to_value === "cleared" ? "cleared the follow up date" : `set a follow up for ${new Date(`${e.to_value}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
    case "note":
      return "updated the notes";
    default:
      return "edited the details";
  }
}

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const me = await currentMember();
  await requireLeadAccess(me, id);
  const all = seesAll(me);
  const lead = must(await sb().from("leads").select("*").eq("id", id).maybeSingle()) as Lead | null;
  if (!lead) notFound();
  const [people, events, dups] = await Promise.all([
    // Everyone can hand a lead to a teammate, so everyone sees teammates' names. Only admins see emails elsewhere.
    sb().from("members").select("id, name, email").neq("status", "disabled").order("name").then((r) => must(r) as { id: string; name: string | null; email: string }[]),
    sb().from("lead_events").select("id, member_name, kind, from_value, to_value, at").eq("lead_id", id).order("at", { ascending: false }).limit(100).then((r) => must(r) as Event[]),
    lead.is_lead ? findDuplicates({ emails: lead.emails, authorUrl: lead.author_url, postUrl: lead.post_url, excludeId: lead.id }) : Promise.resolve([]),
  ]);
  const nameOf = (mid: string | null) => {
    const p = people.find((x) => x.id === mid);
    return p ? (p.id === me?.id ? "You" : p.name || p.email.split("@")[0]) : null;
  };
  const back = `/leads/${id}`;
  const select = "h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px]";

  return (
    <>
      <PageHeader
        title={lead.author || "Unknown"}
        description={lead.headline || SOURCES[lead.source] || lead.source}
        back={lead.is_lead ? { href: "/", label: "leads" } : { href: "/finds", label: "daily finds" }}
        actions={
          <>
            {!lead.is_lead ? (
              <form action={addToLeads}>
                <input type="hidden" name="ids" value={lead.id} />
                <input type="hidden" name="back" value={back} />
                <SubmitButton pendingText="Adding...">Add to leads</SubmitButton>
              </form>
            ) : null}
            {lead.author_url ? (
              <a href={lead.author_url} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Open profile
              </a>
            ) : null}
            {lead.post_url ? (
              <a href={lead.post_url} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Open post
              </a>
            ) : null}
          </>
        }
      />
      <Flash searchParams={searchParams} />
      <LiveRefresh />
      {dups.length ? (
        <Callout tone="amber" label="Someone else has this person too" className="mb-6">
          {dups.map((d) => `${d.owner} (${STATUS_WORDS[d.status] ?? d.status})`).join(", ")}. Agree who works it, then mark the other one Lost.
        </Callout>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Badge tone={lead.status === "paid" ? "green" : lead.status === "lost" ? "red" : "blue"}>{STATUS_WORDS[lead.status] ?? lead.status}</Badge>
              <ScoreBadge score={lead.score} />
              <Badge>{SOURCES[lead.source] ?? lead.source}</Badge>
              {lead.deal_value !== null ? <Badge tone="green">{money(Number(lead.deal_value), lead.deal_currency ?? "INR")}</Badge> : null}
            </div>
            {lead.status === "lost" && lead.lost_reason ? <p className="mb-3 text-[15px] text-danger">Lost: {lead.lost_reason}</p> : null}
            <p className="text-[15px] leading-relaxed whitespace-pre-line">{lead.text}</p>
            <div className="mt-4 border-t border-border pt-4 text-[15px]">
              <ContactCell emails={lead.emails} phones={lead.phones} workEmail={lead.work_email} workStatus={lead.work_email_status} workConfidence={lead.work_email_confidence} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <form action={saveNotes} className="space-y-3">
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="back" value={back} />
              <label className="sr-only" htmlFor="notes">
                Notes
              </label>
              <Textarea id="notes" name="notes" defaultValue={lead.notes} placeholder="Call notes, quote sent, next step..." />
              <SubmitButton variant="secondary">Save notes</SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="History" description="Who did what, newest first." />
            {events.length ? (
              <ul className="space-y-3">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
                    <p className="text-[15px]">
                      <span className="font-semibold">{e.member_name ?? "Someone"}</span> {said(e)}
                    </p>
                    <span className="text-[13px] text-muted-foreground">{timeAgo(e.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted-foreground">Nothing yet. Changes to status, owner, follow up and notes show here.</p>
            )}
          </Card>

          <Card>
            <details>
              <summary className="min-h-[32px] text-[17px] font-semibold">Edit details</summary>
              <form action={updateLead} className="mt-4 space-y-4">
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="back" value={back} />
                <FormGrid cols={2}>
                  <Field label="Name" htmlFor="e-author">
                    <Input id="e-author" name="author" defaultValue={lead.author ?? ""} required maxLength={200} />
                  </Field>
                  <Field label="Company and role" htmlFor="e-headline" optional>
                    <Input id="e-headline" name="headline" defaultValue={lead.headline ?? ""} maxLength={300} />
                  </Field>
                  <Field label="Email" htmlFor="e-emails" optional>
                    <Input id="e-emails" name="emails" defaultValue={lead.emails} maxLength={500} />
                  </Field>
                  <Field label="Phone" htmlFor="e-phones" optional>
                    <Input id="e-phones" name="phones" defaultValue={lead.phones} maxLength={200} />
                  </Field>
                  <Field label="LinkedIn profile" htmlFor="e-author-url" optional>
                    <Input id="e-author-url" name="author_url" type="url" defaultValue={lead.author_url ?? ""} maxLength={1000} />
                  </Field>
                  <Field label="Link to the post or email" htmlFor="e-post-url" optional>
                    <Input id="e-post-url" name="post_url" type="url" defaultValue={lead.post_url ?? ""} maxLength={1000} />
                  </Field>
                </FormGrid>
                <Field label="What they need" htmlFor="e-text">
                  <Textarea id="e-text" name="text" defaultValue={lead.text} required className="min-h-32" />
                </Field>
                <SubmitButton pendingText="Saving...">Save details</SubmitButton>
              </form>
            </details>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status" />
            <StatusPicker id={lead.id} status={lead.status} label="Status" wide />
            {lead.status === "lost" && lead.lost_reason ? <p className="mb-3 text-[14px] text-muted-foreground">Reason: {lead.lost_reason}</p> : null}
            <form action={setDealValue} className="space-y-2 border-t border-border pt-3">
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="back" value={back} />
              <Field label="Deal value" htmlFor="deal_value" optional hint="Pick the currency every time you set an amount.">
                <div className="space-y-2">
                  <label className="sr-only" htmlFor="deal_currency">
                    Currency
                  </label>
                  <select id="deal_currency" name="deal_currency" defaultValue={lead.deal_currency ?? ""} className={`${select} w-full`}>
                    <option value="">Pick a currency</option>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}, {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Input id="deal_value" name="deal_value" inputMode="decimal" defaultValue={lead.deal_value ?? ""} placeholder="50000" maxLength={16} />
                    <SubmitButton variant="secondary" pendingText="Saving...">Save</SubmitButton>
                  </div>
                </div>
              </Field>
            </form>
          </Card>

          <Card>
            <CardHeader title="Owner" description={lead.assigned_to ? `Now: ${nameOf(lead.assigned_to) ?? "a former member"}` : lead.captured_by ? `Not given to anyone, so it stays with ${nameOf(lead.captured_by) === "You" ? "you" : (nameOf(lead.captured_by) ?? "who added it")}` : "Nobody yet"} />
            <form action={assignLead} className="flex gap-2">
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="back" value={back} />
              <label className="sr-only" htmlFor="member">
                Owner
              </label>
              <select id="member" name="member" defaultValue={lead.assigned_to ?? ""} className={select}>
                <option value="">Nobody</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id === me?.id ? "Me" : p.name || p.email.split("@")[0]}
                  </option>
                ))}
              </select>
              <SubmitButton pendingText="Saving...">Save</SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="Follow up" />
            <form action={setFollowUp} className="flex gap-2">
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="back" value={back} />
              <label className="sr-only" htmlFor="follow_up_at">
                Follow up on
              </label>
              <input id="follow_up_at" name="follow_up_at" type="date" defaultValue={lead.follow_up_at ?? ""} className={select} />
              <SubmitButton pendingText="Saving...">Save</SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="About" />
            <dl className="space-y-2 text-[15px]">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Added by</dt>
                <dd>{nameOf(lead.captured_by) ?? "Automatic"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Added</dt>
                <dd>{timeAgo(lead.captured_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Source</dt>
                <dd>{SOURCES[lead.source] ?? lead.source}</dd>
              </div>
            </dl>
            {all || lead.captured_by === me?.id ? (
              <form action={deleteLeads} className="mt-4 border-t border-border pt-4">
                <input type="hidden" name="ids" value={lead.id} />
                <input type="hidden" name="back" value="/" />
                <SubmitButton variant="danger" pendingText="Removing..." confirm="Delete this lead for good?">
                  Delete lead
                </SubmitButton>
              </form>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
