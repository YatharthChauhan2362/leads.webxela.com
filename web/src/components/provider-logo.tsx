import Image from "next/image";

/** Real Google or Zoho mark, shown only where people sign in with that service. */
export function ProviderLogo({ provider, size = 18 }: { provider: string | null | undefined; size?: number }) {
  if (provider !== "google" && provider !== "zoho") return null;
  return <Image src={`/logos/${provider}.svg`} alt="" width={size} height={size} className="shrink-0" />;
}

export const PROVIDER_WORDS: Record<string, string> = { google: "Google", zoho: "Zoho" };
