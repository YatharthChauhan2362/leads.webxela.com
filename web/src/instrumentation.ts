export async function register() {
  // On Vercel there is no long running server, so the extension starts each check instead.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_TIMER === "1" || process.env.VERCEL) return;
  const { pollSources } = await import("./lib/sources");
  const every = (Number(process.env.POLL_MINUTES) || 30) * 60_000;
  const run = () =>
    pollSources()
      .then((r) => console.log("[timer] poll done", r))
      .catch((e) => console.warn("[timer] poll failed", e.message));
  setTimeout(run, 10_000);
  setInterval(run, every);
}
