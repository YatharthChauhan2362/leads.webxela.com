import { addEngine, addKey, remove, testEngine, toggle } from "./actions";
import { Flash } from "@/components/ui/flash";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Card, CardHeader, PageHeader, Stat } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { must, sb } from "@/lib/db";
import { searchesLeftToday } from "@/lib/google-search";
import { requireMember } from "@/lib/session";

const KINDS: Record<string, { word: string; sites: string }> = {
  posts: { word: "Posts", sites: "www.linkedin.com/posts/*, www.linkedin.com/feed/update/*, www.linkedin.com/pulse/*" },
  profiles: { word: "People", sites: "www.linkedin.com/in/*" },
  companies: { word: "Companies", sites: "www.linkedin.com/company/*" },
  contacts: { word: "Web contacts", sites: "Search the entire web, or github.com/*, x.com/*, about.me/*, linktr.ee/*, medium.com/*, www.crunchbase.com/*" },
  elsewhere: { word: "Other sites", sites: "www.reddit.com/r/forhire/*, www.reddit.com/r/startups/*, news.ycombinator.com/*, x.com/*/status/*, www.indiehackers.com/*" },
};

type KeyRow = { id: string; label: string; api_key: string; daily_limit: number; used_on: string | null; used_today: number; exhausted_on: string | null; last_error: string | null; active: boolean };
type EngRow = { id: string; label: string; kind: string; cx: string; active: boolean; used_on: string | null; used_today: number; last_error: string | null };

export default async function EnginesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMember("admin");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [keys, engines, left] = await Promise.all([
    sb().from("search_keys").select("*").order("created_at").then((r) => must(r) as KeyRow[]),
    sb().from("search_engines").select("*").order("kind").order("created_at").then((r) => must(r) as EngRow[]),
    searchesLeftToday(),
  ]);
  const used = (r: { used_on: string | null; used_today: number }) => (r.used_on === today ? r.used_today : 0);
  const mask = (k: string) => `${k.slice(0, 6)}...${k.slice(-4)}`;

  return (
    <>
      <PageHeader
        title="Search engines"
        description="Google API keys and search engines. Add keys from as many Google accounts as you like: when one uses its 100 free searches for the day, the next one takes over."
      />
      <Flash searchParams={searchParams} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Searches left today" value={left} note="All working keys together" />
        <Stat label="API keys" value={keys.filter((k) => k.active).length} note={`${keys.filter((k) => k.exhausted_on === today).length} used up today`} />
        <Stat label="Engines" value={engines.filter((e) => e.active).length} />
        <Stat label="Kinds covered" value={`${new Set(engines.filter((e) => e.active).map((e) => e.kind)).size} of 5`} />
      </div>

      <Card className="mb-6">
        <CardHeader title="How to add a Google account" />
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px]">
          <li>Sign in to Google Cloud with the new account and create a project.</li>
          <li>In APIs and services, open Library, find Custom Search API and press Enable.</li>
          <li>Open Credentials, press Create credentials, then API key. Copy the key, it starts with AIza.</li>
          <li>Add it below as a new key. It is tested before it is saved.</li>
          <li>Engines can be made in any Google account. One API key works with every engine.</li>
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Add an API key" description="One per Google account. 100 free searches a day each." />
          <form action={addKey} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_140px]">
              <Field label="Name" htmlFor="k-label" hint="For example: team@ account">
                <Input id="k-label" name="label" required maxLength={60} />
              </Field>
              <Field label="API key" htmlFor="k-key">
                <Input id="k-key" name="api_key" required placeholder="AIza..." autoComplete="off" />
              </Field>
              <Field label="Per day" htmlFor="k-limit" hint="100 is free.">
                <Input id="k-limit" name="daily_limit" type="number" min={1} max={10000} defaultValue={100} required />
              </Field>
            </div>
            <SubmitButton pendingText="Testing...">Test and add key</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardHeader title="Add an engine" description="Make it at programmablesearchengine.google.com, add the sites for its kind, then paste its Search engine ID." />
          <form action={addEngine} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_160px_1fr]">
              <Field label="Name" htmlFor="e-label">
                <Input id="e-label" name="label" required maxLength={60} placeholder="LinkedIn Post Leads" />
              </Field>
              <Field label="Kind" htmlFor="e-kind">
                <Select id="e-kind" name="kind" defaultValue="posts">
                  {Object.entries(KINDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.word}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Search engine ID" htmlFor="e-cx">
                <Input id="e-cx" name="cx" required placeholder="667ebfd0a83944a86" autoComplete="off" />
              </Field>
            </div>
            <SubmitButton pendingText="Testing...">Test and add engine</SubmitButton>
          </form>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
        API keys, used in this order
      </h2>
      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Key</Th>
            <Th align="right">Used today</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {keys.length === 0 ? (
            <Tr>
              <Td className="text-muted-foreground">No keys yet. Add one above.</Td>
            </Tr>
          ) : null}
          {keys.map((k) => (
            <Tr key={k.id}>
              <Td className="font-semibold">{k.label}</Td>
              <Td className="font-mono text-[13px]">{mask(k.api_key)}</Td>
              <Td align="right">
                {used(k)} of {k.daily_limit}
              </Td>
              <Td className="min-w-[200px]">
                {!k.active ? <Badge>Paused</Badge> : k.exhausted_on === today || used(k) >= k.daily_limit ? <Badge tone="amber">Used up today</Badge> : k.last_error ? <Badge tone="red">Problem</Badge> : <Badge tone="green">Working</Badge>}
                {k.last_error ? <p className="mt-1 text-[13px] text-muted-foreground">{k.last_error}</p> : null}
              </Td>
              <Td>
                <Actions table="search_keys" id={k.id} active={k.active} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <h2 className="mt-8 mb-3 text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
        Engines
      </h2>
      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Kind</Th>
            <Th>Engine ID</Th>
            <Th align="right">Used today</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {engines.map((e) => (
            <Tr key={e.id}>
              <Td className="font-semibold">{e.label}</Td>
              <Td>{KINDS[e.kind]?.word ?? e.kind}</Td>
              <Td className="font-mono text-[13px]">{e.cx}</Td>
              <Td align="right">{used(e)}</Td>
              <Td className="min-w-[180px]">
                {!e.active ? <Badge>Paused</Badge> : e.last_error ? <Badge tone="red">Problem</Badge> : <Badge tone="green">On</Badge>}
                {e.last_error ? <p className="mt-1 text-[13px] text-muted-foreground">{e.last_error}</p> : null}
              </Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  <form action={testEngine}>
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton variant="secondary" size="sm" pendingText="Testing...">
                      Test
                    </SubmitButton>
                  </form>
                  <Actions table="search_engines" id={e.id} active={e.active} />
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Card className="mt-8">
        <CardHeader title="Sites for each kind of engine" description="When you make an engine, add these under Sites to search." />
        <ul className="space-y-2 text-[15px]">
          {Object.values(KINDS).map((k) => (
            <li key={k.word}>
              <span className="font-semibold">{k.word}:</span> <span className="break-words text-muted-foreground">{k.sites}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Actions({ table, id, active }: { table: "search_keys" | "search_engines"; id: string; active: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={toggle}>
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="on" value={active ? "0" : "1"} />
        <SubmitButton variant="secondary" size="sm" pendingText="Saving...">
          {active ? "Pause" : "Turn on"}
        </SubmitButton>
      </form>
      <form action={remove}>
        <input type="hidden" name="table" value={table} />
        <input type="hidden" name="id" value={id} />
        <SubmitButton variant="danger" size="sm" pendingText="Removing..." confirm="Remove this for good?">
          Remove
        </SubmitButton>
      </form>
    </div>
  );
}
