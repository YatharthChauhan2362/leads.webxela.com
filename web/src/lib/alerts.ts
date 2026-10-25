import "server-only";
import nodemailer from "nodemailer";
import type { Lead } from "./db";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailEnabled() {
  return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

export function emailTo() {
  return process.env.EMAIL_TO || process.env.EMAIL_USER || "";
}

type Account = { user: string; pass: string };

/** The main Zoho account, then the backup (EMAIL_USER_2) if one is set. */
function accounts(): Account[] {
  return [
    { user: process.env.EMAIL_USER ?? "", pass: process.env.EMAIL_PASS ?? "" },
    { user: process.env.EMAIL_USER_2 ?? "", pass: process.env.EMAIL_PASS_2 ?? "" },
  ].filter((a) => a.user && a.pass);
}

function transport(a: Account = accounts()[0]) {
  const port = Number(process.env.EMAIL_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.zoho.in",
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: a.user, pass: a.pass },
  });
}

/** Checks the Zoho login without sending anything. */
export async function verifyEmail(): Promise<string | null> {
  if (!emailEnabled()) return "EMAIL_USER and EMAIL_PASS are not set.";
  try {
    await transport().verify();
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

/** One email per check with every hot lead it found, sent through Zoho SMTP. */
export async function sendLeadEmail(leads: Lead[]): Promise<boolean> {
  if (!leads.length || !emailEnabled()) return false;
  const urgent = leads.filter((l) => l.urgency === "urgent").length;
  const when = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  const app = process.env.APP_URL || "http://localhost:3000";

  const rows = leads
    .map(
      (l) => `<tr>
<td>${l.score}${l.urgency === "urgent" ? "<br><b>Urgent</b>" : ""}</td>
<td><b>${esc(l.author)}</b><br><span style="color:#666">${esc(l.headline)}</span></td>
<td>${esc(l.reason)}<br><span style="color:#666">${esc(l.text.slice(0, 280))}${l.text.length > 280 ? "..." : ""}</span></td>
<td>${[l.emails, l.phones].filter(Boolean).map(esc).join("<br>") || "Not found"}</td>
<td>${l.post_url ? `<a href="${esc(l.post_url)}">Post</a>` : ""}${l.author_url ? ` · <a href="${esc(l.author_url)}">Profile</a>` : ""}</td>
</tr>`,
    )
    .join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#171717">
<p>${leads.length} new hot lead${leads.length > 1 ? "s" : ""}. <a href="${esc(app)}">Open the inbox</a> to draft replies.</p>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;border-color:#ddd;font-size:13px">
<tr style="background:#0080FF;color:#fff"><th>Score</th><th>Who</th><th>Needs</th><th>Contact</th><th>Links</th></tr>
${rows}
</table></div>`;

  for (const a of accounts()) {
    try {
      await transport(a).sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || "Yatri Leads"}" <${a.user}>`,
        to: emailTo(),
        subject: `[Leads] ${leads.length} hot lead${leads.length > 1 ? "s" : ""}${urgent ? `, ${urgent} urgent` : ""} (${when})`,
        text: leads.map((l) => `${l.score} ${l.author}: ${l.reason} ${l.post_url ?? ""}`).join("\n"),
        html,
      });
      return true;
    } catch (err) {
      console.warn(`[email] send from ${a.user} failed:`, (err as Error).message);
    }
  }
  return false;
}
