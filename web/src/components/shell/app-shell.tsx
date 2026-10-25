import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Avatar, BLUE_PANEL } from "@/components/ui/layout";
import { getBrand } from "@/lib/brand";
import { must, sb } from "@/lib/db";
import { can, type Member } from "@/lib/session";
import { MobileMenu, NavLinks, type NavGroup } from "./nav-links";
import { ActivityTracker } from "./activity-tracker";
import { Suspense } from "react";

const ROLE_WORDS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

function nav(newCount: number, member: Member | null): NavGroup[] {
  const admin = !member || can(member, "admin");
  return [
    {
      label: "Leads",
      items: [
        { href: "/", label: "Leads", count: newCount },
        { href: "/people", label: "People" },
        { href: "/add", label: "Add a post" },
      ],
    },
    {
      label: "Setup",
      items: [
        ...(admin ? [{ href: "/linkedin", label: "LinkedIn account" }] : []),
        { href: "/extension", label: "Chrome extension" },
        ...(admin ? [{ href: "/settings", label: "Searches and alerts" }] : []),
        { href: "/team", label: "Team" },
        ...(admin ? [{ href: "/activity", label: "Activity" }] : []),
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

function SideContent({ count, last, member, company }: { count: number; last: Last; member: Member | null; company: string }) {
  return (
    <div className="flex min-h-full flex-col gap-6 [&>*]:shrink-0">
      <StatusCard last={last} company={company} />
      <nav aria-label="Main">
        <NavLinks groups={nav(count, member)} />
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
    sb().from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    sb().from("runs").select("at, added").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const count = newLeads.count ?? 0;
  const brand = await getBrand();
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
          <SideContent count={count} last={last} member={member} company={brand.company} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <Brand />
          <MobileMenu label="Open menu">
            <SideContent count={count} last={last} member={member} company={brand.company} />
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
