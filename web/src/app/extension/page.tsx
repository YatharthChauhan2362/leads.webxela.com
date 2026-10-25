import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Callout, Card, PageHeader } from "@/components/ui/layout";

const STEPS = [
  { title: "Open the extensions page", body: "In Chrome, go to chrome://extensions and turn on Developer mode at the top right." },
  { title: "Load the folder", body: "Press Load unpacked and pick the extension folder inside this project: lead-generation-auto-saas/extension." },
  { title: "Pin it", body: "Pin Yatri Leads to the toolbar so you can see how many leads it found today." },
  { title: "Browse LinkedIn as usual", body: "Open your feed, a post search, or someone's activity page. Posts on screen are scored and the good ones land in your inbox." },
  { title: "Use the buttons", body: "Every post gets a bar with Find email and phone and Save lead. Every profile gets a small panel at the bottom right. Results show on the page with a Copy button." },
  { title: "Turn on watch mode if you want", body: "Watch mode opens your saved searches in a background tab every 30 minutes. Keep the daily page limit low." },
];

export default function ExtensionPage() {
  return (
    <>
      <PageHeader
        title="Chrome extension"
        description="It reads LinkedIn in the tab where you are already signed in, the same way Apollo's extension works."
        actions={
          <Link href="/settings" className={buttonClass("secondary")}>
            Edit searches
          </Link>
        }
      />
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <Card className="flex gap-4">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border text-[17px] font-bold text-primary" style={{ fontFamily: "var(--font-display)" }}>
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold">{s.title}</p>
                <p className="mt-0.5 text-[15px] text-muted-foreground">{s.body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Callout tone="amber" label="About your LinkedIn account">
          LinkedIn does not allow automated scraping and can limit accounts that use it. Saving posts while you browse is low risk. Watch mode is riskier, so it stops for 12 hours if LinkedIn shows a security check.
        </Callout>
        <Callout tone="blue" label="About contact details">
          Only what people share in public is saved: their post text and their Contact info section. Most people do not list a phone, so expect email on some leads and phone on few.
        </Callout>
      </div>
    </>
  );
}
