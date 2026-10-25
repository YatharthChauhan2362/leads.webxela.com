import Link from "next/link";
import { ContactCell } from "@/components/leads";
import { timeAgo } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState, PageHeader, Stat } from "@/components/ui/layout";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { must, sb, type Profile } from "@/lib/db";
import { myLeadsFilter, seesAll } from "@/lib/access";
import { currentMember } from "@/lib/session";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const withContact = sp.contact === "1";

  const me = await currentMember();
  const all = seesAll(me);
  let query = sb().from("profiles").select("*");
  // Members only see the profiles they saved.
  if (!all && me) query = query.eq("captured_by", me.id);
  if (q) {
    const term = q.replace(/[,()*%\\"]/g, " ").trim();
    if (term) query = query.or(`name.ilike.*${term}*,company.ilike.*${term}*,headline.ilike.*${term}*,location.ilike.*${term}*`);
  }
  if (withContact) query = query.or("emails.neq.,phones.neq.,work_email.not.is.null");

  const scope = <T extends { eq: (c: string, v: string) => T }>(q: T) => (!all && me ? q.eq("captured_by", me.id) : q);
  const [people, totals, leadRows] = await Promise.all([
    query.order("updated_at", { ascending: false }).limit(500).then((r) => must(r) as Profile[]),
    Promise.all([
      scope(sb().from("profiles").select("url", { count: "exact", head: true })),
      scope(sb().from("profiles").select("url", { count: "exact", head: true }).neq("emails", "")),
      scope(sb().from("profiles").select("url", { count: "exact", head: true }).not("work_email", "is", null)),
      scope(sb().from("profiles").select("url", { count: "exact", head: true }).neq("phones", "")),
    ]).then((r) => r.map((x) => x.count ?? 0)),
    (!all && me ? sb().from("leads").select("id, author_url").not("author_url", "is", null).or(myLeadsFilter(me)) : sb().from("leads").select("id, author_url").not("author_url", "is", null)).then(
      (r) => must(r) as { id: number; author_url: string }[],
    ),
  ]);
  const leadsOf = new Map<string, number[]>();
  for (const l of leadRows) leadsOf.set(l.author_url, [...(leadsOf.get(l.author_url) ?? []), l.id]);
  const [total, withEmail, withWork, withPhone] = totals;

  return (
    <>
      <PageHeader
        title="People"
        description="Everyone from LinkedIn posts and every profile you open, with company, location and contact details, including a predicted work email."
        actions={
          <Link href="/extension" className={buttonClass("secondary")}>
            Extension setup
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="People saved" value={total} />
        <Stat label="Public email" value={withEmail} note="Seen on LinkedIn or their site" />
        <Stat label="Work email" value={withWork} note="Found, likely or guessed" />
        <Stat label="Phone" value={withPhone} />
      </div>

      <form className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]" action="/people">
        <label className="sr-only" htmlFor="q">
          Search people
        </label>
        <Input id="q" name="q" defaultValue={q} placeholder="Search names, companies, places" />
        <label className="flex h-12 items-center gap-2 rounded-xl border border-input bg-background px-3 text-[15px] whitespace-nowrap">
          <input type="checkbox" name="contact" value="1" defaultChecked={withContact} className="size-5 accent-primary" />
          Has contact
        </label>
        <button className={buttonClass("secondary", "md", "h-12")}>Search</button>
      </form>

      {people.length === 0 ? (
        <EmptyState title="No people yet" description="Open any LinkedIn profile with the extension on. It is saved here by itself." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Location</Th>
              <Th>Contact</Th>
              <Th>Leads</Th>
              <Th>Saved</Th>
            </tr>
          </THead>
          <tbody>
            {people.map((p) => (
              <Tr key={p.url}>
                <Td className="min-w-[220px] align-top">
                  <a href={p.url} target="_blank" rel="noreferrer" className="font-semibold hover:text-primary hover:underline">
                    {p.name || p.url.replace(/^https:\/\/www\.linkedin\.com\/in\//, "").replace(/\/$/, "")}
                  </a>
                  {p.headline ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{p.headline}</p> : null}
                </Td>
                <Td className="min-w-[160px] align-top text-[14px]">
                  {p.company || <span className="text-muted-foreground">Not known</span>}
                  {p.company_domain ? <p className="text-[13px] text-muted-foreground">{p.company_domain}</p> : null}
                </Td>
                <Td className="min-w-[140px] align-top text-[14px]">{p.location || <span className="text-muted-foreground">Not known</span>}</Td>
                <Td className="min-w-[240px] align-top text-[14px]">
                  <ContactCell emails={p.emails} phones={p.phones} workEmail={p.work_email} workStatus={p.work_email_status} workConfidence={p.work_email_confidence} />
                </Td>
                <Td className="align-top text-[14px] whitespace-nowrap">
                  {(leadsOf.get(p.url) ?? []).length ? (
                    <Link href={`/leads/${leadsOf.get(p.url)![0]}`} className="font-medium text-primary hover:underline">
                      {(leadsOf.get(p.url) ?? []).length === 1 ? "Open lead" : `${(leadsOf.get(p.url) ?? []).length} leads`}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </Td>
                <Td className="align-top text-[14px] whitespace-nowrap">{timeAgo(p.updated_at)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
