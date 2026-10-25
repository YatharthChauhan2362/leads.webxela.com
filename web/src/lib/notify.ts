import "server-only";
import nodemailer from "nodemailer";
import { must, sb, type Lead } from "./db";
import { appUrl } from "./oauth";

type Kind = "hot_lead" | "assigned" | "follow_up" | "reply" | "digest" | "system";

/** Adds a notification for each person. The bell shows it, and their extension pops it up on the desktop within a minute. */
export async function notify(memberIds: (string | null | undefined)[], kind: Kind, title: string, body?: string | null, leadId?: number | null) {
  const ids = [...new Set(memberIds.filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  await sb()
    .from("notifications")
    .insert(ids.map((member_id) => ({ member_id, kind, title, body: body ?? null, lead_id: leadId ?? null })));
}

export async function adminIds() {
  return (must(await sb().from("members").select("id").in("role", ["owner", "admin"]).eq("status", "active")) as { id: string }[]).map((m) => m.id);
}

/** A new hot lead: tell the admins, whoever captured it and whoever it was given to. */
export async function notifyHotLead(lead: Lead) {
  await notify([...(await adminIds()), lead.captured_by, lead.assigned_to], "hot_lead", `Hot lead: ${lead.author ?? "Someone"} (${lead.score})`, lead.reason ?? lead.text.slice(0, 140), lead.id);
}

function transport() {
  const port = Number(process.env.EMAIL_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.zoho.in",
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One short email to one person. Quietly does nothing when email is not set up. */
export async function emailPerson(to: string, subject: string, lines: string[], leadIds: number[] = []) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return false;
  const links = leadIds.map((id) => `<a href="${appUrl()}/leads/${id}">Open lead ${id}</a>`).join(" · ");
  try {
    await transport().sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || "Leads"}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text: lines.join("\n"),
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#171717">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}${links ? `<p>${links}</p>` : ""}<p><a href="${appUrl()}/">Open your leads</a></p></div>`,
    });
    return true;
  } catch (err) {
    console.warn("[email]", (err as Error).message);
    return false;
  }
}
