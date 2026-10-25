import { saveHitAsLead, saveHitAsPerson } from "./actions";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Input } from "@/components/ui/form";
import { Callout, Card, EmptyState, PageHeader, Tabs } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { logActivity } from "@/lib/activity";
import { engineReady, searchEngine, searchesLeftToday, type Engine } from "@/lib/google-search";
import { currentMember } from "@/lib/session";

const TYPES: { key: Engine; label: string; hint: string; example: string }[] = [
  { key: "posts", label: "Posts", hint: "LinkedIn posts from people who need something built.", example: "need a shopify developer" },
  { key: "profiles", label: "People", hint: "LinkedIn profiles by role, company or place.", example: "founder ecommerce Bangalore" },
  { key: "companies", label: "Companies", hint: "LinkedIn company pages, to find their website and team.", example: "logistics startup Pune" },
  { key: "contacts", label: "Web contacts", hint: "A person's public email or phone on the web.", example: "\"Sanskriti Kadam\" Hitachi email" },
  { key: "elsewhere", label: "Other sites", hint: "Project requests on Reddit, X, Hacker News and more.", example: "[hiring] web app" },
];

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const type = (TYPES.find((t) => t.key === sp.type)?.key ?? "posts") as Engine;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const page = Math.min(5, Math.max(1, Number(sp.page) || 1));
  const t = TYPES.find((x) => x.key === type)!;
  const me = await currentMember();
  const result = q ? await searchEngine(type, q, page) : null;
  if (q && result?.used) await logActivity(me, "lookup", { detail: `Searched ${t.label}: ${q}` });
  const left = await searchesLeftToday();
  const ready = await engineReady(type);
  const back = `/search?type=${type}&q=${encodeURIComponent(q)}&page=${page}`;

  return (
    <>
      <PageHeader title="Search" description="Find posts, people, companies and contact details with your Google search engines. Save anything good in one click." />
      <Flash searchParams={sp} />

      <Tabs active={type} label="What to search" tabs={TYPES.map((x) => ({ key: x.key, label: x.label, href: `/search?type=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}` }))} />

      <form action="/search" className="mb-2 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="type" value={type} />
        <label className="sr-only" htmlFor="q">
          Search {t.label}
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder={`For example: ${t.example}`} />
        <button className={buttonClass("primary", "md", "h-12 sm:w-40")}>Search</button>
      </form>
      <p className="mb-6 text-[13px] text-muted-foreground">
        {t.hint} {left} free searches left today for the whole team.
      </p>

      {!ready ? (
        <Callout tone="amber" label="This search is not set up yet">
          Ask an admin to add a Google API key and a {t.label} engine on the Search engines page, or all of today&apos;s free searches are used up.
        </Callout>
      ) : !q ? (
        <EmptyState title={`Search ${t.label.toLowerCase()}`} description={`Type what you are looking for, for example: ${t.example}`} />
      ) : !result?.hits.length ? (
        <EmptyState title="No results" description={left <= 0 ? "Today's free searches are used up. Try again tomorrow." : "Try fewer or different words."} />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {result.hits.map((h) => (
            <Card key={h.link}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <a href={h.link} target="_blank" rel="noreferrer" className="text-[16px] font-semibold break-words hover:text-primary hover:underline">
                    {h.title}
                  </a>
                  <p className="mt-0.5 text-[13px] break-all text-muted-foreground">{h.link}</p>
                  {h.snippet ? <p className="mt-2 text-[15px] text-foreground">{h.snippet}</p> : null}
                  {h.emails.length || h.phones.length ? (
                    <p className="mt-2 text-[14px]">
                      {[...h.emails, ...h.phones].map((c) => (
                        <span key={c} className="mr-3 font-medium text-primary select-all">
                          {c}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {[saveHitAsLead, ...(/linkedin\.com\/in\//.test(h.link) ? [saveHitAsPerson] : [])].map((action, i) => (
                    <form key={i} action={action}>
                      <input type="hidden" name="title" value={h.title.slice(0, 500)} />
                      <input type="hidden" name="link" value={h.link.slice(0, 1000)} />
                      <input type="hidden" name="snippet" value={h.snippet.slice(0, 2000)} />
                      <input type="hidden" name="back" value={back} />
                      <SubmitButton variant={i === 0 ? "primary" : "secondary"} size="sm" pendingText="Saving...">
                        {i === 0 ? "Save as lead" : "Save to People"}
                      </SubmitButton>
                    </form>
                  ))}
                </div>
              </div>
            </Card>
          ))}
          <div className="flex gap-2">
            {page > 1 ? (
              <a href={`/search?type=${type}&q=${encodeURIComponent(q)}&page=${page - 1}`} className={buttonClass("secondary")}>
                Previous
              </a>
            ) : null}
            {result.hits.length === 10 && page < 5 ? (
              <a href={`/search?type=${type}&q=${encodeURIComponent(q)}&page=${page + 1}`} className={buttonClass("secondary")}>
                More results
              </a>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
