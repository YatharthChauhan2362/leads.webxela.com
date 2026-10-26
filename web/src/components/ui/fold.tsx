"use client";

import { useState, type ReactNode } from "react";

/** On a phone, folds a block behind one button so the list comes first. On a computer it is always open. */
export function MobileFold({ label, children, active = false }: { label: string; children: ReactNode; active?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 lg:mb-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-12 w-full items-center justify-between rounded-xl border border-border bg-background px-4 text-[15px] font-medium lg:hidden"
      >
        <span>
          {label}
          {active ? <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-[12px] text-white">On</span> : null}
        </span>
        <span className="text-primary">{open ? "Hide" : "Show"}</span>
      </button>
      <div className={open ? "mt-3 lg:mt-0" : "hidden lg:block"}>{children}</div>
    </div>
  );
}
