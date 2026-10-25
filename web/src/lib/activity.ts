import "server-only";
import { headers } from "next/headers";
import { sb } from "./db";

export type ActivityWho = { id: string; email: string } | null;

/** Words admins see on the Activity page, one per action. */
export const ACTION_WORDS: Record<string, string> = {
  online: "Was active",
  sign_in: "Signed in",
  sign_out: "Signed out",
  sign_in_refused: "Sign in refused",
  page_view: "Opened a page",
  status: "Changed lead status",
  notes: "Saved notes",
  assign: "Assigned a lead",
  reply: "Drafted a reply",
  delete_lead: "Deleted a lead",
  add_post: "Added a post by hand",
  rescore: "Scored all leads again",
  check_now: "Ran a check",
  settings: "Changed searches and alerts",
  export_csv: "Downloaded CSV",
  copy: "Copied text",
  open_link: "Opened a link",
  email_link: "Opened an email link",
  phone_link: "Opened a phone link",
  capture: "Captured posts with the extension",
  lookup: "Looked up contact details",
  invite: "Invited someone",
  member_change: "Changed someone's role or team",
  access: "Turned someone's access on or off",
  remove_member: "Removed someone",
  new_key: "Made a new extension key",
  team_change: "Changed teams",
  linkedin_worker: "Used the separate LinkedIn window",
};

/** Records one thing a person did. Never throws, so logging can never break the app. */
export async function logActivity(who: ActivityWho, action: string, opts: { target?: string | null; detail?: string | null; path?: string | null } = {}) {
  try {
    const h = await headers();
    await sb()
      .from("activity")
      .insert({
        member_id: who?.id || null,
        member_email: who?.email ?? null,
        action,
        target: opts.target?.slice(0, 500) ?? null,
        detail: opts.detail?.slice(0, 2000) ?? null,
        path: opts.path?.slice(0, 500) ?? null,
        ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
        user_agent: h.get("user-agent")?.slice(0, 300) ?? null,
      });
  } catch {
    // Logging is best effort.
  }
}
