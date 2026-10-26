import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Avatar } from "@/components/ui/layout";
import { getBrand } from "@/lib/brand";
import { hoursAgo, must, sb } from "@/lib/db";
import { can, type Member } from "@/lib/session";
import { BottomTabs, NavLinks, type NavGroup, type TabItem } from "./nav-links";
import { Pulse } from "./pulse";
import { NavProgress } from "./nav-progress";
import { ActivityTracker } from "./activity-tracker";
import { unreadTotal } from "@/lib/chat";
import { Suspense } from "react";

const ROLE_WORDS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

function nav(newCount: number, member: Member | null, unread = 0, findCount = 0, openFeedback = 0, chat = 0): NavGroup[] {
  const admin = !member || can(member, "admin");
  if (!admin) {
    // Members get only what they need to work their leads.
    return [
      {
        label: "",
        items: [
          { href: "/", label: "Leads", count: newCount, match: ["/leads"] },
          { href: "/chat", label: "Team chat", count: chat },
          { href: "/notifications", label: "Notifications", count: unread },
          { href: "/search", label: "Search" },
          { href: "/resources", label: "Resources" },
          { href: "/feedback", label: "Feedback" },
        ],
      },
    ];
  }
  return [
    {
      label: "",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/", label: "Leads", count: newCount, match: ["/leads"] },
        { href: "/chat", label: "Team chat", count: chat },
        { href: "/notifications", label: "Notifications", count: unread },
      ],
    },
    {
      label: "Find leads",
      items: [
        { href: "/finds", label: "Daily finds", count: findCount },
        { href: "/search", label: "Search" },
        { href: "/people", label: "People" },
      ],
    },
    {
      label: "Team",
      items: [
        { href: "/team", label: "Members" },
        { href: "/activity", label: "Activity" },
        { href: "/resources", label: "Resources" },
        { href: "/feedback", label: "Feedback", count: openFeedback },
        // One link for every setting; the pages share tabs.
        { href: "/preferences", label: "Settings", match: ["/engines", "/settings"] },
      ],
    },
  ];
}

/** The phone tab bar: what each person uses most, one tap away. */
function tabsFor(member: Member | null, n: { count: number; chat: number; unread: number }): TabItem[] {
  const admin = !member || can(member, "admin");
  return [
    { href: "/", label: "Leads", count: n.count },
    { href: "/chat", label: "Chat", count: n.chat },
    { href: "/notifications", label: "Alerts", count: n.unread },
    admin ? { href: "/dashboard", label: "Dashboard" } : { href: "/search", label: "Search" },
  ];
}

type Last = { at: string; added: number } | null;


function SideContent({ count, last, member, company, unread, finds, feedback = 0, chat = 0 }: { count: number; last: Last; member: Member | null; company: string; unread: number; finds: number; feedback?: number; chat?: number }) {
  return (
    <div className="flex min-h-full flex-col gap-6 [&>*]:shrink-0">
      <nav aria-label="Pages">
        <NavLinks groups={nav(count, member, unread, finds, feedback, chat)} />
      </nav>
      {member ? (
        <div className="mt-auto space-y-2 border-t border-border pt-4">
          <div className="flex min-h-[44px] items-center gap-3 rounded-xl p-2">
            <Avatar name={member.name || member.email} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{member.name || member.email}</span>
              {can(member, "admin") ? <span className="block truncate text-[12px] text-muted-foreground">{company}, {last ? `checked ${timeAgo(last.at)}` : "no check yet"}</span> : null}
              <span className="block truncate text-[13px] text-muted-foreground">{ROLE_WORDS[member.role]}</span>
            </span>
          </div>
          <form action="/auth/signout" method="post">
            <button className="min-h-[44px] w-full rounded-xl border border-border px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-danger hover:bg-danger hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export async function AppShell({ children, member }: { children: ReactNode; member: Member | null }) {
  const admin = !member || can(member, "admin");
  const mineOnly = member && !admin ? `assigned_to.eq.${member.id},captured_by.eq.${member.id}` : null;
  // Everything the menu needs, fetched at the same time rather than one after another.
  let newQuery = sb().from("leads").select("id", { count: "exact", head: true }).eq("is_lead", true).eq("status", "new");
  // Only finds worth a look: the same "hide cold" cut the Daily finds list starts with.
  let findQuery = sb().from("leads").select("id", { count: "exact", head: true }).eq("is_lead", false).gte("score", 40).gte("captured_at", hoursAgo(24));
  if (mineOnly) {
    newQuery = newQuery.or(mineOnly);
    findQuery = findQuery.or(mineOnly);
  }
  const zero = Promise.resolve({ count: 0 });
  const [newLeads, lastRun, brand, findRes, feedbackRes, chat, unreadRes] = await Promise.all([
    newQuery,
    sb().from("runs").select("at, added").order("id", { ascending: false }).limit(1).maybeSingle(),
    getBrand(),
    admin ? findQuery : zero,
    admin ? sb().from("feedback").select("id", { count: "exact", head: true }).eq("status", "open") : zero,
    member ? unreadTotal(member).catch(() => 0) : Promise.resolve(0),
    member ? sb().from("notifications").select("id", { count: "exact", head: true }).eq("member_id", member.id).is("read_at", null) : zero,
  ]);
  const count = newLeads.count ?? 0;
  const finds = findRes.count ?? 0;
  const feedback = feedbackRes.count ?? 0;
  const unread = unreadRes.count ?? 0;
  const last = must(lastRun) as Last;
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[272px_1fr]">
      {member ? (
        <Suspense fallback={null}>
          <ActivityTracker />
          <Pulse />
          <NavProgress />
        </Suspense>
      ) : null}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-border bg-background lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <SideContent count={count} last={last} member={member} company={brand.company} unread={unread} finds={finds} feedback={feedback} chat={chat} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <Brand />
        </header>
        <main className="mx-auto w-full max-w-[1760px] px-3 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-8">{children}</main>
        <BottomTabs
          tabs={tabsFor(member, { count, chat, unread })}
          groups={nav(count, member, unread, finds, feedback, chat)}
          more={<SideContent count={count} last={last} member={member} company={brand.company} unread={unread} finds={finds} feedback={feedback} chat={chat} />}
        />
      </div>
    </div>
  );
}

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
