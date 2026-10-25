import { createTeam, deleteTeam, invite, newKey, removeMember, renameTeam, setAccess, updateMember } from "./actions";
import { timeAgo } from "@/components/shell/app-shell";
import { Flash } from "@/components/ui/flash";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Avatar, Badge, Callout, Card, CardHeader, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { must, sb } from "@/lib/db";
import { appUrl, providerEnabled } from "@/lib/oauth";
import { authEnabled, can, requireMember, type Member } from "@/lib/session";

type Team = { id: string; name: string };

const ROLE_WORDS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };
const ROLE_HELP = "Owner: everything. Admin: invites people, edits searches, deletes leads. Member: works leads.";

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireMember();
  const admin = !me || can(me, "admin");
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
          <CardHeader title="Invite someone" description="They sign in with the Google or Zoho account that uses this email." />
          <form action={invite} className="space-y-5">
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
              <Field label="Team" htmlFor="team_id" optional>
                <Select id="team_id" name="team_id" defaultValue="">
                  <option value="">No team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
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
            <Th>Role and team</Th>
            <Th>Access</Th>
            <Th>Leads</Th>
            {admin ? <Th>Actions</Th> : null}
          </tr>
        </THead>
        <tbody>
          {members.length === 0 ? (
            <Tr>
              <Td className="text-muted-foreground">Nobody yet. The owner is added the first time they sign in.</Td>
            </Tr>
          ) : null}
          {members.map((m) => {
            const self = m.id === me?.id;
            const locked = !owner && (m.role === "owner" || m.role === "admin");
            return (
              <Tr key={m.id}>
                <Td className="min-w-[220px] align-top">
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
                <Td className="min-w-[230px] align-top">
                  {admin && !locked && !self ? (
                    <form action={updateMember} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={m.id} />
                      <label className="sr-only" htmlFor={`role-${m.id}`}>
                        Role for {m.email}
                      </label>
                      <select id={`role-${m.id}`} name="role" defaultValue={m.role} className="h-11 rounded-xl border border-input bg-background px-2 text-[14px]">
                        {(owner ? ["member", "admin", "owner"] : ["member"]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_WORDS[r]}
                          </option>
                        ))}
                      </select>
                      <label className="sr-only" htmlFor={`team-${m.id}`}>
                        Team for {m.email}
                      </label>
                      <select id={`team-${m.id}`} name="team_id" defaultValue={m.team_id ?? ""} className="h-11 min-w-0 rounded-xl border border-input bg-background px-2 text-[14px]">
                        <option value="">No team</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="secondary" size="sm" pendingText="Saving...">
                        Save
                      </SubmitButton>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={m.role === "owner" ? "ink" : m.role === "admin" ? "blue" : "neutral"}>{ROLE_WORDS[m.role]}</Badge>
                      {m.team_id ? <Badge>{teamName.get(m.team_id)}</Badge> : null}
                    </div>
                  )}
                </Td>
                <Td className="align-top whitespace-nowrap">
                  <Badge tone={m.status === "active" ? "green" : m.status === "invited" ? "amber" : "red"}>
                    {m.status === "active" ? "Active" : m.status === "invited" ? "Invited" : "Turned off"}
                  </Badge>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {m.last_login_at ? `Signed in ${timeAgo(m.last_login_at)} with ${m.provider === "zoho" ? "Zoho" : "Google"}` : "Not signed in yet"}
                  </p>
                </Td>
                <Td className="align-top">{leadCount.get(m.id) ?? 0}</Td>
                {admin ? (
                  <Td className="align-top">
                    {!self && !locked ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={setAccess}>
                          <input type="hidden" name="id" value={m.id} />
                          <input type="hidden" name="on" value={m.status === "disabled" ? "1" : "0"} />
                          <SubmitButton variant="secondary" size="sm" pendingText="Saving...">
                            {m.status === "disabled" ? "Turn on" : "Turn off"}
                          </SubmitButton>
                        </form>
                        <form action={removeMember}>
                          <input type="hidden" name="id" value={m.id} />
                          <SubmitButton variant="danger" size="sm" pendingText="Removing..." confirm={`Remove ${m.email} from the team?`}>
                            Remove
                          </SubmitButton>
                        </form>
                      </div>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">{self ? "This is you" : "Owner only"}</span>
                    )}
                  </Td>
                ) : null}
              </Tr>
            );
          })}
        </tbody>
      </Table>

      <Card className="mt-6">
        <CardHeader title="Teams" description="Group people, for example by country or by service." />
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
