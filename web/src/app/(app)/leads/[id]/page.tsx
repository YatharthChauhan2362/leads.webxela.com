import { notFound } from "next/navigation";
import { assignLead, deleteLead, draftReply, handToBde, saveNotes, setFollowUp, setStatus } from "@/app/actions";
import { requireLeadAccess, seesAll } from "@/lib/access";
import { currentMember } from "@/lib/session";
import { ContactCell, SOURCES, STATUS_WORDS, ScoreBadge, list } from "@/components/leads";
import { timeAgo } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Textarea } from "@/components/ui/form";
import { Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { must, sb, type Lead, type Profile } from "@/lib/db";

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const me = await currentMember();
  await requireLeadAccess(me, id);
  const all = seesAll(me);
  const lead = must(await sb().from("leads").select("*").eq("id", id).maybeSingle()) as Lead | null;
  if (!lead) notFound();
  const person = lead.author_url ? (must(await sb().from("profiles").select("*").eq("url", lead.author_url).maybeSingle()) as Profile | null) : null;
  const back = `/leads/${id}`;
  // Only admins see the team list. Members can take the lead themselves or give it to a BDE.
  const people = all ? (must(await sb().from("members").select("id, name, email, job").neq("status", "disabled").order("name")) as { id: string; name: string | null; email: string; job: string }[]) : [];

  return (
    <>
      <PageHeader
        title={lead.author || "Unknown"}
        description={lead.headline || SOURCES[lead.source] || lead.source}
        back={{ href: "/", label: "leads" }}
        actions={
          <>
            {lead.post_url ? (
              <a href={lead.post_url} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
                Open post
              </a>
            ) : null}
            {lead.author_url ? (
              <a href={lead.author_url} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                Open profile
              </a>
            ) : null}
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <ScoreBadge score={lead.score} />
              {lead.urgency === "urgent" ? <Badge tone="red">Urgent</Badge> : lead.urgency === "soon" ? <Badge tone="amber">Soon</Badge> : null}
              {lead.intent && lead.intent !== "project" ? <Badge>{lead.intent === "job" ? "Job post" : lead.intent === "selling" ? "Selling" : "Unclear"}</Badge> : null}
              <Badge>{SOURCES[lead.source] ?? lead.source}</Badge>
            </div>
            {lead.reason ? <p className="text-[16px] font-semibold">{lead.reason}</p> : null}
            <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line">{lead.text}</p>
          </Card>

          <Card>
            <CardHeader title="Reply" description="Write a first message, then copy it into LinkedIn or email." />
            {lead.reply ? <p className="mb-4 rounded-xl border border-border px-4 py-3 text-[15px] whitespace-pre-line select-all">{lead.reply}</p> : null}
            <form action={draftReply}>
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="back" value={back} />
              <SubmitButton variant={lead.reply ? "secondary" : "primary"} pendingText="Writing...">
                {lead.reply ? "Write again" : "Draft a reply"}
              </SubmitButton>
            </form>
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <div className="text-[15px]">
              <ContactCell emails={lead.emails} phones={lead.phones} workEmail={lead.work_email} workStatus={lead.work_email_status} workConfidence={lead.work_email_confidence} />
            </div>
            {lead.contact_note ? <p className="mt-2 text-[13px] text-muted-foreground">{lead.contact_note}</p> : null}
            {person?.email_alternatives ? (
              <p className="mt-2 text-[13px] text-muted-foreground">Other email options: {list(person.email_alternatives).join(", ")}</p>
            ) : null}
            <p className="mt-3 text-[13px] text-muted-foreground">Found means seen in public. Likely means the company pattern was learned from real emails. Guess means the most common pattern.</p>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <DescriptionList
              items={[
                { label: "Company", value: person?.company ?? "" },
                { label: "Location", value: person?.location ?? "" },
                { label: "Budget", value: lead.budget ?? "" },
                { label: "Skills", value: lead.skills ?? "" },
                { label: "Website", value: list(lead.websites)[0] ?? "" },
                { label: "Found", value: `${timeAgo(lead.captured_at)}${lead.posted_at ? `, posted ${/^\d{4}-/.test(lead.posted_at) ? timeAgo(lead.posted_at) : lead.posted_at}` : ""}` },
              ]}
            />
          </Card>

          <Card>
            <CardHeader title="Assigned to" description="Who is working this lead." />
            <p className="mb-3 text-[15px]">
              {lead.assigned_to ? (lead.assigned_to === me?.id ? "You" : (people.find((p) => p.id === lead.assigned_to)?.name ?? people.find((p) => p.id === lead.assigned_to)?.email ?? "A teammate")) : "Nobody yet"}
            </p>
            {all ? (
              <form action={assignLead} className="flex gap-2">
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="back" value={back} />
                <label className="sr-only" htmlFor="member">
                  Assigned to
                </label>
                <select id="member" name="member" defaultValue={lead.assigned_to ?? ""} className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px]">
                  <option value="">Nobody</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.email}
                      {p.job === "bde" ? " (BDE)" : p.job === "lead_generator" ? " (Lead generator)" : ""}
                    </option>
                  ))}
                </select>
                <SubmitButton pendingText="Saving...">Save</SubmitButton>
              </form>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={handToBde}>
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="back" value={back} />
                <SubmitButton variant="secondary" pendingText="Handing over...">
                  Give to a BDE
                </SubmitButton>
              </form>
              {me && lead.assigned_to !== me.id ? (
                <form action={assignLead}>
                  <input type="hidden" name="id" value={lead.id} />
                  <input type="hidden" name="back" value={back} />
                  <input type="hidden" name="member" value="me" />
                  <SubmitButton variant="secondary" pendingText="Saving...">
                    Take it myself
                  </SubmitButton>
                </form>
              ) : null}
            </div>
            <p className="mt-2 text-[13px] text-muted-foreground">Give to a BDE picks the BDE with the fewest open leads.</p>
          </Card>

          <Card>
            <CardHeader title="Follow up" description="The day to contact them next. It shows in Follow-ups due." />
            <form action={setFollowUp} className="flex gap-2">
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="back" value={back} />
              <label className="sr-only" htmlFor="follow_up_at">
                Follow up on
              </label>
              <input id="follow_up_at" name="follow_up_at" type="date" defaultValue={lead.follow_up_at ?? ""} className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px]" />
              <SubmitButton pendingText="Saving...">Save</SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="Status" />
            <form action={setStatus} className="flex gap-2">
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="back" value={back} />
              <label className="sr-only" htmlFor="status">
                Status
              </label>
              <select id="status" name="status" defaultValue={lead.status} className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px]">
                {Object.entries(STATUS_WORDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <SubmitButton pendingText="Saving...">Save</SubmitButton>
            </form>
            {all ? (
            <form action={deleteLead} className="mt-4 border-t border-border pt-4">
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="back" value="/" />
              <SubmitButton variant="danger" pendingText="Removing..." confirm="Remove this lead for good?">
                Remove lead
              </SubmitButton>
            </form>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
