import { timeAgo } from "@/components/shell/app-shell";
import { buttonClass } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, Stat } from "@/components/ui/layout";
import { THead, Table, Td, Th, Tr } from "@/components/ui/table";
import { ACTION_WORDS } from "@/lib/activity";
import { hoursAgo, must, sb } from "@/lib/db";
import { requireMember } from "@/lib/session";

type Row = { id: number; member_id: string | null; member_email: string | null; action: string; target: string | null; detail: string | null; path: string | null; ip: string | null; at: string };

// Actions where data can leave the app. Shown in red so they stand out.
const LEAVES = new Set(["export_csv", "copy", "email_link", "phone_link", "open_link", "lookup"]);
const GROUPS: Record<string, string[]> = {
  shared: ["export_csv", "copy", "email_link", "phone_link", "open_link"],
  leads: ["status", "notes", "assign", "reply", "delete_lead", "add_post", "rescore", "check_now"],
  access: ["sign_in", "sign_out", "sign_in_refused", "invite", "member_change", "access", "remove_member", "new_key", "team_change"],
  pages: ["page_view"],
  extension: ["capture", "lookup"],
};
const GROUP_WORDS: Record<string, string> = { shared: "Copied, downloaded or opened", leads: "Lead work", access: "Sign in and team", pages: "Pages opened", extension: "Extension" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMember("admin");
  const sp = await searchParams;
  const who = typeof sp.who === "string" ? sp.who : "";
  const group = typeof sp.group === "string" && GROUPS[sp.group] ? sp.group : "";
  const days = Number(sp.days) || 7;

  // The once a minute "online" signals feed the summary, not the event list.
  let q = sb().from("activity").select("id, member_id, member_email, action, target, detail, path, ip, at").gte("at", hoursAgo(days * 24)).neq("action", "online");
  if (/^[0-9a-f-]{36}$/.test(who)) q = q.eq("member_id", who);
  if (group) q = q.in("action", GROUPS[group]);

  const [rows, people, shared, summary] = await Promise.all([
    q.order("at", { ascending: false }).limit(500).then((r) => must(r) as Row[]),
    sb().from("members").select("id, name, email").order("name").then((r) => must(r) as { id: string; name: string | null; email: string }[]),
    sb().from("activity").select("id", { count: "exact", head: true }).gte("at", hoursAgo(24)).in("action", GROUPS.shared),
    usage(),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name || p.email]));
  const dayAgo = hoursAgo(24);
  const activeToday = new Set(rows.filter((r) => r.at > dayAgo && r.member_id).map((r) => r.member_id)).size;

  return (
    <>
      <PageHeader title="Activity" description="What each person does in the app: pages, lead work, sign ins, and every copy, download and outside link." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Events shown" value={rows.length} note={`Last ${days} day${days === 1 ? "" : "s"}`} />
        <Stat label="People active today" value={activeToday} />
        <Stat label="Copied or downloaded today" value={shared.count ?? 0} note="Data that may have left the app" href="/activity?group=shared&days=1" />
        <Stat label="Refused sign ins" value={rows.filter((r) => r.action === "sign_in_refused").length} href="/activity?group=access" />
      </div>

      <h2 className="mb-3 text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
        People
      </h2>
      <div className="mb-8">
        <Table>
          <THead>
            <tr>
              <Th>Person</Th>
              <Th>Now</Th>
              <Th align="right">Active today</Th>
              <Th align="right">Active this week</Th>
              <Th>Uses most</Th>
              <Th align="right">Copied or downloaded</Th>
            </tr>
          </THead>
          <tbody>
            {summary.map((u) => (
              <Tr key={u.id}>
                <Td className="min-w-[180px]">
                  <a href={`/activity?who=${u.id}`} className="font-semibold hover:text-primary hover:underline">
                    {u.name}
                  </a>
                </Td>
                <Td className="whitespace-nowrap">
                  {u.online ? <Badge tone="green">Online now</Badge> : <span className="text-[14px] text-muted-foreground">{u.lastSeen ? `Seen ${timeAgo(u.lastSeen)}` : "Not seen yet"}</span>}
                </Td>
                <Td align="right">{minutes(u.today)}</Td>
                <Td align="right">{minutes(u.week)}</Td>
                <Td className="min-w-[220px] text-[14px]">{u.top.length ? u.top.join(", ") : <span className="text-muted-foreground">Nothing yet</span>}</Td>
                <Td align="right">{u.shared}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2 text-[13px] text-muted-foreground">Active time counts minutes the app is open and on screen. Online now means active in the last 2 minutes.</p>
      </div>

      <form action="/activity" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[260px_260px_180px_auto]">
        <label className="sr-only" htmlFor="who">
          Person
        </label>
        <Select id="who" name="who" defaultValue={who}>
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name || p.email}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="group">
          Kind of action
        </label>
        <Select id="group" name="group" defaultValue={group}>
          <option value="">Every action</option>
          {Object.entries(GROUP_WORDS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="days">
          Time
        </label>
        <Select id="days" name="days" defaultValue={String(days)}>
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
        <button className={buttonClass("secondary", "md", "h-12")}>Show</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Nothing yet" description="Activity shows up here as soon as people sign in and use the app." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>When</Th>
              <Th>Who</Th>
              <Th>What</Th>
              <Th>Details</Th>
              <Th>Where</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="align-top text-[14px] whitespace-nowrap">
                  {timeAgo(r.at)}
                  <p className="text-[12.5px] text-muted-foreground">
                    {new Date(r.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                  </p>
                </Td>
                <Td className="min-w-[180px] align-top text-[14px]">
                  {r.member_id ? nameOf.get(r.member_id) ?? r.member_email : (r.member_email ?? <span className="text-muted-foreground">Extension key</span>)}
                </Td>
                <Td className="min-w-[200px] align-top">
                  {r.action === "sign_in_refused" ? (
                    <Badge tone="red">{ACTION_WORDS[r.action]}</Badge>
                  ) : LEAVES.has(r.action) ? (
                    <Badge tone="amber">{ACTION_WORDS[r.action] ?? r.action}</Badge>
                  ) : (
                    <span className="text-[14px] font-medium">{ACTION_WORDS[r.action] ?? r.action}</span>
                  )}
                </Td>
                <Td className="min-w-[280px] max-w-[520px] align-top text-[14px]">
                  {r.target ? <p className="break-all">{r.target}</p> : null}
                  {r.detail ? <p className="line-clamp-3 break-words text-muted-foreground">{r.detail}</p> : null}
                </Td>
                <Td className="align-top text-[13px] text-muted-foreground">
                  {r.path ? <p className="break-all">{r.path}</p> : null}
                  {r.ip ? <p>{r.ip}</p> : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

const FEATURES: [RegExp, string][] = [
  [/^\/$|^\/\?/, "Leads"],
  [/^\/leads\//, "Lead details"],
  [/^\/people/, "People"],
  [/^\/me/, "My work"],
  [/^\/add/, "Add a post"],
  [/^\/team/, "Team"],
  [/^\/settings/, "Searches and alerts"],
  [/^\/activity/, "Activity"],
  [/^\/extension/, "Chrome extension"],
  [/^\/linkedin/, "LinkedIn account"],
];

function feature(path: string | null) {
  if (!path) return null;
  return FEATURES.find(([re]) => re.test(path))?.[1] ?? null;
}

function minutes(n: number) {
  if (!n) return "0 min";
  return n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`;
}

/** Per person: online now, minutes active today and this week, most used features, and copies or downloads. */
async function usage() {
  const week = hoursAgo(7 * 24);
  const day = hoursAgo(24);
  const twoMin = hoursAgo(2 / 60);
  const [people, events] = await Promise.all([
    sb().from("members").select("id, name, email, last_seen_at").neq("status", "disabled").order("name").then((r) => must(r) as { id: string; name: string | null; email: string; last_seen_at: string | null }[]),
    sb().from("activity").select("member_id, action, target, path, at").gte("at", week).not("member_id", "is", null).order("at", { ascending: false }).limit(20000).then(
      (r) => must(r) as { member_id: string; action: string; target: string | null; path: string | null; at: string }[],
    ),
  ]);
  return people.map((p) => {
    const mine = events.filter((e) => e.member_id === p.id);
    const beats = mine.filter((e) => e.action === "online");
    // One beat a minute; count distinct minutes so two open tabs do not double count.
    const mins = (list: typeof beats) => new Set(list.map((b) => b.at.slice(0, 16))).size;
    const counts = new Map<string, number>();
    for (const e of mine) {
      const f = e.action === "page_view" ? feature(e.target) : e.action === "online" ? null : (ACTION_WORDS[e.action] ?? null);
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return {
      id: p.id,
      name: p.name || p.email,
      online: Boolean(p.last_seen_at && p.last_seen_at >= twoMin),
      lastSeen: p.last_seen_at,
      today: mins(beats.filter((b) => b.at >= day)),
      week: mins(beats),
      top: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`),
      shared: mine.filter((e) => GROUPS.shared.includes(e.action)).length,
    };
  });
}
