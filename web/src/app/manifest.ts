import type { MetadataRoute } from "next";
import { getBrand } from "@/lib/brand";

/** Lets the team install the app on a phone's home screen. It opens full screen, straight to Leads. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBrand();
  return {
    name: b.tabTitle,
    short_name: b.first || "Leads",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [{ src: b.favicon, sizes: "any", purpose: "any" }],
  };
}
