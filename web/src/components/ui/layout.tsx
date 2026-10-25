import Link from "next/link";
import type { ReactNode } from "react";

/** Vertical blue used by page headers and the workspace card. A touch brighter at the top. */
// Follows the brand colour an admin picks (--color-primary), a touch lighter at the top and darker at the bottom.
export const BLUE_PANEL =
  "linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 88%, white) 0%, var(--color-primary) 55%, color-mix(in srgb, var(--color-primary) 90%, black) 100%)";

/** Large blue areas on the public site: the same blue, with a soft glow in the top right corner. */
export const BLUE_HERO = `radial-gradient(60% 70% at 85% 0%, color-mix(in srgb, var(--color-primary) 55%, white) 0%, transparent 70%), ${BLUE_PANEL}`;

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-7">
      {back ? (
        <Link href={back.href} className="no-print mb-3 inline-flex min-h-[44px] items-center text-sm font-medium text-muted-foreground hover:text-primary">
          Back to {back.label}
        </Link>
      ) : null}
      <div className="hero-card print-sheet relative overflow-hidden rounded-3xl px-6 py-7 sm:px-9 sm:py-9" style={{ backgroundImage: BLUE_PANEL }}>
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full border-[28px] border-white/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold tracking-[-0.02em] break-words sm:text-[36px]">{title}</h1>
            {description ? <div className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/85 sm:text-[16px]">{description}</div> : null}
          </div>
          {actions ? <div className="hero-actions no-print flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}

export const CARD_SURFACE = "shadow-[0_1px_2px_hsl(0_0%_0%/0.04)]";

/** Hover for any clickable card: blue border, small lift and soft shadow. */
export const CARD_HOVER =
  "touch-manipulation transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-card)] focus-visible:border-primary active:scale-[0.99] active:border-primary";

export function Card({ children, className = "", padded = true, id }: { children: ReactNode; className?: string; padded?: boolean; id?: string }) {
  return (
    <div id={id} className={`rounded-2xl border border-border ${CARD_SURFACE} bg-background ${padded ? "p-5 sm:p-6" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardLink({ href, children = "View all" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}

/** Stat card: a label, a large blue number and a short note. No icon. */
export function Stat({ label, value, note, href }: { label: string; value: ReactNode; note?: ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-[14px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-4 text-[clamp(22px,6.2vw,30px)] leading-none font-extrabold tracking-tight break-words text-primary tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
        {value}
      </p>
      {note ? <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{note}</p> : null}
    </>
  );
  const cls = `group relative block h-full overflow-hidden rounded-2xl border border-border ${CARD_SURFACE} bg-background p-5`;
  return href ? (
    <Link href={href} className={`${cls} ${CARD_HOVER}`} data-stat={label}>
      {body}
    </Link>
  ) : (
    <div className={cls} data-stat={label}>
      {body}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary bg-background px-6 py-12 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      {description ? <div className="mx-auto mt-1.5 max-w-md text-[15px] text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Small empty state inside a card. */
export function CardEmpty({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[14px] leading-relaxed text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "ink";
const fills: Record<Tone, string> = {
  neutral: "bg-muted text-foreground ring-1 ring-border",
  blue: "bg-primary text-white",
  green: "bg-success text-white",
  amber: "bg-warning text-white",
  red: "bg-danger text-white",
  ink: "bg-foreground text-white",
};

/** Solid status pill with a word. Coloured pills always use white text. */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge inline-flex items-center whitespace-nowrap rounded-full px-3 py-0.5 text-[13px] font-semibold ${fills[tone]}`}>{children}</span>;
}

/** Note inside a page: white card with a short coloured label word. */
export function Callout({ children, tone = "blue", label, className = "" }: { children: ReactNode; tone?: "blue" | "amber" | "red" | "green"; label?: string; className?: string }) {
  const { color, word } = {
    blue: { color: "text-primary", word: "Note" },
    amber: { color: "text-warning", word: "Check" },
    red: { color: "text-danger", word: "Important" },
    green: { color: "text-success", word: "Done" },
  }[tone];
  return (
    <div className={`rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground ${className}`}>
      <p className={`text-[13px] font-semibold ${color}`}>{label ?? word}</p>
      <div className="mt-0.5 min-w-0">{children}</div>
    </div>
  );
}

/** Segmented tabs driven by links, so they work without client JavaScript. */
export function Tabs({ tabs, active, label = "Sections" }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string; label?: string }) {
  return (
    <nav className="no-print mb-6 max-w-full overflow-x-auto" aria-label={label}>
      <div className="inline-flex gap-1 rounded-2xl border border-border bg-background p-1.5">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[15px] font-medium transition-colors ${
              t.key === active ? "bg-primary text-primary-foreground shadow-[var(--shadow-inset)]" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count != null ? <span className="tabular-nums opacity-80">{t.count}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-[13px] text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-[15px] break-words">{it.value || <span className="text-muted-foreground">Not added</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Initials in an ink circle, for people. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const letters =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-foreground font-semibold text-background" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {letters}
    </span>
  );
}
