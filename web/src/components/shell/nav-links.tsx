"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export type NavItem = { href: string; label: string; count?: number };
export type NavGroup = { label: string; items: NavItem[] };

/** Only the most specific matching link lights up. */
function activeHref(pathname: string, groups: NavGroup[]) {
  const matches = groups
    .flatMap((g) => g.items.map((i) => i.href))
    .filter((href) => pathname === href || pathname.startsWith(href + "/"));
  return matches.reduce<string | null>((best, h) => (!best || h.length > best.length ? h : best), null);
}

export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const active = activeHref(pathname, groups);
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="eyebrow px-3 pb-1.5">{group.label}</p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const isActive = item.href === active;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-[44px] touch-manipulation items-center justify-between gap-3 rounded-xl px-3.5 text-[15px] font-medium transition-colors duration-150 ${
                      isActive ? "bg-brand text-white" : "text-muted-foreground hover:bg-brand hover:text-white active:bg-brand active:text-white"
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
