import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  // touch-manipulation removes the tap delay on phones; active: gives instant feedback where there is no hover.
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 touch-manipulation active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none select-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-[var(--shadow-inset)] hover:bg-primary-hover active:bg-primary-hover",
  secondary: "border border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary active:bg-primary active:text-primary-foreground active:border-primary",
  ghost: "text-foreground hover:bg-muted active:bg-muted",
  danger: "border border-danger/30 bg-background text-danger hover:bg-danger hover:text-white hover:border-danger",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-6 text-base",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
