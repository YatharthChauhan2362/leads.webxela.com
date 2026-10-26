import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
// Feature test: drives the real app in Chrome as an admin and two members, then tries to break it.
// Run against a local production build: npm run build && npx next start -p 3123, then npm run test:e2e.
// Uses the real database with marked test rows (yatri-test-*, Yatri Test*) and removes them at the end.
import { fileURLToPath } from "node:url";
const WEB = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const require = createRequire(WEB + "/package.json");
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright-core");
const env = Object.fromEntries(readFileSync(WEB + "/.env.local", "utf8").split("\n").filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE || "http://localhost:3123";
const token = (id) => { const p = Buffer.from(JSON.stringify({ m: id, e: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"); return `${p}.${createHmac("sha256", env.SESSION_SECRET).update(p).digest("base64url")}`; };
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log("PASS", msg); } else { fail++; console.log("FAIL", msg); } };

// Setup
await db.from("members").delete().like("email", "yatri-test-%");
const owner = (await db.from("members").select("id, name").eq("role", "admin").eq("status", "active").limit(1).single()).data;
const mk = async (n) => (await db.from("members").insert({ email: `yatri-test-${n}@example.com`, name: `Test ${n.toUpperCase()}`, role: "member", status: "active" }).select("id").single()).data.id;
const A = await mk("a"), B = await mk("b");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const as = async (id) => { const c = await browser.newContext(); await c.addCookies([{ name: "yl_session", value: token(id), url: BASE }]); const p = await c.newPage(); p.setDefaultTimeout(20000); return p; };
const pa = await as(A), pb = await as(B), po = await as(owner.id);
const submitIn = async (p, sel) => { await Promise.all([p.waitForLoadState("networkidle").catch(() => {}), p.locator(sel).locator("button[type=submit], button:not([type])").first().click()]); await p.waitForTimeout(1500); };
const text = async (p) => (await p.locator("main").innerText());

try {
  // Member A: nav
  await pa.goto(BASE + "/");
  const nav = await pa.locator("aside nav").innerText();
  ok(/Leads/.test(nav) && /Notifications/.test(nav) && /Search/.test(nav) && /Feedback/.test(nav) && /Team chat/.test(nav) && !/Chrome extension|Dashboard|Daily finds|People|\bTeam\b(?! chat)/.test(nav), "member menu: Leads, Notifications, Team chat, Search, Feedback (no extension)");

  // A adds a lead by hand
  await pa.goto(BASE + "/leads/new");
  await pa.fill("#author", "Yatri Test Lead One");
  await pa.fill("#emails", "lead.one@yatritest.in");
  await pa.fill("#text", "Needs a booking website for a clinic, test lead.");
  await Promise.all([pa.waitForURL(/\/leads\/\d+/), pa.click("button:has-text('Add lead')")]);
  const L1 = Number(pa.url().match(/leads\/(\d+)/)[1]);
  let t = await text(pa);
  ok(/Lead added/.test(t), "lead created with confirmation");
  ok(/Test A\s+added this lead/.test(t), "history shows who added it");
  const row1 = (await db.from("leads").select("assigned_to, captured_by, status, is_lead").eq("id", L1).single()).data;
  ok(row1.assigned_to === null && row1.captured_by === A && row1.is_lead && row1.status === "new", "no automatic assignment, captured by A, status New");

  // A moves it to Contacted: saves on pick, no button, no reload
  ok((await pa.locator(`#status-${L1}`).count()) === 1 && (await pa.locator("button:has-text('Save status')").count()) === 0, "status has no Save button");
  await pa.evaluate(() => (window.__noReload = true));
  await pa.selectOption(`#status-${L1}`, "contacted");
  await pa.waitForSelector("text=Saved: Contacted");
  await pa.waitForSelector("text=moved it from Not contacted yet to Contacted");
  ok(await pa.evaluate(() => window.__noReload === true), "status saved instantly without a page reload, history updated");

  // A gives it to B
  await pa.selectOption("#member", B);
  await submitIn(pa, "form:has(#member)");
  t = await text(pa);
  ok(/gave it to Test B/.test(t), "hand over recorded in history");
  ok((await db.from("leads").select("assigned_to").eq("id", L1).single()).data.assigned_to === B, "lead now assigned to B");
  ok(((await db.from("notifications").select("id").eq("member_id", B)).data ?? []).length > 0, "B got a notification");

  // Budget with currency on a new lead
  await pa.goto(BASE + "/leads/new");
  await pa.fill("#author", "Yatri Test Lead Budget");
  await pa.fill("#text", "Needs a CRM, test budget lead.");
  await pa.fill("#budget_amount", "3000");
  await pa.selectOption("#budget_currency", "EUR");
  await Promise.all([pa.waitForURL(/\/leads\/\d+/), pa.click("button:has-text('Add lead')")]);
  const LB = Number(pa.url().match(/leads\/(\d+)/)[1]);
  ok(/EUR/.test((await db.from("leads").select("budget").eq("id", LB).single()).data.budget ?? ""), "budget saved with its currency");
  // A adds a second lead, keeps it
  await pa.goto(BASE + "/leads/new");
  await pa.fill("#author", "Yatri Test Lead Two <img src=x onerror=window.__xss=1>");
  await pa.fill("#author_url", "https://www.linkedin.com/in/yatri-test-private-a/");
  await pa.fill("#text", "Wants a Shopify store, test lead two.");
  await Promise.all([pa.waitForURL(/\/leads\/\d+/), pa.click("button:has-text('Add lead')")]);
  const L2 = Number(pa.url().match(/leads\/(\d+)/)[1]);

  // B sees only lead one
  await pb.goto(BASE + "/?status=all");
  t = await text(pb);
  ok(/Yatri Test Lead One/.test(t) && !/Yatri Test Lead Two/.test(t), "B sees the lead given to them, not A's other lead");
  const r2 = await pb.goto(BASE + `/leads/${L2}`);
  ok(r2.status() === 404 || /could not be found|not found/i.test(await pb.content()), "B cannot open A's other lead");
  ok(!/Former member/.test(t), "owner names show for members");

  // B updates status to Contract signed, A gets told
  await pb.goto(BASE + `/leads/${L1}`);
  await pb.selectOption(`#status-${L1}`, "contract");
  await pb.waitForSelector("text=Saved: Contract signed");
  await pb.waitForTimeout(1500);
  t = await text(pb);
  ok(/Test B\s+moved it from Contacted to Contract signed/.test(t), "B's status change recorded");
  const nA = (await db.from("notifications").select("title, body").eq("member_id", A)).data ?? [];
  ok(nA.length > 0, `A notified when B changed the lead (${nA[0]?.title ?? "none"})`);
  // B notes
  await pb.fill("#notes", "Called, they signed.");
  await submitIn(pb, "form:has(#notes)");
  ok(/updated the notes/.test(await text(pb)), "note recorded in history");


  // Deal value and lost reason
  await pb.fill("#deal_value", "50000");
  await submitIn(pb, "form:has(#deal_value)");
  ok(/Pick the currency/.test(await text(pb)) && (await db.from("leads").select("deal_value").eq("id", L1).single()).data.deal_value === null, "deal value without a currency is refused");
  ok((await pb.locator("#deal_currency option").count()) > 150, "currency list has every currency");
  await pb.selectOption("#deal_currency", "INR");
  await pb.fill("#deal_value", "50000");
  await submitIn(pb, "form:has(#deal_value)");
  ok(/set the deal value to ₹50,000/.test(await text(pb)), "deal value saved in INR and in history");
  await pb.selectOption("#deal_currency", "USD");
  await pb.fill("#deal_value", "2000");
  await submitIn(pb, "form:has(#deal_value)");
  const dv = (await db.from("leads").select("deal_value, deal_currency").eq("id", L1).single()).data;
  ok(dv.deal_currency === "USD" && Number(dv.deal_value) === 2000 && /set the deal value to USD\s2,000/.test(await text(pb)), "switching to USD saved");
  await pb.selectOption(`#status-${L1}`, "lost");
  await pb.waitForTimeout(800);
  ok((await pb.locator(`#lost-${L1}`).count()) === 1 && (await db.from("leads").select("status").eq("id", L1).single()).data.status === "contract", "picking Lost asks for a reason before saving");
  // Back to contract from the list instead, and live refresh: A's page updates by itself
  await pa.goto(BASE + "/?status=all");
  await pb.goto(BASE + "/?status=all");
  await pb.selectOption(`#status-${L1}`, "lost");
  await pb.fill(`#lost-${L1}`, "Budget too small");
  await pb.click(`form:has(#lost-${L1}) button`);
  await pb.waitForSelector("text=Saved: Lost");
  ok((await db.from("leads").select("lost_reason").eq("id", L1).single()).data.lost_reason === "Budget too small", "Lost saved with reason from the list");
  await pa.waitForFunction((id) => document.querySelector(`#status-${id}`)?.value === "lost", L1, { timeout: 25000 }).then(() => ok(true, "A's open list showed B's change without a reload"), () => ok(false, "A's open list showed B's change without a reload"));
  await pb.goto(BASE + `/leads/${L1}`);
  await pb.selectOption(`#status-${L1}`, "contract");
  await pb.waitForSelector("text=Saved: Contract signed");
  // Duplicate: A adds the same email again
  await pa.goto(BASE + "/leads/new");
  await pa.fill("#author", "Yatri Test Lead Dup");
  await pa.fill("#emails", "lead.one@yatritest.in");
  await pa.fill("#text", "Same person again, test duplicate.");
  await Promise.all([pa.waitForURL(/\/leads\/\d+/), pa.click("button:has-text('Add lead')")]);
  t = await text(pa);
  ok(/Test B already has this person/.test(t) && /Someone else has this person too/.test(t), "duplicate warned on add and on the lead page");
  ok(((await db.from("notifications").select("title").eq("member_id", B)).data ?? []).some((n) => /also added/.test(n.title)), "B told about the duplicate");
  // Members can search
  const rs = await pb.goto(BASE + "/search");
  ok(rs.status() === 200 && new URL(pb.url()).pathname === "/search", "member can open Search");
  await pb.goto(BASE + "/search?type=posts&q=" + encodeURIComponent("looking for a freelance developer"));
  await pb.waitForFunction(() => /new result|No new clients|No results|not set up/.test(document.querySelector("main")?.innerText || ""), null, { timeout: 60000 }).catch(() => {});
  const st = await text(pb);
  const m = st.match(/(\d+) new results?[^\n]*/);
  console.log("search summary:", m ? m[0] : st.match(/No new clients|No results|not set up yet/)?.[0]);
  ok(/new result|No new clients|No results/.test(st), "member search runs with the client filter");
  // A still sees lead one (they added it)
  await pa.goto(BASE + "/?status=all");
  ok(/Yatri Test Lead One/.test(await text(pa)), "A still sees the lead they added");

  // Feedback
  await pa.goto(BASE + "/feedback");
  ok(/Feedback/.test(await pa.locator("aside nav").innerText()), "Feedback is in the member menu");
  await pa.selectOption("#kind", "bug");
  await pa.fill("#title", "Yatri test bug report");
  await pa.fill("#details", "Status picker test details.");
  await submitIn(pa, "form:has(#title)");
  ok(/Thanks\. The admins have it\./.test(await text(pa)) && /Yatri test bug report/.test(await text(pa)), "member sent a bug report and sees it");
  ok(((await db.from("notifications").select("title").eq("member_id", owner.id)).data ?? []).some((n) => /Bug from Test A/.test(n.title)), "admins notified of the report");
  await pb.goto(BASE + "/feedback");
  ok(!/Yatri test bug report/.test(await text(pb)), "other members do not see someone else's report");
  // Break it: a member tampers with forms and replays admin requests
  // 1. A deletes the lead they gave to B by changing the ticked id. B's work must stay.
  await pa.goto(BASE + "/?status=all");
  await pa.evaluate((id) => {
    const box = document.querySelector('input[name="ids"][form="bulk"]');
    box.value = String(id);
    box.checked = true;
  }, L1);
  pa.once("dialog", (d) => d.accept());
  await submitIn(pa, "form#bulk");
  ok((await db.from("leads").select("id").eq("id", L1).maybeSingle()).data !== null, "a member cannot delete a lead they already gave to a teammate");
  // 2. B points the notes form at A's private lead.
  await pb.goto(BASE + `/leads/${L1}`);
  await pb.evaluate((id) => { document.querySelector('form:has(#notes) input[name="id"]').value = String(id); }, L2);
  await pb.fill("#notes", "tampered");
  await submitIn(pb, "form:has(#notes)");
  ok((await db.from("leads").select("notes").eq("id", L2).single()).data.notes !== "tampered", "a member cannot write notes on someone else's lead");
  // 3. B gives A's private lead to themselves.
  await pb.goto(BASE + `/leads/${L1}`);
  await pb.evaluate((id) => { document.querySelector('form:has(#member) input[name="id"]').value = String(id); }, L2);
  await pb.selectOption("#member", B);
  await submitIn(pb, "form:has(#member)");
  ok((await db.from("leads").select("assigned_to").eq("id", L2).single()).data.assigned_to !== B, "a member cannot take someone else's lead");
  // 4. Replay admin actions with a member's cookie.
  const replay = async (page, button, cookieOf) => {
    await po.goto(BASE + page);
    const field = await po.evaluate((label) => {
      const btn = [...document.querySelectorAll("form button")].find((b) => b.textContent.trim() === label);
      return [...(btn?.closest("form")?.querySelectorAll("input[type=hidden]") ?? [])].map((i) => [i.name, i.value]);
    }, button);
    const fd = new FormData();
    for (const [k, v] of field) fd.append(k, v);
    const res = await fetch(BASE + page, { method: "POST", body: fd, headers: { cookie: `yl_session=${token(cookieOf)}` }, redirect: "manual" });
    return { found: field.length > 0, location: decodeURIComponent(res.headers.get("location") ?? "") + " " + res.status };
  };
  let rp = await replay("/finds", "Check now", B);
  ok(rp.found && /Only admins/.test(rp.location), `member replaying Check now is refused (${rp.location.slice(0, 60)})`);
  rp = await replay("/dashboard", "Turn off", B);
  ok(rp.found && /Only admins/.test(rp.location) && (await db.from("settings").select("value").eq("key", "claude_auto").maybeSingle()).data?.value !== "off", "member replaying the Claude switch is refused");
  // 5. API without a key, with a wrong key, with junk.
  ok((await fetch(BASE + "/api/brief")).status === 401 && (await fetch(BASE + "/api/brief", { headers: { "x-api-key": "nope" } })).status === 401, "API refuses missing or wrong keys");
  const mKey = "yl_yatritest" + Date.now();
  await db.from("members").update({ api_key: mKey }).eq("id", B);
  const junk = await fetch(BASE + "/api/ingest", { method: "POST", headers: { "x-api-key": mKey, "content-type": "application/json" }, body: "{not json" });
  ok(junk.status === 400, "API rejects broken JSON");
  const exp = await fetch(BASE + "/api/export", { headers: { "x-api-key": mKey } });
  ok(exp.status === 403, "a member's key cannot download all leads");
  const la = await (await fetch(BASE + "/api/lead-action", { method: "POST", headers: { "x-api-key": mKey, "content-type": "application/json" }, body: JSON.stringify({ action: "follow_up", url: "https://www.linkedin.com/in/yatri-test-private-a/", date: "2030-01-01" }) })).json();
  ok(/Already a lead with Test A/.test(la.error ?? ""), "extension cannot touch a teammate's lead (" + (la.error ?? la.message) + ")");
  // 6. Script in a name shows as text.
  ok(!(await pa.evaluate(() => window.__xss === 1)), "no script ran from user text");

  // Members blocked from admin pages
  for (const path of ["/dashboard", "/finds", "/people", "/team", "/activity", "/preferences", "/engines", "/settings"]) {
    await pb.goto(BASE + path);
    ok(new URL(pb.url()).pathname === "/", `member sent away from ${path}`);
  }
  await pb.goto(BASE + "/me");
  ok(new URL(pb.url()).pathname === "/", "old My work link goes to Leads");

  // Admin
  await po.goto(BASE + "/dashboard");
  t = await text(po);
  ok(/Test A/.test(t) && /Test B/.test(t) && /Latest updates/.test(t), "dashboard lists members and latest updates");

  // Admin answers feedback
  await po.goto(BASE + "/feedback");
  const fid = (await db.from("feedback").select("id").eq("title", "Yatri test bug report").single()).data.id;
  await po.selectOption(`#fs-${fid}`, "planned");
  await po.fill(`#fn-${fid}`, "Fixing this week");
  await submitIn(po, `form:has(#fs-${fid})`);
  ok((await db.from("feedback").select("status").eq("id", fid).single()).data.status === "planned", "admin set the report to Planned");
  await pa.goto(BASE + "/feedback");
  ok(/Reply: Fixing this week/.test(await text(pa)) && ((await db.from("notifications").select("title").eq("member_id", A)).data ?? []).some((n) => /now Planned/.test(n.title)), "reporter sees the reply and got notified");
  // Own Auto switch on Team
  await po.goto(BASE + "/team");
  const before = (await db.from("members").select("auto_access").eq("id", owner.id).single()).data.auto_access;
  await submitIn(po, `form:has(input[name=id][value="${owner.id}"]):has(input[name=on])`);
  const after = (await db.from("members").select("auto_access").eq("id", owner.id).single()).data.auto_access;
  ok(after === !before, "admin can switch their own Auto");
  await po.goto(BASE + "/team");
  await submitIn(po, `form:has(input[name=id][value="${owner.id}"]):has(input[name=on])`);
  ok((await db.from("members").select("auto_access").eq("id", owner.id).single()).data.auto_access === before, "and switch it back");
  // Tab title and icon
  await po.goto(BASE + "/settings");
  const oldTitle = (await db.from("settings").select("value").eq("key", "tab_title").maybeSingle()).data?.value ?? "";
  await po.fill("#tab_title", "Yatri Test Tab");
  await submitIn(po, "form:has(#tab_title)");
  await po.goto(BASE + "/");
  ok((await po.title()) === "Yatri Test Tab", "admin changed the browser tab title");
  ok(Boolean(await po.locator('link[rel="icon"]').first().getAttribute("href")), "page has a tab icon");
  await po.goto(BASE + "/settings");
  await po.fill("#tab_title", oldTitle);
  await submitIn(po, "form:has(#tab_title)");
  // Claude routine switch
  const key = (await db.from("members").select("api_key").like("email", "claude-routine@%").maybeSingle()).data?.api_key;
  await po.goto(BASE + "/dashboard");
  ok(/Claude routine is on/.test(await text(po)), "dashboard shows Claude routine on");
  await submitIn(po, "form:has(input[name=on])");
  ok(await po.waitForSelector("text=Claude routine is off", { timeout: 10000 }).then(() => true, () => false), "admin turned the Claude routine off");
  if (key) {
    const b = await (await fetch(BASE + "/api/brief", { headers: { "x-api-key": key } })).json();
    ok(b.paused === true, "routine brief says paused");
    const i = await (await fetch(BASE + "/api/ingest", { method: "POST", headers: { "x-api-key": key, "content-type": "application/json" }, body: JSON.stringify({ posts: [] }) })).json();
    ok(i.paused === true, "routine finds ignored while off");
  }
  await submitIn(po, "form:has(input[name=on])");
  ok(await po.waitForSelector("text=Claude routine is on", { timeout: 10000 }).then(() => true, () => false), "turned back on");
  if (key) ok(!(await (await fetch(BASE + "/api/brief", { headers: { "x-api-key": key } })).json()).paused, "routine brief works again");
  ok(/USD\s2,000/.test(await text(po)), "dashboard shows signed value in its currency");
  await po.goto(BASE + `/?who=${B}&status=all`);
  t = await text(po);
  ok(/Yatri Test Lead One/.test(t) && !/Yatri Test Lead Two/.test(t), "admin filter by B shows only B's leads");
  await po.goto(BASE + `/?who=${A}&status=all`);
  t = await text(po);
  ok(/Yatri Test Lead Two/.test(t) && !/Yatri Test Lead One\b/.test(t), "admin filter by A shows A's own unassigned lead");
  await po.goto(BASE + `/?status=contract`);
  ok(/Yatri Test Lead One/.test(await text(po)), "Contract signed tab shows the lead");
  const nav2 = await po.locator("aside nav").innerText();
  ok(/Dashboard/.test(nav2) && /Daily finds/.test(nav2) && /Settings/.test(nav2) && !/My work|LinkedIn account|Preferences|Search engines/.test(nav2), "admin menu is short: one Settings link, no My work or LinkedIn account");
  // Mobile width no sideways scroll
  for (const w of [390, 820]) {
    await po.setViewportSize({ width: w, height: 900 });
    for (const path of ["/", "/dashboard", `/leads/${L1}`]) {
      await po.goto(BASE + path);
      const over = await po.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 1, `${path} at ${w}px has no sideways scroll (${over})`);
    }
  }
  // Phone: app style tab bar, lead cards, no zoom on fields
  await pa.setViewportSize({ width: 390, height: 844 });
  await pa.goto(BASE + "/?status=all");
  ok(await pa.locator("nav[aria-label=Main] >> text=More").isVisible(), "phone shows the bottom tab bar");
  ok(await pa.locator("ul.md\\:hidden > li").first().isVisible(), "phone shows leads as cards");
  ok(!(await pa.locator("table").first().isVisible().catch(() => false)), "the wide table is hidden on phones");
  ok((await pa.evaluate(() => getComputedStyle(document.querySelector("#q")).fontSize)) === "16px", "fields use 16px on phones, so iOS does not zoom");
  await pa.goto(BASE + `/leads/${L1}`);
  ok((await pa.locator("nav[aria-label=Main] a[aria-current=page]").innerText()).includes("Leads"), "a lead's page highlights the Leads tab");
  await pa.locator("nav[aria-label=Main] button:has-text('More')").click();
  ok(await pa.locator("[role=dialog][aria-label=More] >> text=Feedback").isVisible(), "More opens the full menu");
  // Live without reload: B changes a lead while A watches the list
  await pa.goto(BASE + "/?status=all");
  await pa.evaluate(() => (window.__stay = 1));
  await db.from("leads").update({ author: "Yatri Test Lead One Live" }).eq("id", L1);
  await db.from("lead_events").insert({ lead_id: L1, member_id: B, member_name: "Test B", kind: "edited" });
  await pa.waitForFunction(() => document.body.innerText.includes("Yatri Test Lead One Live"), null, { timeout: 12000 }).then(
    () => ok(true, "A's list showed a change made elsewhere within seconds"),
    () => ok(false, "A's list showed a change made elsewhere within seconds"),
  );
  ok(await pa.evaluate(() => window.__stay === 1), "...without reloading the page");

  const events = (await db.from("lead_events").select("kind").eq("lead_id", L1)).data.map((e) => e.kind);
  console.log("events on lead one:", events.join(", "));
} catch (e) {
  fail++; console.log("ERROR", e.message);
} finally {
  await browser.close();
  // Clean up test data
  const ids = ((await db.from("leads").select("id").like("author", "Yatri Test Lead%")).data ?? []).map((l) => l.id);
  if (ids.length) { await db.from("lead_events").delete().in("lead_id", ids); await db.from("notifications").delete().in("lead_id", ids); await db.from("leads").delete().in("id", ids); }
  await db.from("notifications").delete().in("member_id", [A, B]);
  await db.from("feedback").delete().like("title", "Yatri test%");
  // Admins were told about test reports and leads: remove those for every admin.
  await db.from("notifications").delete().or("title.ilike.%yatri test%,title.ilike.%from Test A%,title.ilike.%from Test B%,title.ilike.Test A %,title.ilike.Test B %");
  await db.from("activity").delete().in("member_id", [A, B]).then(() => {}, () => {});
  const del = await db.from("members").delete().like("email", "yatri-test-%");
  console.log("cleanup", ids.length, "leads", del.error?.message ?? "members removed");
  console.log(`\n${pass} passed, ${fail} failed`);
}
