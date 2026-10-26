import { addEngine, remove, setKind, testEngine, toggle } from "./actions";
import { SettingsTabs } from "@/components/settings-tabs";
import { Flash } from "@/components/ui/flash";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { must, sb } from "@/lib/db";
import { requireMember } from "@/lib/session";

const KINDS: Record<string, { word: string; sites: string }> = {
  posts: { word: "Posts", sites: "www.linkedin.com/posts/*, www.linkedin.com/feed/update/*, www.linkedin.com/pulse/*" },
  profiles: { word: "People", sites: "www.linkedin.com/in/*" },
  companies: { word: "Companies", sites: "www.linkedin.com/company/*" },
  contacts: { word: "Web contacts", sites: "Search the entire web, or github.com/*, x.com/*, about.me/*, linktr.ee/*, medium.com/*, www.crunchbase.com/*" },
  elsewhere: { word: "Other sites", sites: "www.reddit.com/r/forhire/*, www.reddit.com/r/startups/*, news.ycombinator.com/*, x.com/*/status/*, www.indiehackers.com/*" },
};

type EngRow = { id: string; label: string; kind: string; cx: string; active: boolean; last_error: string | null };

export default async function EnginesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMember("admin");
  const engines = must(await sb().from("search_engines").select("id, label, kind, cx, active, last_error").order("kind").order("created_at")) as EngRow[];
  const covered = new Set(engines.filter((e) => e.active).map((e) => e.kind));

  return (
    <>
      <PageHeader title="Settings" description="Your Google Programmable Search engines. Add each one's name, kind and engine ID, and its tab appears on the Search page." />
      <SettingsTabs active="engines" />
      <Flash searchParams={searchParams} />

      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(KINDS).map(([k, v]) => (
          <Badge key={k} tone={covered.has(k) ? "green" : "neutral"}>
            {v.word}: {covered.has(k) ? "ready" : "not added"}
          </Badge>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader title="Add an engine" description="Open the engine at programmablesearchengine.google.com, and copy the Search engine ID from Overview, under Basic." />
        <form action={addEngine} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px_1fr]">
            <Field label="Name" htmlFor="e-label">
              <Input id="e-label" name="label" required maxLength={60} placeholder="LinkedIn Posts" />
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
          <SubmitButton pendingText="Testing...">Test and add</SubmitButton>
        </form>
      </Card>

      <Table>
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Kind</Th>
            <Th>Engine ID</Th>
            <Th>Status</Th>
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {engines.length === 0 ? (
            <Tr>
              <Td className="text-muted-foreground">No engines yet. Add one above.</Td>
            </Tr>
          ) : null}
          {engines.map((e) => (
            <Tr key={e.id}>
              <Td className="font-semibold">{e.label}</Td>
              <Td>
                <form action={setKind} className="flex gap-2">
                  <input type="hidden" name="id" value={e.id} />
                  <label className="sr-only" htmlFor={`kind-${e.id}`}>
                    Kind of {e.label}
                  </label>
                  <select id={`kind-${e.id}`} name="kind" defaultValue={e.kind} className="h-11 rounded-xl border border-input bg-background px-2 text-[14px]">
                    {Object.entries(KINDS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.word}
                      </option>
                    ))}
                  </select>
                  <SubmitButton variant="secondary" size="sm" pendingText="Saving...">
                    Save
                  </SubmitButton>
                </form>
              </Td>
              <Td className="font-mono text-[13px]">{e.cx}</Td>
              <Td className="min-w-[160px]">
                {!e.active ? <Badge>Paused</Badge> : e.last_error ? <Badge tone="red">Not working</Badge> : <Badge tone="green">Working</Badge>}
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
                  <form action={toggle}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="on" value={e.active ? "0" : "1"} />
                    <SubmitButton variant="secondary" size="sm" pendingText="Saving...">
                      {e.active ? "Pause" : "Turn on"}
                    </SubmitButton>
                  </form>
                  <form action={remove}>
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton variant="danger" size="sm" pendingText="Removing..." confirm={`Remove ${e.label}?`}>
                      Remove
                    </SubmitButton>
                  </form>
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <Card className="mt-8">
        <CardHeader title="Sites to add in each kind of engine" description="When you make an engine at programmablesearchengine.google.com, add these under Sites to search." />
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
