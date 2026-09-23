import { ReactNode } from "react";
import { EvidenceItem, PinnedAnswer, ReferenceLookup } from "./types";

interface EvidenceDrawerProps {
  evidenceOpen: boolean;
  activeEvidence: EvidenceItem | null;
  isEvidenceLoading: boolean;
  pinnedAnswers: PinnedAnswer[];
  onClose: () => void;
  onOpenReferenceDetail: (lookup: ReferenceLookup) => void;
  onPinMessage: (messageId: number) => void;
}

export function EvidenceDrawer({
  evidenceOpen,
  activeEvidence,
  isEvidenceLoading,
  pinnedAnswers,
  onClose,
  onOpenReferenceDetail,
  onPinMessage,
}: EvidenceDrawerProps): ReactNode {
  if (!evidenceOpen || !activeEvidence) {
    return null;
  }

  const messageNumericId = Number.parseInt(activeEvidence.messageId, 10);
  const isPinned =
    !Number.isNaN(messageNumericId) &&
    pinnedAnswers.some((pin) => pin.messageId === messageNumericId);

  return (
    <aside className="piq-evidence-drawer" aria-label="Policy Evidence Panel">
      <div className="piq-evidence-header">
        <div className="piq-evidence-label">EVIDENCE</div>
        <button
          type="button"
          className="piq-evidence-close"
          onClick={onClose}
          aria-label="Close evidence panel"
          title="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="piq-evidence-card">
        <div className="piq-evidence-card-header">
          <div className="piq-evidence-chip-label">{activeEvidence.label}</div>
          <h3 className="piq-evidence-title">{activeEvidence.title}</h3>
        </div>

        {isEvidenceLoading ? (
          <div className="piq-evidence-loading">Loading evidence snippet...</div>
        ) : (
          <blockquote className="piq-evidence-quote">
            &quot;{activeEvidence.quote}&quot;
          </blockquote>
        )}

        <div className="piq-evidence-meta">{activeEvidence.meta}</div>

        <div className="piq-evidence-actions">
          {activeEvidence.lookup && (
            <button
              type="button"
              className="piq-btn piq-btn-ghost piq-btn-full"
              onClick={() => activeEvidence.lookup && onOpenReferenceDetail(activeEvidence.lookup)}
            >
              Open full policy ↗
            </button>
          )}

          {!Number.isNaN(messageNumericId) && (
            <button
              type="button"
              className={`piq-btn ${isPinned ? "piq-btn-secondary" : "piq-btn-ghost"} piq-btn-full`}
              onClick={() => onPinMessage(messageNumericId)}
            >
              {isPinned ? "★ Answer Pinned" : "☆ Pin this answer"}
            </button>
          )}
        </div>

        <p className="piq-evidence-disclaimer">
          Citations are drawn directly from your district&apos;s active policy dataset or uploaded handbooks.
        </p>
      </div>
    </aside>
  );
}
