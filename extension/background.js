// Sends posts to the Yatri Leads server, and runs watch mode on a timer.

const DEFAULTS = {
  server: "https://leads-webxela-com.vercel.app",
  apiKey: "",
  capture: true,
  watch: true,
  every: 30,
  perRun: 4,
  profilesPerRun: 5,
  dailyCap: 80,
};

const get = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
const set = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));
const today = () => new Date().toISOString().slice(0, 10);

async function api(path, init = {}) {
  const s = await get(DEFAULTS);
  const res = await fetch(s.server.replace(/\/$/, "") + path, {
    ...init,
    headers: { "content-type": "application/json", ...(s.apiKey ? { "x-api-key": s.apiKey } : {}), ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Server said ${res.status}`);
  return res.json();
}

async function bump(fields) {
  const s = await get({ stats: {} });
  const st = s.stats.day === today() ? s.stats : { day: today(), sent: 0, added: 0, views: 0 };
  for (const [k, v] of Object.entries(fields)) st[k] = (st[k] || 0) + v;
  await set({ stats: st });
  chrome.action.setBadgeBackgroundColor({ color: "#0080FF" });
  chrome.action.setBadgeText({ text: st.added ? String(st.added) : "" });
  return st;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "ingest") {
    api("/api/ingest", { method: "POST", body: JSON.stringify({ posts: msg.posts, profiles: msg.profiles }) })
      .then(async (r) => {
        await bump({ sent: msg.posts.length, added: r.added || 0 });
        await set({ lastError: "" });
        reply(r);
      })
      .catch(async (e) => {
        await set({ lastError: `Could not reach the server: ${e.message}` });
        reply({ error: e.message });
      });
    return true;
  }
  if (msg.type === "lookup") {
    lookup(msg).then(reply).catch((e) => reply({ error: e.message }));
    return true;
  }
  if (msg.type === "watch-now") {
    runWatch(true).then(reply);
    return true;
  }
  if (msg.type === "settings-changed") {
    setupAlarm().then(() => reply({ ok: true }));
    return true;
  }
});

async function setupAlarm() {
  const s = await get(DEFAULTS);
  await chrome.alarms.clear("watch");
  if (s.watch) chrome.alarms.create("watch", { periodInMinutes: Math.max(15, Number(s.every) || 30), delayInMinutes: 1 });
  chrome.alarms.create("heartbeat", { periodInMinutes: 5, delayInMinutes: 0.1 });
  heartbeat();
}

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "watch") runWatch(false);
  if (a.name === "heartbeat") heartbeat();
});

// Only checks that the LinkedIn sign in cookie exists. Its value is never read out or sent anywhere.
async function linkedinSignedIn() {
  const c = await chrome.cookies.get({ url: "https://www.linkedin.com", name: "li_at" }).catch(() => null);
  return Boolean(c);
}

// Tells the app this extension is connected, so the LinkedIn account page can show it.
async function heartbeat() {
  try {
    const s = await get({ ...DEFAULTS, stats: {}, lastWatch: null, lastError: "", pausedUntil: 0 });
    const st = s.stats.day === today() ? s.stats : {};
    await api("/api/heartbeat", {
      method: "POST",
      body: JSON.stringify({
        version: chrome.runtime.getManifest().version,
        linkedin: (await linkedinSignedIn()) ? "signed-in" : "signed-out",
        watch: s.watch,
        pagesToday: st.views || 0,
        dailyCap: s.dailyCap,
        lastWatch: s.lastWatch,
        pausedUntil: s.pausedUntil || 0,
        lastError: s.lastError || "",
      }),
    });
  } catch {
    // The app is not running. Try again on the next beat.
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForLoad(tabId) {
  return new Promise((resolve) => {
    const done = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(done);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(done);
      resolve();
    }, 30000);
  });
}

let watching = false;

// Opens a few saved searches in one background tab, at a human pace, then closes it.
async function runWatch(manual) {
  if (watching) return { error: "Already running." };
  watching = true;
  let tab;
  const result = { pages: 0, posts: 0, added: 0 };
  try {
    const s = await get({ ...DEFAULTS, cursor: 0, stats: {}, pausedUntil: 0 });
    if (!manual && Date.now() < s.pausedUntil) return { error: "Paused after a LinkedIn warning." };
    const st = s.stats.day === today() ? s.stats : { views: 0 };
    const left = Math.max(0, s.dailyCap - (st.views || 0));
    if (!left) return { error: "Daily page limit reached." };

    if (!(await linkedinSignedIn())) {
      await set({ lastError: "Not signed in to LinkedIn in this Chrome." });
      return { error: "Sign in to LinkedIn first." };
    }
    // Also start the app's Reddit and Hacker News check, since a hosted app has no timer of its own.
    api("/api/poll", { method: "POST" }).catch(() => {});
    const { urls } = await api("/api/searches");
    if (!urls.length) return { error: "No searches set up." };
    const count = Math.min(s.perRun, left, urls.length);
    tab = await chrome.tabs.create({ url: "about:blank", active: false });

    for (let i = 0; i < count; i++) {
      const url = urls[(s.cursor + i) % urls.length];
      await chrome.tabs.update(tab.id, { url });
      await waitForLoad(tab.id);
      await sleep(4000 + Math.random() * 4000);
      const r = await chrome.tabs.sendMessage(tab.id, { type: "watch-scroll", screens: 4 }).catch(() => null);
      await bump({ views: 1 });
      result.pages++;
      if (r) {
        result.posts += r.posts || 0;
        result.added += r.added || 0;
        if (r.blocked) {
          // LinkedIn asked for a check. Stop for 12 hours to protect the account.
          await set({ pausedUntil: Date.now() + 12 * 3600_000, lastError: "LinkedIn showed a security check. Watch mode is paused for 12 hours." });
          break;
        }
      }
      await sleep(15000 + Math.random() * 25000);
    }
    await set({ cursor: (s.cursor + count) % urls.length });

    // Then look up email and phone for hot leads that have none yet.
    result.profiles = 0;
    const room = Math.min(s.profilesPerRun, left - result.pages);
    const blocked = (await get({ pausedUntil: 0 })).pausedUntil > Date.now();
    if (room > 0 && !blocked) {
      const { profiles } = await api(`/api/enrich?limit=${room}`);
      for (const url of profiles) {
        await sleep(12000 + Math.random() * 20000);
        const r = await lookup({ url });
        await bump({ views: 1 });
        if (r && !r.error) result.profiles++;
      }
    }
    await set({ lastWatch: { at: Date.now(), ...result }, lastError: "" });
    heartbeat();
    return result;
  } catch (e) {
    await set({ lastError: e.message });
    return { error: e.message };
  } finally {
    if (tab) chrome.tabs.remove(tab.id).catch(() => {});
    watching = false;
  }
}

// Opens the person's Contact info in a background tab, reads it, closes the tab,
// then asks the server to save it and check their website.
async function lookup({ url, post }) {
  let profile = null;
  if (url) {
    const tab = await chrome.tabs.create({ url: url.replace(/\/?$/, "/") + "overlay/contact-info/", active: false });
    try {
      await waitForLoad(tab.id);
      for (let i = 0; i < 10 && !profile; i++) {
        profile = await chrome.tabs.sendMessage(tab.id, { type: "read-contact" }).catch(() => null);
        if (!profile) await sleep(700);
      }
    } finally {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
    if (!profile) return { error: "LinkedIn did not open the Contact info. Are you signed in?" };
    profile.url = url;
  }
  const body = {};
  if (profile) body.profile = { url: profile.url, name: profile.name, headline: profile.headline, emails: profile.emails, phones: profile.phones, websites: profile.websites };
  if (post) body.post = post;
  const r = await api("/api/lookup", { method: "POST", body: JSON.stringify(body) });
  if (r.saved) await bump({ added: 1 });
  return r;
}
