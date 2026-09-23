import { FormEvent, ReactNode } from "react";
import {
  AuthUser,
  PolicyImportPreview,
  PolicyImportSummary,
  PolicyPlatform,
  SOURCE_TABS,
  SourceTab,
} from "./types";
import { FileDropzone } from "./helpers";

interface SourceImporterProps {
  authUser: AuthUser | null;
  sourceTab: SourceTab;
  policyImportUrl: string;
  policyImportPlatform: PolicyPlatform;
  policyImportIncludeAllBooks: boolean;
  policyImportDatasetTitle: string;
  isImportingPolicies: boolean;
  isCommittingPolicyImport: boolean;
  policyImportStatus: string;
  policyImportError: string;
  policyImportPreview: PolicyImportPreview | null;
  policyImportSummary: PolicyImportSummary | null;
  uploadFile: File | null;
  uploadDatasetTitle: string;
  isUploading: boolean;
  uploadStatus: string;
  uploadError: string;
  studentHandbookFile: File | null;
  staffHandbookFile: File | null;
  studentHandbookTitle: string;
  staffHandbookTitle: string;
  isStudentHandbookUploading: boolean;
  isStaffHandbookUploading: boolean;
  studentHandbookStatus: string;
  studentHandbookError: string;
  staffHandbookStatus: string;
  staffHandbookError: string;
  onSourceTabChange: (tab: SourceTab) => void;
  onPolicyImportUrlChange: (val: string) => void;
  onPolicyImportPlatformChange: (platform: PolicyPlatform) => void;
  onPolicyImportIncludeAllBooksChange: (include: boolean) => void;
  onPolicyImportDatasetTitleChange: (val: string) => void;
  onPolicyImportSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPolicyImportCommit: () => void;
  onPolicyImportDiscard: () => void;
  onPolicyPreviewDownload: () => void;
  onUploadFileChange: (file: File | null) => void;
  onUploadDatasetTitleChange: (val: string) => void;
  onUploadSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStudentHandbookFileChange: (file: File | null) => void;
  onStaffHandbookFileChange: (file: File | null) => void;
  onStudentHandbookTitleChange: (val: string) => void;
  onStaffHandbookTitleChange: (val: string) => void;
  onStudentHandbookSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStaffHandbookSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function SourceImporter({
  authUser,
  sourceTab,
  policyImportUrl,
  policyImportPlatform,
  policyImportIncludeAllBooks,
  policyImportDatasetTitle,
  isImportingPolicies,
  isCommittingPolicyImport,
  policyImportStatus,
  policyImportError,
  policyImportPreview,
  policyImportSummary,
  uploadFile,
  uploadDatasetTitle,
  isUploading,
  uploadStatus,
  uploadError,
  studentHandbookFile,
  staffHandbookFile,
  studentHandbookTitle,
  staffHandbookTitle,
  isStudentHandbookUploading,
  isStaffHandbookUploading,
  studentHandbookStatus,
  studentHandbookError,
  staffHandbookStatus,
  staffHandbookError,
  onSourceTabChange,
  onPolicyImportUrlChange,
  onPolicyImportPlatformChange,
  onPolicyImportIncludeAllBooksChange,
  onPolicyImportDatasetTitleChange,
  onPolicyImportSubmit,
  onPolicyImportCommit,
  onPolicyImportDiscard,
  onPolicyPreviewDownload,
  onUploadFileChange,
  onUploadDatasetTitleChange,
  onUploadSubmit,
  onStudentHandbookFileChange,
  onStaffHandbookFileChange,
  onStudentHandbookTitleChange,
  onStaffHandbookTitleChange,
  onStudentHandbookSubmit,
  onStaffHandbookSubmit,
}: SourceImporterProps): ReactNode {
  return (
    <div className="piq-page-frame" aria-label="Add Source Data">
      <div className="piq-page-header">
        <div>
          <h1 className="piq-page-title">Add Source</h1>
          <p className="piq-page-sub">
            Import your district&apos;s board policies or upload student and staff handbooks.
          </p>
        </div>
      </div>

      {/* Method Tabs */}
      <div className="piq-source-tabs">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`piq-source-tab${sourceTab === tab.key ? " is-active" : ""}`}
            onClick={() => onSourceTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Web Scraper Import */}
      {sourceTab === "import" && (
        <div className="piq-importer-panel">
          <form className="piq-form" onSubmit={onPolicyImportSubmit}>
            <div className="piq-form-group">
              <label htmlFor="import-url" className="piq-label">
                District Policy URL
              </label>
              <div className="piq-input-row">
                <input
                  id="import-url"
                  type="url"
                  className="piq-input"
                  placeholder="https://go.boarddocs.com/in/blm/Board.nsf/Public"
                  value={policyImportUrl}
                  onChange={(e) => onPolicyImportUrlChange(e.target.value)}
                />
                <button
                  type="submit"
                  className="piq-btn piq-btn-accent"
                  disabled={isImportingPolicies || !policyImportUrl.trim()}
                >
                  {isImportingPolicies ? "Scanning..." : "Scan & Preview"}
                </button>
              </div>
            </div>

            <div className="piq-form-row">
              <div className="piq-form-group">
                <label htmlFor="import-platform" className="piq-label">
                  Platform Detection Mode
                </label>
                <select
                  id="import-platform"
                  className="piq-select"
                  value={policyImportPlatform}
                  onChange={(e) => onPolicyImportPlatformChange(e.target.value as PolicyPlatform)}
                >
                  <option value="auto">Auto-detect platform</option>
                  <option value="boarddocs">BoardDocs</option>
                  <option value="table-link">Table-based policy index</option>
                  <option value="accordion-pdf">Accordion + PDF files</option>
                  <option value="parentsquare">ParentSquare Smart Sites</option>
                </select>
              </div>

              <div className="piq-form-group piq-checkbox-group">
                <label className="piq-checkbox-label">
                  <input
                    type="checkbox"
                    checked={policyImportIncludeAllBooks}
                    onChange={(e) => onPolicyImportIncludeAllBooksChange(e.target.checked)}
                  />
                  Scan all policy books / series
                </label>
              </div>
            </div>
          </form>

          {policyImportStatus && (
            <div className="piq-banner piq-banner-info">{policyImportStatus}</div>
          )}
          {policyImportError && (
            <div className="piq-banner piq-banner-error">{policyImportError}</div>
          )}

          {/* Import Preview Card */}
          {policyImportPreview && (
            <div className="piq-preview-card">
              <div className="piq-preview-header">
                <h3>
                  Preview: {policyImportPreview.policyCount} policies found (
                  {policyImportPreview.platformLabel})
                </h3>
                <div className="piq-preview-actions">
                  <button
                    type="button"
                    className="piq-btn piq-btn-ghost piq-btn-sm"
                    onClick={onPolicyPreviewDownload}
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    className="piq-btn piq-btn-ghost piq-btn-sm"
                    onClick={onPolicyImportDiscard}
                  >
                    Discard
                  </button>
                </div>
              </div>

              <div className="piq-preview-table-container">
                <table className="piq-table piq-table-sm">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>Code</th>
                      <th>Title</th>
                      <th>Wording Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policyImportPreview.sampleRows.slice(0, 5).map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.policySection}</td>
                        <td>
                          <strong>{row.policyCode}</strong>
                        </td>
                        <td>{row.policyTitle}</td>
                        <td>{row.policyWordingPreview}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="piq-preview-footer">
                <input
                  type="text"
                  className="piq-input"
                  placeholder="Optional dataset title override"
                  value={policyImportDatasetTitle}
                  onChange={(e) => onPolicyImportDatasetTitleChange(e.target.value)}
                />
                <button
                  type="button"
                  className="piq-btn piq-btn-accent"
                  disabled={isCommittingPolicyImport}
                  onClick={onPolicyImportCommit}
                >
                  {isCommittingPolicyImport ? "Importing..." : "Import to Library"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Upload CSV */}
      {sourceTab === "csv" && (
        <div className="piq-importer-panel">
          <form className="piq-form" onSubmit={onUploadSubmit}>
            <FileDropzone
              id="csv-file-dropzone"
              title="Upload District Policy CSV"
              hint="Drag & drop CSV file or click to browse"
              accept=".csv"
              glyph="📄"
              file={uploadFile}
              onFile={onUploadFileChange}
            />

            <div className="piq-form-group" style={{ marginTop: "16px" }}>
              <label htmlFor="csv-title" className="piq-label">
                Dataset Title (Optional)
              </label>
              <input
                id="csv-title"
                type="text"
                className="piq-input"
                placeholder="e.g. 2026 Board Policy Manual"
                value={uploadDatasetTitle}
                onChange={(e) => onUploadDatasetTitleChange(e.target.value)}
              />
            </div>

            {uploadStatus && <div className="piq-banner piq-banner-info">{uploadStatus}</div>}
            {uploadError && <div className="piq-banner piq-banner-error">{uploadError}</div>}

            <button
              type="submit"
              className="piq-btn piq-btn-accent"
              disabled={isUploading || !uploadFile}
              style={{ marginTop: "16px" }}
            >
              {isUploading ? "Uploading & Indexing..." : "Upload Policy CSV"}
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: Upload Handbooks */}
      {sourceTab === "handbook" && (
        <div className="piq-importer-panel">
          <div className="piq-handbook-grid">
            {/* Student Handbook Form */}
            <form className="piq-handbook-card" onSubmit={onStudentHandbookSubmit}>
              <h3>Student Handbook</h3>
              <FileDropzone
                id="student-handbook-dropzone"
                title="Student Handbook PDF/TXT/MD"
                hint="Select file"
                accept=".pdf,.txt,.md"
                glyph="📘"
                file={studentHandbookFile}
                onFile={onStudentHandbookFileChange}
              />
              {studentHandbookStatus && (
                <div className="piq-banner piq-banner-info">{studentHandbookStatus}</div>
              )}
              {studentHandbookError && (
                <div className="piq-banner piq-banner-error">{studentHandbookError}</div>
              )}
              <button
                type="submit"
                className="piq-btn piq-btn-accent piq-btn-full"
                disabled={isStudentHandbookUploading || !studentHandbookFile}
                style={{ marginTop: "12px" }}
              >
                {isStudentHandbookUploading ? "Indexing..." : "Upload Student Handbook"}
              </button>
            </form>

            {/* Staff Handbook Form */}
            <form className="piq-handbook-card" onSubmit={onStaffHandbookSubmit}>
              <h3>Staff Handbook</h3>
              <FileDropzone
                id="staff-handbook-dropzone"
                title="Staff Handbook PDF/TXT/MD"
                hint="Select file"
                accept=".pdf,.txt,.md"
                glyph="📕"
                file={staffHandbookFile}
                onFile={onStaffHandbookFileChange}
              />
              {staffHandbookStatus && (
                <div className="piq-banner piq-banner-info">{staffHandbookStatus}</div>
              )}
              {staffHandbookError && (
                <div className="piq-banner piq-banner-error">{staffHandbookError}</div>
              )}
              <button
                type="submit"
                className="piq-btn piq-btn-accent piq-btn-full"
                disabled={isStaffHandbookUploading || !staffHandbookFile}
                style={{ marginTop: "12px" }}
              >
                {isStaffHandbookUploading ? "Indexing..." : "Upload Staff Handbook"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
