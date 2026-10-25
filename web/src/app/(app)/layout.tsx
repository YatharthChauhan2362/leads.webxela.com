import { AppShell } from "@/components/shell/app-shell";
import { requireMember } from "@/lib/session";

/** Everything inside needs a signed in team member (once Google or Zoho sign in is set up). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  return <AppShell member={member}>{children}</AppShell>;
}
