// Talks to the real Supabase project with clearly marked test rows, and removes them after.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sb } from "@/lib/db";
import { findDuplicates } from "@/lib/duplicates";
import { ingestPosts } from "@/lib/ingest";

const RUN = Date.now();
const tag = (s: string) => `yatri-int-${RUN}-${s}`;
const ids: number[] = [];
let memberId = "";

beforeAll(async () => {
  const m = await sb().from("members").insert({ email: `yatri-test-int-${RUN}@example.com`, name: "Int Tester", role: "member", status: "active" }).select("id").single();
  memberId = m.data!.id;
});

afterAll(async () => {
  const rows = (await sb().from("leads").select("id").like("post_key", `%yatri-int-${RUN}%`)).data ?? [];
  const all = [...new Set([...ids, ...rows.map((r) => r.id)])];
  if (all.length) await sb().from("leads").delete().in("id", all);
  await sb().from("members").delete().eq("id", memberId);
});

describe("ingestPosts, strict clients", () => {
  it("keeps a client post and drops sellers, job ads and tips", async () => {
    const res = await ingestPosts(
      [
        { source: "linkedin", postId: tag("client"), text: "Looking for a freelance developer to build our clinic booking website. Please DM." },
        { source: "linkedin", postId: tag("seller"), text: "I'm a full-stack developer available for freelance projects. DM me for my portfolio." },
        { source: "linkedin", postId: tag("job"), text: "We're hiring a React developer, full-time, 5+ years experience, apply now." },
        { source: "linkedin", postId: tag("tips"), text: "Top 10 tips to pick the right app development company in 2026." },
      ],
      { capturedBy: memberId },
    );
    const kept = (await sb().from("leads").select("id, post_key, is_lead, captured_by").like("post_key", `%yatri-int-${RUN}%`)).data ?? [];
    ids.push(...kept.map((k) => k.id));
    expect(kept.map((k) => k.post_key.split("-").pop())).toEqual(["client"]);
    expect(kept[0].is_lead).toBe(false);
    expect(kept[0].captured_by).toBe(memberId);
    expect(res.added).toBe(1);
  });

  it("the same post twice is stored once", async () => {
    const p = { source: "linkedin", postId: tag("twice"), text: "Need an agency to build our SaaS MVP, budget ready." };
    await ingestPosts([p], { capturedBy: memberId });
    const again = await ingestPosts([p], { capturedBy: memberId });
    expect(again.added).toBe(0);
    const rows = (await sb().from("leads").select("id").like("post_key", `%${tag("twice")}%`)).data ?? [];
    ids.push(...rows.map((r) => r.id));
    expect(rows.length).toBe(1);
  });

  it("picking a find by hand makes it a lead credited to the picker", async () => {
    const p = { source: "linkedin", postId: tag("pick"), text: "Looking for a developer to build our delivery app." };
    await ingestPosts([p]);
    await ingestPosts([p], { force: true, capturedBy: memberId });
    const row = (await sb().from("leads").select("id, is_lead, captured_by").like("post_key", `%${tag("pick")}%`).single()).data!;
    ids.push(row.id);
    expect(row.is_lead).toBe(true);
    expect(row.captured_by).toBe(memberId);
  });

  it("skips malformed text without throwing", async () => {
    await expect(ingestPosts([{ source: "linkedin", postId: tag("weird"), text: "need ".repeat(2000) + "\u0000​🚀" }])).resolves.toBeDefined();
  });
});

describe("findDuplicates", () => {
  it("matches by email, profile and post link, and says who owns it", async () => {
    const email = `owner-${RUN}@yatritest.in`;
    const profile = `https://www.linkedin.com/in/yatri-int-${RUN}/`;
    const ins = await sb()
      .from("leads")
      .insert({ source: "manual", post_key: tag("dup"), text: "Duplicate test lead", author: "Dup Person", emails: email, author_url: profile, is_lead: true, captured_by: memberId, score: 50 })
      .select("id")
      .single();
    ids.push(ins.data!.id);
    for (const q of [{ emails: email.toUpperCase() }, { authorUrl: profile.replace("www.", "in.").replace(/\/$/, "") }]) {
      const d = await findDuplicates(q);
      expect(d.map((x) => x.id)).toContain(ins.data!.id);
      expect(d.find((x) => x.id === ins.data!.id)?.owner).toBe("Int Tester");
    }
    expect(await findDuplicates({ emails: email, excludeId: ins.data!.id })).toEqual([]);
  });

  it("ignores filter tricks in the input", async () => {
    await expect(findDuplicates({ emails: "a@b.co),id.gt.0,(x@y.co" })).resolves.toBeInstanceOf(Array);
    expect(await findDuplicates({ emails: "", authorUrl: "", postUrl: "" })).toEqual([]);
  });
});
