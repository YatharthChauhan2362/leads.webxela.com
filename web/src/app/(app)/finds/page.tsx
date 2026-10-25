import { LeadsView } from "../leads-view";
import { requireMember } from "@/lib/session";

/** Daily finds: everything collected automatically, to review and add to Leads. Admins only. */
export default async function FindsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireMember("admin");
  return <LeadsView searchParams={searchParams} mode="finds" />;
}
