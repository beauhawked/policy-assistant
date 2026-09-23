import { ReactNode } from "react";
import {
  AppView,
  HandbookDocument,
  LibraryFilter,
  PolicyDataset,
} from "./types";
import {
  formatDatasetSource,
  formatLongDate,
  HealthMark,
} from "./helpers";

interface LibraryViewProps {
  datasets: PolicyDataset[];
  handbookDocuments: HandbookDocument[];
  selectedDatasetId: string;
  librarySearchQuery: string;
  libraryFilter: LibraryFilter;
  showArchived: boolean;
  datasetStatus: string;
  datasetError: string;
  busyDatasetId: string;
  busyHandbookDocumentId: string;
  onSearchQueryChange: (val: string) => void;
  onFilterChange: (filter: LibraryFilter) => void;
  onToggleShowArchived: () => void;
  onSelectDataset: (datasetId: string) => void;
  onDatasetRename: (dataset: PolicyDataset) => void;
  onDatasetArchive: (dataset: PolicyDataset, archive: boolean) => void;
  onDatasetDelete: (dataset: PolicyDataset) => void;
  onHandbookArchive: (document: HandbookDocument, archive: boolean) => void;
  onHandbookDelete: (document: HandbookDocument) => void;
  onNavigate: (view: AppView) => void;
}

export function LibraryView({
  datasets,
  handbookDocuments,
  selectedDatasetId,
  librarySearchQuery,
  libraryFilter,
  showArchived,
  datasetStatus,
  datasetError,
  busyDatasetId,
  busyHandbookDocumentId,
  onSearchQueryChange,
  onFilterChange,
  onToggleShowArchived,
  onSelectDataset,
  onDatasetRename,
  onDatasetArchive,
  onDatasetDelete,
  onHandbookArchive,
  onHandbookDelete,
  onNavigate,
}: LibraryViewProps): ReactNode {
  const activeDatasets = datasets.filter((d) => !d.archivedAt);
  const archivedDatasets = datasets.filter((d) => Boolean(d.archivedAt));

  const activeHandbooks = handbookDocuments.filter((h) => !h.archivedAt);
  const archivedHandbooks = handbookDocuments.filter((h) => Boolean(h.archivedAt));

  const studentHandbooks = activeHandbooks.filter((h) => h.handbookType === "student");
  const staffHandbooks = activeHandbooks.filter((h) => h.handbookType === "staff");

  const isStaffMissing = staffHandbooks.length === 0;

  return (
    <div className="piq-page-frame" aria-label="District Policy Library">
      <div className="piq-page-header">
        <div>
          <h1 className="piq-page-title">Library</h1>
          <p className="piq-page-sub">
            Manage your district&apos;s active policy dataset and handbook documents.
          </p>
        </div>

        <div className="piq-header-actions">
          <input
            type="search"
            className="piq-search-input"
            placeholder="Search policies & handbooks..."
            value={librarySearchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
          <button
            type="button"
            className="piq-btn piq-btn-accent"
            onClick={() => onNavigate("source")}
          >
            ＋ Add source
          </button>
        </div>
      </div>

      {datasetStatus && <div className="piq-banner piq-banner-success">{datasetStatus}</div>}
      {datasetError && <div className="piq-banner piq-banner-error">{datasetError}</div>}

      {/* Filter Tabs */}
      <div className="piq-filter-bar">
        <button
          type="button"
          className={`piq-filter-pill${libraryFilter === "all" ? " is-active" : ""}`}
          onClick={() => onFilterChange("all")}
        >
          All sources ({activeDatasets.length + activeHandbooks.length})
        </button>
        <button
          type="button"
          className={`piq-filter-pill${libraryFilter === "policies" ? " is-active" : ""}`}
          onClick={() => onFilterChange("policies")}
        >
          Policies ({activeDatasets.length})
        </button>
        <button
          type="button"
          className={`piq-filter-pill${libraryFilter === "student" ? " is-active" : ""}`}
          onClick={() => onFilterChange("student")}
        >
          Student Handbooks ({studentHandbooks.length})
        </button>
        <button
          type="button"
          className={`piq-filter-pill${libraryFilter === "staff" ? " is-active" : ""}`}
          onClick={() => onFilterChange("staff")}
        >
          Staff Handbooks ({staffHandbooks.length})
        </button>

        <button
          type="button"
          className={`piq-filter-pill piq-archived-pill${showArchived ? " is-active" : ""}`}
          onClick={onToggleShowArchived}
        >
          Archived ({archivedDatasets.length + archivedHandbooks.length})
        </button>
      </div>

      {/* Missing Source Warning Banner */}
      {isStaffMissing && !showArchived && (
        <div className="piq-callout-card">
          <div className="piq-callout-icon">⚠</div>
          <div className="piq-callout-content">
            <strong>Staff handbook hasn&apos;t been added</strong>
            <p>Staff-leave and HR questions will answer from board policies only.</p>
          </div>
          <button
            type="button"
            className="piq-btn piq-btn-ghost piq-btn-sm"
            onClick={() => onNavigate("source")}
          >
            Add it now
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="piq-table-container">
        <table className="piq-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Count / Chunks</th>
              <th>Health</th>
              <th>Updated</th>
              <th>Source Type</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!showArchived ? (
              <>
                {/* Active Datasets */}
                {(libraryFilter === "all" || libraryFilter === "policies") &&
                  activeDatasets.map((dataset) => {
                    const isSelected = dataset.id === selectedDatasetId;
                    const isBusy = busyDatasetId === dataset.id;

                    return (
                      <tr key={dataset.id} className={isSelected ? "is-selected" : ""}>
                        <td>
                          <div className="piq-table-title-cell">
                            <strong>{dataset.title}</strong>
                            {isSelected && <span className="piq-active-badge">Active</span>}
                          </div>
                        </td>
                        <td>{dataset.policyCount} policies</td>
                        <td>
                          <span className="piq-health-badge">
                            <HealthMark good={true} /> Good
                          </span>
                        </td>
                        <td>{formatLongDate(dataset.uploadedAt)}</td>
                        <td>{formatDatasetSource(dataset)}</td>
                        <td style={{ textAlign: "right" }}>
                          <div className="piq-row-actions">
                            <button
                              type="button"
                              className="piq-icon-btn"
                              title="Rename dataset"
                              disabled={isBusy}
                              onClick={() => onDatasetRename(dataset)}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="piq-icon-btn"
                              title="Archive source"
                              disabled={isBusy}
                              onClick={() => onDatasetArchive(dataset, true)}
                            >
                              ⤵
                            </button>
                            <button
                              type="button"
                              className="piq-icon-btn piq-danger-btn"
                              title="Delete source"
                              disabled={isBusy}
                              onClick={() => onDatasetDelete(dataset)}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                {/* Active Handbooks */}
                {(libraryFilter === "all" ||
                  libraryFilter === "student" ||
                  libraryFilter === "staff") &&
                  activeHandbooks
                    .filter((h) =>
                      libraryFilter === "all" ? true : h.handbookType === libraryFilter,
                    )
                    .map((handbook) => {
                      const isBusy = busyHandbookDocumentId === handbook.id;
                      return (
                        <tr key={handbook.id}>
                          <td>
                            <strong>{handbook.title}</strong>
                          </td>
                          <td>{handbook.chunkCount} section chunks</td>
                          <td>
                            <span className="piq-health-badge">
                              <HealthMark good={true} /> Good
                            </span>
                          </td>
                          <td>{formatLongDate(handbook.uploadedAt)}</td>
                          <td>
                            {handbook.handbookType === "staff"
                              ? "Staff Handbook"
                              : "Student Handbook"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="piq-row-actions">
                              <button
                                type="button"
                                className="piq-icon-btn"
                                title="Archive handbook"
                                disabled={isBusy}
                                onClick={() => onHandbookArchive(handbook, true)}
                              >
                                ⤵
                              </button>
                              <button
                                type="button"
                                className="piq-icon-btn piq-danger-btn"
                                title="Delete handbook"
                                disabled={isBusy}
                                onClick={() => onHandbookDelete(handbook)}
                              >
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </>
            ) : (
              <>
                {/* Archived Datasets */}
                {archivedDatasets.map((dataset) => (
                  <tr key={dataset.id} className="is-archived">
                    <td>
                      <strong>{dataset.title}</strong> (Archived)
                    </td>
                    <td>{dataset.policyCount} policies</td>
                    <td>—</td>
                    <td>{formatLongDate(dataset.uploadedAt)}</td>
                    <td>{formatDatasetSource(dataset)}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="piq-row-actions">
                        <button
                          type="button"
                          className="piq-icon-btn"
                          title="Restore dataset"
                          onClick={() => onDatasetArchive(dataset, false)}
                        >
                          ⤴
                        </button>
                        <button
                          type="button"
                          className="piq-icon-btn piq-danger-btn"
                          title="Delete dataset"
                          onClick={() => onDatasetDelete(dataset)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {/* Archived Handbooks */}
                {archivedHandbooks.map((handbook) => (
                  <tr key={handbook.id} className="is-archived">
                    <td>
                      <strong>{handbook.title}</strong> (Archived)
                    </td>
                    <td>{handbook.chunkCount} section chunks</td>
                    <td>—</td>
                    <td>{formatLongDate(handbook.uploadedAt)}</td>
                    <td>
                      {handbook.handbookType === "staff"
                        ? "Staff Handbook"
                        : "Student Handbook"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="piq-row-actions">
                        <button
                          type="button"
                          className="piq-icon-btn"
                          title="Restore handbook"
                          onClick={() => onHandbookArchive(handbook, false)}
                        >
                          ⤴
                        </button>
                        <button
                          type="button"
                          className="piq-icon-btn piq-danger-btn"
                          title="Delete handbook"
                          onClick={() => onHandbookDelete(handbook)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
