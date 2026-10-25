import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const interTight = localFont({ src: "./fonts/inter-tight-latin-wght-normal.woff2", variable: "--font-inter-tight", weight: "100 900", display: "swap" });
const bricolage = localFont({ src: "./fonts/bricolage-grotesque-latin-wght-normal.woff2", variable: "--font-bricolage", weight: "200 800", display: "swap" });

export const metadata: Metadata = {
  title: "Yatri Leads",
  description: "Find people who need a project built, the moment they post.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${interTight.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  );
}
