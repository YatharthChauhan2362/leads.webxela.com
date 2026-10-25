# Yatri Leads

Finds people who need a project built and puts them in one inbox with a score, contact details and a reply draft.

- `web/` is the app (Next.js). Data lives in Supabase project leads.webxela.com (zkizljbvtmuttrizqyzj).
- `extension/` is the Chrome extension that reads LinkedIn in your own signed in tab.

## Run it

```
cd web
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

Database changes are files in `web/supabase/migrations/`. Apply and refresh types with:

```
cd web
npx supabase db push            # uses SUPABASE_ACCESS_TOKEN from .env.local
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

Every table has row level security on and no policies. Only the server, with SUPABASE_SECRET_KEY, can read or write.

The server checks Reddit and Hacker News every 30 minutes on its own while it runs (`POLL_MINUTES`).
Hot leads (score at or above the alert score in Settings) are emailed through Zoho, one email per check.

## LinkedIn without the extension

Open LinkedIn account in the app, press Sign in to LinkedIn and sign in in the Chrome window that opens.
Then press Start auto check. Every 30 minutes it opens a few of your searches, saves the posts,
and looks up Contact info (and the website listed there) for up to 5 hot leads.
The same thing from a terminal: `node scripts/linkedin.mjs login | once | run`.

## LinkedIn with the extension

1. Open `chrome://extensions`, turn on Developer mode, press Load unpacked, pick the `extension` folder.
2. Sign in to LinkedIn in that Chrome and browse as usual: feed, post searches, someone's activity page.
   Posts on screen are scored and the good ones are saved.
3. Each post gets Find email and phone and Save lead buttons. Each profile gets a panel with the same lookup.
   The lookup reads their Contact info and the website listed there, then shows the result with a Copy button.
4. Watch mode (in the extension popup) opens your saved searches in a background tab on a timer.
   It is capped at 60 pages a day and pauses for 12 hours if LinkedIn shows a security check.

## Keys in .env.local

| Key | What it does |
| --- | --- |
| SUPABASE_URL, SUPABASE_SECRET_KEY | Database. Server only. |
| EMAIL_* | Zoho SMTP for hot lead emails. EMAIL_TO defaults to EMAIL_USER. |
| AI_API_KEY | Smarter scoring and reply drafts. Without it, keyword scoring is used. |
| REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET | Reddit official API. Make a "script" app at reddit.com/prefs/apps. |
| INGEST_KEY | Optional. If set, the extension must send it (paste it in the popup). |
