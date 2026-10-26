import { deleteFeedback, sendFeedback, setFeedbackStatus } from "./actions";
import { timeAgo } from "@/components/shell/app-shell";
import { Flash } from "@/components/ui/flash";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Tabs } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { seesAll } from "@/lib/access";
import { must, sb } from "@/lib/db";
import { requireMember } from "@/lib/session";

type Row = { id: number; member_id: string | null; member_name: string | null; kind: string; title: string; details: string; page: string | null; status: string; admin_note: string | null; created_at: string };

const KINDS: Record<string, { label: string; tone: "red" | "blue" | "neutral" }> = {
  bug: { label: "Bug", tone: "red" },
  idea: { label: "Idea", tone: "blue" },
  other: { label: "Other", tone: "neutral" },
};
const STATUSES: Record<string, { label: string; tone: "amber" | "blue" | "green" | "neutral" }> = {
  open: { label: "Open", tone: "amber" },
  planned: { label: "Planned", tone: "blue" },
  done: { label: "Done", tone: "green" },
  wont: { label: "Not doing", tone: "neutral" },
};

/** Bugs and ideas from the team. Members see what they sent; admins see everything and set a status. */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMember();
  const all = seesAll(me);
  const show = typeof sp.show === "string" && sp.show in STATUSES ? sp.show : "all";
  let q = sb().from("feedback").select("*").order("created_at", { ascending: false }).limit(300);
  if (!all && me) q = q.eq("member_id", me.id);
  const rows = must(await q) as Row[];
  const list = show === "all" ? rows : rows.filter((r) => r.status === show);
  const select = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px]";

  return (
    <>
      <PageHeader title="Feedback" description="Found a bug or have an idea? Tell us here. You get a notification when an admin replies." />
      <Flash searchParams={sp} />

      <Card className="mb-6">
        <CardHeader title="Send feedback" />
        <form action={sendFeedback} className="space-y-4">
          <FormGrid cols={2}>
            <Field label="What is it" htmlFor="kind">
              <Select id="kind" name="kind" defaultValue="bug">
                <option value="bug">Something is broken</option>
                <option value="idea">An idea or a feature</option>
                <option value="other">Something else</option>
              </Select>
            </Field>
            <Field label="Which page" htmlFor="page" optional hint="For example Leads, or a lead's page.">
              <Input id="page" name="page" maxLength={500} placeholder="Leads" />
            </Field>
          </FormGrid>
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" required minLength={3} maxLength={200} placeholder="Status does not save on my phone" />
          </Field>
          <Field label="Details" htmlFor="details" optional hint="What you did, what you expected, what happened.">
            <Textarea id="details" name="details" maxLength={5000} className="min-h-28" />
          </Field>
          <SubmitButton pendingText="Sending...">Send</SubmitButton>
        </form>
      </Card>

      <Tabs
        active={show}
        label="Feedback status"
        tabs={[{ key: "all", label: "All" }, ...Object.entries(STATUSES).map(([key, v]) => ({ key, label: v.label }))].map((t) => ({
          ...t,
          href: t.key === "all" ? "/feedback" : `/feedback?show=${t.key}`,
          count: t.key === "all" ? rows.length : rows.filter((r) => r.status === t.key).length,
        }))}
      />

      {list.length === 0 ? (
        <EmptyState title="Nothing here yet" description={all ? "Reports from the team show up here." : "What you send shows up here with its status."} />
      ) : (
        <div className="space-y-4">
          {list.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={KINDS[r.kind]?.tone ?? "neutral"}>{KINDS[r.kind]?.label ?? r.kind}</Badge>
                    <Badge tone={STATUSES[r.status]?.tone ?? "neutral"}>{STATUSES[r.status]?.label ?? r.status}</Badge>
                  </div>
                  <p className="text-[17px] font-semibold">{r.title}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {r.member_id === me?.id ? "You" : (r.member_name ?? "Someone")}, {timeAgo(r.created_at)}
                    {r.page ? `, on ${r.page}` : ""}
                  </p>
                </div>
              </div>
              {r.details ? <p className="mt-3 text-[15px] whitespace-pre-line">{r.details}</p> : null}
              {r.admin_note && !all ? <p className="mt-3 rounded-xl bg-muted p-3 text-[15px]">Reply: {r.admin_note}</p> : null}
              {all ? (
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
                  <form action={setFeedbackStatus} className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-[180px_1fr_auto]">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="sr-only" htmlFor={`fs-${r.id}`}>
                      Status
                    </label>
                    <select id={`fs-${r.id}`} name="status" defaultValue={r.status} className={select}>
                      {Object.entries(STATUSES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor={`fn-${r.id}`}>
                      Reply
                    </label>
                    <Input id={`fn-${r.id}`} name="admin_note" defaultValue={r.admin_note ?? ""} maxLength={2000} placeholder="Reply to them (optional)" />
                    <SubmitButton variant="secondary" pendingText="Saving...">
                      Save
                    </SubmitButton>
                  </form>
                  <form action={deleteFeedback}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton variant="danger" pendingText="Removing..." confirm="Remove this report for good?">
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
