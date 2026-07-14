import Image from "next/image";
import Link from "next/link";

import { PolicyScraperPanel } from "@/components/policy-scraper-panel";

export const dynamic = "force-dynamic";

export default function PolicyScraperPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="scraper-hero-head">
          <div className="scraper-hero-title-group">
            <div className="hero-logo-wrap">
              <Image
                src="/logo.png"
                alt="Policy to Action logo"
                width={1536}
                height={1024}
                className="scraper-hero-logo"
                priority
              />
            </div>
            <h1>Policy Scraper</h1>
          </div>
          <Link href="/policy-assistant" className="action-button nav-action-link hero-nav-button">
            Back to Policy Assistant
          </Link>
        </div>

        <ol className="hero-instructions">
          <li>Navigate to the page housing your school district policies.</li>
          <li>
            Copy the URL for this page and paste it into the box below titled, &quot;District Policy Listing URL&quot;.
          </li>
        </ol>
      </section>
      <PolicyScraperPanel />
    </main>
  );
}
