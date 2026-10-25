import { redirect } from "next/navigation";

/** Old "My work" link. Everything now lives on Leads. */
export default function MePage() {
  redirect("/");
}
