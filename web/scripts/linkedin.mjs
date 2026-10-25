#!/usr/bin/env node
// LinkedIn worker for Yatri Leads. Uses your installed Chrome with its own saved profile in data/linkedin-profile.
//   node scripts/linkedin.mjs login   opens Chrome so you can sign in yourself (the password never touches this app)
//   node scripts/linkedin.mjs once    one check: searches, watched profiles, then contact info for hot leads
//   node scripts/linkedin.mjs run     the same check every POLL_MINUTES until stopped
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const PROFILE_DIR = path.join(DATA, "linkedin-profile");
const STATUS = path.join(DATA, "linkedin-status.json");
const READER = fs.readFileSync(path.join(ROOT, "scripts", "li-reader.js"), "utf8");

const APP = process.env.APP_URL || "http://localhost:3000";
const KEY = process.env.INGEST_KEY || "";
const EVERY_MIN = Number(process.env.POLL_MINUTES) || 30;
const PAGES_PER_RUN = Number(process.env.LINKEDIN_PAGES_PER_RUN) || 4;
const PROFILES_PER_RUN = Number(process.env.LINKEDIN_PROFILES_PER_RUN) || 5;
const DAILY_CAP = Number(process.env.LINKEDIN_DAILY_PAGES) || 80;
const HEADLESS = process.env.LINKEDIN_HEADLESS === "1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => sleep(min + Math.random() * (max - min));
const today = () => new Date().toISOString().slice(0, 10);

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(STATUS, "utf8"));
  } catch {
    return {};
  }
}
function writeStatus(patch) {
  fs.mkdirSync(DATA, { recursive: true });
  const next = { ...readStatus(), ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(STATUS, JSON.stringify(next, null, 2));
  return next;
}
function countPage() {
  const s = readStatus();
  const pagesToday = s.day === today() ? (s.pagesToday || 0) + 1 : 1;
  writeStatus({ day: today(), pagesToday });
  return pagesToday;
}
function pagesLeft() {
  const s = readStatus();
  return DAILY_CAP - (s.day === today() ? s.pagesToday || 0 : 0);
}

async function api(p, body) {
  const res = await fetch(APP + p, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(KEY ? { "x-api-key": KEY } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${p} returned ${res.status}`);
  return res.json();
}

async function openBrowser(headless) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  // chromiumSandbox keeps Chrome's normal security sandbox on (and removes the --no-sandbox warning bar).
  return chromium.launchPersistentContext(PROFILE_DIR, { channel: "chrome", headless, chromiumSandbox: true, viewport: { width: 1280, height: 900 } });
}

async function signedIn(ctx) {
  return (await ctx.cookies("https://www.linkedin.com")).some((c) => c.name === "li_at");
}

async function login() {
  writeStatus({ state: "signing-in", error: null, pid: process.pid });
  const ctx = await openBrowser(false);
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("https://www.linkedin.com/login");
  // Wait up to 10 minutes for you to finish signing in, including any code LinkedIn asks for.
  for (let i = 0; i < 300; i++) {
    if ((await signedIn(ctx)) && /\/feed|\/in\/|\/mynetwork/.test(page.url())) break;
    if (!ctx.pages().length) break;
    await sleep(2000);
  }
  const ok = await signedIn(ctx).catch(() => false);
  writeStatus({ state: ok ? "signed-in" : "signed-out", error: ok ? null : "Sign in was not finished.", pid: null, pausedUntil: 0 });
  await ctx.close().catch(() => {});
  console.log(ok ? "Signed in. The session is saved." : "Not signed in.");
}

async function readPage(page) {
  return page.evaluate(READER);
}

async function humanScroll(page, screens) {
  for (let i = 0; i < screens; i++) {
    await page.mouse.wheel(0, 500 + Math.random() * 400);
    await jitter(2000, 4500);
  }
}

function stopFor(state) {
  const pausedUntil = state === "blocked" ? Date.now() + 12 * 3600_000 : 0;
  writeStatus({
    state,
    pausedUntil,
    error: state === "blocked" ? "LinkedIn showed a security check. Paused for 12 hours." : "Signed out of LinkedIn. Press Sign in to LinkedIn again.",
  });
}

async function once() {
  const st = readStatus();
  if (st.pausedUntil && Date.now() < st.pausedUntil) {
    console.log("Paused until", new Date(st.pausedUntil).toLocaleString());
    return;
  }
  if (pagesLeft() <= 0) {
    writeStatus({ error: "Daily page limit reached. Next check tomorrow." });
    return;
  }
  writeStatus({ state: "checking", error: null });
  const ctx = await openBrowser(HEADLESS);
  const result = { pages: 0, posts: 0, added: 0, profiles: 0 };
  try {
    if (!(await signedIn(ctx))) return stopFor("signed-out");
    const page = ctx.pages()[0] || (await ctx.newPage());

    // 1. Searches and watched profiles, a few per run, taking turns.
    const { urls } = await api("/api/searches");
    const cursor = readStatus().cursor || 0;
    const count = Math.min(PAGES_PER_RUN, urls.length, pagesLeft());
    for (let i = 0; i < count; i++) {
      await page.goto(urls[(cursor + i) % urls.length], { waitUntil: "domcontentloaded" });
      await jitter(4000, 8000);
      await humanScroll(page, 4);
      const r = await readPage(page);
      countPage();
      result.pages++;
      if (r.state !== "ok") return stopFor(r.state);
      if (r.posts.length) {
        const res = await api("/api/ingest", { posts: r.posts, profiles: [] });
        result.posts += r.posts.length;
        result.added += res.added || 0;
      }
      await jitter(15000, 35000);
    }
    writeStatus({ cursor: urls.length ? (cursor + count) % urls.length : 0 });

    // 2. Contact info for hot leads that have no email or phone yet.
    const { profiles } = await api(`/api/enrich?limit=${Math.min(PROFILES_PER_RUN, pagesLeft())}`);
    for (const url of profiles) {
      await page.goto(url.replace(/\/?$/, "/") + "overlay/contact-info/", { waitUntil: "domcontentloaded" });
      await jitter(4000, 7000);
      const r = await readPage(page);
      countPage();
      result.pages++;
      if (r.state !== "ok") return stopFor(r.state);
      const p = r.profile || { url, emails: [], phones: [], websites: [] };
      await api("/api/ingest", { posts: [], profiles: [{ ...p, url }] });
      result.profiles++;
      await jitter(12000, 30000);
    }
    writeStatus({ state: "signed-in", lastRun: { at: new Date().toISOString(), ...result } });
    console.log("Check done", result);
  } catch (err) {
    writeStatus({ state: "error", error: err.message });
    console.error(err);
  } finally {
    await ctx.close().catch(() => {});
  }
}

const mode = process.argv[2];
if (mode === "login") {
  await login();
} else if (mode === "once") {
  writeStatus({ pid: process.pid });
  await once();
  writeStatus({ pid: null });
} else if (mode === "run") {
  writeStatus({ pid: process.pid, auto: true });
  const stop = () => {
    writeStatus({ pid: null, auto: false, state: readStatus().state === "checking" ? "signed-in" : readStatus().state });
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  for (;;) {
    await once();
    const next = Date.now() + (EVERY_MIN + Math.random() * 5) * 60_000;
    writeStatus({ nextRun: new Date(next).toISOString() });
    await sleep(next - Date.now());
  }
} else {
  console.log("Use: node scripts/linkedin.mjs login | once | run");
}
