import "server-only";
import { getLines } from "./db";
import { ingestPosts, logRun, type PostIn } from "./ingest";

const UA = "web:yatri-leads:0.1 (by Yatri Cloud)";

type RedditChild = {
  data: { id: string; title: string; selftext: string; author: string; permalink: string; created_utc: number; link_flair_text?: string | null };
};

let redditToken: { value: string; until: number } | null = null;

/** App only OAuth token for Reddit's official API. Needs REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET. */
async function redditAuth(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (redditToken && redditToken.until > Date.now()) return redditToken.value;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": UA,
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Reddit sign in failed (${res.status}). Check REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  redditToken = { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 };
  return j.access_token;
}

export function redditEnabled() {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

async function fetchReddit(): Promise<PostIn[]> {
  const token = await redditAuth();
  if (!token) return [];
  const out: PostIn[] = [];
  for (const sub of await getLines("subreddits")) {
    try {
      const res = await fetch(`https://oauth.reddit.com/r/${encodeURIComponent(sub)}/new?limit=50&raw_json=1`, {
        headers: { "user-agent": UA, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        console.warn(`[reddit] r/${sub}: ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { data?: { children?: RedditChild[] } };
      for (const { data: d } of json.data?.children ?? []) {
        // In hiring subs only [Hiring] or [Task] posts are buyers.
        if (/forhire|slavelabour|freelance/i.test(sub) && !/\[(hiring|task)\]/i.test(d.title) && !/hiring|task/i.test(d.link_flair_text ?? "")) continue;
        out.push({
          source: "reddit",
          postId: d.id,
          postUrl: `https://www.reddit.com${d.permalink}`,
          author: `u/${d.author}`,
          authorUrl: `https://www.reddit.com/user/${d.author}`,
          headline: `r/${sub}`,
          text: `${d.title}\n\n${d.selftext}`.trim(),
          postedAt: new Date(d.created_utc * 1000).toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[reddit] r/${sub}:`, (err as Error).message);
    }
  }
  return out;
}

type HnHit = { objectID: string; author: string; created_at: string; title?: string | null; story_text?: string | null; comment_text?: string | null; story_title?: string | null };

async function hnSearch(params: Record<string, string>): Promise<HnHit[]> {
  const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HN ${res.status}`);
  return ((await res.json()) as { hits: HnHit[] }).hits;
}

/** Buyers in the monthly "Freelancer? Seeking freelancer?" thread start their comment with SEEKING FREELANCER. */
async function hnFreelancerThread(): Promise<HnHit[]> {
  const stories = await hnSearch({ query: "Freelancer? Seeking freelancer?", tags: "story", hitsPerPage: "10" });
  const thread = stories.find((h) => /^Ask HN: Freelancer\? Seeking freelancer\?/i.test(h.title ?? ""));
  if (!thread) return [];
  const comments = await hnSearch({ tags: `comment,story_${thread.objectID}`, hitsPerPage: "200" });
  return comments.filter((c) => /^\s*(<p>)?\s*SEEKING FREELANCER/i.test(c.comment_text ?? ""));
}

async function fetchHn(): Promise<PostIn[]> {
  const out: PostIn[] = [];
  const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
  const batches: Promise<HnHit[]>[] = [
    hnFreelancerThread(),
    ...(await getLines("searches")).slice(0, 6).map((q) => hnSearch({ query: `"${q}"`, tags: "(story,comment)", numericFilters: `created_at_i>${since}`, hitsPerPage: "20" })),
  ];
  for (const batch of batches) {
    try {
      for (const h of await batch) {
        const body = (h.story_text ?? h.comment_text ?? "").replace(/<[^>]+>/g, " ").replace(/&#x2F;/g, "/").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
        out.push({
          source: "hackernews",
          postId: h.objectID,
          postUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
          author: h.author,
          authorUrl: `https://news.ycombinator.com/user?id=${h.author}`,
          headline: h.story_title ?? null,
          text: `${h.title ?? ""}\n\n${body}`.trim(),
          postedAt: h.created_at,
        });
      }
    } catch (err) {
      console.warn("[hn]", (err as Error).message);
    }
  }
  return out.filter((p) => p.text.length >= 20);
}

let running = false;

/** Pulls new posts from Reddit and Hacker News. LinkedIn comes in through the Chrome extension. */
export async function pollSources() {
  if (running) return { found: 0, added: 0, skipped: true };
  running = true;
  try {
    const [reddit, hn] = await Promise.all([fetchReddit().catch((e) => (console.warn("[reddit]", e.message), [])), fetchHn()]);
    const posts = [...reddit, ...hn];
    const res = await ingestPosts(posts);
    await logRun("poll", res.found, res.added);
    return res;
  } catch (err) {
    await logRun("poll", 0, 0, (err as Error).message);
    throw err;
  } finally {
    running = false;
  }
}
