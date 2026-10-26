import "server-only";
import { must, sb } from "./db";
import { can, type Member } from "./session";

// Team resources: profiles, contacts, bank details and files admins keep for everyone.
// Items marked admins only never leave the server for members, and neither do their files.

export const CATEGORIES = {
  contact: "Founders and contacts",
  social: "Social profiles",
  document: "Pitch deck and documents",
  bank: "Bank and payments",
  link: "Useful links",
  other: "Other",
} as const;
export type Category = keyof typeof CATEGORIES;

export type Resource = {
  id: number;
  category: Category;
  title: string;
  value: string;
  url: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  admins_only: boolean;
  updated_at: string;
};

export const MAX_RESOURCE_FILE = 50 * 1024 * 1024;
/** Only paths made by our upload link are accepted back. */
export const RESOURCE_PREFIX = "items/";

const COLS = "id, category, title, value, url, phone, email, note, file_path, file_name, file_type, file_size, admins_only, updated_at";

/** Admins see everything; while sign in is not set up yet (me is null) the stand in owner does too. */
export const seesPrivate = (me: Member | null) => !me || can(me, "admin");

export async function resourcesFor(me: Member | null): Promise<Resource[]> {
  let q = sb().from("resources").select(COLS).order("category").order("title");
  if (!seesPrivate(me)) q = q.eq("admins_only", false);
  return must(await q) as Resource[];
}

export async function resourceFor(me: Member | null, id: number): Promise<Resource | null> {
  if (!Number.isInteger(id) || id < 1) return null;
  const r = must(await sb().from("resources").select(COLS).eq("id", id).maybeSingle()) as Resource | null;
  if (!r || (r.admins_only && !seesPrivate(me))) return null;
  return r;
}
