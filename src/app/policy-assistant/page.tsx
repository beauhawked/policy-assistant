import fs from "node:fs";
import path from "node:path";

import Image from "next/image";
import Link from "next/link";

import { AccessibilityToggle } from "@/components/accessibility-toggle";
import { PolicyAssistantApp } from "@/components/policy-assistant-app";

export const dynamic = "force-dynamic";

export default function PolicyAssistantPage() {
  const logoFilePath = path.join(process.cwd(), "public", "logo-mark.png");
  const hasLogo = fs.existsSync(logoFilePath);

  return (
    <main className="page-shell policy-assistant-shell">
      <header className="app-header">
        <div className="app-header-brand">
          {hasLogo ? (
            <Image
              src="/logo-mark.png"
              alt="Policy to Action"
              className="app-header-logo"
              width={869}
              height={280}
              priority
            />
          ) : (
            <span className="app-header-wordmark">Policy to Action</span>
          )}
        </div>
        <nav className="app-header-nav">
          <AccessibilityToggle />
          <Link href="/policies" className="app-header-link">
            Policy Scraper
          </Link>
        </nav>
      </header>

      <p className="app-tagline">
        Upload your district&rsquo;s policies and handbooks, then ask scenario questions and get guidance
        grounded in them.
      </p>

      <PolicyAssistantApp />
    </main>
  );
}
