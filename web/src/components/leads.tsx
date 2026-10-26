import { Badge } from "@/components/ui/layout";

export const SOURCES: Record<string, string> = {
  linkedin: "LinkedIn",
  reddit: "Reddit",
  hackernews: "Hacker News",
  manual: "Added by hand",
  referral: "Referral",
  email: "Email",
  call: "Phone call",
  event: "Event",
  website: "Our website",
  other: "Other",
};

export const JOB_WORDS: Record<string, string> = { lead_generator: "Lead generator", bde: "BDE (sales)", manager: "Manager", other: "Other" };

// The team's pipeline, in order.
export const STATUS_WORDS: Record<string, string> = {
  new: "Not contacted yet",
  contacted: "Contacted",
  interested: "Interested",
  proposal: "Proposal sent",
  contract: "Contract signed",
  paid: "Payment received",
  lost: "Lost",
};
export const OPEN_STATUSES = ["new", "contacted", "interested", "proposal", "contract"];

const WORK_WORDS: Record<string, string> = { found: "Found", likely: "Likely", guess: "Guess" };

export function scoreTone(score: number) {
  return score >= 70 ? "green" : score >= 50 ? "amber" : "neutral";
}

export function ScoreBadge({ score }: { score: number }) {
  return <Badge tone={scoreTone(score)}>{score >= 70 ? `Hot ${score}` : score >= 50 ? `Warm ${score}` : `Cold ${score}`}</Badge>;
}

export const list = (s: string | null | undefined) => (s ? s.split(", ").filter(Boolean) : []);

/** Email, phone and predicted work email in one compact cell. */
export function ContactCell({
  emails,
  phones,
  workEmail,
  workStatus,
  workConfidence,
}: {
  emails: string;
  phones: string;
  workEmail?: string | null;
  workStatus?: string | null;
  workConfidence?: number | null;
}) {
  const e = list(emails);
  const p = list(phones);
  const showWork = workEmail && !e.includes(workEmail);
  if (!e.length && !p.length && !showWork) return <span className="text-muted-foreground">Not found yet</span>;
  return (
    <div className="space-y-1">
      {e.slice(0, 2).map((x) => (
        <a key={x} href={`mailto:${x}`} className="block break-all text-primary hover:underline">
          {x}
        </a>
      ))}
      {showWork ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <a href={`mailto:${workEmail}`} className="break-all text-primary hover:underline">
            {workEmail}
          </a>
          <Badge tone={workStatus === "found" ? "green" : workStatus === "likely" ? "blue" : "neutral"}>
            {WORK_WORDS[workStatus ?? "guess"]} {workConfidence ?? ""}%
          </Badge>
        </div>
      ) : null}
      {p.slice(0, 2).map((x) => (
        <a key={x} href={`tel:${x.replace(/[^\d+]/g, "")}`} className="block whitespace-nowrap text-primary hover:underline">
          {x}
        </a>
      ))}
    </div>
  );
}

/** Every currency the runtime knows, as ISO codes with their names, for the deal value picker. */
export const CURRENCIES: { code: string; name: string }[] = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  return Intl.supportedValuesOf("currency")
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));
})();

/** An amount in its own currency: ₹50,000 for rupees, USD 2,000 for the rest, since "$" alone is ambiguous. */
export function money(n: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, currencyDisplay: currency === "INR" ? "symbol" : "code", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("en-IN")}`;
  }
}

/** Totals in several currencies, never added across currencies: "₹50,000 + USD 2,000". */
export function moneyTotals(rows: { value: number; currency: string | null }[]) {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency ?? "INR", (by.get(r.currency ?? "INR") ?? 0) + r.value);
  return [...by].map(([c, v]) => money(v, c)).join(" + ");
}

/** A deal event's value, saved as "USD 2000" (older ones are just "50000", in rupees). */
export function dealWords(v: string | null) {
  if (!v || v === "cleared") return "nothing";
  const [a, b] = v.split(" ");
  return b === undefined ? money(Number(a)) : money(Number(b), a);
}
