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
  min_score: "0",
  alert_score: "70",
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
