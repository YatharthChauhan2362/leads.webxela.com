import { redirect } from "next/navigation";

/** Social search is now part of Search. Old links still land on the same platform. */
export default async function FindPlatformPage({ params }: { params: Promise<{ platform: string }> }) {
  redirect(`/search?p=${encodeURIComponent((await params).platform)}`);
}
