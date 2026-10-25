import Link from "next/link";
import { getBrand } from "@/lib/brand";

export async function Logo({ size = 32 }: { size?: number }) {
  const b = await getBrand();
  // A plain img so an uploaded logo from any address works.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={b.logo} alt="" width={size} height={size} className="shrink-0 rounded-md object-contain" style={{ width: size, height: size }} />;
}

export async function Brand({ href = "/" }: { href?: string }) {
  const b = await getBrand();
  return (
    <Link href={href} className="flex min-h-[44px] items-center gap-2.5 transition-opacity hover:opacity-80" aria-label={`${b.first} ${b.second} home`}>
      <Logo size={32} />
      <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        {b.first} <span className="gradient-text">{b.second}</span>
      </span>
    </Link>
  );
}
