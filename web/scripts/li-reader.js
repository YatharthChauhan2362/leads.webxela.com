// Runs inside a LinkedIn page. Returns the posts and contact info that are on screen.
// Kept as plain browser JavaScript so the worker can inject it as is.
(() => {
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
        const outer = el.parentElement && el.parentElement.closest('[data-urn*="urn:li:"], [data-id*="urn:li:"]');
        found.add(outer && URN_RE.test(outer.getAttribute("data-urn") || outer.getAttribute("data-id") || "") ? outer : el);
      });
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
    const headline = firstText(box, [".update-components-actor__description span[aria-hidden='true']", ".update-components-actor__description"]).split("\n")[0];
    const postedAt = firstText(box, [".update-components-actor__sub-description span[aria-hidden='true']", ".update-components-actor__sub-description"]).split("•")[0].trim();

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

  function readProfile() {
    const m = location.pathname.match(/^\/in\/([^/]+)/);
    if (!m) return null;
    const url = `https://www.linkedin.com/in/${m[1]}/`;
    const name = clean(document.querySelector("main h1")?.innerText || "").split("\n")[0] || null;
    const headline = clean(document.querySelector("main .text-body-medium")?.innerText || "") || null;
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
    return { url, name, headline, emails, phones, websites, dialogOpen: Boolean(dialog) };
  }

  const state = /checkpoint|authwall|\/login|\/uas\//.test(location.pathname)
    ? "signed-out"
    : /unusual activity|security verification|let.s do a quick security check/i.test(document.body.innerText.slice(0, 3000))
      ? "blocked"
      : "ok";

  const posts = [];
  const seen = new Set();
  for (const box of postContainers()) {
    const p = readPost(box);
    if (p && !seen.has(p.postId)) {
      seen.add(p.postId);
      posts.push(p);
    }
  }
  return { state, posts, profile: readProfile() };
})();
