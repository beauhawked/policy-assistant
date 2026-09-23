import { ReactNode } from "react";
import { DetailView } from "./types";
import { renderRichText } from "./helpers";

interface PolicyDetailViewProps {
  detailView: DetailView | null;
  onBack: () => void;
  onAskAboutPolicy: (code: string, title: string) => void;
  onCopyText: (text: string) => void;
}

export function PolicyDetailView({
  detailView,
  onBack,
  onAskAboutPolicy,
  onCopyText,
}: PolicyDetailViewProps): ReactNode {
  if (!detailView) {
    return (
      <div className="piq-page-frame">
        <button type="button" className="piq-btn piq-btn-ghost" onClick={onBack}>
          ← Back to Library
        </button>
        <p style={{ marginTop: "24px" }}>No policy detail loaded.</p>
      </div>
    );
  }

  return (
    <div className="piq-page-frame" aria-label="Policy Detail Reader">
      <div className="piq-detail-nav">
        <button type="button" className="piq-btn piq-btn-ghost" onClick={onBack}>
          ← Library
        </button>
      </div>

      <div className="piq-detail-header">
        <div className="piq-detail-code">{detailView.code}</div>
        <h1 className="piq-detail-title">{detailView.title}</h1>
      </div>

      {/* Metadata Row */}
      <div className="piq-detail-meta-bar">
        {detailView.metadata.map((field) => (
          <div key={field.label} className="piq-meta-item">
            <span className="piq-meta-label">{field.label}:</span>{" "}
            <span className="piq-meta-val">{field.value}</span>
          </div>
        ))}

        <div className="piq-meta-actions">
          <button
            type="button"
            className="piq-btn piq-btn-ghost piq-btn-sm"
            onClick={() => onCopyText(`${detailView.code} ${detailView.title}\n\n${detailView.bodyText}`)}
          >
            Copy text
          </button>
          <button
            type="button"
            className="piq-btn piq-btn-accent piq-btn-sm"
            onClick={() => onAskAboutPolicy(detailView.code, detailView.title)}
          >
            Ask about this policy ↗
          </button>
        </div>
      </div>

      {/* Policy Wording Body */}
      <article className="piq-detail-body">
        <h2>Policy Wording</h2>
        <div className="piq-prose">{renderRichText(detailView.bodyText)}</div>
      </article>

      {/* Related Cross-references */}
      {detailView.relatedText && (
        <section className="piq-detail-related">
          <h3>Related Cross-References</h3>
          <p>{detailView.relatedText}</p>
        </section>
      )}
    </div>
  );
}
