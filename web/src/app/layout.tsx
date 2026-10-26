import type { Metadata } from "next";
import localFont from "next/font/local";
import type { CSSProperties } from "react";
import { getBrand } from "@/lib/brand";
import "./globals.css";

const interTight = localFont({ src: "./fonts/inter-tight-latin-wght-normal.woff2", variable: "--font-inter-tight", weight: "100 900", display: "swap" });
const bricolage = localFont({ src: "./fonts/bricolage-grotesque-latin-wght-normal.woff2", variable: "--font-bricolage", weight: "200 800", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBrand();
  return { title: b.tabTitle, description: "Find people who need a project built, the moment they post.", icons: { icon: b.favicon, apple: b.favicon } };
}

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const b = await getBrand();
  // The admin's brand colour replaces the blue everywhere: buttons, headers, links, focus rings.
  const theme = { "--color-primary": b.color, "--color-primary-hover": b.hover, "--color-brand": b.color, "--color-ring": b.color } as CSSProperties;
  return (
    <html lang="en" className={`${interTight.variable} ${bricolage.variable}`} style={theme}>
      <body>{children}</body>
    </html>
  );
}
