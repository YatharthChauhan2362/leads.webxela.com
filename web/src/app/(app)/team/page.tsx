import { createTeam, deleteTeam, invite, newKey, removeMember, renameTeam, setAccess, setAutoAccess, updateMember } from "./actions";
import Link from "next/link";
import { JOB_WORDS } from "@/components/leads";
import { PROVIDER_WORDS, ProviderLogo } from "@/components/provider-logo";
import { timeAgo } from "@/components/shell/app-shell";
import { Flash } from "@/components/ui/flash";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Avatar, Badge, Callout, Card, CardHeader, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { must, sb } from "@/lib/db";
import { appUrl, providerEnabled } from "@/lib/oauth";
import { authEnabled, requireMember, type Member } from "@/lib/session";

type Team = { id: string; name: string };

const ROLE_WORDS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const ROLE_HELP = "Admins manage the team and settings. Members work leads.";
const JOB_HELP = "BDEs get hot leads handed to them.";

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireMember("admin");
  const admin = true;
  const owner = !me || me.role === "owner";
  const [members, teams, assigned] = await Promise.all([
    sb().from("members").select("*").order("created_at").then((r) => must(r) as Member[]),
    sb().from("teams").select("id, name").order("name").then((r) => must(r) as Team[]),
    sb().from("leads").select("assigned_to").not("assigned_to", "is", null).then((r) => must(r) as { assigned_to: string }[]),
  ]);
  const leadCount = new Map<string, number>();
  for (const a of assigned) leadCount.set(a.assigned_to, (leadCount.get(a.assigned_to) ?? 0) + 1);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const roleOptions = owner ? ["member", "admin", "owner"] : ["member"];
  const providers = (["google", "zoho"] as const).filter((p) => providerEnabled(p));
  const allProviders = ["google", "zoho"] as const;

  return (
    <>
      <PageHeader title="Team" description="Who can sign in, what they can do, and which team they are in." />
      <Flash searchParams={searchParams} />

      {!authEnabled() ? (
        <Callout tone="amber" label="Sign in is not switched on yet" className="mb-6">
          <p>Until Google or Zoho keys are added, anyone with the link can open the app. Add these sign in addresses when you create the keys:</p>
          <p className="mt-1 font-mono text-[13px] break-all">{appUrl()}/auth/google/callback</p>
          <p className="font-mono text-[13px] break-all">{appUrl()}/auth/zoho/callback</p>
        </Callout>
      ) : null}

      {me ? (
        <Card className="mb-6">
          <CardHeader title="Your extension key" description="Paste it into the Yatri Leads extension settings so leads you capture show your name." />
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="my-key">
              Your extension key
            </label>
            <Input id="my-key" readOnly value={me.api_key ?? ""} className="font-mono text-[13px]" />
            <form action={newKey}>
              <input type="hidden" name="id" value={me.id} />
              <SubmitButton variant="secondary" pendingText="Making..." confirm="Make a new key? The old one stops working.">
                New key
              </SubmitButton>
            </form>
          </div>
        </Card>
      ) : null}

      {admin ? (
        <Card className="mb-6">
          <CardHeader title="Invite someone" description="Pick how they sign in, then enter the email of that Google or Zoho account." />
          <form action={invite} className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">1. How will they sign in?</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {allProviders.map((p) => {
                  const on = providerEnabled(p);
                  return (
                    <label
                      key={p}
                      className={`flex min-h-[64px] items-center gap-3 rounded-2xl border px-4 py-3 transition-colors has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/30 ${
                        on ? "cursor-pointer border-border bg-background hover:border-primary" : "cursor-not-allowed border-border bg-muted opacity-60"
                      }`}
                    >
                      <input type="radio" name="login_with" value={p} required disabled={!on} defaultChecked={on && providers[0] === p} className="size-5 accent-primary" />
                      <ProviderLogo provider={p} size={24} />
                      <span className="min-w-0">
                        <span className="block text-[16px] font-semibold">{PROVIDER_WORDS[p]}</span>
                        <span className="block text-[13px] text-muted-foreground">
                          {on ? (p === "zoho" ? "For Zoho Mail accounts, like info@webxela.com" : "For Gmail or Google Workspace accounts") : "Not set up yet"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground">They can only sign in this way. You can change it later.</p>
            </fieldset>
            <p className="text-sm font-medium">2. Who are they?</p>
            <FormGrid cols={2}>
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" required placeholder="name@company.com" />
              </Field>
              <Field label="Name" htmlFor="name" optional>
                <Input id="name" name="name" />
              </Field>
              <Field label="Role" htmlFor="role" hint={ROLE_HELP}>
                <Select id="role" name="role" defaultValue="member">
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_WORDS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Job" htmlFor="job" hint={JOB_HELP}>
                <Select id="job" name="job" defaultValue="lead_generator">
                  {Object.entries(JOB_WORDS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              {teams.length ? (
                <Field label="Team" htmlFor="team_id" optional>
                  <Select id="team_id" name="team_id" defaultValue="">
                    <option value="">None</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label={teams.length ? "Or a new team" : "Team"} htmlFor="new_team" optional>
                <Input id="new_team" name="new_team" placeholder="India sales" maxLength={60} />
              </Field>
            </FormGrid>
            <SubmitButton pendingText="Inviting...">Invite</SubmitButton>
          </form>
        </Card>
      ) : null}

      <h2 className="mb-3 text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
        People ({members.length})
      </h2>
      <Table>
        <THead>
          <tr>
            <Th>Person</Th>
            <Th>Role</Th>
            <Th>Sign in</Th>
            <Th>Job</Th>
            {teams.length ? <Th>Team</Th> : null}
            <Th>Status</Th>
            <Th align="right">Leads</Th>
            <Th>Auto</Th>
            <Th>Actions</Th>
          </tr>
        </THead>
        <tbody>
          {members.map((m) => {
            const self = m.id === me?.id;
            const locked = !owner && (m.role === "owner" || m.role === "admin");
            const editable = admin && !locked && !self;
            const formId = `m-${m.id}`;
            const select = "h-11 rounded-xl border border-input bg-background px-2 text-[14px]";
            return (
              <Tr key={m.id}>
                <Td className="min-w-[220px] align-middle">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name || m.email} />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {m.name || m.email.split("@")[0]}
                        {self ? <span className="ml-1 text-[13px] font-normal text-muted-foreground">(you)</span> : null}
                      </p>
                      <p className="text-[13px] break-all text-muted-foreground">{m.email}</p>
                    </div>
                  </div>
                </Td>
                <Td className="align-middle">
                  {editable ? (
                    <select form={formId} name="role" defaultValue={m.role} aria-label={`Role for ${m.email}`} className={select}>
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_WORDS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone={m.role === "owner" ? "ink" : m.role === "admin" ? "blue" : "neutral"}>{ROLE_WORDS[m.role]}</Badge>
                  )}
                </Td>
                <Td className="align-middle">
                  {editable ? (
                    <select form={formId} name="login_with" defaultValue={m.login_with} aria-label={`Sign in for ${m.email}`} className={select}>
                      {allProviders.map((p) => (
                        <option key={p} value={p}>
                          {PROVIDER_WORDS[p]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[14px]">
                      <ProviderLogo provider={m.login_with} size={16} />
                      {PROVIDER_WORDS[m.login_with]}
                    </span>
                  )}
                </Td>
                <Td className="align-middle">
                  {editable ? (
                    <select form={formId} name="job" defaultValue={m.job} aria-label={`Job for ${m.email}`} className={select}>
                      {Object.entries(JOB_WORDS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[14px]">{JOB_WORDS[m.job]}</span>
                  )}
                </Td>
                {teams.length ? (
                  <Td className="align-middle">
                    {editable ? (
                      <select form={formId} name="team_id" defaultValue={m.team_id ?? ""} aria-label={`Team for ${m.email}`} className={select}>
                        <option value="">None</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[14px]">{m.team_id ? teamName.get(m.team_id) : "None"}</span>
                    )}
                  </Td>
                ) : null}
                <Td className="align-middle whitespace-nowrap">
                  <Badge tone={m.status === "active" ? "green" : m.status === "invited" ? "amber" : "red"}>
                    {m.status === "active" ? "Active" : m.status === "invited" ? "Invited" : "Off"}
                  </Badge>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">{m.last_login_at ? timeAgo(m.last_login_at) : "Never signed in"}</p>
                </Td>
                <Td align="right" className="align-middle">
                  <Link href={`/activity?who=${m.id}`} className="font-medium text-primary hover:underline" title="See activity">
                    {leadCount.get(m.id) ?? 0}
                  </Link>
                </Td>
                <Td className="align-middle">
                  {/* You can always switch your own automatic features. */}
                  {editable || self ? (
                    <form action={setAutoAccess}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="on" value={m.auto_access ? "0" : "1"} />
                      <SubmitButton variant={m.auto_access ? "primary" : "secondary"} size="sm" pendingText="..." aria-label={`Automatic features for ${m.email}: ${m.auto_access ? "on, press to turn off" : "off, press to turn on"}`}>
                        {m.auto_access ? "On" : "Off"}
                      </SubmitButton>
                    </form>
                  ) : (
                    <Badge tone={m.auto_access ? "green" : "neutral"}>{m.auto_access ? "On" : "Off"}</Badge>
                  )}
                </Td>
                <Td className="align-middle">
                  {editable ? (
                    <div className="flex flex-nowrap gap-2">
                      <form id={formId} action={updateMember}>
                        <input type="hidden" name="id" value={m.id} />
                        {!teams.length ? <input type="hidden" name="team_id" value="" /> : null}
                        <SubmitButton size="sm" pendingText="Saving...">
                          Save
                        </SubmitButton>
                      </form>
                      <form action={setAccess}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="on" value={m.status === "disabled" ? "1" : "0"} />
                        <SubmitButton variant="secondary" size="sm" pendingText="...">
                          {m.status === "disabled" ? "Allow" : "Block"}
                        </SubmitButton>
                      </form>
                      <form action={removeMember}>
                        <input type="hidden" name="id" value={m.id} />
                        <SubmitButton variant="danger" size="sm" pendingText="..." confirm={`Remove ${m.email}?`}>
                          Remove
                        </SubmitButton>
                      </form>
                    </div>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">{self ? "You" : "Owner only"}</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <p className="mt-2 text-[13px] text-muted-foreground">Auto: extension timer, their searches in the Claude routine and AI drafts. The leads number opens their activity.</p>

      <Card className="mt-6">
        <CardHeader title="Teams" />
        {teams.length ? (
          <ul className="mb-5 divide-y divide-border">
            {teams.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-3">
                {admin ? (
                  <>
                    <form action={renameTeam} className="flex min-w-0 flex-1 gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <label className="sr-only" htmlFor={`t-${t.id}`}>
                        Team name
                      </label>
                      <Input id={`t-${t.id}`} name="name" defaultValue={t.name} className="h-11" />
                      <SubmitButton variant="secondary" size="sm" pendingText="Saving...">
                        Rename
                      </SubmitButton>
                    </form>
                    <form action={deleteTeam}>
                      <input type="hidden" name="id" value={t.id} />
                      <SubmitButton variant="danger" size="sm" pendingText="Deleting..." confirm={`Delete the team ${t.name}?`}>
                        Delete
                      </SubmitButton>
                    </form>
                  </>
                ) : (
                  <span className="font-medium">{t.name}</span>
                )}
                <span className="text-[13px] text-muted-foreground">{members.filter((m) => m.team_id === t.id).length} people</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-[15px] text-muted-foreground">No teams yet.</p>
        )}
        {admin ? (
          <form action={createTeam} className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="team-name">
              New team name
            </label>
            <Input id="team-name" name="name" placeholder="New team name, like India sales" required minLength={2} />
            <SubmitButton variant="secondary" pendingText="Creating...">
              Create team
            </SubmitButton>
          </form>
        ) : null}
      </Card>

      <p className="mt-6 text-[13px] text-muted-foreground">
        Sign in options on: {[providerEnabled("google") && "Google", providerEnabled("zoho") && "Zoho"].filter(Boolean).join(" and ") || "none yet"}.
      </p>
    </>
  );
}
