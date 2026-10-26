// Social search: one page per platform, each with its own ways to look for clients.
// Every search is a Google query aimed at public pages (site: and inurl: rules), run through the team's
// Google search engines. We never sign in to a platform, never load its pages from our server and never get past its limits.
// Each mode also says which links count (a post, a profile) so wrong pages are dropped before anyone sees them.

export type Field = "what" | "role" | "company";
export type Choice = { value: string; label: string; query: string };
export type Mode = {
  key: string;
  label: string;
  hint: string;
  /** Which engine to use first. Any engine set to search the entire web works for every mode. */
  engine: "profiles" | "posts" | "companies" | "web";
  /** What the results are, which decides how they are shown and saved. */
  shows: "people" | "posts" | "companies" | "pages";
  fields: Field[];
  labels?: Partial<Record<Field, string>>;
  examples: Partial<Record<Field, string>>;
  choice?: { label: string; choices: Choice[] };
  /** Only people asking to hire, using the same check as Search. */
  clientsOnly?: boolean;
  /** Links must match this, and must not match skip. Regex source, so it can reach the browser. */
  keep: string;
  skip?: string;
  build: (v: { what: string; role: string; company: string; place: string; choice: string }) => string;
};
export type Platform = { key: string; name: string; source: string; blurb: string; modes: Mode[] };

const quote = (v: string) => (v ? `"${v.replace(/"/g, "")}"` : "");
/** Several words typed with commas become (a OR b), so one search covers them all. */
const anyOf = (v: string) => {
  const parts = v
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] ? (parts[0].includes(" ") ? quote(parts[0]) : parts[0]) : "";
  return `(${parts.map((p) => (p.includes(" ") ? quote(p) : p)).join(" OR ")})`;
};
const join = (...parts: string[]) => parts.filter(Boolean).join(" ");
const ASKING = `("looking for" OR "need a" OR "need an" OR "recommend" OR "anyone know" OR "hiring")`;
const DECIDERS = `(founder OR "co-founder" OR CEO OR owner OR "managing director")`;

export const PLATFORMS: Platform[] = [
  {
    key: "linkedin",
    name: "LinkedIn",
    source: "linkedin",
    blurb: "Decision makers, posts asking for help, companies and teams hiring for work you can do.",
    modes: [
      {
        key: "people",
        label: "Decision makers",
        hint: "Founders, owners and heads of department, by industry and place.",
        engine: "profiles",
        shows: "people",
        fields: ["role", "what", "company"],
        labels: { role: "Title", what: "Industry or keywords", company: "Company" },
        examples: { role: "Founder, CEO", what: "ecommerce, D2C", company: "" },
        keep: "linkedin\\.com/in/",
        build: (v) => join("site:linkedin.com/in", v.role ? anyOf(v.role) : DECIDERS, anyOf(v.what), quote(v.company), v.place),
      },
      {
        key: "posts",
        label: "Posts asking for help",
        hint: "People posting that they need a developer, designer or agency.",
        engine: "posts",
        shows: "posts",
        fields: ["what"],
        labels: { what: "What they need" },
        examples: { what: "shopify developer, website" },
        clientsOnly: true,
        keep: "linkedin\\.com/(posts|feed/update)/",
        build: (v) => join("site:linkedin.com/posts", ASKING, anyOf(v.what), v.place),
      },
      {
        key: "companies",
        label: "Companies",
        hint: "Company pages by industry and place, to find their website and team.",
        engine: "companies",
        shows: "companies",
        fields: ["what"],
        labels: { what: "Industry or keywords" },
        examples: { what: "logistics, real estate" },
        keep: "linkedin\\.com/company/",
        build: (v) => join("site:linkedin.com/company", anyOf(v.what), v.place),
      },
      {
        key: "hiring",
        label: "Hiring for your skills",
        hint: "Companies with a job open for work you could do for them as an agency instead.",
        engine: "web",
        shows: "pages",
        fields: ["role"],
        labels: { role: "Job title" },
        examples: { role: "react developer, UI designer" },
        keep: "linkedin\\.com/jobs/",
        build: (v) => join("site:linkedin.com/jobs/view", anyOf(v.role || "developer"), v.place),
      },
    ],
  },
  {
    key: "x",
    name: "X (Twitter)",
    source: "x",
    blurb: "Founders tweeting that they need help, and people whose bio says they run a business.",
    modes: [
      {
        key: "posts",
        label: "Posts asking for help",
        hint: "Tweets from people looking for a developer, designer or agency.",
        engine: "web",
        shows: "posts",
        fields: ["what"],
        labels: { what: "What they need" },
        examples: { what: "developer, website, mobile app" },
        clientsOnly: true,
        keep: "(x|twitter)\\.com/[^/]+/status/",
        build: (v) => join("(site:x.com OR site:twitter.com)", "inurl:status", ASKING, anyOf(v.what), v.place),
      },
      {
        key: "people",
        label: "Founders by bio",
        hint: "Profiles whose bio says founder or owner, by industry and place.",
        engine: "web",
        shows: "pages",
        fields: ["role", "what"],
        labels: { role: "Title", what: "Industry or keywords" },
        examples: { role: "founder", what: "SaaS, ecommerce" },
        keep: "(x|twitter)\\.com/[A-Za-z0-9_]{1,15}/?(\\?|$)",
        skip: "/(status|search|hashtag|i|home|explore)\\b",
        build: (v) => join("(site:x.com OR site:twitter.com)", "-inurl:status", v.role ? anyOf(v.role) : DECIDERS, anyOf(v.what), v.place),
      },
    ],
  },
  {
    key: "instagram",
    name: "Instagram",
    source: "instagram",
    blurb: "Small businesses and brands, often with an email or phone in their bio. Good for websites and apps.",
    modes: [
      {
        key: "business",
        label: "Business profiles",
        hint: "Shops, studios, clinics and brands by type and place. Their bio often has an email.",
        engine: "web",
        shows: "pages",
        fields: ["what"],
        labels: { what: "Type of business" },
        examples: { what: "bakery, salon, boutique" },
        choice: {
          label: "Must show",
          choices: [
            { value: "", label: "Anything", query: "" },
            { value: "email", label: "An email", query: `("@gmail.com" OR "email" OR "e-mail")` },
            { value: "phone", label: "A phone or WhatsApp", query: `("whatsapp" OR "call" OR "phone")` },
            { value: "nosite", label: "No website yet", query: `-"www." -".com/"` },
          ],
        },
        keep: "instagram\\.com/[A-Za-z0-9_.]{1,30}/?(\\?|$)",
        skip: "/(p|reel|reels|explore|stories|tv|accounts)/",
        build: (v) => join("site:instagram.com", "-inurl:p", "-inurl:reel", "-inurl:explore", anyOf(v.what), v.place, v.choice),
      },
    ],
  },
  {
    key: "facebook",
    name: "Facebook",
    source: "facebook",
    blurb: "Posts in public groups asking for help, and business pages.",
    modes: [
      {
        key: "groups",
        label: "Group posts asking for help",
        hint: "Public group posts where someone needs a developer, designer or agency.",
        engine: "web",
        shows: "posts",
        fields: ["what"],
        labels: { what: "What they need" },
        examples: { what: "website developer, app" },
        clientsOnly: true,
        keep: "facebook\\.com/groups/",
        build: (v) => join("site:facebook.com/groups", ASKING, anyOf(v.what), v.place),
      },
      {
        key: "pages",
        label: "Business pages",
        hint: "Pages of local businesses by type and place.",
        engine: "web",
        shows: "pages",
        fields: ["what"],
        labels: { what: "Type of business" },
        examples: { what: "restaurant, gym, clinic" },
        keep: "facebook\\.com/",
        skip: "/(groups|posts|photos|videos|events|watch|marketplace|login|sharer)\\b",
        build: (v) => join("site:facebook.com", "-inurl:groups", "-inurl:posts", anyOf(v.what), v.place, `("contact" OR "call" OR "email")`),
      },
    ],
  },
  {
    key: "reddit",
    name: "Reddit",
    source: "reddit",
    blurb: "Hiring posts and founders asking for help in the right communities.",
    modes: [
      {
        key: "requests",
        label: "Hiring and help posts",
        hint: "Threads where someone wants to hire or asks who can build something.",
        engine: "web",
        shows: "posts",
        fields: ["what"],
        labels: { what: "What they need" },
        examples: { what: "web app, shopify, mobile app" },
        clientsOnly: true,
        choice: {
          label: "Where",
          choices: [
            { value: "", label: "Hiring and founder communities", query: "(inurl:r/forhire OR inurl:r/hiring OR inurl:r/startups OR inurl:r/smallbusiness OR inurl:r/entrepreneur OR inurl:r/SaaS)" },
            { value: "forhire", label: "r/forhire", query: `inurl:r/forhire "[hiring]"` },
            { value: "startups", label: "Founders: r/startups, r/SaaS, r/entrepreneur", query: "(inurl:r/startups OR inurl:r/SaaS OR inurl:r/entrepreneur)" },
            { value: "smallbusiness", label: "Small business owners", query: "(inurl:r/smallbusiness OR inurl:r/sweatystartup)" },
            { value: "shopify", label: "Shopify and ecommerce", query: "(inurl:r/shopify OR inurl:r/ecommerce)" },
          ],
        },
        keep: "reddit\\.com/r/[^/]+/comments/",
        build: (v) => join("site:reddit.com", v.choice, ASKING, anyOf(v.what)),
      },
    ],
  },
  {
    key: "youtube",
    name: "YouTube",
    source: "youtube",
    blurb: "Creators and businesses with a business email on their channel.",
    modes: [
      {
        key: "channels",
        label: "Channels with a business email",
        hint: "Channels in a niche that list an email for business enquiries.",
        engine: "web",
        shows: "pages",
        fields: ["what"],
        labels: { what: "Niche" },
        examples: { what: "fitness, cooking, real estate" },
        keep: "youtube\\.com/(@|c/|channel/|user/)",
        skip: "/(watch|shorts|playlist|results)\\b",
        build: (v) => join("site:youtube.com", "(inurl:@ OR inurl:channel)", anyOf(v.what), v.place, `("business inquiries" OR "business enquiries" OR "@gmail.com" OR "for collaborations")`),
      },
    ],
  },
  {
    key: "upwork",
    name: "Upwork",
    source: "upwork",
    blurb: "Public job posts from clients with a budget. Apply on Upwork itself.",
    modes: [
      {
        key: "jobs",
        label: "Open jobs",
        hint: "Public job posts that match your services.",
        engine: "web",
        shows: "posts",
        fields: ["what"],
        labels: { what: "Skill or project" },
        examples: { what: "shopify, next.js, mobile app" },
        keep: "upwork\\.com/(freelance-jobs/apply|jobs)/",
        build: (v) => join("site:upwork.com", "(inurl:freelance-jobs/apply OR inurl:jobs)", anyOf(v.what), v.place),
      },
    ],
  },
];

export const platformOf = (key: string) => PLATFORMS.find((p) => p.key === key);

export const SOURCE_NAMES: Record<string, string> = Object.fromEntries(PLATFORMS.map((p) => [p.source, p.name]));

/** The platform a link belongs to, for saving a result with the right source. */
export function sourceOfLink(link: string) {
  const host = (() => {
    try {
      return new URL(link).hostname.replace(/^www\.|^m\./, "");
    } catch {
      return "";
    }
  })();
  if (/linkedin\.com$/.test(host)) return "linkedin";
  if (/(^|\.)(x|twitter)\.com$/.test(host)) return "x";
  if (/instagram\.com$/.test(host)) return "instagram";
  if (/facebook\.com$/.test(host)) return "facebook";
  if (/reddit\.com$/.test(host)) return "reddit";
  if (/youtube\.com$/.test(host)) return "youtube";
  if (/upwork\.com$/.test(host)) return "upwork";
  return "manual";
}

/** The account name in a profile link, like @bakehouse.pune. */
export function handleOf(link: string): string | null {
  try {
    const u = new URL(link);
    const first = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (/instagram|x\.com|twitter/.test(u.hostname) && /^[A-Za-z0-9_.]{1,30}$/.test(first)) return `@${first}`;
    if (/youtube/.test(u.hostname) && first.startsWith("@")) return first;
    if (/reddit/.test(u.hostname) && first === "r") return `r/${u.pathname.split("/")[2]}`;
    return null;
  } catch {
    return null;
  }
}

/** "12.5K followers" or "3,400 subscribers" from a snippet, when Google shows it. */
export function audienceOf(text: string): string | null {
  return text.match(/\b(\d[\d.,]*\s?[KkMm]?)\+?\s+(followers|subscribers|members|likes)\b/)?.[0] ?? null;
}
