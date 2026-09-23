import { ReactNode } from "react";
import { PinnedAnswer } from "./types";
import { formatShortDate } from "./helpers";

interface PinnedViewProps {
  pinnedAnswers: PinnedAnswer[];
  onSelectConversation: (conversationId: string) => void;
  onUnpinMessage: (messageId: number) => void;
}

export function PinnedView({
  pinnedAnswers,
  onSelectConversation,
  onUnpinMessage,
}: PinnedViewProps): ReactNode {
  return (
    <div className="piq-page-frame" aria-label="Pinned Answers (Living FAQ)">
      <div className="piq-page-header">
        <div>
          <h1 className="piq-page-title">Pinned Answers</h1>
          <p className="piq-page-sub">
            Your district&apos;s living FAQ — answers you&apos;ve saved, with evidence frozen at pin time.
          </p>
        </div>
      </div>

      {pinnedAnswers.length === 0 ? (
        <div className="piq-empty-card">
          <p>No pinned answers yet. Select ☆ Pin under any answer card in Assistant to save it here.</p>
        </div>
      ) : (
        <div className="piq-pinned-grid">
          {pinnedAnswers.map((pin) => (
            <div key={pin.messageId} className="piq-pinned-card">
              <div className="piq-pinned-header">
                <h3 className="piq-pinned-title">{pin.title}</h3>
                <button
                  type="button"
                  className="piq-icon-btn"
                  title="Unpin answer"
                  onClick={() => onUnpinMessage(pin.messageId)}
                >
                  ★
                </button>
              </div>

              <div className="piq-pinned-body">{pin.body}</div>

              <div className="piq-pinned-footer">
                <span>{pin.meta}</span>
                <span className="piq-dot-sep">•</span>
                <span>Pinned {formatShortDate(pin.pinnedAt)}</span>

                {pin.conversationId && (
                  <button
                    type="button"
                    className="piq-text-btn"
                    onClick={() => onSelectConversation(pin.conversationId)}
                    style={{ marginLeft: "auto" }}
                  >
                    Open thread ↗
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
