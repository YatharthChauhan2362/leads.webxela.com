import "server-only";
import { cache } from "react";
import { getSettings } from "./db";

export type Brand = { first: string; second: string; company: string; color: string; hover: string; logo: string };

/** Hex colour to relative luminance (WCAG). */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast of white text on this colour. 3 or more keeps button and header text readable. */
export function whiteContrast(hex: string) {
  return 1.05 / (luminance(hex) + 0.05);
}

function darker(hex: string, by = 0.12) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) => Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - by))))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
  );
}

/** The app's name, colour and logo, as the admin set them. Read once per request. */
export const getBrand = cache(async (): Promise<Brand> => {
  const s = await getSettings().catch(() => null);
  const color = /^#[0-9a-f]{6}$/i.test(s?.brand_color ?? "") ? s!.brand_color : "#0080FF";
  return {
    first: s?.brand_first || "Yatri",
    second: s?.brand_second || "Leads",
    company: s?.company_name || "Yatri Cloud",
    color,
    hover: darker(color),
    logo: s?.logo_url || "/logo.png",
  };
});
