import { rescoreAll, saveSettings } from "../actions";
import { Flash } from "@/components/ui/flash";
import { Field, FormGrid, FormSection, Input, Textarea } from "@/components/ui/form";
import { Callout, Card, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { aiEnabled } from "@/lib/ai";
import { emailEnabled, emailTo } from "@/lib/alerts";
import { getSettings, lines } from "@/lib/db";
import { linkedinSearchUrl } from "@/lib/linkedin";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const email = emailEnabled();
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Searches and alerts" description="What to look for, where to look, and when to tell you." />
      <Flash searchParams={searchParams} />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Callout tone={aiEnabled() ? "green" : "amber"} label={aiEnabled() ? "AI scoring is on" : "AI scoring is off"}>
          {aiEnabled() ? "Each post is read by AI and scored." : "Posts are scored by keywords. Add AI_API_KEY to .env.local for smarter scores."}
        </Callout>
        <Callout tone={email ? "green" : "amber"} label={email ? "Email alerts are on" : "Email alerts are off"}>
          {email ? `Hot leads are emailed to ${emailTo()} through Zoho.` : "Add the Zoho EMAIL_USER and EMAIL_PASS to .env.local to get hot leads by email."}
        </Callout>
      </div>

      <Card>
        <form action={saveSettings} className="space-y-6">
          <input type="hidden" name="back" value="/settings" />
          <FormSection title="Search phrases" description="One per line. Used for LinkedIn post search and Hacker News.">
            <Textarea name="searches" defaultValue={settings.searches} className="min-h-48" />
          </FormSection>
          <FormSection title="Watched LinkedIn profiles" description="One profile link per line. The extension checks their latest posts.">
            <Textarea name="watched_profiles" defaultValue={settings.watched_profiles} />
          </FormSection>
          <FormSection title="Subreddits" description="One name per line, without r/. In hiring subs only [Hiring] and [Task] posts are kept.">
            <Textarea name="subreddits" defaultValue={settings.subreddits} />
          </FormSection>
          <FormSection title="Scores">
            <FormGrid>
              <Field label="Keep posts scoring at least" htmlFor="min_score" hint="Lower posts are not saved.">
                <Input id="min_score" name="min_score" type="number" min={0} max={100} defaultValue={settings.min_score} required />
              </Field>
              <Field label="Alert me at" htmlFor="alert_score" hint="Posts at or above this are emailed to you.">
                <Input id="alert_score" name="alert_score" type="number" min={0} max={100} defaultValue={settings.alert_score} required />
              </Field>
            </FormGrid>
          </FormSection>
          <SubmitButton>Save settings</SubmitButton>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 className="text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>LinkedIn searches to open</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Newest posts from the last 24 hours. Open any of these while the extension is on and the posts are saved.</p>
        <ul className="mt-3 space-y-1">
          {lines(settings.searches).map((s) => (
            <li key={s}>
              <a href={linkedinSearchUrl(s)} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center text-[15px] text-primary hover:underline">
                {s}
              </a>
            </li>
          ))}
        </ul>
        <form action={rescoreAll} className="mt-4 border-t border-border pt-4">
          <input type="hidden" name="back" value="/settings" />
          <SubmitButton variant="secondary" pendingText="Scoring...">Score all leads again</SubmitButton>
        </form>
      </Card>
    </>
  );
}
