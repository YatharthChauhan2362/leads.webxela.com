import { Badge } from "@/components/ui/layout";

export const SOURCES: Record<string, string> = { linkedin: "LinkedIn", reddit: "Reddit", hackernews: "Hacker News", manual: "Added by hand" };

export const STATUS_WORDS: Record<string, string> = { new: "New", contacted: "Contacted", replied: "Replied", won: "Won", lost: "Lost" };

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
