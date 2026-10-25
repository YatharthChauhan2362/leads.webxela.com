import { GoogleBox } from "./google-box";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Input } from "@/components/ui/form";
import { Callout, EmptyState, PageHeader } from "@/components/ui/layout";
import { logActivity } from "@/lib/activity";
import { getSettings, lines, must, sb } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { COUNTRIES } from "@/lib/places";
import { urlHash } from "@/lib/url-hash";
import { Field, Select } from "@/components/ui/form";

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
  const str = (k: string, max = 120) => (typeof sp[k] === "string" ? (sp[k] as string).trim().slice(0, max) : "");
  const q = str("q", 200);
  // Filters
  const country = COUNTRIES[str("country")] ? str("country") : "";
  const city = str("city", 60);
  const role = str("role", 80);
  const company = str("company", 80);
  const exclude = str("exclude", 200);
  const count = [10, 20, 50, 100].includes(Number(sp.count)) ? Number(sp.count) : 20;
  const confirmed = sp.confirmed === "1";
  const newest = sp.newest === "1";
  // Show only results not seen before. On by default; "all=1" shows everything again.
  const showAll = sp.all === "1";
  // Posts are strict by default: only people who want to pay a developer, freelancer or agency.
  const anyPost = sp.any === "1";
  const t = TYPES.find((x) => x.key === type)!;
  const me = await requireMember();
  // Engines are added on the Search engines page. Only the engine ID is needed, no API key.
  const engines = must(await sb().from("search_engines").select("kind, cx").eq("active", true)) as { kind: string; cx: string }[];
  const cx = engines.find((e) => e.kind === type)?.cx ?? null;
  const have = new Set(engines.map((e) => e.kind));

  const params = new URLSearchParams(Object.entries({ type, q, country, city, role, company, exclude, count: String(count), confirmed: confirmed ? "1" : "", newest: newest ? "1" : "", all: showAll ? "1" : "", any: anyPost ? "1" : "" }).filter(([, v]) => v));
  // Everyone and every post we already have, so search never shows them again.
  const [savedLeads, savedPeople, s] = await Promise.all([
    sb().from("leads").select("post_url, author_url").limit(20000).then((r) => must(r) as { post_url: string | null; author_url: string | null }[]),
    sb().from("profiles").select("url").limit(20000).then((r) => must(r) as { url: string }[]),
    getSettings(),
  ]);
  // Only short hashes go to the browser, so members never receive teammates' links.
  const known = [...new Set([...savedLeads.flatMap((l) => [l.post_url, l.author_url]), ...savedPeople.map((p) => p.url)].filter((x): x is string => Boolean(x)).map(urlHash))];
  const back = `/search?${params}`;
  if (q && cx) await logActivity(me, "lookup", { detail: `Searched ${t.label}: ${q}${country ? `, ${COUNTRIES[country].name}` : ""}${city ? `, ${city}` : ""}` });

  // One Google query from the filters. Places widen it with their main cities, words to leave out become -word.
  const quote = (v: string) => (v ? `"${v.replace(/"/g, "")}"` : "");
  const place = city ? quote(city) : country ? `(${COUNTRIES[country].terms.slice(0, 8).map((t) => (t.includes(" ") ? `"${t}"` : t)).join(" OR ")})` : "";
  const fullQuery = [q, quote(role), quote(company), place, ...exclude.split(/[,\s]+/).filter(Boolean).map((w) => `-${w.replace(/^-/, "")}`)].filter(Boolean).join(" ");
  // Words each result must mention for "Location confirmed".
  const confirmTerms = city ? [city] : country ? COUNTRIES[country].terms : [];

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

      <form action="/search" className="mb-2 space-y-3">
        <input type="hidden" name="type" value={type} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="q">
            Search {t.label}
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder={`For example: ${t.example}`} />
          <button className={buttonClass("primary", "md", "h-12 sm:w-40")}>Search</button>
        </div>
        <details className="rounded-2xl border border-border bg-background p-4" open>
          <summary className="min-h-[32px] text-[15px] font-semibold">Filters</summary>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Country" htmlFor="country">
              <Select id="country" name="country" defaultValue={country}>
                <option value="">Any country</option>
                {Object.entries(COUNTRIES)
                  .sort((a, b) => a[1].name.localeCompare(b[1].name))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="City" htmlFor="city" optional hint="Narrower than country.">
              <Input id="city" name="city" defaultValue={city} placeholder="Pune" />
            </Field>
            {type === "profiles" || type === "posts" ? (
              <Field label={type === "profiles" ? "Title or role" : "Must mention"} htmlFor="role" optional>
                <Input id="role" name="role" defaultValue={role} placeholder={type === "profiles" ? "Founder" : "budget"} />
              </Field>
            ) : null}
            {type === "profiles" || type === "companies" ? (
              <Field label={type === "profiles" ? "Company" : "Industry"} htmlFor="company" optional>
                <Input id="company" name="company" defaultValue={company} placeholder={type === "profiles" ? "Infosys" : "logistics"} />
              </Field>
            ) : null}
            <Field label="Leave out these words" htmlFor="exclude" optional hint="Separate with commas.">
              <Input id="exclude" name="exclude" defaultValue={exclude} placeholder="intern, student, hiring" />
            </Field>
            <Field label="How many results" htmlFor="count" hint="Google gives at most 100 per search.">
              <Select id="count" name="count" defaultValue={String(count)}>
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="space-y-3 sm:col-span-2 sm:pt-7">
              <label className="flex items-start gap-3">
                <input type="checkbox" name="confirmed" value="1" defaultChecked={confirmed} className="mt-0.5 size-5 accent-primary" />
                <span>
                  <span className="block text-[15px] font-medium">Confirmed location only</span>
                  <span className="block text-[13px] text-muted-foreground">Keep only results whose name, title or summary mentions the country or city. Fewer results, but they really are there.</span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" name="all" value="1" defaultChecked={showAll} className="mt-0.5 size-5 accent-primary" />
                <span>
                  <span className="block text-[15px] font-medium">Show results I have already seen or saved</span>
                  <span className="block text-[13px] text-muted-foreground">Off by default, so the same search keeps finding new people.</span>
                </span>
              </label>
              {type === "posts" ? (
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="any" value="1" defaultChecked={anyPost} className="mt-0.5 size-5 accent-primary" />
                  <span>
                    <span className="block text-[15px] font-medium">Show every post</span>
                    <span className="block text-[13px] text-muted-foreground">Off by default, so you only see people asking for a developer, freelancer or agency. No job ads, sellers, job seekers or tips.</span>
                  </span>
                </label>
              ) : null}
              {type === "posts" ? (
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="newest" value="1" defaultChecked={newest} className="mt-0.5 size-5 accent-primary" />
                  <span className="block text-[15px] font-medium">Newest first</span>
                </label>
              ) : null}
            </div>
          </div>
        </details>
      </form>
      <p className="mb-6 text-[13px] text-muted-foreground">{t.hint}</p>

      {!cx ? (
        <Callout tone="amber" label="This search is not set up yet">
          An admin adds the {t.label} engine ID on the Search engines page. No API key is needed.
        </Callout>
      ) : !q ? (
        <EmptyState title={`Search ${t.label.toLowerCase()}`} description={`Type what you are looking for, for example: ${t.example}`} />
      ) : (
        <GoogleBox
          key={`${cx}:${fullQuery}:${count}:${confirmed}:${showAll}:${anyPost}`}
          cx={cx}
          q={fullQuery}
          back={back}
          kind={type}
          count={count}
          confirmTerms={confirmTerms}
          confirmedOnly={confirmed}
          newest={newest}
          known={showAll ? [] : known}
          onlyNew={!showAll}
          clientsOnly={type === "posts" && !anyPost}
          services={lines(s.pref_services)}
          places={lines(s.pref_locations)}
        />
      )}
    </>
  );
}
