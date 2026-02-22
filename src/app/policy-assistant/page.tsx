import Link from "next/link";

import { PolicyAssistantApp } from "@/components/policy-assistant-app";

export const dynamic = "force-dynamic";

export default function PolicyAssistantPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>School District Policy Assistant</h1>
        <p>
          Upload a district policy CSV, store the records in the local policy database, and evaluate real-world
          scenarios against those policies using the OpenAI API.
        </p>
        <p className="small-muted">
          Need to generate a CSV first? Open the <Link href="/policies">Policy Scraper</Link>.
        </p>
      </section>

      <PolicyAssistantApp />
    </main>
  );
}
