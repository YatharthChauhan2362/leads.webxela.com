import type { ReactNode } from "react";

const alignClass = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-border bg-background">
      <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-primary text-[12.5px] text-white">{children}</thead>;
}

export function Th({ children, className = "", align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th scope="col" className={`whitespace-nowrap border-r border-white/15 px-4 py-3.5 font-semibold tracking-[0.04em] uppercase last:border-r-0 ${alignClass[align]} ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "", align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return <td className={`border-r border-b border-border px-4 py-3.5 align-middle last:border-r-0 ${alignClass[align]} ${className}`}>{children}</td>;
}

export function Tr({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <tr className={`bg-background last:[&>td]:border-b-0 hover:bg-canvas ${className}`}>{children}</tr>;
}
