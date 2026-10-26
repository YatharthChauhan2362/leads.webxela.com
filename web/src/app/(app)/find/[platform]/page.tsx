import { notFound } from "next/navigation";
import { engineFor, knownHashes } from "../engines";
import { GoogleBox } from "../../search/google-box";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Field, Input, Select } from "@/components/ui/form";
import { Callout, EmptyState, PageHeader } from "@/components/ui/layout";
import { logActivity } from "@/lib/activity";
import { getSettings, lines } from "@/lib/db";
import { COUNTRIES } from "@/lib/places";
import { PLATFORMS, platformOf } from "@/lib/platforms";
import { requireMember } from "@/lib/session";

const quote = (v: string) => (v ? `"${v.replace(/"/g, "")}"` : "");

/** One platform: pick a way to search, fill in what you want, and get only the right kind of page back. */
export default async function PlatformPage({ params, searchParams }: { params: Promise<{ platform: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ platform: key }, sp] = await Promise.all([params, searchParams]);
  const p = platformOf(key);
  if (!p) notFound();
  const me = await requireMember();
  const mode = p.modes.find((m) => m.key === sp.mode) ?? p.modes[0];
  const str = (k: string, max = 120) => (typeof sp[k] === "string" ? (sp[k] as string).trim().slice(0, max) : "");
  const what = str("what", 200);
  const role = str("role", 120);
  const company = str("company", 80);
  const country = COUNTRIES[str("country")] ? str("country") : "";
  const city = str("city", 60);
  const choice = mode.choice?.choices.find((c) => c.value === str("choice")) ?? mode.choice?.choices[0];
  const count = [10, 20, 50, 100].includes(Number(sp.count)) ? Number(sp.count) : 20;
  const showAll = sp.all === "1";
  const newest = sp.newest === "1";
  const anyPost = sp.any === "1";
  const asked = Boolean(what || role || company);

  const place = city ? quote(city) : country ? `(${COUNTRIES[country].terms.slice(0, 8).map((t) => (t.includes(" ") ? quote(t) : t)).join(" OR ")})` : "";
  const query = mode.build({ what, role, company, place, choice: choice?.query ?? "" });
  const confirmTerms = city ? [city] : country ? COUNTRIES[country].terms : [];
  const [engine, known, s] = await Promise.all([engineFor(mode), asked && !showAll ? knownHashes() : Promise.resolve([] as string[]), getSettings()]);
  const keep = new URLSearchParams(Object.entries({ mode: mode.key, what, role, company, country, city, choice: choice?.value ?? "", count: String(count), all: showAll ? "1" : "", newest: newest ? "1" : "", any: anyPost ? "1" : "" }).filter(([, v]) => v));
  const back = `/find/${p.key}?${keep}`;
  if (asked && engine) await logActivity(me, "lookup", { detail: `Social search ${p.name}, ${mode.label}: ${[what, role, company].filter(Boolean).join(", ")}` });
  const kind = mode.shows === "people" ? "profiles" : mode.shows === "companies" ? "companies" : "posts";

  return (
    <>
      <PageHeader title={p.name} description={p.blurb} back={{ href: "/find", label: "Social search" }} />
      <Flash searchParams={sp} />

      <nav aria-label="Platforms" className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          {PLATFORMS.map((x) => (
            <li key={x.key}>
              <a
                href={`/find/${x.key}`}
                aria-current={x.key === p.key ? "page" : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-[15px] font-medium whitespace-nowrap ${x.key === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"}`}
              >
                {x.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* A fresh page for each mode: Google's search box needs one. */}
      {p.modes.length > 1 ? (
        <nav aria-label="Ways to search" className="mb-4 max-w-full overflow-x-auto">
          <div className="inline-flex gap-1 rounded-2xl border border-border bg-background p-1.5">
            {p.modes.map((m) => (
              <a
                key={m.key}
                href={`/find/${p.key}?mode=${m.key}`}
                aria-current={m.key === mode.key ? "page" : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-xl px-4 text-[15px] font-medium whitespace-nowrap ${m.key === mode.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {m.label}
              </a>
            ))}
          </div>
        </nav>
      ) : null}

      <form action={`/find/${p.key}`} className="mb-2 rounded-2xl border border-border bg-background p-4">
        <input type="hidden" name="mode" value={mode.key} />
        <p className="mb-4 text-[15px] text-muted-foreground">{mode.hint}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {mode.fields.map((f) => (
            <Field key={f} label={mode.labels?.[f] ?? f} htmlFor={`f-${f}`} optional={f !== mode.fields[0]} hint={f === "what" || f === "role" ? "Separate several with commas." : undefined}>
              <Input id={`f-${f}`} name={f} defaultValue={{ what, role, company }[f]} placeholder={mode.examples[f] ?? ""} />
            </Field>
          ))}
          {mode.choice ? (
            <Field label={mode.choice.label} htmlFor="f-choice">
              <Select id="f-choice" name="choice" defaultValue={choice?.value ?? ""}>
                {mode.choice.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {mode.key !== "requests" ? (
            <>
              <Field label="Country" htmlFor="f-country" optional>
                <Select id="f-country" name="country" defaultValue={country}>
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
              <Field label="City" htmlFor="f-city" optional>
                <Input id="f-city" name="city" defaultValue={city} placeholder="Pune" />
              </Field>
            </>
          ) : null}
          <Field label="How many results" htmlFor="f-count">
            <Select id="f-count" name="count" defaultValue={String(count)}>
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          <label className="flex items-center gap-2 text-[15px]">
            <input type="checkbox" name="all" value="1" defaultChecked={showAll} className="size-5 accent-primary" />
            Show ones we already have
          </label>
          {mode.shows === "posts" ? (
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" name="newest" value="1" defaultChecked={newest} className="size-5 accent-primary" />
              Newest first
            </label>
          ) : null}
          {mode.clientsOnly ? (
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" name="any" value="1" defaultChecked={anyPost} className="size-5 accent-primary" />
              Show every post, not only people hiring
            </label>
          ) : null}
          <button className={buttonClass("primary", "md", "sm:ml-auto sm:w-40")}>Search</button>
        </div>
      </form>
      {asked ? (
        <details className="mb-6 text-[13px] text-muted-foreground">
          <summary className="inline-flex min-h-[36px] cursor-pointer items-center">See the Google search we run</summary>
          <code className="block rounded-xl bg-muted p-3 break-words text-foreground">{query}</code>
          {engine ? (
            <p className="mt-2">
              Runs on the engine {engine.label ?? "without a name"}.{engine.whole ? " If nothing comes back, check that engine has Search the entire web turned on." : ""}
            </p>
          ) : null}
        </details>
      ) : (
        <div className="mb-6" />
      )}

      {!engine ? (
        <Callout tone="amber" label="Not set up yet">
          This search needs a Google engine with Search the entire web turned on. An admin adds it on the Search engines page with the kind Web contacts. No API key is needed.
        </Callout>
      ) : !asked ? (
        <EmptyState title={`Search ${p.name}`} description={`Fill in ${(mode.labels?.[mode.fields[0]] ?? "the first box").toLowerCase()} and press Search.`} />
      ) : (
        <GoogleBox
          key={`${engine.cx}:${query}:${count}:${showAll}:${anyPost}:${newest}`}
          cx={engine.cx}
          q={query}
          back={back}
          kind={kind}
          count={count}
          confirmTerms={confirmTerms}
          newest={newest}
          known={known}
          onlyNew={!showAll}
          clientsOnly={Boolean(mode.clientsOnly) && !anyPost}
          services={lines(s.pref_services)}
          places={lines(s.pref_locations)}
          keep={mode.keep}
          skip={mode.skip}
          platform={p.key}
        />
      )}
    </>
  );
}
