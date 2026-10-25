import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Avatar, BLUE_PANEL } from "@/components/ui/layout";
import { getBrand } from "@/lib/brand";
import { hoursAgo, must, sb } from "@/lib/db";
import { can, type Member } from "@/lib/session";
import { MobileMenu, NavLinks, type NavGroup } from "./nav-links";
import { ActivityTracker } from "./activity-tracker";
import { Suspense } from "react";

const ROLE_WORDS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

function nav(newCount: number, member: Member | null, unread = 0, findCount = 0): NavGroup[] {
  const admin = !member || can(member, "admin");
  if (!admin) {
    // Members get only what they need to work their leads.
    return [
      {
        label: "Work",
        items: [
          { href: "/", label: "Leads", count: newCount },
          { href: "/notifications", label: "Notifications", count: unread },
          { href: "/extension", label: "Chrome extension" },
        ],
      },
    ];
  }
  return [
    {
      label: "Work",
      items: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/", label: "Leads", count: newCount },
        { href: "/notifications", label: "Notifications", count: unread },
      ],
    },
    {
      label: "Finding leads",
      items: [
        { href: "/finds", label: "Daily finds", count: findCount },
        { href: "/search", label: "Search" },
        { href: "/people", label: "People" },
        { href: "/extension", label: "Chrome extension" },
      ],
    },
    {
      label: "Admin",
      items: [
        { href: "/team", label: "Team" },
        { href: "/activity", label: "Activity" },
        { href: "/preferences", label: "Preferences" },
        { href: "/engines", label: "Search engines" },
        { href: "/settings", label: "Searches and branding" },
      ],
    },
  ];
}

type Last = { at: string; added: number } | null;

function StatusCard({ last, company }: { last: Last; company: string }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-2xl p-4 text-white shadow-[var(--shadow-glow)]" style={{ backgroundImage: BLUE_PANEL }}>
      <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full border-[18px] border-white/10" />
      <div className="relative">
        <p className="text-[16px] leading-tight font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {company}
        </p>
        <p className="mt-1 text-[13px] text-white/85">
          {last ? `Last check ${timeAgo(last.at)}, ${last.added} new` : "No check yet"}
        </p>
      </div>
    </div>
  );
}

function SideContent({ count, last, member, company, unread, finds }: { count: number; last: Last; member: Member | null; company: string; unread: number; finds: number }) {
  return (
    <div className="flex min-h-full flex-col gap-6 [&>*]:shrink-0">
      <StatusCard last={last} company={company} />
      <nav aria-label="Main">
        <NavLinks groups={nav(count, member, unread, finds)} />
      </nav>
      {member ? (
        <div className="mt-auto space-y-2 border-t border-border pt-4">
          <div className="flex min-h-[44px] items-center gap-3 rounded-xl p-2">
            <Avatar name={member.name || member.email} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{member.name || member.email}</span>
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
  const [newLeads, lastRun] = await Promise.all([
    // Members only count their own new leads.
    (member && !can(member, "admin")
      ? sb().from("leads").select("id", { count: "exact", head: true }).eq("is_lead", true).eq("status", "new").or(`assigned_to.eq.${member.id},captured_by.eq.${member.id}`)
      : sb().from("leads").select("id", { count: "exact", head: true }).eq("is_lead", true).eq("status", "new")),
    sb().from("runs").select("at, added").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const count = newLeads.count ?? 0;
  const brand = await getBrand();
  // New daily finds in the last 24 hours, for the menu.
  let findQuery = sb().from("leads").select("id", { count: "exact", head: true }).eq("is_lead", false).gte("captured_at", hoursAgo(24));
  if (member && !can(member, "admin")) findQuery = findQuery.or(`assigned_to.eq.${member.id},captured_by.eq.${member.id}`);
  const finds = (await findQuery).count ?? 0;
  const unread = member ? ((await sb().from("notifications").select("id", { count: "exact", head: true }).eq("member_id", member.id).is("read_at", null)).count ?? 0) : 0;
  const last = must(lastRun) as Last;
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[272px_1fr]">
      {member ? (
        <Suspense fallback={null}>
          <ActivityTracker />
        </Suspense>
      ) : null}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-border bg-background lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <SideContent count={count} last={last} member={member} company={brand.company} unread={unread} finds={finds} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <Brand />
          <MobileMenu label="Open menu">
            <SideContent count={count} last={last} member={member} company={brand.company} unread={unread} finds={finds} />
          </MobileMenu>
        </header>
        <main className="mx-auto w-full max-w-[1760px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
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
