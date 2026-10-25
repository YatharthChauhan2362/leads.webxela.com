import { LeadsView } from "./leads-view";

/** Leads: the ones your team chose to work. */
export default function LeadsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  return <LeadsView searchParams={searchParams} mode="leads" />;
}
