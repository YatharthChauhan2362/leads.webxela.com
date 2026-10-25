/** Solid round status mark used by save messages: blue when saved, red when something went wrong. */
export function StatusDot({ error = false }: { error?: boolean }) {
  return <span aria-hidden className={`size-3 shrink-0 rounded-full ${error ? "bg-danger" : "bg-brand"}`} />;
}
