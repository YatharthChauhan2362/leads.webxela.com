import { describe, expect, it } from "vitest";
import { CURRENCIES, dealWords, money, moneyTotals } from "@/components/leads";

describe("money", () => {
  it("writes rupees with the symbol and others with their code", () => {
    expect(money(50000)).toBe("₹50,000");
    expect(money(2000, "USD").replace(/\s/g, " ")).toBe("USD 2,000");
  });
  it("keeps paise", () => {
    expect(money(1999.5)).toBe("₹1,999.5");
  });
  it("does not crash on an unknown code", () => {
    expect(money(10, "ZZZ")).toContain("10");
  });
  it("never adds across currencies", () => {
    const t = moneyTotals([
      { value: 100, currency: "INR" },
      { value: 50, currency: null },
      { value: 20, currency: "USD" },
    ]).replace(/\s/g, " ");
    expect(t).toBe("₹150 + USD 20");
  });
  it("reads deal history values, old and new", () => {
    expect(dealWords("50000")).toBe("₹50,000");
    expect(dealWords("EUR 300").replace(/\s/g, " ")).toBe("EUR 300");
    expect(dealWords("cleared")).toBe("nothing");
    expect(dealWords(null)).toBe("nothing");
  });
  it("lists every currency once, with INR, USD and EUR", () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of ["INR", "USD", "EUR", "GBP", "AED"]) expect(codes).toContain(c);
    expect(codes.length).toBeGreaterThan(100);
  });
});
