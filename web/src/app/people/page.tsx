import Link from "next/link";
import { ContactCell } from "@/components/leads";
import { timeAgo } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState, PageHeader, Stat } from "@/components/ui/layout";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { must, sb, type Profile } from "@/lib/db";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const withContact = sp.contact === "1";

  let query = sb().from("profiles").select("*");
  if (q) {
    const term = q.replace(/[,()*%\\"]/g, " ").trim();
    if (term) query = query.or(`name.ilike.*${term}*,company.ilike.*${term}*,headline.ilike.*${term}*,location.ilike.*${term}*`);
  }
  if (withContact) query = query.or("emails.neq.,phones.neq.,work_email.not.is.null");

  const [people, totals] = await Promise.all([
    query.order("updated_at", { ascending: false }).limit(500).then((r) => must(r) as Profile[]),
    Promise.all([
      sb().from("profiles").select("url", { count: "exact", head: true }),
      sb().from("profiles").select("url", { count: "exact", head: true }).neq("emails", ""),
      sb().from("profiles").select("url", { count: "exact", head: true }).not("work_email", "is", null),
      sb().from("profiles").select("url", { count: "exact", head: true }).neq("phones", ""),
    ]).then((r) => r.map((x) => x.count ?? 0)),
  ]);
  const [total, withEmail, withWork, withPhone] = totals;

  return (
    <>
      <PageHeader
        title="People"
        description="Every LinkedIn profile you open is saved here with their company, location and contact details, including a predicted work email."
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
                <Td className="align-top text-[14px] whitespace-nowrap">{timeAgo(p.updated_at)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
