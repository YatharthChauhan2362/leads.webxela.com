import { createLead } from "@/app/actions";
import { CURRENCIES } from "@/components/leads";
import { Flash } from "@/components/ui/flash";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";

const LEAD_SOURCES: Record<string, string> = {
  manual: "Added by hand",
  linkedin: "LinkedIn",
  referral: "Referral",
  email: "Email",
  call: "Phone call",
  event: "Event or meetup",
  website: "Our website",
  other: "Other",
};

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <>
      <PageHeader title="New lead" description="Add a lead from a call, an email, a referral or anywhere else. It stays with you until you give it to someone." back={{ href: "/", label: "leads" }} />
      <Flash searchParams={searchParams} />
      <Card>
        <form action={createLead} className="space-y-6">
          <input type="hidden" name="back" value="/leads/new" />
          <FormGrid cols={2}>
            <Field label="Name" htmlFor="author">
              <Input id="author" name="author" required maxLength={200} placeholder="Priya Sharma" />
            </Field>
            <Field label="Company and role" htmlFor="headline" optional>
              <Input id="headline" name="headline" maxLength={300} placeholder="Founder at Acme Foods" />
            </Field>
            <Field label="Email" htmlFor="emails" optional hint="Separate several with commas.">
              <Input id="emails" name="emails" maxLength={500} placeholder="priya@acme.com" />
            </Field>
            <Field label="Phone" htmlFor="phones" optional>
              <Input id="phones" name="phones" maxLength={200} placeholder="+91 98765 43210" />
            </Field>
            <Field label="LinkedIn profile" htmlFor="author_url" optional>
              <Input id="author_url" name="author_url" type="url" maxLength={1000} placeholder="https://www.linkedin.com/in/someone/" />
            </Field>
            <Field label="Where it came from" htmlFor="source">
              <Select id="source" name="source" defaultValue="manual">
                {Object.entries(LEAD_SOURCES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <Field label="What they need" htmlFor="text" hint="Deadline and what they want built.">
            <Textarea id="text" name="text" required minLength={5} maxLength={5000} className="min-h-40" />
          </Field>
          <FormGrid cols={2}>
            <Field label="Budget" htmlFor="budget_amount" optional hint="If they told you one.">
              <Input id="budget_amount" name="budget_amount" inputMode="decimal" maxLength={20} placeholder="50000" />
            </Field>
            <Field label="Budget currency" htmlFor="budget_currency" optional hint="Needed when you add a budget.">
              <Select id="budget_currency" name="budget_currency" defaultValue="INR">
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}, {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          <Field label="Link to the post or email" htmlFor="post_url" optional>
            <Input id="post_url" name="post_url" type="url" maxLength={1000} />
          </Field>
          <SubmitButton pendingText="Adding...">Add lead</SubmitButton>
        </form>
      </Card>
    </>
  );
}
