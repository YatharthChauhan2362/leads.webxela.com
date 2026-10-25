import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { BLUE_PANEL } from "@/components/ui/layout";
import { must, sb } from "@/lib/db";
import { MobileMenu, NavLinks, type NavGroup } from "./nav-links";

function nav(newCount: number): NavGroup[] {
  return [
    {
      label: "Leads",
      items: [
        { href: "/", label: "Inbox", count: newCount },
        { href: "/add", label: "Add a post" },
      ],
    },
    {
      label: "Setup",
      items: [
        { href: "/linkedin", label: "LinkedIn account" },
        { href: "/settings", label: "Searches and alerts" },
        { href: "/extension", label: "Chrome extension" },
      ],
    },
  ];
}

type Last = { at: string; added: number } | null;

function StatusCard({ last }: { last: Last }) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-2xl p-4 text-white shadow-[var(--shadow-glow)]" style={{ backgroundImage: BLUE_PANEL }}>
      <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full border-[18px] border-white/10" />
      <div className="relative">
        <p className="text-[16px] leading-tight font-bold" style={{ fontFamily: "var(--font-display)" }}>
          Yatri Cloud
        </p>
        <p className="mt-1 text-[13px] text-white/85">
          {last ? `Last check ${timeAgo(last.at)}, ${last.added} new` : "No check yet"}
        </p>
      </div>
    </div>
  );
}

function SideContent({ count, last }: { count: number; last: Last }) {
  return (
    <div className="flex min-h-full flex-col gap-6 [&>*]:shrink-0">
      <StatusCard last={last} />
      <nav aria-label="Main">
        <NavLinks groups={nav(count)} />
      </nav>
    </div>
  );
}

export async function AppShell({ children }: { children: ReactNode }) {
  const [newLeads, lastRun] = await Promise.all([
    sb().from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
    sb().from("runs").select("at, added").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const count = newLeads.count ?? 0;
  const last = must(lastRun) as Last;
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-border bg-background lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <SideContent count={count} last={last} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-4 lg:hidden">
          <Brand />
          <MobileMenu label="Open menu">
            <SideContent count={count} last={last} />
          </MobileMenu>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
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
