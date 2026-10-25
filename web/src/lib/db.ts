import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

declare global {
  var __leadsSb: SupabaseClient<Database> | undefined;
}

/** Server only Supabase client with the secret key. Row level security blocks everyone else. */
export function sb() {
  if (!globalThis.__leadsSb) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local.");
    globalThis.__leadsSb = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return globalThis.__leadsSb;
}

/** Throws on a Supabase error so failures are never silent. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database: ${res.error.message}`);
  return res.data as T;
}

export const DEFAULT_SETTINGS = {
  searches: [
    "looking for a developer",
    "need a developer",
    "looking for someone to build",
    "need help building",
    "looking for an agency",
    "freelance developer needed",
    "need a website",
    "build our MVP",
    "recommend a developer",
  ].join("\n"),
  watched_profiles: "https://www.linkedin.com/in/dr-mohsen-tayyebi/",
  subreddits: "forhire\nslavelabour\nstartups\nSaaS\nentrepreneur",
  min_score: "40",
  alert_score: "70",
  // "on" gives every new hot lead to the BDE with the fewest open leads.
  auto_assign: "off",
  // The hourly Claude routine. "off" makes /api/brief tell it to stop and /api/ingest ignore it.
  claude_auto: "on",
  // "on" keeps only posts from people asking to hire a developer, freelancer or agency. See lib/client-intent.ts.
  strict_clients: "on",
  // Google search: "YYYY-MM-DD:count" for the free daily allowance, and when posts were last searched.
  cse_quota: "",
  // Lead preferences, set by admins on the Preferences page.
  pref_services: "website\nweb app\nmobile app\nshopify\nwordpress\nsaas\nmvp\nai\nchatbot\nautomation\ncloud\ndevops",
  pref_exclude: "open to work\nlooking for a job\ninternship\nunpaid\nequity only\nrevenue share\nhire me\nwe are hiring interns",
  pref_locations: "",
  pref_lead_types: "project,job",
  pref_max_age_hours: "72",
  // How often things run. Only admins can change these, members and extensions follow them.
  fetch_minutes: "60",
  ext_minutes: "30",
  ext_daily_cap: "80",
  src_google: "on",
  src_reddit: "on",
  src_hn: "on",
  digest_hour: "9",
  notify_hot: "on",
  last_server_run: "0",
  last_digest: "",
  cse_last_posts: "0",
  // Branding, set by admins on Searches and alerts.
  brand_first: "Yatri",
  brand_second: "Leads",
  company_name: "Yatri Cloud",
  brand_color: "#0080FF",
  logo_url: "/logo.png",
};

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingKey, string>;

export async function getSettings(): Promise<Settings> {
  const rows = must(await sb().from("settings").select("key, value"));
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

export async function getSetting(key: SettingKey): Promise<string> {
  return (await getSettings())[key];
}

export function lines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getLines(key: SettingKey): Promise<string[]> {
  return lines(await getSetting(key));
}

export async function setSettings(values: Partial<Settings>) {
  const rows = Object.entries(values).map(([key, value]) => ({ key, value: String(value) }));
  must(await sb().from("settings").upsert(rows, { onConflict: "key" }));
}

export function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}
