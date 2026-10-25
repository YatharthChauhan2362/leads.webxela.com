"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { cleanProfileUrl, ingestPosts, saveProfile } from "@/lib/ingest";
import { requireMember } from "@/lib/session";
import { sb } from "@/lib/db";

const Hit = z.object({
  title: z.string().max(500),
  link: z.string().url().max(1000),
  snippet: z.string().max(2000),
  photo: z.union([z.literal(""), z.string().url().max(2000)]).optional(),
  back: z.string().max(500),
});

function back(path: string, msg: string, kind: "ok" | "error" = "ok"): never {
  const url = new URL(path.startsWith("/") && !path.startsWith("//") ? path : "/search", "http://x");
  url.searchParams.set(kind, msg);
  redirect(`${url.pathname}${url.search}`);
}

/** Saves a search result as a lead, credited to you, whatever its score. */
export async function saveHitAsLead(formData: FormData) {
  const me = await requireMember();
  const h = Hit.parse(Object.fromEntries(formData));
  const slug = h.link.match(/linkedin\.com\/(?:in|posts)\/([^_/?]+)/)?.[1];
  const res = await ingestPosts(
    [
      {
        source: /linkedin\.com/.test(h.link) ? "linkedin" : "manual",
        postUrl: h.link,
        postId: h.link.match(/activity-(\d{15,})/)?.[1] ? `urn:li:activity:${h.link.match(/activity-(\d{15,})/)![1]}` : h.link,
        author: h.title.split(/ on LinkedIn| \| | - |: /)[0].trim() || null,
        authorUrl: slug ? `https://www.linkedin.com/in/${slug}/` : null,
        text: `${h.title}\n\n${h.snippet}`.slice(0, 5000).padEnd(20, "."),
      },
    ],
    { force: true, capturedBy: me?.id },
  );
  // A saved LinkedIn person also gets their photo in People.
  const profileUrl = cleanProfileUrl(h.link);
  if (h.photo && profileUrl && /linkedin\.com\/in\//.test(profileUrl)) {
    await sb().from("profiles").update({ photo_url: h.photo }).eq("url", profileUrl).is("photo_url", null);
  }
  await logActivity(me, "add_post", { detail: `From search: ${h.link}` });
  back(h.back, res.added ? "Saved as a lead." : "That one is already a lead.");
}

/** Saves a LinkedIn profile result to People, and predicts their work email. */
export async function saveHitAsPerson(formData: FormData) {
  const me = await requireMember();
  const h = Hit.parse(Object.fromEntries(formData));
  const url = cleanProfileUrl(h.link);
  if (!url || !/linkedin\.com\/in\//.test(url)) back(h.back, "Only LinkedIn profile results can be saved to People.", "error");
  const [name, ...rest] = h.title.replace(/ \| LinkedIn$/, "").split(/ - | – /);
  await saveProfile({ url, name: name?.trim() || null, headline: rest.join(" - ").trim() || h.snippet.slice(0, 200), emails: [], phones: [], websites: [] }, me?.id);
  await logActivity(me, "lookup", { target: url, detail: "Saved from search" });
  back(h.back, "Saved to People with a predicted work email where we could find one.");
}
