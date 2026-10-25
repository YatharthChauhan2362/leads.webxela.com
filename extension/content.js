// Reads posts and contact info from LinkedIn pages you have open, and hands them to background.js.
// It only reads what is on the page. The one click it makes is opening Contact info when you press Find.

(() => {
  // The popup may load this file again into a tab that already has it.
  if (window.__yatriLeadsLoaded) return;
  window.__yatriLeadsLoaded = true;
  const sent = new Set();
  let enabled = true;

  // After the extension is reloaded or updated, this old copy stays in open tabs with no extension behind it.
  // Then every chrome.* call throws "Extension context invalidated". Detect that and switch off quietly.
  const alive = () => {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  };
  const safeSend = (msg, cb) => {
    if (!alive()) return cb && cb(undefined, true);
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        const failed = Boolean(chrome.runtime.lastError);
        cb && cb(failed ? undefined : r, failed);
      });
    } catch {
      cb && cb(undefined, true);
    }
  };
  // The app's name and colour, so the buttons on LinkedIn match it.
  let BRAND = { first: "Yatri", second: "Leads", color: "#0080FF" };
  try {
    chrome.storage.local.get({ brand: null, capture: true }, (s) => {
      if (s.brand) BRAND = s.brand;
      enabled = s.capture;
      // Wait for the rest of this file to set up before the first scan.
      setTimeout(schedule, 0);
    });
    chrome.storage.onChanged.addListener((c) => {
      if (c.brand?.newValue) BRAND = c.brand.newValue;
      if (c.capture) enabled = c.capture.newValue;
    });
  } catch {
    return;
  }

  const clean = (s) => (s || "").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const firstText = (root, sels) => {
    for (const sel of sels) {
      const el = root.querySelector(sel);
      const t = el && clean(el.innerText);
      if (t) return t;
    }
    return "";
  };
  const abs = (href) => {
    try {
      return new URL(href, location.origin).href.split("?")[0];
    } catch {
      return null;
    }
  };

  const URN_RE = /urn:li:(?:activity|ugcPost|share):\d+/;

  function postContainers() {
    const found = new Set();
    document
      .querySelectorAll('[data-urn*="urn:li:activity:"], [data-urn*="urn:li:ugcPost:"], [data-urn*="urn:li:share:"], [data-id*="urn:li:activity:"], [data-id*="urn:li:ugcPost:"]')
      .forEach((el) => {
        // Use the outermost post box, not nested reshares.
        const outer = el.parentElement && el.parentElement.closest('[data-urn*="urn:li:"], [data-id*="urn:li:"]');
        found.add(outer && URN_RE.test(outer.getAttribute("data-urn") || outer.getAttribute("data-id") || "") ? outer : el);
      });
    // Newer layouts: find posts through their "update" links when the data attributes are missing.
    if (!found.size) {
      document.querySelectorAll('a[href*="/feed/update/urn:li:"]').forEach((a) => {
        const box = a.closest("article, [role='article'], li, .feed-shared-update-v2");
        if (box) found.add(box);
      });
    }
    return [...found];
  }

  function readPost(box) {
    const attr = box.getAttribute("data-urn") || box.getAttribute("data-id") || "";
    let urn = (attr.match(URN_RE) || [])[0];
    if (!urn) {
      const link = box.querySelector('a[href*="/feed/update/urn:li:"]');
      urn = link && (link.getAttribute("href").match(URN_RE) || [])[0];
    }
    if (!urn) return null;

    let text = firstText(box, [
      ".update-components-text",
      ".feed-shared-update-v2__description",
      ".feed-shared-inline-show-more-text",
      ".feed-shared-text",
      '[data-test-id="main-feed-activity-card__commentary"]',
    ]);
    if (!text) {
      // Fall back to the longest block of text in the post.
      let best = "";
      box.querySelectorAll('span[dir="ltr"], div[dir="ltr"], p').forEach((el) => {
        const t = clean(el.innerText);
        if (t.length > best.length) best = t;
      });
      text = best;
    }
    text = text.replace(/\n?…\s*(see more|more)$/i, "").trim();
    if (text.length < 20) return null;

    const actorLink =
      box.querySelector(".update-components-actor__meta-link, a.update-components-actor__image, .update-components-actor__container a[href*='/in/']") ||
      box.querySelector('a[href*="/in/"], a[href*="/company/"]');
    let author = firstText(box, [
      ".update-components-actor__title span[aria-hidden='true']",
      ".update-components-actor__name span[aria-hidden='true']",
      ".update-components-actor__title",
      ".update-components-actor__name",
    ]);
    author = author.split("\n")[0].replace(/\s*•.*$/, "").trim();
    // Newer LinkedIn layouts hide the old class names. Try the profile link's visible text,
    // then the "View X's profile" labels LinkedIn puts on links and photos.
    if (!author) {
      const named = box.querySelector('a[href*="/in/"] span[aria-hidden="true"], a[href*="/company/"] span[aria-hidden="true"]');
      author = clean(named?.innerText || "").split("\n")[0];
    }
    if (!author) {
      const labelled = [...box.querySelectorAll('a[href*="/in/"][aria-label], a[href*="/company/"][aria-label], img[alt]')]
        .map((el) => el.getAttribute("aria-label") || el.getAttribute("alt") || "")
        .map((t) => (t.match(/^View:?\s*(.+?)(?:[’']s)?\s+(?:profile|graphic link|page|company)/i) || [])[1])
        .find(Boolean);
      author = (labelled || "").trim();
    }
    if (!author && actorLink) author = clean(actorLink.innerText || "").split("\n")[0].replace(/\s*•.*$/, "").trim();
    author = author.replace(/\s*(Verified|Premium|Profile|Follow|\d+(st|nd|rd|th)\+?)$/i, "").trim();
    const headline = firstText(box, [
      ".update-components-actor__description span[aria-hidden='true']",
      ".update-components-actor__description",
    ]).split("\n")[0];
    const postedAt = firstText(box, [
      ".update-components-actor__sub-description span[aria-hidden='true']",
      ".update-components-actor__sub-description",
    ])
      .split("•")[0]
      .trim();

    // On someone's activity page every post is theirs.
    const own = location.pathname.match(/^\/in\/([^/]+)\/recent-activity/);
    let authorUrl = actorLink ? abs(actorLink.getAttribute("href")) : null;
    if (own && !authorUrl) authorUrl = `https://www.linkedin.com/in/${own[1]}/`;
    if (!author && own) author = clean(document.querySelector("h1, h3")?.innerText || "").split("\n")[0];

    return {
      source: "linkedin",
      postId: urn,
      postUrl: `https://www.linkedin.com/feed/update/${urn}/`,
      author: author || null,
      authorUrl,
      headline: headline || null,
      text: text.slice(0, 20000),
      postedAt: postedAt || null,
    };
  }

  function readContactDialog() {
    const m = location.pathname.match(/^\/in\/([^/]+)/);
    const dialog = document.querySelector('[role="dialog"]');
    const emails = [];
    const phones = [];
    const websites = [];
    if (dialog) {
      dialog.querySelectorAll('a[href^="mailto:"]').forEach((a) => emails.push(a.getAttribute("href").slice(7)));
      dialog.querySelectorAll('a[href^="tel:"]').forEach((a) => phones.push(a.getAttribute("href").slice(4)));
      dialog.querySelectorAll("section").forEach((sec) => {
        const head = clean(sec.querySelector("h3")?.innerText || "");
        const body = clean(sec.innerText.replace(head, ""));
        if (/^phone/i.test(head)) body.split("\n").forEach((l) => /\d{6,}/.test(l.replace(/\D/g, "")) && phones.push(l.replace(/\((mobile|work|home)\)/i, "").trim()));
        if (/^email/i.test(head)) body.split("\n").forEach((l) => l.includes("@") && emails.push(l.trim()));
        if (/website/i.test(head)) sec.querySelectorAll("a[href^='http']").forEach((a) => websites.push(a.href));
      });
    }
    return {
      url: m ? `https://www.linkedin.com/in/${m[1]}/` : location.href,
      name: clean(document.querySelector("main h1")?.innerText || "").split("\n")[0] || null,
      headline: clean(document.querySelector("main .text-body-medium")?.innerText || "") || null,
      emails: [...new Set(emails)],
      phones: [...new Set(phones)],
      websites: [...new Set(websites)],
      found: Boolean(dialog),
    };
  }

  // Opens this profile's own Contact info box, reads it and closes it again, so you stay on the page.
  // Emails and phone numbers people write in their headline, About or Featured text.
  function contactsInPageText() {
    const main = document.querySelector("main");
    if (!main) return { emails: [], phones: [] };
    const text = main.innerText;
    const emails = [...new Set((text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g) || []).map((e) => e.toLowerCase()))];
    // Only numbers written with a country code, so follower counts and dates are never picked up.
    const phones = [...new Set((text.match(/\+\d{1,3}[\s.-]?\(?\d{2,5}\)?(?:[\s.-]?\d{2,5}){2,4}/g) || []).filter((p) => {
      const d = p.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 15;
    }))];
    return { emails, phones };
  }

  async function findContactHere() {
    const m = location.pathname.match(/^\/in\/([^/]+)/);
    if (!m) return null;
    const fromPage = contactsInPageText();
    const link = document.querySelector('#top-card-text-details-contact-info, a[href*="/overlay/contact-info"]');
    if (!link) {
      // No Contact info link on this layout. Still return what the page text shows.
      return {
        url: `https://www.linkedin.com/in/${m[1]}/`,
        name: clean(document.querySelector("main h1")?.innerText || "").split("\n")[0] || null,
        headline: clean(document.querySelector("main .text-body-medium")?.innerText || "") || null,
        emails: fromPage.emails,
        phones: fromPage.phones,
        websites: [],
        found: true,
        ...readCompany(),
        location: readLocation(),
        photo: readPhoto(),
      };
    }
    const startPath = location.pathname;
    link.click();
    let dialog = null;
    for (let i = 0; i < 20; i++) {
      dialog = document.querySelector('[role="dialog"]');
      if (dialog && /contact info/i.test(dialog.innerText) && dialog.querySelector("section, a")) break;
      await sleep(400);
    }
    await sleep(500);
    const data = readContactDialog();
    data.url = `https://www.linkedin.com/in/${m[1]}/`;
    // Close the box the way you would: its close button, or Back if LinkedIn changed the address.
    const close = dialog && dialog.querySelector('button[aria-label*="ismiss"], button[aria-label*="lose"]');
    if (close) close.click();
    await sleep(300);
    if (location.pathname !== startPath && /overlay\/contact-info/.test(location.pathname)) history.back();
    if (!data.found) return null;
    Object.assign(data, readCompany(), { location: readLocation(), photo: readPhoto() });
    data.emails = [...new Set([...data.emails, ...fromPage.emails])];
    data.phones = [...new Set([...data.phones, ...fromPage.phones])];
    return data;
  }

  // Current company: the top card button, else the first job in Experience, else "@ Company" in the headline.
  function readCompany() {
    const btn = document.querySelector('main [aria-label^="Current company"]');
    const fromBtn = btn && (btn.getAttribute("aria-label").match(/Current company:\s*(.+?)(?:\.\s*Click|$)/i) || [])[1];
    const exp = document.querySelector("#experience")?.closest("section");
    const link = exp && exp.querySelector('a[href*="/company/"]');
    const logo = link && link.querySelector("img[alt]");
    const fromExp = logo ? logo.getAttribute("alt").replace(/\s*logo$/i, "") : null;
    const headline = clean(document.querySelector("main .text-body-medium")?.innerText || "");
    const fromHeadline = (headline.match(/(?:@|\bat\b)\s+([A-Z0-9][^|,•·\n@]{1,60})/) || [])[1];
    return {
      company: (fromBtn || fromExp || fromHeadline || "").trim() || null,
      companyUrl: link ? abs(link.getAttribute("href")) : null,
    };
  }

  // Their profile photo from the top of the page, for the profile card.
  function readPhoto() {
    const img =
      document.querySelector('main img.pv-top-card-profile-picture__image--show, main img.pv-top-card-profile-picture__image, main .pv-top-card__photo img, main img[class*="profile-picture"]') ||
      [...document.querySelectorAll("main img")].find((i) => i.naturalWidth >= 80 && /^https:/.test(i.src) && !/background|banner/i.test(i.className));
    return img && /^https:/.test(img.src) ? img.src : null;
  }

  function readLocation() {
    const el = document.querySelector("main .text-body-small.inline, main span.text-body-small.inline.t-black--light");
    return clean(el?.innerText || "") || null;
  }

  function readProfile() {
    const m = location.pathname.match(/^\/in\/([^/]+)/);
    if (!m) return null;
    const url = `https://www.linkedin.com/in/${m[1]}/`;
    const name = clean(document.querySelector("main h1")?.innerText || "").split("\n")[0] || null;
    const headline = clean(document.querySelector("main .text-body-medium")?.innerText || "") || null;
    const { company, companyUrl } = readCompany();
    const fromPage = contactsInPageText();

    // The Contact info window opens at /in/<slug>/overlay/contact-info/.
    const dialog = document.querySelector('[role="dialog"]');
    const emails = [];
    const phones = [];
    const websites = [];
    if (dialog && /contact info/i.test(dialog.innerText)) {
      dialog.querySelectorAll('a[href^="mailto:"]').forEach((a) => emails.push(a.getAttribute("href").slice(7)));
      dialog.querySelectorAll('a[href^="tel:"]').forEach((a) => phones.push(a.getAttribute("href").slice(4)));
      dialog.querySelectorAll("section").forEach((sec) => {
        const head = clean(sec.querySelector("h3")?.innerText || "");
        const body = clean(sec.innerText.replace(head, ""));
        if (/^phone/i.test(head)) body.split("\n").forEach((l) => /\d{6,}/.test(l.replace(/\D/g, "")) && phones.push(l.replace(/\((mobile|work|home)\)/i, "").trim()));
        if (/^email/i.test(head)) body.split("\n").forEach((l) => l.includes("@") && emails.push(l.trim()));
        if (/website/i.test(head)) sec.querySelectorAll("a[href^='http']").forEach((a) => websites.push(a.href));
      });
    }
    emails.push(...fromPage.emails);
    phones.push(...fromPage.phones);
    if (!name && !emails.length && !phones.length) return null;
    // Every profile you open is saved once per visit, with whatever it shows.
    const key = `profile:${url}:${company}:${emails.join()}:${phones.join()}`;
    if (sent.has(key)) return null;
    sent.add(key);
    return { url, name, headline, company, companyUrl, location: readLocation(), photo: readPhoto(), emails: [...new Set(emails)], phones: [...new Set(phones)], websites };
  }

  function scan() {
    if (!enabled) return Promise.resolve({ posts: 0 });
    const posts = [];
    for (const box of postContainers()) {
      const p = readPost(box);
      if (p && !sent.has(p.postId)) {
        sent.add(p.postId);
        posts.push(p);
      }
    }
    const profile = readProfile();
    const profiles = profile ? [profile] : [];
    if (!posts.length && !profiles.length) return Promise.resolve({ posts: 0 });
    return new Promise((resolve) => {
      safeSend({ type: "ingest", posts, profiles }, (res, failed) => {
        if (failed) {
          // The extension was reloaded; let these be sent again next time.
          posts.forEach((p) => sent.delete(p.postId));
          return resolve({ posts: 0 });
        }
        resolve({ posts: posts.length, ...(res || {}) });
      });
    });
  }

  // ---------- Buttons on the page, like Apollo: find contact, save lead ----------

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 12px; border-top: 1px solid #e6e6e6; border-bottom: 1px solid #e6e6e6; background: #fff; }
    .tag { font-size: 12px; font-weight: 700; color: var(--b); margin-right: 4px; }
    button { height: 32px; padding: 0 12px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid #e6e6e6; background: #fff; color: #171717; }
    button:hover { background: var(--b); color: #fff; border-color: var(--b); }
    button.primary { background: var(--b); color: #fff; border-color: var(--b); }
    button.primary:hover { filter: brightness(0.9); }
    button:disabled { opacity: .6; cursor: default; }
    .out { width: 100%; font-size: 13px; color: #171717; line-height: 1.5; }
    .out:empty { display: none; }
    .row { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 4px 0; border-top: 1px solid #f0f0f0; }
    .row:first-child { border-top: 0; }
    .row span { overflow-wrap: anywhere; }
    .row small { color: #616161; display: block; font-size: 11px; }
    .row button { height: 26px; padding: 0 8px; font-size: 12px; }
    .muted { color: #616161; }
    .err { color: #bf2121; }
    .panel { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; width: 300px; background: #fff; border: 1px solid #e6e6e6; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,.08); padding: 14px; }
    .panel h3 { margin: 0 0 2px; font-size: 15px; } .panel h3 b { color: var(--b); }
    .panel .who { font-size: 13px; color: #616161; margin-bottom: 10px; }
    .panel .btns { display: grid; gap: 6px; }
    .panel .btns button { width: 100%; height: 38px; }
    .panel .close { position: absolute; top: 8px; right: 8px; height: 26px; border: 0; color: #616161; }
    .pill { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; }
  `;

  function mount(host, html) {
    host.style.setProperty("--b", BRAND.color || "#0080FF");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>${html}`;
    return root;
  }

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function showContacts(out, res) {
    if (!res || res.error) {
      out.innerHTML = `<span class="err">${esc(res?.error || "Could not reach the leads app. Open the extension and check it says Connected.")}</span>`;
      return;
    }
    const c = res.contacts || { emails: [], phones: [], websites: [] };
    const w = res.workEmail;
    const WORD = { found: "Found", likely: "Likely", guess: "Guess" };
    const rows = [
      ...(w && !c.emails.includes(w.email) ? [[`Work email, ${WORD[w.status] || "Guess"} ${w.confidence ?? ""}%`, w.email]] : []),
      ...c.emails.map((v) => ["Email", v]),
      ...c.phones.map((v) => ["Phone", v]),
      ...c.websites.slice(0, 2).map((v) => ["Website", v]),
    ];
    out.innerHTML = rows.length
      ? rows.map(([k, v]) => `<div class="row"><span><small>${k}</small>${esc(v)}</span><button data-copy="${esc(v)}">Copy</button></div>`).join("") +
        (w && w.note ? `<div class="muted">${esc(w.note)}${w.alternatives?.length ? `. Other options: ${w.alternatives.map(esc).join(", ")}` : ""}</div>` : "") +
        (c.emails.length || c.phones.length || w ? "" : `<div class="muted">No email or phone listed. Connect with them, then look again.</div>`)
      : `<div class="muted">Nothing listed. LinkedIn shows email mostly to your connections.</div>`;
    out.querySelectorAll("[data-copy]").forEach((b) =>
      b.addEventListener("click", () => {
        navigator.clipboard.writeText(b.dataset.copy);
        safeSend({ type: "activity", action: "copy", detail: b.dataset.copy, path: location.href.split("?")[0] });
        b.textContent = "Copied";
        setTimeout(() => (b.textContent = "Copy"), 1200);
      }),
    );
  }

  function ask(msg) {
    return new Promise((resolve) => {
      safeSend(msg, (r, failed) => resolve(failed ? { error: "The extension was updated. Reload this LinkedIn tab once, then try again." } : r));
    });
  }

  async function busy(btn, label, fn) {
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function addPostBars() {
    for (const box of postContainers()) {
      if (box.querySelector(":scope > .yatri-bar")) continue;
      const post = readPost(box);
      if (!post) continue;
      const host = document.createElement("div");
      host.className = "yatri-bar";
      box.prepend(host);
      const root = mount(
        host,
        `<div class="bar"><span class="tag">${esc(BRAND.first)} ${esc(BRAND.second)}</span>
          ${post.authorUrl && /\/in\//.test(post.authorUrl) ? '<button class="primary" data-a="find">Find email and phone</button>' : ""}
          <button data-a="save">Save lead</button><div class="out"></div></div>`,
      );
      const out = root.querySelector(".out");
      root.querySelector('[data-a="save"]')?.addEventListener("click", (e) =>
        busy(e.target, "Saving...", async () => {
          const r = await ask({ type: "lookup", post });
          out.innerHTML = r?.error ? `<span class="err">${esc(r.error)}</span>` : `<span class="muted">${r.saved ? "Saved to your inbox." : "Already in your inbox."}</span>`;
        }),
      );
      root.querySelector('[data-a="find"]')?.addEventListener("click", (e) =>
        busy(e.target, "Looking up...", async () => {
          // On the author's own profile, read it right here. Otherwise a minimized window does it.
          const here = location.pathname.match(/^\/in\/([^/]+)/);
          const same = here && post.authorUrl && post.authorUrl.toLowerCase().includes(`/in/${here[1].toLowerCase()}`);
          const profile = same ? await findContactHere() : null;
          showContacts(out, await ask(profile ? { type: "lookup", profile, post } : { type: "lookup", url: post.authorUrl, post }));
        }),
      );
    }
  }

  // ---------- Profile card, like SignalHire: who they are, contacts, and actions ----------

  const CARD_CSS = `
    .card { position: fixed; right: 16px; top: 72px; z-index: 2147483000; width: 340px; max-height: calc(100vh - 96px); overflow: auto; background: #fff; border: 1px solid #e6e6e6; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,.12); color: #171717; font-size: 14px; line-height: 1.45; }
    .top { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid #eee; }
    .brand { font-weight: 800; font-size: 16px; } .brand b { color: var(--b); }
    .x { border: 0; background: none; font-size: 13px; color: #616161; height: 28px; padding: 0 6px; }
    .band { background: var(--b); color: #fff; text-align: center; font-weight: 700; padding: 6px; font-size: 13px; letter-spacing: .02em; }
    .who { display: flex; gap: 12px; padding: 14px; }
    .who img, .who .ph { width: 64px; height: 64px; border-radius: 14px; object-fit: cover; flex-shrink: 0; background: #f2f2f2; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #616161; font-size: 20px; }
    .nm { font-size: 17px; font-weight: 800; margin: 0; } .hl { font-weight: 600; margin: 2px 0; } .co { color: var(--b); font-weight: 600; text-decoration: none; display: block; } .lc { color: #616161; }
    .links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .links a { font-size: 12px; font-weight: 600; border: 1px solid #e6e6e6; border-radius: 999px; padding: 2px 10px; color: #171717; text-decoration: none; }
    .links a:hover { border-color: var(--b); color: var(--b); }
    .sec { border-top: 1px solid #eee; padding: 12px 14px; }
    .sec h4 { margin: 0 0 6px; font-size: 14px; }
    .lbl { font-size: 12px; color: #616161; margin: 8px 0 2px; font-weight: 600; }
    .row { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 3px 0; }
    .row span { overflow-wrap: anywhere; font-weight: 500; }
    .row small { display: block; color: #616161; font-size: 11px; font-weight: 400; }
    .row button { height: 26px; padding: 0 8px; font-size: 12px; flex-shrink: 0; }
    .none { color: #616161; }
    .actions { padding: 12px 14px 14px; border-top: 1px solid #eee; }
    .actions > button { width: 100%; height: 42px; }
    .menu { display: none; margin-top: 8px; border: 1px solid #e6e6e6; border-radius: 12px; overflow: hidden; }
    .menu.open { display: block; }
    .menu button, .menu .fu { display: flex; width: 100%; border: 0; border-top: 1px solid #f0f0f0; border-radius: 0; height: 40px; justify-content: flex-start; padding: 0 12px; background: #fff; align-items: center; gap: 6px; }
    .menu button:first-child { border-top: 0; }
    .menu button:hover { background: var(--b); color: #fff; }
    .menu .fu input { height: 30px; border: 1px solid #ddd; border-radius: 8px; padding: 0 6px; font: inherit; flex: 1; }
    .menu .fu button { width: auto; height: 30px; border: 1px solid #e6e6e6; border-radius: 8px; }
    .msg { margin-top: 8px; font-size: 13px; color: #616161; } .msg.err { color: #bf2121; }
  `;

  let panelFor = null;

  function contactRows(label, list, note) {
    if (!list.length) return "";
    return `<div class="lbl">${label}</div>` + list.map((v) => `<div class="row"><span>${esc(v)}${note ? `<small>${esc(note)}</small>` : ""}</span><button data-copy="${esc(v)}">Copy</button></div>`).join("");
  }

  function renderContacts(box, res) {
    const c = res?.contacts;
    const w = res?.workEmail;
    if (!c && !w) {
      box.innerHTML = `<div class="none">Not looked up yet. Press Find email and phone.</div>`;
      return;
    }
    const WORD = { found: "Found", likely: "Likely", guess: "Guess" };
    const work = [...(c?.work_emails || [])];
    let html = "";
    if (w && !work.includes(w.email)) html += contactRows(`Work email, ${WORD[w.status] || "Guess"} ${w.confidence ?? ""}%`, [w.email], w.note || "");
    html += contactRows("Work email", work);
    html += contactRows("Personal email", c?.personal_emails || []);
    html += contactRows("Phone", c?.phones || []);
    if (w?.alternatives?.length) html += `<div class="lbl">Other work email options</div><div class="none">${w.alternatives.map(esc).join(", ")}</div>`;
    box.innerHTML = html || `<div class="none">No email or phone listed in public. Connect with them on LinkedIn, then look again.</div>`;
    box.querySelectorAll("[data-copy]").forEach((b) =>
      b.addEventListener("click", () => {
        navigator.clipboard.writeText(b.dataset.copy);
        safeSend({ type: "activity", action: "copy", detail: b.dataset.copy, path: location.href.split("?")[0] });
        b.textContent = "Copied";
        setTimeout(() => (b.textContent = "Copy"), 1200);
      }),
    );
  }

  function addProfilePanel() {
    const m = location.pathname.match(/^\/in\/([^/]+)\/?$/);
    const old = document.getElementById("yatri-panel");
    if (!m) {
      old?.remove();
      panelFor = null;
      return;
    }
    if (panelFor === m[1] && old) return;
    old?.remove();
    panelFor = m[1];
    const url = `https://www.linkedin.com/in/${m[1]}/`;
    const name = clean(document.querySelector("main h1")?.innerText || "").split("\n")[0] || "This person";
    const headline = clean(document.querySelector("main .text-body-medium")?.innerText || "");
    const { company, companyUrl } = readCompany();
    const loc = readLocation();
    const photo = readPhoto();
    const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
    const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const host = document.createElement("div");
    host.id = "yatri-panel";
    document.body.appendChild(host);
    host.style.setProperty("--b", BRAND.color || "#0080FF");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}${CARD_CSS}</style>
      <div class="card">
        <div class="top"><span class="brand">${esc(BRAND.first)} <b>${esc(BRAND.second)}</b></span><button class="x" data-a="hide">Hide</button></div>
        <div class="band">Profile</div>
        <div class="who">
          ${photo ? `<img src="${esc(photo)}" alt="">` : `<div class="ph">${esc(initials)}</div>`}
          <div>
            <p class="nm">${esc(name)}</p>
            ${headline ? `<p class="hl">${esc(headline.slice(0, 120))}</p>` : ""}
            ${company ? (companyUrl ? `<a class="co" href="${esc(companyUrl)}" target="_blank">${esc(company)}</a>` : `<span class="co">${esc(company)}</span>`) : ""}
            ${loc ? `<span class="lc">${esc(loc)}</span>` : ""}
            <div class="links" data-links><a href="${esc(url)}" target="_blank">LinkedIn</a></div>
          </div>
        </div>
        <div class="sec">
          <h4>Contact info</h4>
          <div data-contacts><div class="none">Checking what we already know...</div></div>
          <button class="primary" data-a="find" style="width:100%;height:40px;margin-top:10px">Find email and phone</button>
        </div>
        <div class="actions">
          <button data-a="menu">Actions with profile</button>
          <div class="menu" data-menu>
            <button data-act="save">Save as lead</button>
            <button data-act="mine">Save and take it myself</button>
            <button data-act="bde">Save and give to a BDE</button>
            <div class="fu"><span>Follow up on</span><input type="date" value="${today}" data-date><button data-act="follow_up">Set</button></div>
            <button data-act="open">Open in the app</button>
            <button data-act="copyall">Copy all contact details</button>
          </div>
          <div class="msg" data-msg></div>
        </div>
      </div>`;

    const $ = (sel) => root.querySelector(sel);
    const contacts = $("[data-contacts]");
    const msg = $("[data-msg]");
    let last = null;
    let leadLink = null;
    const show = (res) => {
      last = res;
      renderContacts(contacts, res);
      const p = res?.person;
      const links = $("[data-links]");
      if (p?.github && !links.querySelector("[data-gh]")) links.insertAdjacentHTML("beforeend", `<a data-gh href="${esc(p.github)}" target="_blank">GitHub</a>`);
      if (p?.website && !links.querySelector("[data-web]")) links.insertAdjacentHTML("beforeend", `<a data-web href="${esc(p.website)}" target="_blank">Website</a>`);
    };
    const say = (text, bad) => {
      msg.textContent = text;
      msg.className = bad ? "msg err" : "msg";
    };

    // Show what we already know straight away, then let them look up more.
    safeSend({ type: "cached", url }, (r) => show(r && !r.error ? r : null));

    $('[data-a="hide"]').addEventListener("click", () => (root.querySelector(".card").style.display = "none"));
    $('[data-a="menu"]').addEventListener("click", () => $("[data-menu]").classList.toggle("open"));
    $('[data-a="find"]').addEventListener("click", (e) =>
      busy(e.target, "Looking up, about 10 seconds...", async () => {
        const profile = await findContactHere();
        const res = await ask(profile ? { type: "lookup", profile: { ...profile, photo: profile.photo || photo } } : { type: "lookup", url });
        if (res?.error) return say(res.error, true);
        show(res);
        say(res?.contacts?.emails?.length || res?.contacts?.phones?.length ? "Found and saved to People." : res?.workEmail ? "Work email predicted from their company. Saved to People." : "Nothing public found. Saved to People.");
      }),
    );
    root.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", async () => {
        const act = b.dataset.act;
        if (act === "open") {
          if (leadLink) return window.open(leadLink, "_blank");
          const r = await ask({ type: "lead-action", action: "save", url });
          leadLink = r?.link;
          return leadLink ? window.open(leadLink, "_blank") : say(r?.error || "Could not open it.", true);
        }
        if (act === "copyall") {
          const c = last?.contacts || {};
          const lines = [name, headline, company, loc, url, ...(c.emails || []), ...(c.phones || []), last?.workEmail?.email].filter(Boolean);
          navigator.clipboard.writeText([...new Set(lines)].join("\n"));
          safeSend({ type: "activity", action: "copy", detail: `All details for ${name}`, path: url });
          return say("Copied.");
        }
        b.disabled = true;
        const r = await ask({ type: "lead-action", action: act, url, date: act === "follow_up" ? $("[data-date]").value : undefined });
        b.disabled = false;
        if (r?.link) leadLink = r.link;
        say(r?.error || r?.message || "Done.", Boolean(r?.error));
      }),
    );
  }

  function decorate() {
    // Skip the hidden lookup tabs the extension opens itself.
    if (/\/overlay\/contact-info/.test(location.pathname)) return;
    addPostBars();
    addProfilePanel();
  }

  let timer = null;
  const observer = new MutationObserver(() => schedule());
  function schedule() {
    clearTimeout(timer);
    if (!alive()) {
      // Old copy left behind by an extension update: stop watching the page.
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      return;
    }
    timer = setTimeout(() => {
      try {
        decorate();
        scan();
      } catch (err) {
        console.warn("[leads extension]", err.message);
      }
    }, 1500);
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("scroll", schedule, { passive: true });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === "scan") {
      scan().then(reply);
      return true;
    }
    if (msg.type === "find-here") {
      findContactHere().then(reply);
      return true;
    }
    if (msg.type === "profile-info") {
      const p = readContactDialog();
      reply({ url: p.url, name: p.name, headline: p.headline });
      return false;
    }
    if (msg.type === "read-contact") {
      (async () => {
        for (let i = 0; i < 20 && !document.querySelector('[role="dialog"]'); i++) await sleep(500);
        await sleep(800);
        reply(readContactDialog());
      })();
      return true;
    }
    if (msg.type === "watch-scroll") {
      // Watch mode: scroll slowly like a person reading, then save what loaded.
      (async () => {
        for (let i = 0; i < (msg.screens || 4); i++) {
          window.scrollBy({ top: window.innerHeight * (0.6 + Math.random() * 0.5), behavior: "smooth" });
          await sleep(2500 + Math.random() * 3000);
        }
        const blocked = /checkpoint|authwall|login/.test(location.pathname) || /unusual activity|security verification/i.test(document.body.innerText.slice(0, 3000));
        const r = await scan();
        reply({ ...r, blocked });
      })();
      return true;
    }
  });
})();
