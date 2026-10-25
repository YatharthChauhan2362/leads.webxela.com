import Link from "next/link";
import { runOnce, signIn, startAuto, stopAuto } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { timeAgo } from "@/components/shell/app-shell";
import { Flash } from "@/components/ui/flash";
import { Badge, Callout, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { lastLogLines, readExtensionStatus, readStatus, workerRunning, type ExtensionStatus } from "@/lib/linkedin-worker";

const STATE: Record<string, { word: string; tone: "green" | "amber" | "red" | "blue" | "neutral" }> = {
  "signed-in": { word: "Signed in", tone: "green" },
  checking: { word: "Checking now", tone: "blue" },
  "signing-in": { word: "Waiting for sign in", tone: "amber" },
  "signed-out": { word: "Signed out", tone: "red" },
  blocked: { word: "Paused by LinkedIn check", tone: "red" },
  error: { word: "Error", tone: "red" },
};

export default async function LinkedInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = readStatus();
  const running = workerRunning();
  const state = STATE[s.state ?? ""] ?? { word: "Not connected", tone: "neutral" as const };
  const auto = running && s.auto;
  const log = lastLogLines();
  const ext = await readExtensionStatus();
  // The separate Chrome window needs this Mac, so it is hidden on Vercel.
  const local = !process.env.VERCEL;

  return (
    <>
      <PageHeader
        title="LinkedIn account"
        description="Sign in to LinkedIn in this Chrome. The Yatri Leads extension then checks your searches every 30 minutes and finds contact info, right here in your own browser."
        actions={
          <>
            <a href="https://www.linkedin.com/login/" target="_blank" rel="noreferrer" className={buttonClass("primary")}>
              Sign in to LinkedIn
            </a>
            <Link href="/extension" className={buttonClass("secondary")}>
              Set up the extension
            </Link>
          </>
        }
      />
      <Flash searchParams={searchParams} />

      <ExtensionCard ext={ext} />

      <Card className="mb-6">
        <CardHeader title="In this Chrome, with the extension" description="Recommended. Uses the LinkedIn sign in you already have." />
        <ol className="list-decimal space-y-2 pl-5 text-[15px]">
          <li>Press Sign in to LinkedIn above. It opens in a new tab in this same window. Sign in there if you are not already.</li>
          <li>Load the Yatri Leads extension once (Set up the extension shows how).</li>
          <li>In the extension, turn on Watch mode. It checks your searches every 30 minutes in a background tab of this Chrome.</li>
          <li>On any post or profile, press Find email and phone.</li>
        </ol>
      </Card>

      {local ? (
        <>
      <h2 className="mb-1 text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
        Without the extension
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        A separate Chrome window run by the app, with its own LinkedIn sign in. Chrome does not let apps control your main window, so this one has to be separate.
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
          <>
            {auto ? (
              <form action={stopAuto}>
                <SubmitButton pendingText="Stopping...">Stop auto check</SubmitButton>
              </form>
            ) : (
              <form action={startAuto}>
                <SubmitButton pendingText="Starting...">Start auto check</SubmitButton>
              </form>
            )}
            <form action={runOnce}>
              <SubmitButton variant="secondary" pendingText="Starting...">Check once now</SubmitButton>
            </form>
          </>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Separate window" action={<Badge tone={state.tone}>{state.word}</Badge>} />
          <DescriptionList
            items={[
              { label: "Auto check", value: auto ? "On, every 30 minutes" : "Off" },
              { label: "Pages opened today", value: `${s.day === new Date().toISOString().slice(0, 10) ? (s.pagesToday ?? 0) : 0} of 80` },
              { label: "Last check", value: s.lastRun ? `${timeAgo(s.lastRun.at)}: ${s.lastRun.pages} pages, ${s.lastRun.added} new leads, ${s.lastRun.profiles} contacts looked up` : "" },
              { label: "Next check", value: auto && s.nextRun ? new Date(s.nextRun).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "" },
            ]}
          />
          {s.error ? <p className="mt-4 text-[15px] font-medium text-danger">{s.error}</p> : null}
          <form action={signIn} className="mt-5 border-t border-border pt-5">
            <SubmitButton variant={s.state === "signed-in" ? "secondary" : "primary"} pendingText="Opening Chrome...">
              {s.state === "signed-in" ? "Sign in again in the separate window" : "Sign in in a separate window"}
            </SubmitButton>
            <p className="mt-2 text-[13px] text-muted-foreground">
              A Chrome window opens on this Mac. You type your password there, not here. The session stays in web/data/linkedin-profile.
            </p>
          </form>
        </Card>

        <Card>
          <CardHeader title="How contacts are found" />
          <ol className="list-decimal space-y-2 pl-5 text-[15px]">
            <li>Email or phone written in the post itself.</li>
            <li>The Contact info box on their LinkedIn profile. LinkedIn shows email there mostly to your 1st degree connections.</li>
            <li>The website listed in their Contact info. The app reads its home, contact and about pages for a public email or phone.</li>
          </ol>
          <p className="mt-3 text-[13px] text-muted-foreground">Only leads at or above your alert score are looked up, up to 5 profiles a check.</p>
        </Card>
      </div>

        </>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Callout tone="amber" label="About your LinkedIn account">
          LinkedIn does not allow automated browsing and can limit accounts that use it. This runs slowly, opens at most 80 pages a day, and stops for 12 hours if LinkedIn shows a security check.
        </Callout>
        <Callout tone="blue" label="Tip">
          Connect with your best leads. Once they accept, their email shows in Contact info and the next check picks it up.
        </Callout>
      </div>

      {log ? (
        <Card className="mt-6">
          <CardHeader title="Recent activity" />
          <pre className="overflow-x-auto text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{log}</pre>
        </Card>
      ) : null}
    </>
  );
}

function ExtensionCard({ ext }: { ext: ExtensionStatus | null }) {
  const minutes = ext ? (Date.parse(new Date().toISOString()) - Date.parse(ext.seenAt)) / 60_000 : Infinity;
  const connected = minutes < 12;
  const paused = ext && ext.pausedUntil > Date.parse(ext.seenAt);
  return (
    <Card className="mb-6">
      <CardHeader
        title="Your Chrome"
        description={connected ? `Extension reported in ${timeAgo(ext!.seenAt)}.` : ext ? `Extension last seen ${timeAgo(ext.seenAt)}. Is Chrome open?` : "The extension has not connected yet."}
        action={
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={connected ? "green" : "red"}>{connected ? "Extension connected" : "Extension not connected"}</Badge>
            {connected ? <Badge tone={ext!.linkedin === "signed-in" ? "green" : "red"}>{ext!.linkedin === "signed-in" ? "LinkedIn signed in" : "LinkedIn signed out"}</Badge> : null}
          </div>
        }
      />
      {ext ? (
        <DescriptionList
          items={[
            { label: "Auto check", value: paused ? "Paused for 12 hours after a LinkedIn security check" : ext.watch ? "On, every 30 minutes" : "Off. Turn it on in the extension." },
            { label: "Pages opened today", value: `${ext.pagesToday} of ${ext.dailyCap}` },
            {
              label: "Last check",
              value: ext.lastWatch ? `${timeAgo(new Date(ext.lastWatch.at).toISOString())}: ${ext.lastWatch.pages} pages, ${ext.lastWatch.added} new leads, ${ext.lastWatch.profiles ?? 0} contacts looked up` : "",
            },
            { label: "Problem", value: ext.lastError || "None" },
          ]}
        />
      ) : (
        <p className="text-[15px] text-muted-foreground">
          Load the extension in the Chrome where you use LinkedIn. It connects by itself within a minute, then runs the first check.
        </p>
      )}
    </Card>
  );
}
