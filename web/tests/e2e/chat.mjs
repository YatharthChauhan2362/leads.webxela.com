// Feature test for Team chat: three members in Chrome, live delivery, privacy, files, and break attempts.
// Run against a local production build on port 3123: npm run test:chat. Removes its test data at the end.
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
const api = (id, path, init = {}) => fetch(BASE + path, { ...init, headers: { cookie: `yl_session=${token(id)}`, ...(init.headers ?? {}) }, redirect: "manual" });

await db.from("members").delete().like("email", "yatri-test-chat-%");
const mk = async (n) => (await db.from("members").insert({ email: `yatri-test-chat-${n}@example.com`, name: `Chat ${n.toUpperCase()}`, role: "member", status: "active" }).select("id").single()).data.id;
const A = await mk("a"), B = await mk("b"), C = await mk("c");
const D = (await db.from("members").insert({ email: "yatri-test-chat-d@example.com", name: "Chat D", role: "admin", status: "active" }).select("id").single()).data.id;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const as = async (id) => {
  const c = await browser.newContext();
  await c.addCookies([{ name: "yl_session", value: token(id), url: BASE }]);
  const p = await c.newPage();
  p.setDefaultTimeout(20000);
  return p;
};
const pa = await as(A), pb = await as(B), pc = await as(C), pd = await as(D);
const say = async (p, text) => {
  await p.fill("#chat-text", text);
  await p.press("#chat-text", "Enter");
  await p.waitForFunction((t) => document.querySelector("#chat-text")?.value === "" && document.body.innerText.includes(t.slice(0, 20)), text);
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const stamp = Date.now();

try {
  // Everyone room, live
  await pa.goto(BASE + "/chat");
  await pb.goto(BASE + "/chat");
  ok(/Team chat/.test(await pa.locator("aside nav").first().innerText()), "Team chat is in the menu");
  ok(/Everyone/.test(await pa.locator("main").innerText()), "opens the Everyone room");
  const hello = `Hello team ${stamp}`;
  await say(pa, hello);
  const t0 = Date.now();
  await pb.waitForFunction((t) => document.body.innerText.includes(t), hello, { timeout: 8000 }).then(
    () => ok(true, `B saw A's message live, without a reload, in ${Date.now() - t0} ms`),
    () => ok(false, "B saw A's message live"),
  );

  // Unread count for C in the menu
  await pc.goto(BASE + "/");
  const cnav = await pc.locator("aside nav").innerText();
  ok(/Team chat\s*\n?\s*\d+/.test(cnav), "C sees an unread count on Team chat");

  // Group A + B
  await pa.goto(BASE + "/chat");
  await pa.click("summary:has-text('New group')");
  await pa.fill("#group-name", `Yatri Test Group ${stamp}`);
  await pa.check(`input[name=people][value="${B}"]`);
  await Promise.all([pa.waitForURL(/room=\d+/), pa.click("button:has-text('Make group')")]);
  const G = Number(new URL(pa.url()).searchParams.get("room"));
  ok(await pa.waitForSelector("text=made the group").then(() => true, () => false), "group made with a note");
  const secret = `Group secret ${stamp}`;
  await say(pa, secret);

  // C is outside: page, API read, API write
  const cp = await pc.goto(BASE + `/chat?room=${G}`);
  ok(cp.status() === 404, "C cannot open the group page");
  ok((await api(C, `/api/chat/messages?room=${G}`)).status === 404, "C cannot read the group through the API");
  ok((await api(C, "/api/chat/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: G, body: "sneaky" }) })).status === 404, "C cannot post into the group");
  ok((await api(C, "/api/chat/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: G, name: "x.png", size: 10 }) })).status === 404, "C cannot get an upload link for the group");
  await pc.goto(BASE + "/chat");
  ok(!(await pc.locator("main").innerText()).includes(secret) && !(await pc.locator("main").innerText()).includes("Yatri Test Group"), "the group is not in C's list");
  ok((await fetch(BASE + `/api/chat/messages?room=${G}`)).status === 401, "no cookie, no messages");

  // Files: picture and document from B
  await pb.goto(BASE + `/chat?room=${G}`);
  await pb.waitForFunction((t) => document.body.innerText.includes(t), secret);
  await pb.setInputFiles("#chat-file", { name: "dot.png", mimeType: "image/png", buffer: PNG });
  await pb.fill("#chat-text", "A picture");
  await pb.press("#chat-text", "Enter");
  await pb.waitForSelector('main img[alt="dot.png"]');
  await pb.setInputFiles("#chat-file", { name: "quote <b>.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") });
  await pb.click("button:has-text('Send')");
  await pb.waitForSelector("text=download");
  const files = (await db.from("chat_messages").select("id, file_name, file_path").eq("room_id", G).not("file_path", "is", null).order("id")).data;
  ok(files.length === 2 && files.every((f) => f.file_path.startsWith(`room-${G}/${B}/`)), "both files stored in B's folder for the group");
  await pa.goto(BASE + `/chat?room=${G}`);
  await pa.waitForSelector('main img[alt="dot.png"]');
  ok(await pa.evaluate(() => [...document.querySelectorAll('main img[alt="dot.png"]')].some((i) => i.complete && i.naturalWidth > 0)), "A sees B's picture");
  const html = await api(A, `/api/chat/file/${files[1].id}`);
  const signed = html.headers.get("location") ?? "";
  const got = signed ? await fetch(signed) : null;
  ok(html.status === 307 && /attachment/.test(got?.headers.get("content-disposition") ?? ""), "an HTML file downloads instead of opening as a page");
  ok((await api(C, `/api/chat/file/${files[0].id}`)).status === 404, "C cannot open the group's files");
  const pub = await fetch(`${env.SUPABASE_URL}/storage/v1/object/public/chat/${files[0].file_path}`);
  ok(pub.status >= 400, "files are not public in storage");

  // Tampered file path: pointing a message at someone else's file
  const tamper = await api(C, "/api/chat/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room: (await db.from("chat_rooms").select("id").eq("kind", "everyone").limit(1).single()).data.id, body: "", file: { path: files[0].file_path, name: "stolen.png", type: "image/png", size: 10 } }),
  });
  ok(tamper.status === 403, "C cannot attach a file from another room or person");
  const traverse = await api(B, "/api/chat/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: G, body: "", file: { path: `room-${G}/${B}/../../room-1/x`, name: "x", type: "x", size: 1 } }) });
  ok(traverse.status === 403, "path tricks are refused");

  // Cross site, too long, empty
  ok((await api(A, "/api/chat/messages", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ room: G, body: "csrf" }) })).status === 403, "posts from other sites are refused");
  ok((await api(A, "/api/chat/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: G, body: "x".repeat(4001) }) })).status === 400, "messages over 4000 characters are refused");
  ok((await api(A, "/api/chat/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: G, body: "   " }) })).status === 400, "empty messages are refused");
  ok((await api(A, "/api/chat/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: G, name: "big.zip", size: 26 * 1024 * 1024 }) })).status === 400, "files over 25 MB are refused");

  // Script in a message stays text, links work
  await say(pa, `<img src=x onerror="window.__x=1"> see https://example.com/page ${stamp}`);
  await pb.waitForFunction((t) => document.body.innerText.includes(t), `see https://example.com/page ${stamp}`);
  ok(!(await pb.evaluate(() => window.__x === 1)), "no script ran from a message");
  ok((await pb.locator('main a[href="https://example.com/page"]').getAttribute("rel"))?.includes("noopener"), "links open safely");

  // Delete own message, and not someone else's
  const mine = (await db.from("chat_messages").select("id").eq("room_id", G).eq("member_id", A).order("id", { ascending: false }).limit(1).single()).data.id;
  ok((await api(B, `/api/chat/messages?id=${mine}`, { method: "DELETE" })).status === 403, "B cannot delete A's message");
  const del = pa.locator("main section button", { hasText: /^Delete$/ }).last();
  await del.click();
  await pa.locator("main section button", { hasText: "Tap again to delete" }).click();
  await pa.waitForSelector("text=Message deleted", { timeout: 8000 }).catch(() => {});
  ok((await db.from("chat_messages").select("deleted_at, body").eq("id", mine).single()).data.deleted_at !== null, "A deleted their own message");

  // Direct message A to C
  await pa.goto(BASE + "/chat");
  await pa.click("summary:has-text('Message someone')");
  await pa.selectOption("#dm-person", C);
  await Promise.all([pa.waitForURL(/room=\d+/), pa.click("button:has-text('Open chat')")]);
  const D = Number(new URL(pa.url()).searchParams.get("room"));
  await say(pa, `Just for you ${stamp}`);
  await pc.goto(BASE + `/chat?room=${D}`);
  await pc.waitForFunction((t) => document.body.innerText.includes(t), `Just for you ${stamp}`);
  ok(/Chat A/.test(await pc.locator("main h2").innerText()), "C sees the direct chat titled with A's name");
  ok((await pb.goto(BASE + `/chat?room=${D}`)).status() === 404, "B cannot read A and C's direct chat");
  // Opening the same direct chat again reuses it
  await pa.goto(BASE + "/chat");
  await pa.click("summary:has-text('Message someone')");
  await pa.selectOption("#dm-person", C);
  await Promise.all([pa.waitForURL(/room=\d+/), pa.click("button:has-text('Open chat')")]);
  ok(Number(new URL(pa.url()).searchParams.get("room")) === D, "one direct chat per pair");

  // Team admin D is not in the group: can manage people, cannot read
  await pd.goto(BASE + "/chat?manage=1");
  ok(/Manage groups/.test(await pd.locator("main").innerText()) && /Yatri Test Group/.test(await pd.locator("main").innerText()), "team admin sees every group in Manage groups");
  ok(!(await pd.locator("main").innerText()).includes(secret), "Manage groups shows no messages");
  await pd.selectOption(`#add-${G}`, C);
  await Promise.all([pd.waitForURL(/ok=Added/), pd.locator(`form:has(#add-${G}) button`).click()]);
  ok((await db.from("chat_members").select("member_id").eq("room_id", G).eq("member_id", C).maybeSingle()).data !== null, "team admin added C to the group");
  ok((await pd.goto(BASE + `/chat?room=${G}`)).status() === 404, "team admin still cannot read a group they are not in");
  await pd.goto(BASE + "/chat?manage=1");
  await Promise.all([pd.waitForURL(/ok=Removed/), pd.locator(`form:has(input[name=person][value="${C}"]):has(input[name=room][value="${G}"]) button`).click()]);
  ok((await db.from("chat_members").select("member_id").eq("room_id", G).eq("member_id", C).maybeSingle()).data === null, "team admin removed C from the group");
  await pc.goto(BASE + "/chat?manage=1");
  ok(!/Manage groups/.test(await pc.locator("main").innerText()), "members cannot open Manage groups");

  // Group admin powers: B is not admin
  await pb.goto(BASE + `/chat?room=${G}`);
  await pb.locator("header summary", { hasText: /^Group$/ }).click();
  ok(await pb.locator("button:has-text('Leave group')").isVisible(), "group menu opens");
  ok((await pb.locator("button:has-text('Delete group')").count()) === 0 && (await pb.locator("button:has-text('Rename')").count()) === 0, "only group admins see rename and delete");
  await pa.goto(BASE + `/chat?room=${G}`);
  await pa.locator("header summary", { hasText: /^Group$/ }).click();
  ok((await pa.locator("button:has-text('Delete group')").count()) === 1 && (await pa.locator("button:has-text('Rename')").isVisible()), "the group's admin sees rename and delete");
  await pa.fill("#rename", `Yatri Test Renamed ${stamp}`);
  await Promise.all([pa.waitForURL(/ok=Renamed/), pa.click("button:has-text('Rename')")]);
  ok(/Yatri Test Renamed/.test(await pa.locator("main h2").innerText()), "admin renamed the group");
  pb.once("dialog", (d) => d.accept());
  await Promise.all([pb.waitForURL(/\/chat\?/), pb.click("button:has-text('Leave group')")]);
  ok((await pb.goto(BASE + `/chat?room=${G}`)).status() === 404, "after leaving, B cannot open the group");

  // Phone layout
  for (const w of [390, 820]) {
    await pa.setViewportSize({ width: w, height: 800 });
    for (const path of [`/chat?room=${G}`, "/chat?list=1"]) {
      await pa.goto(BASE + path);
      const over = await pa.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(over <= 1, `${path} at ${w}px has no sideways scroll (${over})`);
    }
  }
  await pa.setViewportSize({ width: 390, height: 800 });
  await pa.goto(BASE + `/chat?room=${G}`);
  ok(await pa.locator("#chat-text").isVisible(), "message box visible on a phone");
} catch (e) {
  fail++;
  console.log("ERROR", e.message);
} finally {
  await browser.close();
  const ids = [A, B, C, D];
  const paths = ((await db.from("chat_messages").select("file_path").in("member_id", ids).not("file_path", "is", null)).data ?? []).map((f) => f.file_path);
  if (paths.length) await db.storage.from("chat").remove(paths);
  await db.from("chat_rooms").delete().in("created_by", ids);
  await db.from("chat_messages").delete().in("member_id", ids);
  await db.from("chat_messages").delete().is("member_id", null).like("body", "%Chat %");
  await db.from("members").delete().in("id", ids);
  console.log("cleanup done");
  console.log(`\n${pass} passed, ${fail} failed`);
}
