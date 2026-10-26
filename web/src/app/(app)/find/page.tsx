import { redirect } from "next/navigation";

/** Social search is now part of Search. */
export default function FindPage() {
  redirect("/search");
}
