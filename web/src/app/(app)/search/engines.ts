import "server-only";
import { must, sb } from "@/lib/db";
import type { Mode } from "@/lib/platforms";

/**
 * The engine for a mode: its own kind first (the LinkedIn engines), then the Web contacts engine, which searches the whole web.
 * Other sites engines only cover a few sites, so they are the last resort.
 * Returns which one it picked so the page can say so.
 */
export async function engineFor(mode: Mode) {
  const engines = must(await sb().from("search_engines").select("kind, cx, label").eq("active", true)) as { kind: string; cx: string; label: string | null }[];
  const web = engines.find((e) => e.kind === "contacts") ?? engines.find((e) => e.kind === "elsewhere");
  const own = mode.engine === "web" ? undefined : engines.find((e) => e.kind === mode.engine);
  const pick = own ?? web;
  return pick ? { cx: pick.cx, label: pick.label, whole: pick === web } : null;
}

/** Short hashes of every post and person the team already has, so results never show them again. Only hashes reach the browser. */
export async function knownHashes() {
  const { urlHash } = await import("@/lib/url-hash");
  const [leads, people] = await Promise.all([
    sb().from("leads").select("post_url, author_url").limit(20000).then((r) => must(r) as { post_url: string | null; author_url: string | null }[]),
    sb().from("profiles").select("url").limit(20000).then((r) => must(r) as { url: string }[]),
  ]);
  return [...new Set([...leads.flatMap((l) => [l.post_url, l.author_url]), ...people.map((p) => p.url)].filter((x): x is string => Boolean(x)).map(urlHash))];
}
