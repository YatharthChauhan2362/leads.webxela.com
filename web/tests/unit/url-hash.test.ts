import { describe, expect, it } from "vitest";
import { normUrl, urlHash } from "@/lib/url-hash";

describe("urlHash", () => {
  it("treats the same profile written different ways as one", () => {
    const a = urlHash("https://in.linkedin.com/in/priya-sharma/");
    expect(urlHash("https://www.linkedin.com/in/priya-sharma")).toBe(a);
    expect(urlHash("https://www.linkedin.com/in/Priya-Sharma/?trk=x#top")).toBe(a);
  });
  it("tells different people apart", () => {
    expect(urlHash("https://www.linkedin.com/in/priya")).not.toBe(urlHash("https://www.linkedin.com/in/priyanka"));
  });
  it("never sends the link itself", () => {
    const h = urlHash("https://www.linkedin.com/in/secret-person/");
    expect(h).not.toContain("secret");
    expect(h).toMatch(/^[0-9a-z]+$/);
  });
  it("normalises", () => {
    expect(normUrl("HTTPS://UK.LINKEDIN.COM/in/x/?a=1")).toBe("https://www.linkedin.com/in/x");
  });
});
