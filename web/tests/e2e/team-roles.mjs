// Role changes on the Team page: admins can make admins, only the owner makes owners or demotes admins.
// Run against a local production build on port 3123: npm run test:roles. Removes its test data at the end.
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
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

await db.from("members").delete().like("email", "yatri-test-res-%");

await db.from("members").delete().like("email", "yatri-test-role-%");
const mk = async (n, role) => (await db.from("members").insert({ email: `yatri-test-role-${n}@example.com`, name: `Role ${n.toUpperCase()}`, role, status: "active", login_with: "google" }).select("id").single()).data.id;
const ADMIN = await mk("admin", "admin"), OTHER = await mk("other", "admin"), MEM = await mk("member", "member"), OWNER = await mk("owner", "owner");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const as = async (id) => {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await c.addCookies([{ name: "yl_session", value: token(id), url: BASE }]);
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  return p;
};
const roleOf = async (id) => (await db.from("members").select("role").eq("id", id).single()).data.role;
const saveRow = async (p, id) => Promise.all([p.waitForURL(/(ok|error)=/), p.click(`button[form="m-${id}"]:has-text("Save"), form#m-${id} button:has-text("Save")`)]);

try {
  const pa = await as(ADMIN);
  await pa.goto(BASE + "/team");
  const opts = await pa.locator(`select[form="m-${MEM}"][name=role] option`).allTextContents();
  ok(opts.includes("Admin"), "an admin can pick Admin for a member");
  ok(!opts.includes("Owner"), "an admin cannot pick Owner");
  await pa.selectOption(`select[form="m-${MEM}"][name=role]`, "admin");
  await saveRow(pa, MEM);
  ok((await roleOf(MEM)) === "admin", "admin made a member an admin");
  ok((await pa.locator(`select[form="m-${OTHER}"][name=role]`).count()) === 0, "an admin cannot change another admin");

  const po = await as(OWNER);
  await po.goto(BASE + "/team");
  ok((await po.locator(`select[form="m-${MEM}"][name=role] option`).allTextContents()).includes("Owner"), "the owner can pick Owner");
  await po.selectOption(`select[form="m-${MEM}"][name=role]`, "member");
  await saveRow(po, MEM);
  ok((await roleOf(MEM)) === "member", "the owner can turn an admin back into a member");

  const pm = await as(MEM);
  const r = await pm.goto(BASE + "/team");
  ok(!/\/team/.test(pm.url()) || r.status() >= 300, "members cannot open the Team page");
} catch (e) {
  fail++;
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  await db.from("members").delete().in("id", [ADMIN, OTHER, MEM, OWNER]);
  console.log("cleanup done");
  console.log(`\n${pass} passed, ${fail} failed`);
}
