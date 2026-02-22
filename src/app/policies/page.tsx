import { PolicyScraperPanel } from "@/components/policy-scraper-panel";

export const dynamic = "force-dynamic";

export default function PolicyScraperPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>School Board Policy Scraper</h1>
        <p>
          Paste any district BoardDocs URL and generate a CSV with these columns:
          <strong> Section, Code, Adopted Date, Revised Date, Status, Policy Title, Policy Wording.</strong>
        </p>
      </section>
      <PolicyScraperPanel />
    </main>
  );
}
