import { GoogleBox } from "./google-box";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Input } from "@/components/ui/form";
import { Callout, EmptyState, PageHeader } from "@/components/ui/layout";
import { logActivity } from "@/lib/activity";
import { must, sb } from "@/lib/db";
import { currentMember } from "@/lib/session";

type Kind = "posts" | "profiles" | "companies" | "contacts" | "elsewhere";

const TYPES: { key: Kind; label: string; hint: string; example: string }[] = [
  { key: "posts", label: "Posts", hint: "LinkedIn posts from people who need something built.", example: "need a shopify developer" },
  { key: "profiles", label: "People", hint: "LinkedIn profiles by role, company or place.", example: "founder ecommerce Bangalore" },
  { key: "companies", label: "Companies", hint: "LinkedIn company pages, to find their website and team.", example: "logistics startup Pune" },
  { key: "contacts", label: "Web contacts", hint: "A person's public email or phone on the web.", example: "\"Sanskriti Kadam\" Hitachi email" },
  { key: "elsewhere", label: "Other sites", hint: "Project requests on Reddit, X, Hacker News and more.", example: "[hiring] web app" },
];

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const type = TYPES.find((t) => t.key === sp.type)?.key ?? "posts";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const t = TYPES.find((x) => x.key === type)!;
  const me = await currentMember();
  // Engines are added on the Search engines page. Only the engine ID is needed, no API key.
  const engines = must(await sb().from("search_engines").select("kind, cx").eq("active", true)) as { kind: string; cx: string }[];
  const cx = engines.find((e) => e.kind === type)?.cx ?? null;
  const have = new Set(engines.map((e) => e.kind));
  if (q && cx) await logActivity(me, "lookup", { detail: `Searched ${t.label}: ${q}` });
  const back = `/search?type=${type}&q=${encodeURIComponent(q)}`;

  return (
    <>
      <PageHeader title="Search" description="Find posts, people, companies and contact details with your Google search engines. Save anything good in one click." />
      <Flash searchParams={sp} />

      {/* Plain links: each tab loads a different Google engine, which needs a fresh page. */}
      <nav className="no-print mb-6 max-w-full overflow-x-auto" aria-label="What to search">
        <div className="inline-flex gap-1 rounded-2xl border border-border bg-background p-1.5">
          {TYPES.filter((x) => have.has(x.key) || x.key === type).map((x) => (
            <a
              key={x.key}
              href={`/search?type=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={x.key === type ? "page" : undefined}
              className={`inline-flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-medium whitespace-nowrap transition-colors ${
                x.key === type ? "bg-primary text-primary-foreground shadow-[var(--shadow-inset)]" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {x.label}
            </a>
          ))}
        </div>
      </nav>

      <form action="/search" className="mb-2 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="type" value={type} />
        <label className="sr-only" htmlFor="q">
          Search {t.label}
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder={`For example: ${t.example}`} />
        <button className={buttonClass("primary", "md", "h-12 sm:w-40")}>Search</button>
      </form>
      <p className="mb-6 text-[13px] text-muted-foreground">{t.hint}</p>

      {!cx ? (
        <Callout tone="amber" label="This search is not set up yet">
          An admin adds the {t.label} engine ID on the Search engines page. No API key is needed.
        </Callout>
      ) : !q ? (
        <EmptyState title={`Search ${t.label.toLowerCase()}`} description={`Type what you are looking for, for example: ${t.example}`} />
      ) : (
        <GoogleBox key={`${cx}:${q}`} cx={cx} q={q} back={back} kind={type} />
      )}
    </>
  );
}
