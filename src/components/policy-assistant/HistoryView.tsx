import { ReactNode } from "react";
import { ConversationSummary } from "./types";
import { formatRelativeDate } from "./helpers";

interface HistoryViewProps {
  conversations: ConversationSummary[];
  selectedConversationId: string;
  onSelectConversation: (id: string) => void;
  onNewQuestion: () => void;
}

export function HistoryView({
  conversations,
  selectedConversationId,
  onSelectConversation,
  onNewQuestion,
}: HistoryViewProps): ReactNode {
  return (
    <div className="piq-page-frame" aria-label="Conversation History">
      <div className="piq-page-header">
        <div>
          <h1 className="piq-page-title">History</h1>
          <p className="piq-page-sub">
            Reopen previous scenario guidance sessions.
          </p>
        </div>

        <button
          type="button"
          className="piq-btn piq-btn-accent"
          onClick={onNewQuestion}
        >
          ＋ New Question
        </button>
      </div>

      {conversations.length === 0 ? (
        <div className="piq-empty-card">
          <p>No saved conversations yet. Start a new scenario in Assistant.</p>
        </div>
      ) : (
        <div className="piq-history-list">
          {conversations.map((conv) => {
            const isSelected = conv.id === selectedConversationId;
            return (
              <button
                key={conv.id}
                type="button"
                className={`piq-history-row${isSelected ? " is-active" : ""}`}
                onClick={() => onSelectConversation(conv.id)}
              >
                <div className="piq-history-main">
                  <h3 className="piq-history-title">{conv.title}</h3>
                  <div className="piq-history-meta">
                    {conv.messageCount} message{conv.messageCount === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="piq-history-date">
                  {formatRelativeDate(conv.lastMessageAt || conv.updatedAt)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
