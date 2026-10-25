const DEFAULTS = { server: "https://leads-webxela-com.vercel.app", apiKey: "", capture: true, watch: true, every: 30, dailyCap: 80, stats: {}, lastError: "", lastWatch: null };
const $ = (id) => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
let settings = DEFAULTS;

async function api(path, init = {}) {
  const res = await fetch(settings.server.replace(/\/$/, "") + path, {
    ...init,
    headers: { "content-type": "application/json", ...(settings.apiKey ? { "x-api-key": settings.apiKey } : {}) },
  });
  if (!res.ok) throw new Error(`The app said ${res.status}`);
  return res.json();
}

function renderGeneral(s) {
  const st = s.stats.day === today() ? s.stats : {};
  $("s-sent").textContent = st.sent || 0;
  $("s-added").textContent = st.added || 0;
  $("s-views").textContent = st.views || 0;
  $("error").textContent = s.lastError || "";
  if (s.lastWatch) {
    const mins = Math.round((Date.now() - s.lastWatch.at) / 60000);
    $("lastWatch").textContent = `Last check ${mins} min ago: ${s.lastWatch.pages} pages, ${s.lastWatch.added} new leads, ${s.lastWatch.profiles || 0} contacts looked up.`;
  }
}

// ---------- Contact panel for a LinkedIn profile ----------

let person = null;

function itemRow(kind, value) {
  const href = kind === "Email" ? `mailto:${value}` : kind === "Phone" ? `tel:${value.replace(/[^\d+]/g, "")}` : value;
  const label = kind === "Email" ? "Send email" : kind === "Phone" ? "Call" : "Open";
  return `<div class="item"><span class="v">${esc(value)}<span class="k">${kind === "Email" ? "Email" : kind === "Phone" ? "Phone" : "Website"}</span></span>
    <span class="acts"><button class="secondary" data-copy="${esc(value)}">Copy</button><a class="btn secondary" href="${esc(href)}" target="_blank">${label}</a></span></div>`;
}

function renderContacts(c) {
  const fill = (id, list, kind, empty) => ($(id).innerHTML = list.length ? list.map((v) => itemRow(kind, v)).join("") : `<p class="none">${empty}</p>`);
  fill("emails", c?.emails || [], "Email", c ? "None listed" : "Not found yet");
  fill("phones", c?.phones || [], "Phone", c ? "None listed" : "Not found yet");
  const sites = c?.websites || [];
  $("sites-wrap").classList.toggle("hidden", !sites.length);
  $("sites").innerHTML = sites.slice(0, 2).map((v) => itemRow("Website", v)).join("");
  document.querySelectorAll("[data-copy]").forEach((b) =>
    b.addEventListener("click", () => {
      navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = "Copied";
      setTimeout(() => (b.textContent = "Copy"), 1200);
    }),
  );
}

async function showPerson(tab) {
  const slug = (tab.url || "").match(/linkedin\.com\/in\/([^/?#]+)/);
  if (!slug) return false;
  person = { url: `https://www.linkedin.com/in/${decodeURIComponent(slug[1]).toLowerCase()}/`, name: null, headline: null };
  $("person").classList.remove("hidden");
  $("general").classList.add("hidden");

  chrome.tabs.sendMessage(tab.id, { type: "profile-info" }, (r) => {
    if (chrome.runtime.lastError || !r) {
      $("p-name").textContent = (tab.title || "").replace(/\s*\|\s*LinkedIn.*$/, "").replace(/^\(\d+\)\s*/, "") || "This person";
      $("p-headline").textContent = "Reload this LinkedIn tab once so the extension can read it.";
      return;
    }
    person.name = r.name;
    person.headline = r.headline;
    $("p-name").textContent = r.name || "This person";
    $("p-headline").textContent = r.headline || "";
  });

  try {
    const r = await api(`/api/lookup?url=${encodeURIComponent(person.url)}`);
    renderContacts(r.contacts);
    if (r.checkedAt) $("p-status").textContent = `Looked up ${new Date(r.checkedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`;
  } catch {
    $("p-error").textContent = "Yatri Leads app is not reachable. Start it with npm run dev.";
  }
  return true;
}

$("find").onclick = async () => {
  $("find").disabled = true;
  $("find").textContent = "Looking up...";
  $("p-error").textContent = "";
  $("p-status").textContent = "Reading their Contact info and website. This takes about 10 seconds.";
  // Read the Contact info on the page you are on. Only if that fails does the extension use a minimized window.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const profile = await new Promise((res) => chrome.tabs.sendMessage(tab.id, { type: "find-here" }, (p) => res(chrome.runtime.lastError ? null : p)));
  chrome.runtime.sendMessage(profile ? { type: "lookup", profile } : { type: "lookup", url: person.url }, (r) => {
    $("find").disabled = false;
    $("find").textContent = "Find email and phone again";
    if (!r || r.error) {
      $("p-status").textContent = "";
      $("p-error").textContent = r?.error || "Lookup failed. Reload the LinkedIn tab and try again.";
      return;
    }
    renderContacts(r.contacts);
    const n = (r.contacts?.emails.length || 0) + (r.contacts?.phones.length || 0);
    $("p-status").textContent = n ? "Found. Saved to all their leads." : "Nothing listed. LinkedIn shows email mostly to your connections. Connect with them, then look again.";
  });
};

$("save").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("save").disabled = true;
  const text = [person.headline, `Profile saved from LinkedIn: ${person.name || person.url}`].filter(Boolean).join("\n\n");
  chrome.runtime.sendMessage(
    { type: "lookup", post: { source: "linkedin", postId: `profile:${person.url}`, postUrl: tab.url, author: person.name, authorUrl: person.url, headline: person.headline, text } },
    (r) => {
      $("save").disabled = false;
      $("save").textContent = r && !r.error ? (r.saved ? "Saved" : "Already saved") : "Could not save";
    },
  );
};

$("open2").onclick = () => chrome.tabs.create({ url: settings.server });

// ---------- General view and settings ----------

chrome.storage.local.get(DEFAULTS, async (s) => {
  settings = s;
  for (const k of ["server", "apiKey", "every", "dailyCap"]) $(k).value = s[k];
  $("capture").checked = s.capture;
  $("watch").checked = s.watch;
  renderGeneral(s);
  try {
    await api("/api/searches");
    $("conn").textContent = "Connected";
  } catch {
    $("conn").textContent = "App not running";
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await showPerson(tab);
});
chrome.storage.onChanged.addListener(() => chrome.storage.local.get(DEFAULTS, renderGeneral));

function save() {
  chrome.storage.local.set(
    {
      server: $("server").value.trim() || DEFAULTS.server,
      apiKey: $("apiKey").value.trim(),
      capture: $("capture").checked,
      watch: $("watch").checked,
      every: Math.max(15, Number($("every").value) || 30),
      dailyCap: Math.min(200, Math.max(1, Number($("dailyCap").value) || 80)),
    },
    () => chrome.runtime.sendMessage({ type: "settings-changed" }),
  );
}
$("save-settings").onclick = () => {
  save();
  $("save-settings").textContent = "Saved";
  setTimeout(() => ($("save-settings").textContent = "Save settings"), 1200);
};
$("capture").onchange = save;
$("watch").onchange = save;

$("scan").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/linkedin\.com/.test(tab.url || "")) {
    $("error").textContent = "Open a LinkedIn page first.";
    return;
  }
  $("scan").textContent = "Saving...";
  chrome.tabs.sendMessage(tab.id, { type: "scan" }, (r) => {
    if (chrome.runtime.lastError) $("error").textContent = "Reload the LinkedIn tab once, then try again.";
    $("scan").textContent = r && r.posts ? `Sent ${r.posts} posts, ${r.added || 0} new leads` : "No new posts on this page";
    setTimeout(() => ($("scan").textContent = "Save posts on this page"), 2500);
  });
};

$("open").onclick = () => chrome.tabs.create({ url: $("server").value.trim() || DEFAULTS.server });

$("watchNow").onclick = () => {
  $("watchNow").textContent = "Running in a background tab...";
  chrome.runtime.sendMessage({ type: "watch-now" }, (r) => {
    $("watchNow").textContent = r && r.error ? r.error : `Done: ${r.pages} pages, ${r.added} new leads`;
    setTimeout(() => ($("watchNow").textContent = "Check now"), 3000);
  });
};
