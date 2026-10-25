"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

/** Submit button that disables itself and shows progress while the form is being saved. */
export function SubmitButton({
  children,
  pendingText = "Saving...",
  variant = "primary",
  size = "md",
  className = "",
  name,
  value,
  confirm,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  name?: string;
  value?: string;
  /** Ask before submitting, for actions that are hard to undo. */
  confirm?: string;
  /** Spoken name when the visible text alone is not enough, e.g. "Approve leave for Tanvi". */
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={buttonClass(variant, size, className)}
    >
      {pending ? pendingText : children}
    </button>
  );
}
