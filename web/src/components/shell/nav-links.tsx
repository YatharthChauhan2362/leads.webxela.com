"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TabIcon } from "./tab-icons";

export type NavItem = { href: string; label: string; count?: number; match?: string[] };
export type NavGroup = { label: string; items: NavItem[] };

/** Only the most specific matching link lights up. A link can also own other paths, like Settings owning its tabs. */
function activeHref(pathname: string, groups: { items: NavItem[] }[]) {
  const hits = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const matches = groups
    .flatMap((g) => g.items)
    .flatMap((i) => [i.href, ...(i.match ?? [])].filter(hits).map((m) => ({ href: i.href, len: m.length })));
  return matches.reduce<{ href: string; len: number } | null>((best, m) => (!best || m.len > best.len ? m : best), null)?.href ?? null;
}

export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const active = activeHref(pathname, groups);
  return (
    <div className="divide-y divide-border">
      {groups.map((group, gi) => (
        <div key={group.label || gi} className="py-3 first:pt-0 last:pb-0">
          {group.label ? <p className="px-3 pb-1.5 text-[12px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{group.label}</p> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = item.href === active;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-[42px] touch-manipulation items-center justify-between gap-3 rounded-xl px-3 text-[15px] transition-colors duration-150 ${
                      isActive ? "bg-brand font-semibold text-white" : "font-medium text-foreground/80 hover:bg-muted hover:text-foreground active:bg-muted"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.count ? (
                      <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${isActive ? "bg-white text-primary" : "bg-primary text-white"}`}>{item.count}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Mobile menu built on <details>; closes itself after navigating. */
export function MobileMenu({ children, label }: { children: ReactNode; label: string }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  return (
    <details ref={ref} className="group lg:hidden">
      <summary
        className="inline-flex h-11 touch-manipulation items-center rounded-xl border border-border px-4 text-sm font-medium hover:border-primary hover:bg-primary hover:text-primary-foreground active:bg-primary active:text-primary-foreground"
        aria-label={label}
      >
        <span className="group-open:hidden">Menu</span>
        <span className="hidden group-open:inline">Close</span>
      </summary>
      <div
        className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-border bg-background p-4"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a") && ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}

export type TabItem = { href: string; label: string; count?: number };

/**
 * Phone tab bar, like an app: the main places one tap away, everything else under More.
 * Sits above the home bar on phones with no button.
 */
export function BottomTabs({ tabs, groups, more }: { tabs: TabItem[]; groups: NavGroup[]; more: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Close the More sheet after moving to another page.
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);
  // A lead's own page belongs to the Leads tab.
  const active = activeHref(pathname.startsWith("/leads/") ? "/" : pathname, [{ items: tabs }]);
  const inMore = !active && !open;
  const moreCount = groups.flatMap((g) => g.items).filter((i) => !tabs.some((t) => t.href === i.href)).reduce((a, i) => a + (i.count ?? 0), 0);
  return (
    <>
      {open ? (
        <div className="fixed inset-x-0 top-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 overflow-y-auto overscroll-contain bg-background p-4 lg:hidden" role="dialog" aria-label="More">
          {more}
        </div>
      ) : null}
      <nav
        aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
      >
        <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const on = t.href === active && !open;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  onClick={() => setOpen(false)}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex h-16 touch-manipulation flex-col items-center justify-center gap-0.5 px-1 text-[11.5px] font-medium select-none active:bg-muted ${on ? "text-primary" : "text-muted-foreground"}`}
                >
                  <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${on ? "bg-primary/12" : ""}`}>
                    <TabIcon name={t.href} active={on} />
                  </span>
                  <span className={`truncate ${on ? "font-semibold" : ""}`}>{t.label}</span>
                  {t.count ? (
                    <span className="absolute top-1 right-[calc(50%-2.2rem)] min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums">
                      {t.count > 99 ? "99+" : t.count}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className={`relative flex h-16 w-full touch-manipulation flex-col items-center justify-center gap-0.5 px-1 text-[11.5px] font-medium select-none active:bg-muted ${open || inMore ? "text-primary" : "text-muted-foreground"}`}
            >
              <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${open || inMore ? "bg-primary/12" : ""}`}>
                <TabIcon name={open ? "close" : "more"} active={open || inMore} />
              </span>
              <span className={open || inMore ? "font-semibold" : ""}>{open ? "Close" : "More"}</span>
              {moreCount && !open ? (
                <span className="absolute top-1 right-[calc(50%-2.2rem)] min-w-5 rounded-full bg-danger px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums">{moreCount}</span>
              ) : null}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
