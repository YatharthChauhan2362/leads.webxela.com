import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPEN_STATUSES, STATUS_WORDS } from "@/components/leads";
import { extractEmails } from "@/lib/contacts";

describe("pipeline", () => {
  it("the app's statuses match the database rule", () => {
    const dir = new URL("../../supabase/migrations/", import.meta.url);
    const sql = readdirSync(dir).map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
    const rule = [...sql.matchAll(/status in \(([^)]*'contract'[^)]*)\)/g)].pop()?.[1] ?? "";
    const db = rule.split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(new Set(Object.keys(STATUS_WORDS))).toEqual(new Set(db));
  });
  it("calls new leads Not contacted yet", () => {
    expect(STATUS_WORDS.new).toBe("Not contacted yet");
  });
  it("paid and lost are not open", () => {
    expect(OPEN_STATUSES).not.toContain("paid");
    expect(OPEN_STATUSES).not.toContain("lost");
  });
});

describe("extractEmails", () => {
  it("finds real emails and drops junk", () => {
    expect(extractEmails("Write to Priya@Acme.in, or x@example.com, or noreply@acme.in.")).toEqual(["priya@acme.in"]);
  });
});
