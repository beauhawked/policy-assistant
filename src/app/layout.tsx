import type { Metadata } from "next";
import { Space_Grotesk, Spectral } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "700"],
});

const serif = Spectral({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "BoardDocs Policy Scraper",
  description:
    "Scrape school district board policies from BoardDocs and export them to CSV with consistent columns.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
