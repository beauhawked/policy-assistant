import Link from "next/link";

import { BillDetailView } from "@/components/bill-detail-view";
import { DEFAULT_YEAR, getBillRecord, orderedVersions } from "@/lib/bill-service";
import { formatDate } from "@/lib/format";

interface BillDetailPageContentProps {
  billName: string;
}

export async function BillDetailPageContent({ billName }: BillDetailPageContentProps) {
  const normalizedBillName = billName.trim().toUpperCase();

  if (!normalizedBillName) {
    return (
      <main className="page-shell">
        <section className="panel" style={{ padding: "1rem" }}>
          <h1 className="section-title">Bill Not Specified</h1>
          <p style={{ marginTop: "0.5rem" }}>
            Open a bill from the tracker home page to view version comparisons and timeline updates.
          </p>
          <Link
            className="action-button"
            style={{
              display: "inline-block",
              marginTop: "0.8rem",
              padding: "0.55rem 0.75rem",
              borderRadius: "10px",
            }}
            href="/"
          >
            Back to bill list
          </Link>
        </section>
      </main>
    );
  }

  const record = await getBillRecord(normalizedBillName, DEFAULT_YEAR, true);

  if (!record) {
    return (
      <main className="page-shell">
        <section className="panel" style={{ padding: "1rem" }}>
          <h1 className="section-title">Bill Not Available</h1>
          <p style={{ marginTop: "0.5rem" }}>
            The bill <strong>{normalizedBillName}</strong> could not be loaded from cache or the API.
          </p>
          <p className="small-muted" style={{ marginTop: "0.5rem" }}>
            Run a fresh sync to pull the latest 2026 records from Indiana General Assembly.
          </p>
          <Link
            className="action-button"
            style={{
              display: "inline-block",
              marginTop: "0.8rem",
              padding: "0.55rem 0.75rem",
              borderRadius: "10px",
            }}
            href="/"
          >
            Back to bill list
          </Link>
        </section>
      </main>
    );
  }

  const detail = record.detail;
  const versions = orderedVersions(record);
  const latestVersion = detail.latestVersion;

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>{detail.billName}</h1>
        <p style={{ marginTop: "0.55rem" }}>{detail.title ?? detail.description ?? "Bill details"}</p>
        <div className="badge-row" style={{ marginTop: "0.8rem" }}>
          <span className="badge accent">{detail.type ?? "Unknown type"}</span>
          <span className="badge">{detail.stage ?? latestVersion?.stageVerbose ?? "Stage unavailable"}</span>
          <span className="badge">{detail.status ?? detail.committeeStatus ?? "Status unavailable"}</span>
          <span className="badge">
            {typeof detail.originChamber === "string" ? detail.originChamber : detail.originChamber?.name ?? "Unknown chamber"}
          </span>
          <span className="badge">
            Current: {typeof detail.currentChamber === "string" ? detail.currentChamber : detail.currentChamber?.name ?? "Unknown"}
          </span>
        </div>
        <p className="small-muted" style={{ marginTop: "0.65rem" }}>
          Last fetched: {formatDate(record.fetchedAt)} | Versions tracked: {versions.length}
        </p>
        <p className="small-muted" style={{ marginTop: "0.4rem" }}>
          <Link href="/">Back to all bills</Link>
        </p>
      </section>

      <BillDetailView year={DEFAULT_YEAR} billName={detail.billName} versions={versions} actions={record.actions} />
    </main>
  );
}
