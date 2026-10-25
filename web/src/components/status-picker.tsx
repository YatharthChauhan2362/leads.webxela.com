"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { changeStatus } from "@/app/actions";
import { STATUS_WORDS } from "@/components/leads";

/** Status that saves the moment you pick it. Lost asks for a short reason first. */
export function StatusPicker({ id, status, label, wide = false }: { id: number; status: string; label: string; wide?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [saved, setSaved] = useState(status);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // A teammate changed it and the page refreshed: show their status.
  const [fromServer, setFromServer] = useState(status);
  if (status !== fromServer) {
    setFromServer(status);
    setValue(status);
    setSaved(status);
  }

  const save = (next: string, lostReason?: string) =>
    start(async () => {
      const r = await changeStatus({ id, status: next, lostReason }).catch(() => ({ ok: false, message: "Could not save. Try again." }));
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setSaved(next);
        router.refresh();
      } else if (next !== "lost") setValue(saved);
    });

  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "w-full" : "min-w-[170px]"}`}>
      <label className="sr-only" htmlFor={`status-${id}`}>
        {label}
      </label>
      <select
        id={`status-${id}`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          setMsg(null);
          if (next !== "lost") save(next);
        }}
        className="h-11 w-full rounded-xl border border-input bg-background px-2 text-[14px] disabled:opacity-60"
      >
        {Object.entries(STATUS_WORDS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {value === "lost" && saved !== "lost" ? (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            save("lost", reason);
          }}
        >
          <label className="sr-only" htmlFor={`lost-${id}`}>
            Why it was lost
          </label>
          <input
            id={`lost-${id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why it was lost"
            maxLength={500}
            required
            autoFocus
            className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-2 text-[14px]"
          />
          <button disabled={pending} className="h-10 rounded-xl bg-primary px-3 text-[14px] font-medium text-primary-foreground disabled:opacity-60">
            Save
          </button>
        </form>
      ) : null}
      <p aria-live="polite" className={`min-h-[18px] text-[12px] ${msg && !msg.ok ? "text-danger" : "text-muted-foreground"}`}>
        {pending ? "Saving..." : (msg?.text ?? "")}
      </p>
    </div>
  );
}

/** Pulls fresh data every few seconds while the tab is open, so teammates' changes show without a reload. */
export function LiveRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = window.setInterval(() => {
      // Never refresh while someone is typing or picking.
      const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (document.visibilityState === "visible" && !typing) router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(t);
  }, [router, seconds]);
  return null;
}
