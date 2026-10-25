import Image from "next/image";
import Link from "next/link";

export function Logo({ size = 32 }: { size?: number }) {
  return <Image src="/logo.png" alt="" width={size} height={size} priority className="shrink-0" />;
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-h-[44px] items-center gap-2.5 transition-opacity hover:opacity-80" aria-label="Yatri Leads home">
      <Logo size={32} />
      <span className="text-lg font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        Yatri <span className="gradient-text">Leads</span>
      </span>
    </Link>
  );
}
