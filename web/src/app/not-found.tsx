import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/layout";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" description="This page does not exist or has moved." />
      <EmptyState
        title="Nothing here"
        description="Check the address, or go back to your leads."
        action={
          <Link href="/" className={buttonClass("primary")}>
            Open lead inbox
          </Link>
        }
      />
    </>
  );
}
