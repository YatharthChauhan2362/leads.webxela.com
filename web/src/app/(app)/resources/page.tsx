import Link from "next/link";
import { deleteResource, saveResource } from "./actions";
import { CopyButton, FileField } from "./client";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { CATEGORIES, resourcesFor, seesPrivate, type Category, type Resource } from "@/lib/resources";
import { requireMember } from "@/lib/session";

const PHONE = /^\+?[\d\s().-]{7,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SITES: Record<string, string> = {
  "linkedin.com": "LinkedIn",
  "youtube.com": "YouTube",
  "upwork.com": "Upwork",
  "instagram.com": "Instagram",
  "x.com": "X",
  "twitter.com": "X",
  "facebook.com": "Facebook",
  "github.com": "GitHub",
  "behance.net": "Behance",
  "dribbble.com": "Dribbble",
  "clutch.co": "Clutch",
  "fiverr.com": "Fiverr",
};

/** The site's name and the profile's handle, like LinkedIn and yatharth-chauhan, so people know where a link goes. */
function site(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const name = Object.entries(SITES).find(([h]) => host === h || host.endsWith("." + h))?.[1] ?? host;
    const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return { name, handle: decodeURIComponent(last).replace(/^~/, "") };
  } catch {
    return { name: "Link", handle: "" };
  }
}

function size(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function fileKind(name: string | null) {
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return "Slides";
  if (["doc", "docx", "odt", "txt", "md"].includes(ext)) return "Document";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "Sheet";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "Picture";
  if (["mp4", "mov", "webm"].includes(ext)) return "Video";
  return ext ? ext.toUpperCase() : "File";
}

/** "Yatharth Chauhan, Founder" reads as a name and a role. */
function nameAndRole(title: string) {
  const i = title.lastIndexOf(", ");
  const role = i > 0 ? title.slice(i + 2) : "";
  return { name: i > 0 ? title.slice(0, i) : title, role: role.charAt(0).toUpperCase() + role.slice(1) };
}

/** Bank details typed as "Label: value" lines become rows, each with its own Copy. */
function fields(value: string) {
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = lines.map((l) => {
    const i = l.indexOf(":");
    return i > 0 && i < 40 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null;
  });
  return rows.every(Boolean) ? (rows as { label: string; value: string }[]) : null;
}

const muted = "text-[14px] text-muted-foreground";

/** Admin tools on an item: a quiet Edit link and an Admins only tag. */
function AdminBar({ r, admin }: { r: Resource; admin: boolean }) {
  if (!admin && !r.admins_only) return null;
  return (
    <div className="flex items-center gap-2">
      {r.admins_only ? <Badge tone="amber">Admins only</Badge> : null}
      {admin ? (
        <Link href={`/resources?edit=${r.id}#form`} className="-my-2 inline-flex min-h-[36px] items-center rounded-lg px-2 text-[14px] font-medium text-primary hover:bg-muted" aria-label={`Edit ${r.title}`}>
          Edit
        </Link>
      ) : null}
    </div>
  );
}

function ContactLine({ kind, value, label }: { kind: "phone" | "email"; value: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="w-full min-w-0 sm:w-auto sm:flex-1">
        <p className="text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{kind === "phone" ? "Phone and WhatsApp" : "Email"}</p>
        <p className={`text-[16px] font-medium select-all ${kind === "phone" ? "whitespace-nowrap tabular-nums" : "break-all"}`}>{value}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {kind === "phone" ? (
          <>
            <a href={`tel:${value.replace(/[^\d+]/g, "")}`} className={buttonClass("primary", "sm")}>
              Call
            </a>
            <a href={`https://wa.me/${value.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
              WhatsApp
            </a>
          </>
        ) : (
          <a href={`mailto:${value}`} className={buttonClass("primary", "sm")}>
            Email
          </a>
        )}
        <CopyButton text={value} label={label} />
      </div>
    </div>
  );
}

function ContactCard({ r, admin }: { r: Resource; admin: boolean }) {
  const { name, role } = nameAndRole(r.title);
  const v = r.value.trim();
  const phone = r.phone || (PHONE.test(v) ? v : null);
  const email = r.email || (EMAIL.test(v) ? v : null);
  const extra = v && v !== phone && v !== email ? v : "";
  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar name={name} size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold break-words">{name}</h3>
          {role ? <p className={muted}>{role}</p> : null}
        </div>
        <AdminBar r={r} admin={admin} />
      </div>
      {phone || email ? (
        <div className="mt-4 rounded-xl border border-border p-3">
          {phone ? <ContactLine kind="phone" value={phone} label={`${name} phone`} /> : null}
          {email ? <ContactLine kind="email" value={email} label={`${name} email`} /> : null}
        </div>
      ) : null}
      {extra ? <p className="mt-3 text-[15px] whitespace-pre-line">{extra}</p> : null}
      {r.note || r.url ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {r.note ? <p className={muted}>{r.note}</p> : <span />}
          {r.url ? (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
              {site(r.url).name} profile
            </a>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function SocialTile({ r, admin }: { r: Resource; admin: boolean }) {
  const s = r.url ? site(r.url) : null;
  const social = s ? Object.values(SITES).includes(s.name) : false;
  const picture = fileKind(r.file_name) === "Picture";
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold tracking-[0.06em] text-primary uppercase">{s?.name ?? "Profile"}</p>
        <AdminBar r={r} admin={admin} />
      </div>
      <div className="mt-1 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold break-words">{r.title}</h3>
          {s?.handle ? <p className={`${muted} break-all`}>{s.handle}</p> : null}
          {r.note ? <p className={`${muted} mt-1`}>{r.note}</p> : null}
        </div>
        {r.file_path && picture ? (
          <a href={`/api/resources/file/${r.id}`} target="_blank" rel="noopener" className="shrink-0" aria-label={`View ${r.file_name}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind a one minute link, not a static image */}
            <img src={`/api/resources/file/${r.id}`} alt="" className="size-14 rounded-xl border border-border object-contain" />
          </a>
        ) : null}
      </div>
      {r.value.trim() ? <p className="mt-2 text-[15px] whitespace-pre-line">{r.value.trim()}</p> : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {r.url ? (
          <>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "sm")}>
              {social ? "Open profile" : "Visit site"}
            </a>
            <CopyButton text={r.url} label={`${r.title} link`} word="Copy link" />
          </>
        ) : null}
        {r.file_path ? (
          picture ? (
            <a href={`/api/resources/file/${r.id}?download=1`} className={buttonClass("secondary", "sm")}>
              Download picture
            </a>
          ) : (
            <FileButtons r={r} withLink={Boolean(r.url)} />
          )
        ) : null}
      </div>
    </Card>
  );
}

/** Open and Download for an item's file. Says "Open file" when the item also has a link, so two buttons never read the same. */
function FileButtons({ r, withLink = false }: { r: Resource; withLink?: boolean }) {
  return (
    <>
      <a href={`/api/resources/file/${r.id}`} target="_blank" rel="noopener" className={buttonClass(withLink ? "secondary" : "primary", "sm")} aria-label={`Open ${r.file_name}`}>
        {withLink ? "Open file" : "Open"}
      </a>
      <a href={`/api/resources/file/${r.id}?download=1`} className={buttonClass("secondary", "sm")} aria-label={`Download ${r.file_name}`}>
        {withLink ? "Download file" : "Download"}
      </a>
    </>
  );
}

/** Files as a tidy list: what it is, how big, and two buttons. */
function DocumentList({ items, admin }: { items: Resource[]; admin: boolean }) {
  return (
    <Card padded={false}>
      <ul className="divide-y divide-border">
        {items.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5">
            <span className="inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-xl border border-border text-[12px] font-semibold text-muted-foreground">{r.file_path ? fileKind(r.file_name) : "Link"}</span>
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-x-2">
                <h3 className="text-[16px] font-semibold break-words">{r.title}</h3>
                {r.file_size ? <span className="text-[13px] text-muted-foreground tabular-nums">{size(r.file_size)}</span> : null}
              </div>
              {r.note ? <p className={muted}>{r.note}</p> : null}
              {r.value.trim() ? <p className="text-[14px] whitespace-pre-line">{r.value.trim()}</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {r.file_path ? <FileButtons r={r} /> : null}
              {r.url ? (
                <a href={r.url} target="_blank" rel="noopener noreferrer" className={buttonClass(r.file_path ? "secondary" : "primary", "sm")}>
                  Open {site(r.url).name}
                </a>
              ) : null}
              <AdminBar r={r} admin={admin} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BankCard({ r, admin }: { r: Resource; admin: boolean }) {
  const rows = fields(r.value);
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold break-words">{r.title}</h3>
          {r.note ? <p className={muted}>{r.note}</p> : null}
        </div>
        <AdminBar r={r} admin={admin} />
      </div>
      {rows ? (
        <dl className="mt-4 divide-y divide-border rounded-xl border border-border">
          {rows.map((f) => (
            <div key={f.label} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <dt className="text-[13px] text-muted-foreground">{f.label}</dt>
                <dd className="text-[16px] font-medium break-all tabular-nums select-all">{f.value}</dd>
              </div>
              <CopyButton text={f.value} label={f.label} />
            </div>
          ))}
        </dl>
      ) : r.value.trim() ? (
        <p className="mt-4 rounded-xl bg-muted p-3 text-[15px] break-words whitespace-pre-line select-all">{r.value.trim()}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {r.value.trim() ? <CopyButton text={r.value.trim()} label={`all of ${r.title}`} /> : null}
        {r.file_path ? <FileButtons r={r} /> : null}
        {r.url ? (
          <a href={r.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
            Open {site(r.url).name}
          </a>
        ) : null}
      </div>
    </Card>
  );
}

/** Anything else: details with Copy, then the link and file. */
function PlainCard({ r, admin }: { r: Resource; admin: boolean }) {
  const v = r.value.trim();
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-[17px] font-semibold break-words">{r.title}</h3>
        <AdminBar r={r} admin={admin} />
      </div>
      {r.note ? <p className={muted}>{r.note}</p> : null}
      {r.phone || r.email ? (
        <div className="mt-3 rounded-xl border border-border p-3">
          {r.phone ? <ContactLine kind="phone" value={r.phone} label={`${r.title} phone`} /> : null}
          {r.email ? <ContactLine kind="email" value={r.email} label={`${r.title} email`} /> : null}
        </div>
      ) : null}
      {v ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3">
          <p className="min-w-0 flex-1 text-[15px] break-words whitespace-pre-line select-all">{v}</p>
          <CopyButton text={v} label={r.title} />
        </div>
      ) : null}
      {r.url || r.file_path ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {r.url ? (
            <a href={r.url} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
              Open {site(r.url).name}
            </a>
          ) : null}
          {r.file_path ? <FileButtons r={r} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

const lead = (title: string) => (/pitch deck/i.test(title) ? 0 : /company profile/i.test(title) ? 1 : 2);

function SectionBody({ category, items, admin }: { category: Category; items: Resource[]; admin: boolean }) {
  // The pitch deck and company profile are what people reach for most, so they lead.
  if (category === "document") return <DocumentList items={[...items].sort((a, b) => lead(a.title) - lead(b.title))} admin={admin} />;
  const grid = category === "social" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-1 gap-4 lg:grid-cols-2";
  return (
    <div className={grid}>
      {items.map((r) =>
        category === "contact" ? (
          <ContactCard key={r.id} r={r} admin={admin} />
        ) : category === "social" ? (
          <SocialTile key={r.id} r={r} admin={admin} />
        ) : category === "bank" ? (
          <BankCard key={r.id} r={r} admin={admin} />
        ) : (
          <PlainCard key={r.id} r={r} admin={admin} />
        ),
      )}
    </div>
  );
}

/** The add and edit form. Same fields both ways; an id means edit. */
function ItemForm({ item, category }: { item?: Resource; category?: Category }) {
  const p = item ? `r${item.id}-` : "new-";
  return (
    <form action={saveResource} className="space-y-4">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormGrid cols={2}>
        <Field label="Section" htmlFor={`${p}category`}>
          <Select id={`${p}category`} name="category" defaultValue={item?.category ?? category ?? "contact"}>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor={`${p}title`} hint="For people, write the name then the role, like Asha Rao, Sales head.">
          <Input id={`${p}title`} name="title" required maxLength={200} defaultValue={item?.title} placeholder="Company LinkedIn page" />
        </Field>
      </FormGrid>
      <FormGrid cols={2}>
        <Field label="Phone" htmlFor={`${p}phone`} optional hint="With the country code, like +91 98765 43210.">
          <Input id={`${p}phone`} name="phone" type="tel" maxLength={40} defaultValue={item?.phone ?? ""} placeholder="+91" />
        </Field>
        <Field label="Email" htmlFor={`${p}email`} optional>
          <Input id={`${p}email`} name="email" type="email" maxLength={320} defaultValue={item?.email ?? ""} placeholder="name@company.com" />
        </Field>
      </FormGrid>
      <Field label="Details" htmlFor={`${p}value`} optional hint="For bank details, one per line like Account number: 1234. Each line gets its own Copy button.">
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
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingText="Saving...">{item ? "Save" : "Add"}</SubmitButton>
        <LinkButton href="/resources" variant="secondary">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

const ORDER = Object.keys(CATEGORIES) as Category[];

/** Everything the team needs in one place, a section at a time. Admins add and change items; members only read. */
export default async function ResourcesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const me = await requireMember();
  const admin = seesPrivate(me);
  const all = await resourcesFor(me);
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 100) : "";
  const items = q ? all.filter((r) => [r.title, r.note, r.value, r.phone, r.email, r.url, r.file_name].some((s) => s?.toLowerCase().includes(q))) : all;
  const active = typeof sp.section === "string" && sp.section in CATEGORIES ? (sp.section as Category) : "all";
  const sections = ORDER.map((c) => ({ key: c, label: CATEGORIES[c], items: items.filter((i) => i.category === c) })).filter((s) => s.items.length);
  const shown = active === "all" ? sections : sections.filter((s) => s.key === active);
  const editing = admin && typeof sp.edit === "string" ? all.find((r) => r.id === Number(sp.edit)) : undefined;
  const adding = admin && sp.add === "1";
  const href = (section: string) => {
    const u = new URLSearchParams();
    if (section !== "all") u.set("section", section);
    if (q) u.set("q", q);
    return `/resources${u.size ? `?${u}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Resources"
        description="Contacts, profiles, decks and details for client work. Tap a button to call, open or copy."
        actions={
          admin ? (
            <Link href={`/resources?add=1${active !== "all" ? `&in=${active}` : ""}#form`} className={buttonClass("secondary", "md", "bg-white")}>
              Add an item
            </Link>
          ) : undefined
        }
      />
      <Flash searchParams={sp} />

      {editing || adding ? (
        <Card className="mb-6 scroll-mt-20" id="form">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[20px] font-bold">{editing ? `Edit ${editing.title}` : "Add an item"}</h2>
          </div>
          <ItemForm item={editing} category={typeof sp.in === "string" && sp.in in CATEGORIES ? (sp.in as Category) : undefined} />
          {editing ? (
            <form action={deleteResource} className="mt-4 border-t border-border pt-4">
              <input type="hidden" name="id" value={editing.id} />
              <SubmitButton variant="danger" size="sm" pendingText="Removing..." confirm={`Remove ${editing.title}${editing.file_name ? " and its file" : ""} for good?`}>
                Remove this item
              </SubmitButton>
            </form>
          ) : null}
        </Card>
      ) : null}

      <div className="mb-6 space-y-3">
        <form action="/resources" role="search" className="flex gap-2">
          {active !== "all" ? <input type="hidden" name="section" value={active} /> : null}
          <label htmlFor="res-q" className="sr-only">
            Find a resource
          </label>
          <Input id="res-q" name="q" type="search" defaultValue={q} placeholder="Find a name, number or file" className="flex-1" />
          <button type="submit" className={buttonClass("secondary", "md", "h-12 shrink-0")}>
            Find
          </button>
        </form>
        {all.length ? (
          <nav aria-label="Sections" className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
            <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
              {[{ key: "all", label: "All", count: items.length }, ...sections.map((s) => ({ key: s.key, label: s.label, count: s.items.length }))].map((t) => (
                <li key={t.key}>
                  <Link
                    href={href(t.key)}
                    aria-current={t.key === active ? "page" : undefined}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors ${
                      t.key === active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    {t.label}
                    <span className="tabular-nums opacity-70">{t.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>

      {all.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description={admin ? "Add founder contacts, social profiles, the pitch deck and bank details." : "Your admins have not added anything yet."}
          action={admin ? <LinkButton href="/resources?add=1#form">Add an item</LinkButton> : undefined}
        />
      ) : shown.length === 0 ? (
        <EmptyState title="Nothing matches" description={q ? `Nothing found for "${q}".` : "This section is empty."} action={<LinkButton href="/resources" variant="secondary">Show everything</LinkButton>} />
      ) : (
        <div className="space-y-10">
          {shown.map((s) => (
            <section key={s.key} id={s.key} aria-labelledby={`h-${s.key}`} className="scroll-mt-20">
              <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border pb-2">
                <h2 id={`h-${s.key}`} className="text-[20px] font-bold">
                  {s.label}
                  <span className="ml-2 text-[15px] font-medium text-muted-foreground tabular-nums">{s.items.length}</span>
                </h2>
                {admin ? (
                  <Link href={`/resources?add=1&in=${s.key}#form`} className="text-[14px] font-medium text-primary hover:underline">
                    Add here
                  </Link>
                ) : null}
              </div>
              <SectionBody category={s.key} items={s.items} admin={admin} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
