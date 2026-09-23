import { KeyboardEvent, RefObject, ReactNode } from "react";
import {
  AppView,
  AuthUser,
  ChatMessage,
  ConversationSummary,
  EvidenceItem,
  HandbookDocument,
  PinnedAnswer,
  PolicyDataset,
  ReferenceCard,
  ReferenceLookup,
  STARTER_PROMPTS,
} from "./types";
import {
  buildEvidenceChips,
  expandChatMessage,
  formatLongDate,
  parseNumberedSteps,
  renderRichText,
  totalPolicyCount,
} from "./helpers";

interface ChatPanelProps {
  authUser: AuthUser | null;
  selectedDataset: PolicyDataset | null;
  datasets: PolicyDataset[];
  activeStudentHandbookDocuments: HandbookDocument[];
  activeStaffHandbookDocuments: HandbookDocument[];
  scenario: string;
  messages: ChatMessage[];
  isSending: boolean;
  isOffline: boolean;
  chatError: string;
  selectedConversation: ConversationSummary | null;
  copiedMessageId: string;
  pinnedAnswers: PinnedAnswer[];
  showScrollToLatest: boolean;
  onScenarioChange: (val: string) => void;
  onSendScenario: (promptText?: string) => void;
  onOpenEvidence: (item: EvidenceItem) => void;
  onOpenReferenceDetail: (lookup: ReferenceLookup) => void;
  onPinMessage: (messageId: number) => void;
  onCopyMessage: (id: string, text: string) => void;
  onNavigate: (view: AppView) => void;
  onScrollToBottom: () => void;
  messageListRef: RefObject<HTMLDivElement | null>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}

export function ChatPanel({
  authUser,
  selectedDataset,
  datasets,
  activeStudentHandbookDocuments,
  activeStaffHandbookDocuments,
  scenario,
  messages,
  isSending,
  isOffline,
  chatError,
  selectedConversation,
  copiedMessageId,
  pinnedAnswers,
  showScrollToLatest,
  onScenarioChange,
  onSendScenario,
  onOpenEvidence,
  onOpenReferenceDetail,
  onPinMessage,
  onCopyMessage,
  onNavigate,
  onScrollToBottom,
  messageListRef,
  composerRef,
}: ChatPanelProps): ReactNode {
  const activePolicyCount = totalPolicyCount(datasets);
  const studentCount = activeStudentHandbookDocuments.length;
  const staffCount = activeStaffHandbookDocuments.length;
  const totalHandbookCount = studentCount + staffCount;

  const districtName = authUser?.districtName || selectedDataset?.districtName || "District";
  const userFirstName = authUser?.firstName || "Administrator";

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (scenario.trim() && !isSending) {
        onSendScenario();
      }
    }
  };

  return (
    <main className="piq-chat-column" aria-label="Policy Assistant Conversation">
      {/* Header bar */}
      <header className="piq-chat-header">
        <div className="piq-header-title">
          <h1>{selectedConversation?.title || "Policy Assistant"}</h1>
        </div>

        <div className="piq-header-right">
          <button
            type="button"
            className="piq-sources-pill"
            onClick={() => onNavigate("library")}
            title="Manage Library sources"
          >
            <span className="piq-status-dot" aria-hidden="true" />
            <span>
              {activePolicyCount} policies
              {totalHandbookCount > 0 ? ` · ${totalHandbookCount} handbooks` : ""}{" "}
              · {districtName}
            </span>
          </button>
        </div>
      </header>

      {/* Offline Warning Banner */}
      {isOffline && (
        <div className="piq-offline-banner" role="alert">
          ⚠ You&apos;re offline — you can read saved conversations, but new questions need a connection.
        </div>
      )}

      {/* Message List */}
      <div className="piq-message-list" ref={messageListRef}>
        {messages.length === 0 ? (
          <div className="piq-empty-state">
            <h2 className="piq-empty-title">How can I help, {userFirstName}?</h2>
            <p className="piq-empty-sub">
              Answers grounded in {districtName}&apos;s {activePolicyCount} policies
              {totalHandbookCount > 0
                ? ` and ${totalHandbookCount} handbook${totalHandbookCount === 1 ? "" : "s"}`
                : ""}
              …
            </p>

            <div className="piq-starter-prompts">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="piq-starter-btn"
                  onClick={() => onSendScenario(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => {
            const bubbles = expandChatMessage(message, selectedDataset?.id || "");
            const numericStoredId = message.storedId;
            const isPinned =
              numericStoredId !== undefined &&
              pinnedAnswers.some((p) => p.messageId === numericStoredId);

            return (
              <div key={message.id} className="piq-message-group">
                {bubbles.map((bubble) => {
                  if (bubble.role === "user") {
                    return (
                      <div key={bubble.id} className="piq-user-bubble">
                        {bubble.content}
                      </div>
                    );
                  }

                  const isActionBlock = bubble.kind === "action";

                  return (
                    <div key={bubble.id} className="piq-assistant-card">
                      {bubble.label && (
                        <div className="piq-card-micro-label">{bubble.label}</div>
                      )}

                      {isActionBlock ? (
                        <div className="piq-action-block">
                          <ol className="piq-action-list">
                            {parseNumberedSteps(bubble.content).map((step, idx) => (
                              <li key={idx}>
                                <span className="piq-step-num">{idx + 1}.</span> {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : (
                        <div className="piq-prose">
                          {renderRichText(bubble.content)}
                        </div>
                      )}

                      {/* Citation Chips */}
                      {buildEvidenceChips(bubble.answerEvidence, message.id, onOpenEvidence)}

                      {/* Card Footer */}
                      <div className="piq-card-footer">
                        <span>Guidance, not legal advice</span>
                        <span className="piq-dot-sep">•</span>
                        <span>
                          Captured{" "}
                          {bubble.answerEvidence?.capturedAt
                            ? formatLongDate(bubble.answerEvidence.capturedAt)
                            : "recently"}
                        </span>

                        {numericStoredId !== undefined && (
                          <>
                            <span className="piq-dot-sep">•</span>
                            <button
                              type="button"
                              className="piq-text-btn"
                              onClick={() => onPinMessage(numericStoredId)}
                            >
                              {isPinned ? "★ Pinned" : "☆ Pin"}
                            </button>
                          </>
                        )}

                        <span className="piq-dot-sep">•</span>
                        <button
                          type="button"
                          className="piq-text-btn"
                          onClick={() => onCopyMessage(message.id, message.content)}
                        >
                          {copiedMessageId === message.id ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}

        {isSending && (
          <div className="piq-assistant-card piq-thinking-card">
            <div className="piq-thinking-indicator">
              <span className="piq-pulse-dot" /> Analyzing policies and handbooks...
            </div>
          </div>
        )}

        {chatError && (
          <div className="piq-chat-error" role="alert">
            {chatError}
          </div>
        )}
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollToLatest && (
        <button
          type="button"
          className="piq-scroll-bottom-btn"
          onClick={onScrollToBottom}
          title="Scroll to latest message"
        >
          ↓ Latest
        </button>
      )}

      {/* Composer Input */}
      <footer className="piq-composer-container">
        <form
          className="piq-composer-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (scenario.trim() && !isSending) {
              onSendScenario();
            }
          }}
        >
          <textarea
            ref={composerRef}
            className="piq-composer-textarea"
            placeholder="Ask a follow-up, or describe a new scenario…"
            rows={2}
            value={scenario}
            onChange={(e) => onScenarioChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="submit"
            className="piq-btn piq-btn-accent piq-send-btn"
            disabled={!scenario.trim() || isSending}
          >
            {isSending ? "Analyzing..." : "Ask"}
          </button>
        </form>

        <p className="piq-composer-disclaimer">
          PolicyIQ can make mistakes — verify critical decisions against the cited source.
        </p>
      </footer>
    </main>
  );
}
