import "server-only";
import { z } from "zod";
import { aiEnabled, aiJson } from "./ai";

export type Scored = {
  score: number;
  intent: "project" | "job" | "selling" | "other";
  urgency: "urgent" | "soon" | "open";
  reason: string;
  budget: string | null;
  skills: string[];
};

// Phrases people use when they need something built and want to hire someone outside.
const NEED: [RegExp, number][] = [
  // Up to two words may sit in between: "looking for an experienced React developer".
  [/\b(looking|searching|hiring) for (a |an )?([\w.+#-]+ ){0,2}(freelance|freelancer|developer|dev|agency|team|partner|someone|somebody|expert|consultant|designer|engineer)/i, 30],
  [/\b(need|needs|needed|require|requires|required|want) (a |an |some )?([\w.+#-]+ ){0,2}(freelance|freelancer|developer|dev|agency|team|someone|somebody|expert|consultant|designer|engineer|help)/i, 30],
  [/\b(anyone|who) (can|could|knows?) (build|develop|make|create|help|recommend)/i, 25],
  [/\b(recommend|recommendations? for|suggest) (a |an )?(good )?(developer|agency|freelancer|dev shop|team|designer)/i, 25],
  [/\b(build|develop|create|make) (our|my|an?|the) (mvp|app|website|platform|saas|product|dashboard|tool|portal|marketplace|chatbot|ai agent)/i, 20],
  [/\b(rfp|request for proposal|outsourc|contract (role|work|basis)|project basis|fixed price|paid project|gig)\b/i, 20],
  [/\b(dm me|message me|reach out|drop (me )?a (dm|message)|comment below|send (me )?(your )?(portfolio|proposal|quote))/i, 12],
  [/\b(budget|quote|pricing|paid|\$\s?\d|₹\s?\d|usd|inr|€\s?\d|£\s?\d)/i, 10],
  [/\[hiring\]|\[task\]|#hiring|#freelance/i, 15],
  [/\bseeking freelancer\b/i, 40],
];

const URGENT = /\b(asap|urgent(ly)?|immediate(ly)?|right away|this week|today|tomorrow|quick turnaround|by (monday|tuesday|wednesday|thursday|friday|end of (the )?(week|month)))\b/i;
const SOON = /\b(soon|next week|this month|starting now|kick ?off|deadline)\b/i;

// People selling their own services, or job seekers, are not leads.
const SELLING = /\b(i am|i'm|we are|we're) (a |an )?(freelance|full[- ]stack|developer|agency|available|open to)|\bopen to work\b|\bour services\b|\bwe (build|offer|help)\b|\bhire me\b|\[for hire\]|#opentowork/i;
// Full time jobs are weaker leads than projects.
const JOB = /\b(full[- ]time|permanent role|salary|ctc|join our team|we('re| are) hiring for|job opening|apply (now|here)|careers? page)\b/i;

const SKILLS = [
  "react", "next.js", "node", "python", "django", "flutter", "react native", "ios", "android", "wordpress", "shopify",
  "webflow", "ai", "machine learning", "llm", "chatbot", "aws", "azure", "devops", "ui/ux", "figma", "saas", "mvp",
  "web app", "mobile app", "website", "automation", "n8n", "zapier", "data", "blockchain", "erp", "crm",
];

export function heuristicScore(text: string): Scored {
  let score = 0;
  for (const [re, pts] of NEED) if (re.test(text)) score += pts;

  let intent: Scored["intent"] = score >= 25 ? "project" : "other";
  if (SELLING.test(text)) {
    intent = "selling";
    score = Math.min(score, 15);
  } else if (JOB.test(text)) {
    intent = "job";
    score = Math.round(score * 0.6);
  }

  const urgency: Scored["urgency"] = URGENT.test(text) ? "urgent" : SOON.test(text) ? "soon" : "open";
  if (intent === "project" && urgency === "urgent") score += 15;
  if (intent === "project" && urgency === "soon") score += 7;

  const budgetMatch = text.match(/(?:budget[^.\n]{0,30}?)?([$₹€£]\s?\d[\d,.]*\s?(?:k|K|lakh|L)?(?:\s?[-–to]+\s?[$₹€£]?\s?\d[\d,.]*\s?(?:k|K|lakh|L)?)?)/);
  const lower = text.toLowerCase();
  const skills = SKILLS.filter((s) => new RegExp(`(^|[^a-z])${s.replace(/[.+/]/g, "\\$&")}([^a-z]|$)`).test(lower));

  score = Math.max(0, Math.min(100, score));
  const reason =
    intent === "selling"
      ? "Looks like someone offering services, not buying."
      : intent === "job"
        ? "Hiring for a job role. Could still need outside help."
        : intent === "project"
          ? `Asks for outside help to build something${urgency === "urgent" ? " and says it is urgent" : ""}.`
          : "No clear request for outside help.";

  return { score, intent, urgency, reason, budget: budgetMatch?.[1]?.trim() ?? null, skills };
}

const AiScore = z.object({
  score: z.number().min(0).max(100),
  intent: z.enum(["project", "job", "selling", "other"]),
  urgency: z.enum(["urgent", "soon", "open"]),
  reason: z.string().max(300),
  budget: z.string().nullable(),
  skills: z.array(z.string()).max(12),
});

const SYSTEM = `You score social media posts for a software agency that builds websites, apps, SaaS, AI and cloud projects.
A good lead is a person or company asking for outside help to build or fix something (project, contract, freelance, agency).
Reply with JSON only: {"score":0-100,"intent":"project"|"job"|"selling"|"other","urgency":"urgent"|"soon"|"open","reason":"one short sentence","budget":string|null,"skills":["..."]}.
Rules: people selling their own services or looking for work score under 15 with intent "selling". Full time job posts are intent "job" and score at most 50.
Urgent means they want to start now, this week, or say ASAP or immediately.`;

export async function scorePost(text: string, author?: string | null, headline?: string | null): Promise<Scored> {
  const fallback = heuristicScore(text);
  if (!aiEnabled()) return fallback;
  try {
    const out = await aiJson(
      SYSTEM,
      `Author: ${author ?? "unknown"}\nHeadline: ${headline ?? "unknown"}\nPost:\n${text.slice(0, 4000)}`,
      AiScore,
    );
    return { ...out, score: Math.round(out.score) };
  } catch (err) {
    console.warn("[score] AI failed, using keyword score:", (err as Error).message);
    return fallback;
  }
}
