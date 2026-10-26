// Line icons for the phone tab bar. Drawn inline at 24px, so there is no icon library to load.
const PATHS: Record<string, string> = {
  // A person card: leads
  "/": "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  // Speech bubble: chat
  "/chat": "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  // Bell: alerts
  "/notifications": "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  // Magnifier: search
  "/search": "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  // Bars: dashboard
  "/dashboard": "M3 3v18h18 M7 16v-5 M12 16V8 M17 16v-9",
  // Three lines: more
  more: "M4 6h16 M4 12h16 M4 18h16",
  // Cross: close the More sheet
  close: "M18 6L6 18 M6 6l12 12",
};

export function TabIcon({ name, active }: { name: string; active: boolean }) {
  const d = PATHS[name] ?? PATHS.more;
  return (
    <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i ? `M${seg}` : seg} />
      ))}
    </svg>
  );
}
