import { StatusDot } from "./status-dot";

type Params = { [key: string]: string | string[] | undefined };

/**
 * Shows the ?ok= or ?error= message set by a server action redirect.
 * White card with a solid status circle: blue tick when saved, red mark when something went wrong. No stripes, no tinted fills.
 */
export async function Flash({ searchParams }: { searchParams: Promise<Params> | Params }) {
  const params = await searchParams;
  const ok = typeof params.ok === "string" ? params.ok : null;
  const error = typeof params.error === "string" ? params.error : null;
  if (!ok && !error) return null;
  const isError = Boolean(error);
  return (
    <div
      role={isError ? "alert" : "status"}
      className="no-print mb-6 flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 shadow-[var(--shadow-card)]"
    >
      <StatusDot error={isError} />
      <p className="text-[15px] font-medium leading-relaxed text-foreground">{error ?? ok}</p>
    </div>
  );
}

