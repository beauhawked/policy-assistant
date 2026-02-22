import { PolicyScraperPanel } from "@/components/policy-scraper-panel";

export const dynamic = "force-dynamic";

export default function PolicyScraperPage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <h1>School Board Policy Scraper</h1>
        <p>
          Paste a district policy URL, choose a platform (or auto-detect), and generate a CSV export.
          BoardDocs exports:
          <strong> Section, Code, Adopted Date, Revised Date, Status, Policy Title, Policy Wording.</strong>
          Table-based exports:
          <strong>
            {" "}
            Policy Chapter, Policy Number, Policy Title, Policy Wording, Statutory Authority, Law(s) Implemented,
            History, Notes.
          </strong>
        </p>
      </section>
      <PolicyScraperPanel />
    </main>
  );
}
