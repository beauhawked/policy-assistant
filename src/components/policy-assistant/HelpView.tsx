import { ReactNode, useState } from "react";
import { FAQ_ITEMS, HELP_DOWNLOADS, HELP_TABS, HelpTab } from "./types";

interface HelpViewProps {
  helpTab: HelpTab;
  onHelpTabChange: (tab: HelpTab) => void;
}

export function HelpView({ helpTab, onHelpTabChange }: HelpViewProps): ReactNode {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <div className="piq-page-frame" aria-label="Help and Documentation">
      <div className="piq-page-header">
        <div>
          <h1 className="piq-page-title">Help & Documentation</h1>
          <p className="piq-page-sub">
            Guides, Frequently Asked Questions, and privacy compliance details.
          </p>
        </div>
      </div>

      {/* Help Tabs */}
      <div className="piq-source-tabs">
        {HELP_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`piq-source-tab${helpTab === tab.key ? " is-active" : ""}`}
            onClick={() => onHelpTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Getting Started */}
      {helpTab === "start" && (
        <div className="piq-importer-panel">
          <h3>Documentation & User Guides</h3>
          <p>Download official onboarding documentation and blueprints for your district team.</p>

          <div className="piq-help-downloads-grid">
            {HELP_DOWNLOADS.map((doc) => (
              <a
                key={doc.file}
                href={doc.file}
                target="_blank"
                rel="noreferrer"
                className="piq-help-download-card"
              >
                <span className="piq-doc-icon">📄</span>
                <span className="piq-doc-label">{doc.label}</span>
                <span className="piq-doc-arrow">↓</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: FAQ */}
      {helpTab === "faq" && (
        <div className="piq-importer-panel">
          <h3>Frequently Asked Questions</h3>

          <div className="piq-faq-accordion">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className={`piq-faq-item${isOpen ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="piq-faq-question"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  >
                    <span>{item.q}</span>
                    <span className="piq-faq-arrow">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && <div className="piq-faq-answer">{item.a}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Trust & Privacy */}
      {helpTab === "trust" && (
        <div className="piq-importer-panel">
          <h3>Trust & Privacy Commitments</h3>

          <div className="piq-prose" style={{ marginTop: "16px" }}>
            <h4>Data Ownership & Privacy</h4>
            <p>
              Your district&apos;s policy datasets and uploaded handbooks are strictly private to your account.
              They are never shared across districts or used to train third-party public models.
            </p>

            <h4>OpenAI Data Processing Agreement (DPA)</h4>
            <p>
              An executed OpenAI Zero-Data-Retention DPA is archived in compliance documentation. Model calls
              are logged exclusively to an append-only audit log in your private PostgreSQL database for administrator review.
            </p>

            <h4>Zero Training Policy</h4>
            <p>
              Neither OpenAI nor PolicyIQ trains AI models on scenario text or policy data submitted through this platform.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
