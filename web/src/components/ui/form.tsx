import type { ComponentProps, ReactNode } from "react";

const control =
  "block w-full h-12 rounded-xl border border-input bg-background px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 transition-colors focus:border-primary focus:outline-none focus:ring-3 focus:ring-ring/25 disabled:bg-muted disabled:text-muted-foreground";

export function Label({ children, htmlFor, optional }: { children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
      {children}
      {optional ? <span className="ml-1 font-normal text-muted-foreground">(optional)</span> : null}
    </label>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-[13px] text-muted-foreground">{children}</p>;
}

/** A labelled field. Pass the input as children, or use the shorthand props below. */
export function Field({
  label,
  htmlFor,
  hint,
  optional,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} optional={optional}>
        {label}
      </Label>
      {children}
      {hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${control} ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={`${control} appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='16'%20height='16'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23666'%20stroke-width='2'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${control} h-auto min-h-28 py-2.5 leading-relaxed ${className}`} {...props} />;
}

export function Checkbox({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 rounded border-input accent-primary" {...props} />
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint ? <span className="block text-[13px] text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const c = cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : cols === 2 ? "sm:grid-cols-2" : "";
  return <div className={`grid grid-cols-1 gap-x-4 gap-y-5 ${c}`}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-6 first-of-type:border-t-0 first-of-type:pt-0">
      <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-sans)", letterSpacing: 0 }}>
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
