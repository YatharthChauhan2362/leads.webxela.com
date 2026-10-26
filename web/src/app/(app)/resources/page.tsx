import { deleteResource, saveResource } from "./actions";
import { CopyButton, FileField } from "./client";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { CATEGORIES, resourcesFor, seesPrivate, type Category, type Resource } from "@/lib/resources";
import { requireMember } from "@/lib/session";

const PHONE = /^\+?[\d\s().-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function size(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** The add and edit form. Same fields both ways; an id means edit. */
function ItemForm({ item, category }: { item?: Resource; category?: Category }) {
  const p = item ? `r${item.id}-` : "new-";
  return (
    <form action={saveResource} className="space-y-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormGrid cols={2}>
        <Field label="Section" htmlFor={`${p}category`}>
          <Select id={`${p}category`} name="category" defaultValue={item?.category ?? category ?? "social"}>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor={`${p}title`}>
          <Input id={`${p}title`} name="title" required maxLength={200} defaultValue={item?.title} placeholder="Company LinkedIn page" />
        </Field>
      </FormGrid>
      <Field label="Details" htmlFor={`${p}value`} optional hint="A phone number, email, account details or any text. People can copy it with one tap.">
        <Textarea id={`${p}value`} name="value" maxLength={5000} defaultValue={item?.value} className="min-h-24" />
      </Field>
      <FormGrid cols={2}>
        <Field label="Link" htmlFor={`${p}url`} optional>
          <Input id={`${p}url`} name="url" type="url" maxLength={2000} defaultValue={item?.url ?? ""} placeholder="https://" />
        </Field>
        <Field label="File" htmlFor={`${p}file`} optional>
          <FileField id={`${p}file`} current={item?.file_name} />
        </Field>
      </FormGrid>
      <Field label="Note" htmlFor={`${p}note`} optional hint="When or how to use it.">
        <Input id={`${p}note`} name="note" maxLength={2000} defaultValue={item?.note ?? ""} />
      </Field>
      <Checkbox name="admins_only" defaultChecked={item?.admins_only} label="Admins only" hint="Members will not see this item or its file." />
      <SubmitButton pendingText="Saving...">{item ? "Save" : "Add"}</SubmitButton>
    </form>
  );
}

function Item({ r, admin }: { r: Resource; admin: boolean }) {
  const v = r.value.trim();
  const call = PHONE.test(v) ? `tel:${v.replace(/[^\d+]/g, "")}` : null;
  const mail = EMAIL.test(v) ? `mailto:${v}` : null;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="min-w-0 text-[17px] font-semibold break-words">{r.title}</h3>
        {r.admins_only ? <Badge tone="amber">Admins only</Badge> : null}
      </div>
      {v ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3">
          <p className="min-w-0 flex-1 text-[15px] break-words whitespace-pre-line select-all">{v}</p>
          <CopyButton text={v} label={r.title} />
        </div>
      ) : null}
      {r.note ? <p className="mt-2 text-[14px] text-muted-foreground">{r.note}</p> : null}
      {call || mail || r.url || r.file_path ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {call ? (
            <a href={call} className={buttonClass("secondary", "sm")}>
              Call
            </a>
          ) : null}
          {mail ? (
            <a href={mail} className={buttonClass("secondary", "sm")}>
              Email
            </a>
          ) : null}
          {r.url ? (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm", "max-w-full")}>
              <span className="truncate">Open link</span>
            </a>
          ) : null}
          {r.file_path ? (
            <>
              <a href={`/api/resources/file/${r.id}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm", "max-w-full")}>
                <span className="truncate">
                  Open {r.file_name}
                  {r.file_size ? <span className="font-normal text-muted-foreground">, {size(r.file_size)}</span> : null}
                </span>
              </a>
              <a href={`/api/resources/file/${r.id}?download=1`} className={buttonClass("ghost", "sm")}>
                Download
              </a>
            </>
          ) : null}
        </div>
      ) : null}
      {admin ? (
        <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-border pt-3">
          <details className="min-w-0 flex-1">
            <summary className="inline-flex min-h-[40px] cursor-pointer items-center text-[15px] font-medium text-primary">Edit</summary>
            <div className="mt-3">
              <ItemForm item={r} />
            </div>
          </details>
          <form action={deleteResource}>
            <input type="hidden" name="id" value={r.id} />
            <SubmitButton variant="danger" size="sm" pendingText="Removing..." confirm={`Remove ${r.title}${r.file_name ? " and its file" : ""} for good?`}>
              Remove
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </Card>
  );
}

/** Everything the team needs in one place. Admins add and change items; members only read. */
export default async function ResourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMember();
  const admin = seesPrivate(me);
  const items = await resourcesFor(me);
  const sections = (Object.keys(CATEGORIES) as Category[]).map((c) => ({ key: c, label: CATEGORIES[c], items: items.filter((i) => i.category === c) })).filter((s) => s.items.length);

  return (
    <>
      <PageHeader
        title="Resources"
        description={admin ? "Profiles, contacts, bank details, the pitch deck and anything else the team needs. Mark private items admins only." : "Profiles, contacts, the pitch deck and anything else you need for the work. Tap Copy to copy details."}
      />
      <Flash searchParams={sp} />

      {admin ? (
        <Card className="mb-6">
          <details>
            <summary className="flex min-h-[44px] cursor-pointer items-center text-[17px] font-semibold">Add an item</summary>
            <div className="mt-4">
              <ItemForm />
            </div>
          </details>
        </Card>
      ) : null}

      {sections.length ? (
        <nav aria-label="Sections" className="mb-5 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a key={s.key} href={`#${s.key}`} className={buttonClass("secondary", "sm")}>
              {s.label}
              <span className="ml-1.5 text-muted-foreground tabular-nums">{s.items.length}</span>
            </a>
          ))}
        </nav>
      ) : null}

      {sections.length === 0 ? (
        <EmptyState title="Nothing here yet" description={admin ? "Add your social profiles, founder contacts, bank details and pitch deck with Add an item." : "Your admins have not added anything yet."} />
      ) : (
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.key} id={s.key} className="scroll-mt-20">
              <h2 className="mb-3 text-[20px] font-bold">{s.label}</h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {s.items.map((r) => (
                  <Item key={r.id} r={r} admin={admin} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
