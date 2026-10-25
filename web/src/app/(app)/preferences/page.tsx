import { savePreferences } from "@/app/actions";
import { Flash } from "@/components/ui/flash";
import { Checkbox, Field, FormSection, Input, Select, Textarea } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { getSettings } from "@/lib/db";
import { requireMember } from "@/lib/session";

export default async function PreferencesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMember("admin");
  const s = await getSettings();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <>
      <PageHeader
        title="Preferences"
        description="What a good lead looks like for you, where to look, and how often. Members and their extensions follow these and cannot change them."
      />
      <Flash searchParams={searchParams} />
      <Card>
        <form action={savePreferences} className="space-y-8">
          <input type="hidden" name="back" value="/preferences" />

          <FormSection title="What we sell" description="Posts that mention these get a higher score and show them as skills.">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Field label="Our services" htmlFor="pref_services" hint="One per line, for example: shopify, mobile app, ai chatbot.">
                <Textarea id="pref_services" name="pref_services" defaultValue={s.pref_services} className="min-h-48" />
              </Field>
              <Field label="Never a lead if the post says" htmlFor="pref_exclude" hint="One per line. Job seekers, unpaid work, equity only and so on.">
                <Textarea id="pref_exclude" name="pref_exclude" defaultValue={s.pref_exclude} className="min-h-48" />
              </Field>
              <Field label="Places we want" htmlFor="pref_locations" hint="One per line, for example: India, Dubai, USA. Posts from these score higher. Empty means anywhere." optional>
                <Textarea id="pref_locations" name="pref_locations" defaultValue={s.pref_locations} className="min-h-48" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Which posts to keep">
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Keep posts scoring at least" htmlFor="min_score" hint="Posts matching a search are always kept.">
                <Input id="min_score" name="min_score" type="number" min={0} max={100} defaultValue={s.min_score} required />
              </Field>
              <Field label="Hot at" htmlFor="alert_score" hint="Hot leads send alerts and can go to BDEs.">
                <Input id="alert_score" name="alert_score" type="number" min={0} max={100} defaultValue={s.alert_score} required />
              </Field>
              <Field label="Oldest post to keep, in hours" htmlFor="pref_max_age_hours" hint="72 means the last 3 days.">
                <Input id="pref_max_age_hours" name="pref_max_age_hours" type="number" min={1} max={720} defaultValue={s.pref_max_age_hours} required />
              </Field>
              <div className="space-y-3 sm:pt-7">
                <Checkbox name="type_job" defaultChecked={s.pref_lead_types.includes("job")} label="Also keep job posts" hint="Companies hiring full time sometimes outsource." />
              </div>
            </div>
          </FormSection>

          <FormSection title="Where to look">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Checkbox name="src_google" defaultChecked={s.src_google === "on"} label="LinkedIn through Google search" hint="Works even when nobody's Chrome is open." />
              <Checkbox name="src_reddit" defaultChecked={s.src_reddit === "on"} label="Reddit" hint="Needs the Reddit keys." />
              <Checkbox name="src_hn" defaultChecked={s.src_hn === "on"} label="Hacker News" hint="The monthly freelancer thread and more." />
            </div>
          </FormSection>

          <FormSection title="How often" description="Only admins can change these. Every extension follows them.">
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Server checks every (minutes)" htmlFor="fetch_minutes" hint="15 to 1440. 60 means every hour.">
                <Input id="fetch_minutes" name="fetch_minutes" type="number" min={15} max={1440} defaultValue={s.fetch_minutes} required />
              </Field>
              <Field label="Each extension checks every (minutes)" htmlFor="ext_minutes" hint="15 to 240. Lower finds posts sooner.">
                <Input id="ext_minutes" name="ext_minutes" type="number" min={15} max={240} defaultValue={s.ext_minutes} required />
              </Field>
              <Field label="LinkedIn pages per person a day" htmlFor="ext_daily_cap" hint="Keep it low to protect accounts. 80 is safe.">
                <Input id="ext_daily_cap" name="ext_daily_cap" type="number" min={10} max={300} defaultValue={s.ext_daily_cap} required />
              </Field>
              <Field label="Daily summary email at" htmlFor="digest_hour" hint="India time.">
                <Select id="digest_hour" name="digest_hour" defaultValue={s.digest_hour}>
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Alerts">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Checkbox name="notify_hot" defaultChecked={s.notify_hot === "on"} label="Alert on every hot lead" hint="Bell, desktop alert through the extension, and email to admins." />
            </div>
          </FormSection>

          <SubmitButton>Save preferences</SubmitButton>
        </form>
      </Card>
    </>
  );
}
