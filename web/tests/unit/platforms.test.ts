import { describe, expect, it } from "vitest";
import { PLATFORMS, audienceOf, handleOf, platformOf, sourceOfLink } from "@/lib/platforms";

const mode = (p: string, m: string) => platformOf(p)!.modes.find((x) => x.key === m)!;
const keeps = (p: string, m: string, link: string) => {
  const md = mode(p, m);
  return new RegExp(md.keep, "i").test(link) && !(md.skip && new RegExp(md.skip, "i").test(link));
};
const blank = { what: "", role: "", company: "", place: "", choice: "" };

describe("social search queries", () => {
  it("every mode aims at its own site", () => {
    for (const p of PLATFORMS) for (const m of p.modes) expect(m.build({ ...blank, what: "shop", role: "founder" })).toMatch(/site:/);
  });
  it("commas become OR, so one search covers several words", () => {
    expect(mode("instagram", "business").build({ ...blank, what: "bakery, cake shop" })).toContain(`(bakery OR "cake shop")`);
  });
  it("LinkedIn people default to decision makers when no title is given", () => {
    expect(mode("linkedin", "people").build({ ...blank, what: "ecommerce" })).toMatch(/founder OR "co-founder" OR CEO/);
  });
  it("adds the place and the chosen filter", () => {
    const q = mode("instagram", "business").build({ ...blank, what: "salon", place: `"Pune"`, choice: `("@gmail.com" OR "email")` });
    expect(q).toContain(`"Pune"`);
    expect(q).toContain(`"@gmail.com"`);
  });
});

describe("only the right kind of page is kept", () => {
  it("Instagram keeps profiles, drops posts and reels", () => {
    expect(keeps("instagram", "business", "https://www.instagram.com/bakehouse.pune/")).toBe(true);
    expect(keeps("instagram", "business", "https://www.instagram.com/p/C1abc/")).toBe(false);
    expect(keeps("instagram", "business", "https://www.instagram.com/reel/C1abc/")).toBe(false);
  });
  it("X posts must be a tweet, X people must be a profile", () => {
    expect(keeps("x", "posts", "https://x.com/jane/status/1800000000000000000")).toBe(true);
    expect(keeps("x", "posts", "https://x.com/jane")).toBe(false);
    expect(keeps("x", "people", "https://twitter.com/jane_doe")).toBe(true);
    expect(keeps("x", "people", "https://x.com/jane/status/1")).toBe(false);
    expect(keeps("x", "people", "https://x.com/search?q=x")).toBe(false);
  });
  it("Reddit keeps threads only", () => {
    expect(keeps("reddit", "requests", "https://www.reddit.com/r/forhire/comments/abc/hiring_dev/")).toBe(true);
    expect(keeps("reddit", "requests", "https://www.reddit.com/r/forhire/")).toBe(false);
  });
  it("YouTube keeps channels, drops videos", () => {
    expect(keeps("youtube", "channels", "https://www.youtube.com/@fitwithasha")).toBe(true);
    expect(keeps("youtube", "channels", "https://www.youtube.com/watch?v=abc")).toBe(false);
  });
  it("Facebook groups keep group posts, pages drop groups", () => {
    expect(keeps("facebook", "groups", "https://www.facebook.com/groups/12345/posts/678/")).toBe(true);
    expect(keeps("facebook", "pages", "https://www.facebook.com/groups/12345/")).toBe(false);
    expect(keeps("facebook", "pages", "https://www.facebook.com/punebakery")).toBe(true);
  });
  it("LinkedIn modes keep their own page types", () => {
    expect(keeps("linkedin", "people", "https://in.linkedin.com/in/priya-sharma")).toBe(true);
    expect(keeps("linkedin", "people", "https://www.linkedin.com/company/acme")).toBe(false);
    expect(keeps("linkedin", "hiring", "https://www.linkedin.com/jobs/view/react-developer-at-acme-123")).toBe(true);
  });
  it("Upwork keeps job posts", () => {
    expect(keeps("upwork", "jobs", "https://www.upwork.com/freelance-jobs/apply/Shopify-store_~0123/")).toBe(true);
    expect(keeps("upwork", "jobs", "https://www.upwork.com/freelancers/~0180b")).toBe(false);
  });
});

describe("reading results", () => {
  it("names the platform a link came from", () => {
    expect(sourceOfLink("https://m.facebook.com/groups/1")).toBe("facebook");
    expect(sourceOfLink("https://twitter.com/a/status/1")).toBe("x");
    expect(sourceOfLink("https://example.com")).toBe("manual");
  });
  it("reads handles and audience size", () => {
    expect(handleOf("https://www.instagram.com/bakehouse.pune/")).toBe("@bakehouse.pune");
    expect(handleOf("https://www.youtube.com/@fitwithasha/videos")).toBe("@fitwithasha");
    expect(audienceOf("Bakery in Pune. 12.5K followers, 300 following")).toBe("12.5K followers");
    expect(audienceOf("no numbers here")).toBeNull();
  });
});
