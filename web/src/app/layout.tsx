import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { CSSProperties } from "react";
import { getBrand } from "@/lib/brand";
import { FONTS } from "@/lib/fonts";
import "./globals.css";

const interTight = localFont({ src: "./fonts/inter-tight-latin-wght-normal.woff2", variable: "--font-inter-tight", weight: "100 900", display: "swap" });
const neueMontreal = localFont({ src: "./fonts/neue-montreal.woff2", variable: "--font-neue-montreal", weight: "400", display: "swap" });
const bricolage = localFont({ src: "./fonts/bricolage-grotesque-latin-wght-normal.woff2", variable: "--font-bricolage", weight: "200 800", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  return {
    title: b.tabTitle,
    description: "Find people who need a project built, the moment they post.",
    icons: { icon: b.favicon, apple: b.favicon },
    // Added to a phone's home screen, it opens full screen like an app.
    appleWebApp: { capable: true, title: b.tabTitle, statusBarStyle: "default" },
    applicationName: b.tabTitle,
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff", colorScheme: "light", interactiveWidget: "resizes-content" };

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const b = await getBrand();
  // The admin's brand colour replaces the blue everywhere: buttons, headers, links, focus rings.
  // So does the font they picked.
  const font = FONTS[b.font];
  const theme = { "--color-primary": b.color, "--color-primary-hover": b.hover, "--color-brand": b.color, "--color-ring": b.color, "--font-sans": font.sans, "--font-display": font.display } as CSSProperties;
  return (
    <html lang="en" className={`${interTight.variable} ${bricolage.variable} ${neueMontreal.variable}`} style={theme}>
      <body>{children}</body>
    </html>
  );
}
