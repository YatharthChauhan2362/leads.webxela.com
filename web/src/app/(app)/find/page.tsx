import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/layout";
import { PLATFORMS } from "@/lib/platforms";
import { requireMember } from "@/lib/session";

/** Social search: pick a platform. Each has its own ways to find clients. */
export default async function FindPage() {
  await requireMember();
  return (
    <>
      <PageHeader title="Social search" description="Find clients on each platform with searches made for it. Only public pages, found through Google, so no account is ever at risk." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((p) => (
          <Link key={p.key} href={`/find/${p.key}`} className="group block rounded-2xl focus-visible:outline-2">
            <Card className="h-full transition-colors group-hover:border-primary">
              <h2 className="text-[20px] font-bold">{p.name}</h2>
              <p className="mt-1 text-[15px] text-muted-foreground">{p.blurb}</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {p.modes.map((m) => (
                  <li key={m.key} className="rounded-full border border-border px-3 py-1 text-[13px] font-medium">
                    {m.label}
                  </li>
                ))}
              </ul>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
