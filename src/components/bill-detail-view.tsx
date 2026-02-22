"use client";

import { useEffect, useMemo, useState } from "react";

import { formatDate } from "@/lib/format";
import type { ApiBillActionItem, ApiBillVersionSummary, BillComparison } from "@/lib/types";

interface BillDetailViewProps {
  year: string;
  billName: string;
  versions: ApiBillVersionSummary[];
  actions: ApiBillActionItem[];
}

function versionName(version: ApiBillVersionSummary): string {
  return version.printVersionName ?? "UNKNOWN";
}

function latestFirstActions(actions: ApiBillActionItem[]): ApiBillActionItem[] {
  return [...actions].sort((left, right) => {
    const leftDate = Date.parse(left.date ?? "");
    const rightDate = Date.parse(right.date ?? "");

    if (Number.isNaN(leftDate) || Number.isNaN(rightDate)) {
      return 0;
    }

    return rightDate - leftDate;
  });
}

export function BillDetailView({ year, billName, versions, actions }: BillDetailViewProps) {
  const orderedVersions = useMemo(
    () =>
      [...versions].sort((left, right) => {
        const leftDate = Date.parse(left.updated ?? left.printed ?? left.created ?? left.filed ?? "");
        const rightDate = Date.parse(right.updated ?? right.printed ?? right.created ?? right.filed ?? "");

        if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
          return leftDate - rightDate;
        }

        return versionName(left).localeCompare(versionName(right));
      }),
    [versions],
  );

  const fromDefault = orderedVersions.length > 0 ? versionName(orderedVersions[0]) : "";
  const toDefault = orderedVersions.length > 1 ? versionName(orderedVersions[orderedVersions.length - 1]) : "";

  const [fromVersion, setFromVersion] = useState(fromDefault);
  const [toVersion, setToVersion] = useState(toDefault);
  const [comparison, setComparison] = useState<BillComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    setFromVersion(fromDefault);
    setToVersion(toDefault);
  }, [fromDefault, toDefault]);

  useEffect(() => {
    if (!fromVersion || !toVersion || fromVersion === toVersion) {
      setComparison(null);
      return;
    }

    const controller = new AbortController();

    async function runComparison() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/bills/${billName}/compare?year=${year}&from=${encodeURIComponent(fromVersion)}&to=${encodeURIComponent(toVersion)}`,
          { signal: controller.signal },
        );

        const data = (await response.json()) as BillComparison & { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to compare versions");
        }

        setComparison(data);
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : "Comparison failed");
          setComparison(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void runComparison();

    return () => controller.abort();
  }, [billName, fromVersion, reloadNonce, toVersion, year]);

  const timeline = useMemo(() => latestFirstActions(actions).slice(0, 60), [actions]);

  return (
    <div className="detail-grid">
      <section className="panel compare-panel">
        <h2 className="section-title">Version Comparison</h2>
        <p className="small-muted" style={{ marginTop: "0.35rem" }}>
          Compare original and revised bill wording across session versions.
        </p>

        <div className="compare-controls">
          <select value={fromVersion} onChange={(event) => setFromVersion(event.target.value)}>
            {orderedVersions.map((version) => {
              const name = versionName(version);
              return (
                <option value={name} key={`from-${name}`}>
                  From: {name}
                </option>
              );
            })}
          </select>

          <select value={toVersion} onChange={(event) => setToVersion(event.target.value)}>
            {orderedVersions.map((version) => {
              const name = versionName(version);
              return (
                <option value={name} key={`to-${name}`}>
                  To: {name}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            onClick={() => setReloadNonce((value) => value + 1)}
            disabled={loading || fromVersion === toVersion}
          >
            {loading ? "Analyzing..." : "Analyze changes"}
          </button>
        </div>

        {error ? (
          <div className="panel" style={{ padding: "0.75rem", marginBottom: "0.75rem", color: "#8a1f12" }}>
            {error}
          </div>
        ) : null}

        {comparison ? (
          <>
            <div className="compare-stats">
              <div className="stat-box">
                <strong>+{comparison.stats.addedLines}</strong>
                <span className="small-muted">Added lines</span>
              </div>
              <div className="stat-box">
                <strong>-{comparison.stats.removedLines}</strong>
                <span className="small-muted">Removed lines</span>
              </div>
              <div className="stat-box">
                <strong>{Math.round(comparison.stats.changeRatio * 100)}%</strong>
                <span className="small-muted">Changed content</span>
              </div>
            </div>

            <h3 style={{ marginBottom: "0.4rem" }}>What Changed</h3>
            <ul className="summary-list">
              {comparison.summary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 style={{ marginTop: "1rem", marginBottom: "0.4rem" }}>Key Wording Revisions</h3>
            <ul className="highlights">
              {comparison.highlights.slice(0, 6).map((highlight, index) => (
                <li key={`${index}-${highlight.before.slice(0, 20)}`} style={{ marginBottom: "0.45rem" }}>
                  <div>
                    <strong>Before:</strong> {highlight.before}
                  </div>
                  <div>
                    <strong>After:</strong> {highlight.after}
                  </div>
                </li>
              ))}
            </ul>

            <div className="compare-text" style={{ marginTop: "1rem" }}>
              <div className="text-pane">
                <h4>Original wording ({comparison.fromVersion})</h4>
                <pre>{comparison.originalText}</pre>
              </div>

              <div className="text-pane">
                <h4>Updated wording ({comparison.toVersion})</h4>
                <pre>{comparison.updatedText}</pre>
              </div>
            </div>
          </>
        ) : (
          <div className="small-muted" style={{ marginTop: "0.7rem" }}>
            {fromVersion && toVersion
              ? fromVersion === toVersion
                ? "Select two different versions to compare wording changes."
                : "Loading comparison..."
              : "Not enough versions are available yet for this bill."}
          </div>
        )}
      </section>

      <section className="panel timeline-panel">
        <h2 className="section-title">Session Timeline</h2>
        <p className="small-muted" style={{ marginTop: "0.35rem", marginBottom: "0.8rem" }}>
          Most recent actions and chamber movement for {billName}.
        </p>

        {timeline.length === 0 ? (
          <p className="small-muted">No timeline actions available yet.</p>
        ) : (
          <div>
            {timeline.map((action, index) => (
              <article className="timeline-item" key={`${action.link ?? action.description ?? "action"}-${index}`}>
                <div style={{ fontWeight: 600 }}>{action.description ?? "Action"}</div>
                <div className="small-muted" style={{ marginTop: "0.25rem" }}>
                  {formatDate(action.date)}
                  {action.chamber?.name ? ` | ${action.chamber.name}` : ""}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
