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
  title: "School District Policy Assistant",
  description:
    "Upload school district policies from CSV into a database and get AI-guided, policy-grounded decision support.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
