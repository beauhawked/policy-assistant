import { ReactNode } from "react";
import { AppView, AuthUser, NAV_ITEMS } from "./types";
import { deriveInitials, RailIcon } from "./helpers";

interface IconRailProps {
  view: AppView;
  authUser: AuthUser | null;
  highContrast: boolean;
  onNavigate: (view: AppView) => void;
  onToggleHighContrast: () => void;
  onNewQuestion: () => void;
  onOpenProfile: () => void;
}

export function IconRail({
  view,
  authUser,
  highContrast,
  onNavigate,
  onToggleHighContrast,
  onNewQuestion,
  onOpenProfile,
}: IconRailProps): ReactNode {
  return (
    <aside className="piq-rail" aria-label="Main Navigation">
      <button
        type="button"
        className="piq-rail-brand"
        title="PolicyIQ Home"
        onClick={() => {
          if (view === "assistant") {
            onNewQuestion();
          } else {
            onNavigate("assistant");
          }
        }}
      >
        <span className="piq-logo-mark">P</span>
      </button>

      <nav className="piq-rail-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = view === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`piq-rail-btn${isActive ? " is-active" : ""}`}
              title={item.label}
              aria-label={item.label}
              onClick={() => {
                if (item.key === "assistant" && view === "assistant") {
                  onNewQuestion();
                } else {
                  onNavigate(item.key);
                }
              }}
            >
              <RailIcon paths={item.paths} />
              <span className="piq-rail-tooltip">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="piq-rail-footer">
        <button
          type="button"
          className={`piq-rail-btn${highContrast ? " is-active" : ""}`}
          title={highContrast ? "Disable High Contrast" : "Enable High Contrast"}
          aria-label="High Contrast Mode Toggle"
          onClick={onToggleHighContrast}
        >
          <span style={{ fontSize: "16px" }} aria-hidden="true">
            ◐
          </span>
          <span className="piq-rail-tooltip">
            {highContrast ? "Standard Contrast" : "High Contrast"}
          </span>
        </button>

        {authUser && (
          <button
            type="button"
            className="piq-rail-avatar"
            title={`${authUser.firstName} ${authUser.lastName} (${authUser.districtName}) - Settings`}
            aria-label="Account Settings"
            onClick={onOpenProfile}
          >
            {deriveInitials(authUser.email, authUser.districtName)}
          </button>
        )}
      </div>
    </aside>
  );
}
