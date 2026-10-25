import "server-only";
import { createHash } from "node:crypto";
import { sb } from "./db";

// Profile photos. LinkedIn photo links expire after a few weeks, so we keep our own copy in Supabase storage.
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function keyFor(profileUrl: string) {
  const slug = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? createHash("sha1").update(profileUrl).digest("hex");
  return slug.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 80);
}

/** Downloads a photo and stores our own copy. Returns its lasting public link, or null. */
export async function storePhoto(source: string, profileUrl: string): Promise<string | null> {
  if (!/^https:\/\//.test(source)) return null;
  // Skip LinkedIn's grey default picture.
  if (/static\.licdn\.com\/aero|\/ghost|default-avatar/i.test(source)) return null;
  try {
    const res = await fetch(source, { signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 leads-app photo copy" } });
    const type = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!res.ok || !TYPES[type]) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length < 800 || body.length > 2 * 1024 * 1024) return null;
    const path = `${keyFor(profileUrl)}.${TYPES[type]}`;
    const up = await sb().storage.from("photos").upload(path, body, { contentType: type, upsert: true, cacheControl: "604800" });
    if (up.error) return null;
    // A version number so browsers show the new picture after an update.
    return `${sb().storage.from("photos").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  } catch {
    return null;
  }
}

/** When LinkedIn gave no photo: their GitHub picture, then their Gravatar. */
export async function fallbackPhoto(profileUrl: string, githubUrl: string | null, emails: string[]): Promise<string | null> {
  const gh = githubUrl?.match(/github\.com\/([^/?#]+)/)?.[1];
  if (gh) {
    const stored = await storePhoto(`https://github.com/${gh}.png?size=160`, profileUrl);
    if (stored) return stored;
  }
  for (const e of emails.slice(0, 3)) {
    const hash = createHash("md5").update(e.trim().toLowerCase()).digest("hex");
    // d=404 means "no Gravatar", so we do not store a made up picture.
    const stored = await storePhoto(`https://www.gravatar.com/avatar/${hash}?s=160&d=404`, profileUrl);
    if (stored) return stored;
  }
  return null;
}
