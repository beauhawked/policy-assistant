import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import { PwaRegister } from "@/components/pwa-register";

import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: ["400", "500", "600"],
});

const display = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.POLICY_ASSISTANT_APP_ORIGIN || "https://policytoaction.beauhawked.com",
  ),
  title: "Policy Aligned — Policy-grounded decision support for school districts",
  description:
    "Turn district policy into defensible next steps with structured guidance grounded in your district's own board policies and handbooks.",
  applicationName: "Policy Aligned",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "Policy Aligned",
    title: "Policy Aligned — Policy-grounded decision support for school districts",
    description:
      "Turn district policy into defensible next steps with visible evidence from your district's own policies and handbooks.",
    images: [
      {
        url: "/og-policy-aligned.png",
        width: 1200,
        height: 630,
        alt: "Policy Aligned: Turn district policy into defensible next steps.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Policy Aligned — Policy-grounded decision support",
    description:
      "Turn district policy into defensible next steps with visible evidence from your district's own sources.",
    images: ["/og-policy-aligned.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Policy Aligned",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

// Note: no maximumScale here. Pinch-to-zoom must stay available for
// accessibility and for reading PDFs; the iOS focus-zoom quirk is prevented
// by keeping mobile form controls at a 16px font instead.
export const viewport: Viewport = {
  themeColor: "#0f2c46",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable}`}>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var h=localStorage.getItem('piq-hc');var v=h===null?localStorage.getItem('a11y-contrast')==='high':h==='1';if(v){document.documentElement.dataset.contrast='high';document.documentElement.classList.add('hc');}}catch(e){}",
          }}
        />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
