import { FormEvent, ReactNode } from "react";
import { AuthMode } from "./types";
import { authButtonLabel, authTitleForMode } from "./helpers";

interface AuthViewProps {
  authMode: AuthMode;
  authEmail: string;
  authPassword: string;
  authDistrictName: string;
  authFirstName: string;
  authLastName: string;
  authError: string;
  authInfo: string;
  isAuthenticating: boolean;
  isResendingVerification: boolean;
  resetToken: string;
  onAuthEmailChange: (val: string) => void;
  onAuthPasswordChange: (val: string) => void;
  onAuthDistrictNameChange: (val: string) => void;
  onAuthFirstNameChange: (val: string) => void;
  onAuthLastNameChange: (val: string) => void;
  onAuthModeChange: (mode: AuthMode) => void;
  onAuthSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onResendVerification: () => void;
}

export function AuthView({
  authMode,
  authEmail,
  authPassword,
  authDistrictName,
  authFirstName,
  authLastName,
  authError,
  authInfo,
  isAuthenticating,
  isResendingVerification,
  resetToken,
  onAuthEmailChange,
  onAuthPasswordChange,
  onAuthDistrictNameChange,
  onAuthFirstNameChange,
  onAuthLastNameChange,
  onAuthModeChange,
  onAuthSubmit,
  onResendVerification,
}: AuthViewProps): ReactNode {
  return (
    <div className="piq-auth-page" aria-label="Sign In or Create Workspace">
      {/* Left Branding Panel */}
      <div className="piq-auth-brand-panel">
        <div className="piq-brand-header">
          <span className="piq-logo-mark">P</span>
          <span className="piq-brand-name">PolicyIQ</span>
        </div>

        <div className="piq-brand-hero">
          <h1>Every answer, grounded in your district&apos;s own policies.</h1>
          <p>
            Decision support for school administrators: describe any scenario in plain language and receive citation-backed action steps.
          </p>
        </div>

        <div className="piq-brand-footer">
          <span>Private to your district · Sources cited on every answer</span>
        </div>
      </div>

      {/* Right Form Card */}
      <div className="piq-auth-form-panel">
        <div className="piq-auth-card">
          <h2>{authTitleForMode(authMode)}</h2>

          {authInfo && <div className="piq-banner piq-banner-info">{authInfo}</div>}
          {authError && <div className="piq-banner piq-banner-error">{authError}</div>}

          <form className="piq-form" onSubmit={onAuthSubmit}>
            {authMode === "signup" && (
              <>
                <div className="piq-form-row">
                  <div className="piq-form-group">
                    <label htmlFor="first-name" className="piq-label">
                      First Name
                    </label>
                    <input
                      id="first-name"
                      type="text"
                      className="piq-input"
                      required
                      value={authFirstName}
                      onChange={(e) => onAuthFirstNameChange(e.target.value)}
                    />
                  </div>
                  <div className="piq-form-group">
                    <label htmlFor="last-name" className="piq-label">
                      Last Name
                    </label>
                    <input
                      id="last-name"
                      type="text"
                      className="piq-input"
                      required
                      value={authLastName}
                      onChange={(e) => onAuthLastNameChange(e.target.value)}
                    />
                  </div>
                </div>

                <div className="piq-form-group">
                  <label htmlFor="district-name" className="piq-label">
                    District Name
                  </label>
                  <input
                    id="district-name"
                    type="text"
                    className="piq-input"
                    placeholder="e.g. Bloomington Community Schools"
                    required
                    value={authDistrictName}
                    onChange={(e) => onAuthDistrictNameChange(e.target.value)}
                  />
                </div>
              </>
            )}

            {authMode !== "reset" && (
              <div className="piq-form-group">
                <label htmlFor="auth-email" className="piq-label">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  className="piq-input"
                  required
                  value={authEmail}
                  onChange={(e) => onAuthEmailChange(e.target.value)}
                />
              </div>
            )}

            {(authMode === "login" || authMode === "signup" || authMode === "reset") && (
              <div className="piq-form-group">
                <label htmlFor="auth-password" className="piq-label">
                  {authMode === "reset" ? "New Password" : "Password"}
                </label>
                <input
                  id="auth-password"
                  type="password"
                  className="piq-input"
                  required
                  minLength={8}
                  value={authPassword}
                  onChange={(e) => onAuthPasswordChange(e.target.value)}
                />
              </div>
            )}

            <button
              type="submit"
              className="piq-btn piq-btn-accent piq-btn-full"
              disabled={isAuthenticating}
              style={{ marginTop: "16px" }}
            >
              {isAuthenticating ? "Please wait..." : authButtonLabel(authMode)}
            </button>
          </form>

          {/* Footer Auth Switcher */}
          <div className="piq-auth-links">
            {authMode === "login" && (
              <>
                <button
                  type="button"
                  className="piq-link-btn"
                  onClick={() => onAuthModeChange("forgot")}
                >
                  Forgot password?
                </button>
                <span>·</span>
                <button
                  type="button"
                  className="piq-link-btn"
                  onClick={() => onAuthModeChange("signup")}
                >
                  Create workspace
                </button>
              </>
            )}

            {authMode === "signup" && (
              <button
                type="button"
                className="piq-link-btn"
                onClick={() => onAuthModeChange("login")}
              >
                Already have an account? Sign in
              </button>
            )}

            {(authMode === "forgot" || authMode === "reset") && (
              <button
                type="button"
                className="piq-link-btn"
                onClick={() => onAuthModeChange("login")}
              >
                Back to Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
