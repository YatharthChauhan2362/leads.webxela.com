You are building Yatri Leads for Yatri Cloud, end to end, at production quality.
Folder: /Volumes/Yatri Cloud/org/webxela/saas/lead-generation-auto-saas. Domain: leads.yatricloud.com. GitHub: yatri-cloud/yatri-leads.

## 1. What to build
Yatri Leads finds people who need a project done right now, such as founders, agencies and companies posting "we need a developer" or "looking for someone to build our app". It scores how urgent and how real each post is, finds a way to contact the person, and alerts us within 30 minutes of the post going up.

Sample lead: https://www.linkedin.com/in/dr-mohsen-tayyebi/ . Study how this person words project posts, then use that to write the scoring rules and search phrases.

Reference products to study: apollo.io (lead database, Chrome extension, enrichment, sequences), taplio.com and leadsnavi type post monitors, and the LinkedIn Sales Navigator alerts flow.
- Reverse engineer the reference products' features, screens and flows with https://github.com/morluto/rea.
  This means their public UI and behaviour only. Do not call or copy their private APIs or data.
  List every feature, screen, flow, setting, export and integration before writing code.
  Then build all of them. Do not leave stubs, mock data or "coming soon" screens.
- Plan the product with https://github.com/deanpeters/Product-Manager-Skills.
  Write docs/product/spec.md first: users, features, flows, business model, edge cases.
- Design the screens with the product-designer skill from https://github.com/borghei/Claude-Skills
  (product-team/product-designer/SKILL.md).

### How leads come in (hard rules)
- LinkedIn: a Chrome extension (Manifest V3) that the user installs, the same way Apollo does it.
  It reads posts and profiles only on pages the user already has open in their own logged in tab,
  and sends them to the app with the user's API key. No server side LinkedIn login, no stored
  LinkedIn cookies, no headless bots logging in.
- Optional watch mode: the extension opens the user's saved post searches (sorted by latest,
  past 24 hours) and watched profiles every 30 minutes. It caps at a low, human pace
  (default 40 page views a day, random gaps) and stops if LinkedIn shows a warning or checkpoint.
  Warn the user in plain words that automation can get their LinkedIn account restricted.
- Other sources through official APIs or feeds only: Reddit API (r/forhire, r/startups,
  r/entrepreneur and others the user picks), Hacker News API, X API if the user adds a key,
  and any RSS feed the user adds.
- Contact info: first use what the person shared in public (email or phone in the post,
  or on the profile Contact Info section). Then look up missing work emails through
  Apollo, Hunter or Prospeo APIs with the user's own keys, and verify them.
  Show where each email or phone came from and how sure we are (Verified, Likely, Guess).
  Never claim 100% accuracy anywhere in the product or site.
- Do not build email pattern guessing with SMTP probing from our own servers.

### Core features
- Sources: saved searches, watched profiles, keyword lists, sources on and off.
- Lead inbox: new posts with an AI score (0 to 100), urgency, budget hints, tech stack,
  country, and the reason for the score in one sentence.
- AI scoring through src/lib/ai.ts. It must tell "I need someone to build our MVP" apart from
  "we are hiring a full time engineer" and from people selling their own services.
- Dedupe by person and by post. One lead card per person with all their posts.
- Alerts: email and Telegram or Slack for leads above a score the user sets, checked every 30 minutes.
- Daily digest email with every lead from the last 24 hours.
- Reply drafts: AI writes a short, human reply or DM for each lead. The user sends it themselves.
  The app never sends LinkedIn messages or comments on its own.
- Pipeline: New, Contacted, Replied, Won, Lost. Notes per lead.
- Export to CSV and Google Sheets. Webhook out for CRMs.
- Teams: workspace, members, roles.

### Privacy
- Store only what is needed to contact the lead about their posted need.
- Delete on request: a public removal form and a "forget this person" button that wipes them
  and blocks them from being added again.
- Leads older than 90 days with no activity are deleted automatically (user can change this).
- Mark leads from the EU and UK and show a GDPR note before export.

## 2. Design
- Copy DESIGN.md from /Volumes/Yatri Cloud/org/Yatri Cloud/yatri-school/DESIGN.md and follow it exactly.
  White pages, one solid blue #0080FF, near black text, thin grey borders, 12 to 24px corners.
- No icons and no emojis anywhere. Words only. The logo is the only image in the chrome.
- No pale blue fills, no gradients between colours, no accent stripes, no heavy shadows.
- No fake logos, stats or testimonials. Use real brand files.
- Every screen must fit 390px and 820px wide with no sideways scroll. Add a Playwright test for it.
- Touch targets are at least 44px. Body text is 15 to 16px. Status pills always carry a word.

## 3. Copy
- Write all copy, docs, emails and commit messages with https://github.com/blader/humanizer.
- Short, plain sentences. No "not X but Y", no hype words, no forced lists of three,
  no dashes as punctuation, no emojis. Write for non-technical people.

## 4. Stack and architecture
- Next.js App Router (read node_modules/next/dist/docs before coding, this version has breaking changes),
  Tailwind v4, Supabase (Postgres, Auth, Storage), deployed on Vercel.
- Chrome extension lives in extension/ in the same repo, built with Vite, Manifest V3.
  It talks only to our API with a per user API key. It never sends LinkedIn cookies to us.
- Pages are Server Components. Changes go through Server Actions with zod validation.
  Client components only for rich editors and small interactive bits.
- The browser never calls Supabase directly. Session cookies are httpOnly.
- AI goes through src/lib/ai.ts on an OpenAI-compatible endpoint (AI_BASE_URL, default
  https://ai.yatricloud.com/v1). Validate every JSON reply with zod.
- Source polling (Reddit, HN, RSS) and alerts run on Vercel Cron every 30 minutes.
- Write README.md, AGENTS.md (with CLAUDE.md pointing to it), DESIGN.md and docs/product/spec.md
  so the next session knows the rules.

## 5. Security (treat as hard rules)
- No secrets in code. Every key comes from env through src/lib/env.ts (server only, zod checked).
  .env.local is git ignored. .env.example lists every key with a comment.
- User supplied keys (Apollo, Hunter, Prospeo, X) are stored encrypted and never sent to the browser.
- Row level security on every table, no exceptions. Use the user's own Supabase client.
  The admin (service role) client is allowed only for named cases written in AGENTS.md,
  and each one checks access first (share token, API key, webhook signature).
- Every page and action starts with a guard: requireMember(), requireAdmin() and so on.
- Check every input on the server. Never trust amounts, roles or IDs sent by the browser
  or the extension.
- Webhooks: verify the signature on the raw body, log each event by its ID, skip repeats,
  answer 500 on failure so the sender retries. Every handler must be safe to run twice.
- Cron routes check Bearer CRON_SECRET. Public routes are listed in one place in proxy.ts.
- Uploads: check type and size on the server, store private by default, serve signed URLs.
- Rate limit sign in, sign up, AI calls, the extension ingest API and any public form.
- Security headers: CSP, HSTS, X-Frame-Options or frame-ancestors, Referrer-Policy.
- Before launch, scan the running app with https://github.com/usestrix/strix and run /security-review.
  Fix every finding, then scan again.

## 6. Payments
- Business model: <decide, e.g. free up to 50 leads a month, paid plan for unlimited leads and alerts>.
  Write it in the spec. Do not add other paid gates.
- Razorpay with test keys first. Amounts come from server constants, never from the browser.
- Three layers so no payment is lost: checkout signature confirms it right away, the webhook
  records it if the tab closes, and a reconcile step asks Razorpay on the Billing page and in
  a daily cron.
- Grants run in Postgres functions that lock the row and are safe to repeat.
- Store test_mode on every payment. Test and live have separate invoice series.
- A Billing page for admins: plan, status, next charge, cancel, billing details with GSTIN,
  and every payment with a PDF invoice.

## 7. Database
- Every change is a file in supabase/migrations/. Apply it, then regenerate the TypeScript types.
- Never edit production data by hand without asking me first.

## 8. Website and docs follow the product
- Every feature change also updates the public site: landing page, features, pricing, docs and FAQ.
  Use strong, real UI for it: live demos or real screenshots, never placeholder art.
- The site explains in plain words where lead data comes from and how to be removed.

## 9. Testing and done
- Typecheck, lint and Playwright must pass before you say something is done.
- Test the extension against saved HTML fixtures of LinkedIn pages, not the live site.
- Open the app in the browser and check each flow you built at 390px, 820px and desktop.
- Tell me plainly what you tested, what failed and what you skipped.

## 10. Working rules
- Do not sign in with my real accounts, enter my passwords or submit forms with real data.
  Ask me to do those steps. For a live LinkedIn test, I open LinkedIn myself and load the extension.
- Commit only when I ask. The commit author must be yatri-cloud <yatricloud@gmail.com>,
  or Vercel Hobby blocks the deploy.
- Ask me before anything that costs money, sends messages or touches production.
- Work through the whole list. Do not take shortcuts. When you finish, give me a short summary:
  what was built, what I must set up (env keys, webhooks, DNS), and what is still open.
