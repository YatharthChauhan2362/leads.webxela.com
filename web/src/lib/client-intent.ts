// Strict check: is this post from someone who wants to pay an outside developer, freelancer or agency?
// Used by Search (in the browser) and by every automatic source on the server, so it has no server imports.
// Not wanted: companies hiring employees, developers or agencies selling, job seekers, tips and marketing posts.

// "someone" counts only as "someone to build/make/help ...". "Developer certificate" and the like are not people.
const WHO = String.raw`(freelancers?|developers?|devs?|agency|agencies|dev(elopment)? (team|shop|partner)|tech partner|technical partner|programmers?|coders?|designers?|experts?|consultants?|engineers?|contractors?|(someone|somebody) (to|who can) (build|develop|make|create|design|fix|help))\b(?!\s+(certificate|account|licen[cs]e|mode|tools?|console|program|role|position|job))`;

// Someone asking for outside help to build something.
const ASKS: RegExp[] = [
  new RegExp(String.raw`\b(looking|searching|seeking) for (a |an )?([\w.+#/-]+ ){0,3}${WHO}`, "i"),
  new RegExp(String.raw`\b(need|needs|needed|require|requires|required|want|wanted) (a |an |some )?([\w.+#/-]+ ){0,3}${WHO}`, "i"),
  /\b(need|want|looking) (someone |somebody |help |a team )?(to )?(build|develop|create|make|design|redesign|fix|revamp) (our|my|an?|the) /i,
  /\b(anyone|who) (can|could|here can|knows?( a| an)?) (build|develop|make|create|design|recommend|suggest|refer)/i,
  /\b(recommend|recommendations?|suggest|suggestions?|refer|referrals?) (for |me )?(a |an )?(good |reliable |solid )?([\w.+#/-]+ ){0,2}(developers?|agency|agencies|freelancers?|dev shop|team|designers?)\b/i,
  /\b(outsourc(e|ing)|rfp|request for proposals?|fixed[- ]price|project[- ]basis|freelance (project|gig|work)|contract basis|paid project)\b/i,
  /\bhiring\b[^.\n]{0,40}\b(freelance|freelancers?|agency|agencies|contractors?)\b/i,
  /\b(anyone|does anyone|who) (know|knows|have|has) (of )?(a |an |any )?(good |reliable |solid )?([\w.+#/-]+ ){0,2}(developers?|devs?|agency|agencies|freelancers?|designers?|dev shop)\b/i,
  /\[(hiring|task|project)\]/i,
];

// Developers, agencies and job seekers talking about themselves.
const SELLER =
  /\b(i am|i'm|we are|we're) (a |an )?([\w-]+ ){0,2}(freelancers?|developers?|agency|studio|company|team) (that|who|helping|specializ|offering|based)|\b(open to work|#opentowork|hire me|available for (work|projects|freelance|hire)|looking for (a )?(job|internship|opportunit|new role|work)|my portfolio|our portfolio|our services|we (build|develop|offer|provide|help|deliver|specialize|create)|dm (me |us )?for (services|projects|quotes?)|book a (call|demo)|free consultation|\[for hire\]|seeking (a )?(job|role|position|opportunit)|willing to relocate|looking for (freelance |remote |part[- ]time |new )?(work|projects|gigs|clients)\b|open to (freelance|new) (work|projects)|r[ée]sum[ée]:|cv:|remote preferred|open to (remote|hybrid|relocation))/i;

// Companies hiring employees: a job, not a project.
const JOB =
  /\b(full[- ]time|part[- ]time (role|position|job)|permanent|salary|ctc|lpa|per annum|join our team|we('re| are) hiring|job (opening|opportunity|description|role)|open (position|role)s?|apply (now|here|via|at|through)|send (your )?(cv|resume)|years of experience|\d\+? ?(yrs|years) exp|work from office|in[- ]office|on[- ]?site|notice period|immediate joiners?|walk[- ]in|interview)/i;

// Tips, news, launches and other marketing or knowledge posts.
const CONTENT =
  /\b(top \d+|\d+ (tips|ways|reasons|lessons|mistakes|tools|steps)|how to |here'?s (why|how|what)|lessons? (i|we) learned|thread|webinar|case study|excited to (announce|share)|proud to|thrilled to|happy to (announce|share)|we (just )?launched|check out (our|my)|new blog|read more|newsletter|guide to|tutorial|cheat ?sheet|hot take|unpopular opinion|agree\?|thoughts\?)/i;

export type ClientCheck = { client: boolean; why: string };

export function clientIntent(text: string): ClientCheck {
  const t = text.replace(/\s+/g, " ");
  const ask = ASKS.find((re) => re.test(t));
  if (SELLER.test(t)) return { client: false, why: "A developer, agency or job seeker selling themselves" };
  if (JOB.test(t) && !/\b(freelanc|contract|project|agency|outsourc)/i.test(t)) return { client: false, why: "A job opening, not a project" };
  if (!ask) return { client: false, why: CONTENT.test(t) ? "Tips or marketing, nobody asking for help" : "Nobody asking for a developer or agency" };
  if (CONTENT.test(t) && !/\b(need|looking for|seeking|anyone|recommend)\b/i.test(t)) return { client: false, why: "Tips or marketing, nobody asking for help" };
  return { client: true, why: `Says "${t.match(ask)![0].trim()}"` };
}
