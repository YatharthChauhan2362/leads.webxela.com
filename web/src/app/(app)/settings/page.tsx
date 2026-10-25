import { rescoreAll, saveBranding, saveSettings } from "@/app/actions";
import { Flash } from "@/components/ui/flash";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Callout, Card, CardHeader, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { aiEnabled } from "@/lib/ai";
import { sb } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { emailEnabled, emailTo } from "@/lib/alerts";
import { getSettings, lines } from "@/lib/db";
import { linkedinSearchUrl } from "@/lib/linkedin";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMember("admin");
  const email = emailEnabled();
  const engineCount = (await sb().from("search_engines").select("id", { count: "exact", head: true }).eq("active", true)).count ?? 0;
  const searchOn = engineCount > 0;
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Searches and branding" description="The team's search phrases and watched profiles, plus your app's name, colour and logo." />
      <Flash searchParams={searchParams} />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Callout tone={aiEnabled() ? "green" : "amber"} label={aiEnabled() ? "AI scoring is on" : "AI scoring is off"}>
          {aiEnabled() ? "Each post is read by AI and scored." : "Posts are scored by keywords. Add AI_API_KEY to .env.local for smarter scores."}
        </Callout>
        <Callout tone={searchOn ? "green" : "amber"} label={searchOn ? "Google search is on" : "Google search is off"}>
          {searchOn
            ? `${engineCount} search engine${engineCount === 1 ? "" : "s"} ready on the Search page.`
            : "Add your engines on the Search engines page."}
        </Callout>
        <Callout tone={email ? "green" : "amber"} label={email ? "Email alerts are on" : "Email alerts are off"}>
          {email ? `Hot leads are emailed to ${emailTo()} through Zoho.` : "Add the Zoho EMAIL_USER and EMAIL_PASS to .env.local to get hot leads by email."}
        </Callout>
      </div>

      <Card className="mb-6">
        <CardHeader title="Branding" description="Your app name, company, colour and logo. The colour replaces the blue on every page, button and header." />
        <form action={saveBranding} className="space-y-5">
          <input type="hidden" name="back" value="/settings" />
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="App name, first word" htmlFor="brand_first" hint="Shown in dark text.">
              <Input id="brand_first" name="brand_first" defaultValue={settings.brand_first} required maxLength={30} />
            </Field>
            <Field label="App name, second word" htmlFor="brand_second" hint="Shown in your colour." optional>
              <Input id="brand_second" name="brand_second" defaultValue={settings.brand_second} maxLength={30} />
            </Field>
            <Field label="Company" htmlFor="company_name" hint="Shown at the top of the menu.">
              <Input id="company_name" name="company_name" defaultValue={settings.company_name} required maxLength={60} />
            </Field>
            <Field label="Colour" htmlFor="brand_color" hint="Dark enough for white text.">
              <input id="brand_color" name="brand_color" type="color" defaultValue={settings.brand_color} className="block h-12 w-full cursor-pointer rounded-xl border border-input bg-background p-1" />
            </Field>
            <Field label="Logo" htmlFor="logo" hint="Square PNG, JPG or WebP, under 1 MB." optional>
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-[14px]" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <SubmitButton pendingText="Saving...">Save branding</SubmitButton>
            <SubmitButton variant="secondary" name="reset" value="1" pendingText="Resetting..." confirm="Go back to the original name, blue and logo?">
              Reset to original
            </SubmitButton>
          </div>
        </form>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <form action={saveSettings} className="space-y-6">
            <input type="hidden" name="back" value="/settings" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <Field label="Search phrases" htmlFor="searches" hint="One per line. Used for LinkedIn post search and Hacker News.">
                <Textarea id="searches" name="searches" defaultValue={settings.searches} className="min-h-72" />
              </Field>
              <Field label="Watched LinkedIn profiles" htmlFor="watched_profiles" hint="One profile link per line. Their latest posts are checked.">
                <Textarea id="watched_profiles" name="watched_profiles" defaultValue={settings.watched_profiles} className="min-h-72" />
              </Field>
              <Field label="Subreddits" htmlFor="subreddits" hint="One name per line, without r/. In hiring subs only [Hiring] and [Task] posts are kept.">
                <Textarea id="subreddits" name="subreddits" defaultValue={settings.subreddits} className="min-h-72" />
              </Field>
            </div>
            <p className="text-[13px] text-muted-foreground">Scores, sources, schedules and hand off are on the Preferences page.</p>
            <SubmitButton>Save settings</SubmitButton>
          </form>
        </Card>

        <Card>
          <h2 className="text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
            LinkedIn searches to open
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Newest posts from the last 24 hours. Open any while the extension is on and the posts are saved.</p>
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
            <SubmitButton variant="secondary" pendingText="Scoring...">
              Score all leads again
            </SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
