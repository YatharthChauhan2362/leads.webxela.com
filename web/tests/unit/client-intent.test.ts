import { describe, expect, it } from "vitest";
import { clientIntent } from "@/lib/client-intent";

// People who would pay us: keep.
const CLIENTS = [
  "Looking for a freelance React Native developer to build our delivery app MVP. Budget 3 lakh. DM me.",
  "We need an agency to redesign our Shopify store asap",
  "Can anyone recommend a good web development agency in Pune?",
  "Seeking a technical partner to build our fintech platform, paid project",
  "Need a developer ASAP for a Shopify fix, paid",
  "Hiring a freelance designer for our new logo and landing page",
  "Anyone know a good Flutter dev? Need an app for my clinic",
  "Looking for someone to build a booking website for my salon",
  "[Hiring] contract developer for a 3 month Laravel project",
  "We want to outsource our mobile app development",
];

// Not clients: drop.
const NOT_CLIENTS = [
  "We're hiring! Senior React Developer, full-time, 5+ years experience, apply now",
  "We are looking for a developer to join our team full-time in Bangalore. CTC 12 LPA.",
  "I'm a full-stack developer available for freelance projects. DM me",
  "Looking for freelance work in React and Node",
  "Looking for a job as a frontend developer, open to work",
  "Top 10 tips to choose the right app development company",
  "We build world-class SaaS products. Book a free consultation",
  "Excited to announce we launched our new AI tool!",
  "Don't you need a developer certificate at least?",
  "I need a developer job urgently, any referrals?",
  "Location: Ontario, Canada. Remote preferred. Willing to relocate: yes. Résumé: link",
  "Most people don't fail because they lack talent.",
  "",
];

describe("clientIntent", () => {
  it.each(CLIENTS)("keeps a client: %s", (t) => {
    expect(clientIntent(t).client).toBe(true);
  });
  it.each(NOT_CLIENTS)("drops a non client: %s", (t) => {
    expect(clientIntent(t).client).toBe(false);
  });
  it("always explains why", () => {
    for (const t of [...CLIENTS, ...NOT_CLIENTS]) expect(clientIntent(t).why.length).toBeGreaterThan(5);
  });
  it("copes with very long and odd text quickly", () => {
    const long = "need ".repeat(20000) + "🚀".repeat(1000);
    const t0 = Date.now();
    clientIntent(long);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
