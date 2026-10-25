import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { BLUE_PANEL } from "@/components/ui/layout";
import { providerEnabled } from "@/lib/oauth";
import { authEnabled, currentMember } from "@/lib/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!authEnabled() || (await currentMember())) redirect("/");
  const google = providerEnabled("google");
  const zoho = providerEnabled("zoho");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <div className="overflow-hidden rounded-3xl border border-border bg-background shadow-[0_1px_2px_hsl(0_0%_0%/0.04)]">
          <div className="hero-card relative overflow-hidden px-7 py-7" style={{ backgroundImage: BLUE_PANEL }}>
            <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full border-[24px] border-white/10" />
            <h1 className="relative text-[28px] font-bold tracking-[-0.02em]">Sign in</h1>
            <p className="relative mt-1 text-[15px] text-white/85">Use the Google or Zoho account your team invited.</p>
          </div>
          <div className="space-y-3 p-7">
            <Flash searchParams={searchParams} />
            {/* Plain links: sign in leaves the app for Google or Zoho, so it must be a full page load. */}
            {google ? (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/auth/google" className={buttonClass("primary", "lg", "w-full")}>
                Continue with Google
              </a>
            ) : null}
            {zoho ? (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/auth/zoho" className={buttonClass(google ? "secondary" : "primary", "lg", "w-full")}>
                Continue with Zoho
              </a>
            ) : null}
            <p className="pt-2 text-center text-[13px] text-muted-foreground">Not on the team yet? Ask the owner or an admin to invite your email.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
