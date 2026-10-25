import { LeadsView } from "../leads-view";

/** Daily finds: everything collected automatically, to review and add to Leads. */
export default function FindsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return <LeadsView searchParams={searchParams} mode="finds" />;
}
