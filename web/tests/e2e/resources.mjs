// Feature test for Resources: an admin adds items and a file in Chrome, a member reads them, and admins only items stay hidden.
// Run against a local production build on port 3123: npm run test:resources. Removes its test data at the end.
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "");
const require = createRequire(WEB + "/package.json");
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright-core");
const env = Object.fromEntries(
  readFileSync(WEB + "/.env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE || "http://localhost:3123";
const token = (id) => {
  const p = Buffer.from(JSON.stringify({ m: id, e: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `${p}.${createHmac("sha256", env.SESSION_SECRET).update(p).digest("base64url")}`;
};
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : fail++; console.log(c ? "PASS" : "FAIL", msg); };
const api = (id, path, init = {}) => fetch(BASE + path, { ...init, headers: { cookie: `yl_session=${token(id)}`, ...(init.headers ?? {}) }, redirect: "manual" });

await db.from("members").delete().like("email", "yatri-test-res-%");
const mk = async (n, role) => (await db.from("members").insert({ email: `yatri-test-res-${n}@example.com`, name: `Res ${n.toUpperCase()}`, role, status: "active" }).select("id").single()).data.id;
const ADMIN = await mk("admin", "admin"), MEM = await mk("member", "member");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const as = async (id) => {
  const c = await browser.newContext();
  await c.addCookies([{ name: "yl_session", value: token(id), url: BASE }]);
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  return p;
};
const pa = await as(ADMIN), pm = await as(MEM);
const stamp = Date.now();
const dir = mkdtempSync(join(tmpdir(), "res-"));
const deck = join(dir, "test-deck.pdf");
writeFileSync(deck, "%PDF-1.4\n% test deck\n");

async function add(p, { category, title, value = "", url = "", phone = "", email = "", file = null, adminsOnly = false }) {
  await p.goto(BASE + "/resources?add=1");
  await p.selectOption("#new-category", category);
  await p.fill("#new-title", title);
  if (phone) await p.fill("#new-phone", phone);
  if (email) await p.fill("#new-email", email);
  if (value) await p.fill("#new-value", value);
  if (url) await p.fill("#new-url", url);
  if (file) {
    await p.setInputFiles("#new-file", file);
    await p.waitForSelector("text=Uploaded. Save to keep it.");
  }
  if (adminsOnly) await p.check("form:has(#new-title) input[name=admins_only]");
  await Promise.all([p.waitForURL(/ok=/), p.click("form:has(#new-title) button[type=submit]")]);
}

try {
  await pa.goto(BASE + "/resources");
  ok(/Resources/.test(await pa.locator("aside nav").first().innerText()), "Resources is in the admin menu");
  await pm.goto(BASE + "/resources");
  ok(/Resources/.test(await pm.locator("aside nav").first().innerText()), "Resources is in the member menu");
  ok((await pm.locator("a:has-text('Add an item')").count()) === 0, "members get no Add button");
  await pm.goto(BASE + "/resources?add=1");
  ok((await pm.locator("#new-title").count()) === 0, "members cannot open the Add form by link");

  await add(pa, { category: "social", title: `Test LinkedIn ${stamp}`, url: "https://www.linkedin.com/company/example" });
  await add(pa, { category: "contact", title: `Test founder ${stamp}`, phone: "+91 98765 43210", email: "founder@example.com" });
  await add(pa, { category: "document", title: `Test pitch deck ${stamp}`, file: deck });
  await add(pa, { category: "bank", title: `Test bank ${stamp}`, value: `Account 000111222 ${stamp}`, adminsOnly: true });
  const main = await pa.locator("main").innerText();
  ok(main.includes(`Test bank ${stamp}`) && main.includes("Admins only"), "admin sees the admins only item, marked");
  ok(/Pitch deck and documents/.test(main) && /Founders and contacts/.test(main), "items sit under their sections");

  const rows = (await db.from("resources").select("id, title, file_path, admins_only").like("title", `%${stamp}`)).data;
  ok(rows.length === 4, "four items saved");
  const bank = rows.find((r) => r.admins_only), doc = rows.find((r) => r.file_path);
  ok(doc?.file_path?.startsWith("items/"), "file stored in the private bucket");

  // Member view
  await pm.goto(BASE + "/resources");
  const mtext = await pm.locator("main").innerText();
  ok(mtext.includes(`Test LinkedIn ${stamp}`) && mtext.includes(`Test pitch deck ${stamp}`), "member sees team items");
  ok(!mtext.includes(`Test bank ${stamp}`) && !mtext.includes("000111222"), "member does not see the admins only item");
  ok(!(await pm.content()).includes("000111222"), "admins only details are not in the member's page source");
  ok((await pm.locator(`a[href^="tel:+919876543210"]`).count()) === 1, "phone gets a Call button");
  ok((await pm.locator(`a[href="https://wa.me/919876543210"]`).count()) === 1, "phone gets a WhatsApp button");
  ok((await pm.locator(`a[href="mailto:founder@example.com"]`).count()) === 1, "email gets an Email button");
  ok((await pm.locator("a:has-text('Edit')").count()) === 0, "members get no Edit links");
  await pm.goto(BASE + `/resources?edit=${doc.id}`);
  ok((await pm.locator("input[name=title]").count()) === 0, "members cannot open the Edit form by link");
  await pm.goto(BASE + "/resources?section=document");
  const only = await pm.locator("main").innerText();
  ok(only.includes(`Test pitch deck ${stamp}`) && !only.includes(`Test LinkedIn ${stamp}`), "a section tab shows only that section");
  await pm.goto(BASE + `/resources?q=${encodeURIComponent("98765")}`);
  const found = await pm.locator("main").innerText();
  ok(found.includes(`Test founder ${stamp}`) && !found.includes(`Test pitch deck ${stamp}`), "find by phone number works");

  // Files
  const mf = await api(MEM, `/api/resources/file/${doc.id}`);
  ok(mf.status === 307 && /supabase/.test(mf.headers.get("location") ?? ""), "member opens the pitch deck through a short link");
  const signed = await fetch(mf.headers.get("location"));
  ok(signed.ok && (await signed.text()).includes("test deck"), "the file downloads intact");
  ok((await fetch(BASE + `/api/resources/file/${doc.id}`, { redirect: "manual" })).status === 401, "no cookie, no file");
  ok((await db.storage.from("resources").getPublicUrl(doc.file_path).data.publicUrl) && (await fetch(db.storage.from("resources").getPublicUrl(doc.file_path).data.publicUrl)).status >= 400, "the bucket is not public");

  // Break attempts by the member
  await db.from("resources").update({ file_path: doc.file_path }).eq("id", bank.id);
  ok((await api(MEM, `/api/resources/file/${bank.id}`)).status === 404, "member cannot open an admins only file");
  ok((await api(ADMIN, `/api/resources/file/${bank.id}`)).status === 307, "admin can open it");
  await db.from("resources").update({ file_path: null }).eq("id", bank.id);
  const up = await api(MEM, "/api/resources/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x.pdf", size: 10 }) });
  ok(up.status === 403, "member cannot get an upload link");
  const big = await api(ADMIN, "/api/resources/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "x.pdf", size: 60 * 1024 * 1024 }) });
  ok(big.status === 400, "files over 50 MB are refused");
  const cross = await api(ADMIN, "/api/resources/upload", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ name: "x.pdf", size: 10 }) });
  ok(cross.status === 403, "other sites cannot ask for an upload link");

  await pa.goto(BASE + "/resources?add=1");
  await pa.fill("#new-title", `Test bad phone ${stamp}`);
  await pa.fill("#new-phone", "call me maybe");
  await Promise.all([pa.waitForURL(/error=/), pa.click("form:has(#new-title) button[type=submit]")]);
  ok(/Phone numbers can have digits/.test(await pa.locator("main").innerText()), "a phone with letters is refused");

  // Admin edit and remove
  const founder = rows.find((r) => r.title === `Test founder ${stamp}`);
  await pa.goto(BASE + `/resources?edit=${founder.id}`);
  await pa.fill(`#r${founder.id}-email`, "Founder2@Example.com");
  await Promise.all([pa.waitForURL(/ok=Saved/), pa.click("#form button:has-text('Save')")]);
  ok((await pa.locator(`a[href="mailto:founder2@example.com"]`).count()) === 1, "edit saved, email stored in lower case");
  pa.on("dialog", (d) => d.accept());
  await pa.goto(BASE + `/resources?edit=${doc.id}`);
  await Promise.all([pa.waitForURL(/ok=Removed/), pa.click("button:has-text('Remove this item')")]);
  const gone = (await db.storage.from("resources").list("items", { search: doc.file_path.slice(6) })).data ?? [];
  ok(gone.length === 0, "removing an item deletes its file");

  // Phone layout
  for (const w of [390, 820]) {
    for (const p of [pa, pm]) {
      await p.setViewportSize({ width: w, height: 800 });
      await p.goto(BASE + "/resources");
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 1, `${p === pa ? "admin" : "member"} at ${w}px has no sideways scroll (${over})`);
    }
  }
} catch (e) {
  fail++;
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  const left = (await db.from("resources").select("file_path").like("title", `%${stamp}`)).data ?? [];
  const paths = left.map((r) => r.file_path).filter(Boolean);
  if (paths.length) await db.storage.from("resources").remove(paths);
  await db.from("resources").delete().like("title", `%${stamp}`);
  await db.from("members").delete().in("id", [ADMIN, MEM]);
  console.log("cleanup done");
  console.log(`\n${pass} passed, ${fail} failed`);
}
