import Link from "next/link";

import { PolicyAssistantApp } from "@/components/policy-assistant-app";

export const dynamic = "force-dynamic";

export default function PolicyAssistantPage() {
  return (
    <main className="page-shell policy-assistant-shell">
      <section className="hero hero-policy">
        <div className="hero-policy-main">
          <p className="hero-eyebrow">District Decision Intelligence</p>
          <h1>School District Policy Assistant</h1>
          <p>
            Upload a district policy CSV, store the records in your private account workspace, and generate
            policy-grounded guidance for real-world scenarios in minutes.
          </p>
          <p className="small-muted">
            Need to generate a CSV first? Open the <Link href="/policies">Policy Scraper</Link>.
          </p>
        </div>

        <aside className="hero-policy-aside" aria-label="Platform highlights">
          <article className="hero-stat">
            <p className="hero-stat-label">Security</p>
            <p className="hero-stat-value">Email-verified account access</p>
          </article>
          <article className="hero-stat">
            <p className="hero-stat-label">Privacy</p>
            <p className="hero-stat-value">Private datasets and chat history per user</p>
          </article>
          <article className="hero-stat">
            <p className="hero-stat-label">Reliability</p>
            <p className="hero-stat-value">Rate-limited API access and session controls</p>
          </article>
        </aside>
      </section>

      <PolicyAssistantApp />
    </main>
  );
}
