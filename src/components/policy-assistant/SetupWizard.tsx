import { ReactNode } from "react";
import { AuthUser } from "./types";

interface SetupWizardProps {
  authUser: AuthUser | null;
  setupStep: number;
  onStepChange: (step: number) => void;
  onFinishSetup: () => void;
  onNavigateToAddSource: () => void;
}

export function SetupWizard({
  authUser,
  setupStep,
  onStepChange,
  onFinishSetup,
  onNavigateToAddSource,
}: SetupWizardProps): ReactNode {
  const districtName = authUser?.districtName || "District";

  return (
    <div className="piq-setup-container" aria-label="Workspace First-Run Setup">
      <header className="piq-setup-header">
        <span className="piq-logo-mark">P</span>
        <h2>Set up your workspace</h2>
        <span className="piq-setup-progress">{districtName} · Step {setupStep} of 3</span>
      </header>

      <div className="piq-setup-body">
        {/* Stepper Navigation */}
        <div className="piq-stepper">
          <div className={`piq-step-item${setupStep >= 1 ? " is-active" : ""}`}>
            <span className="piq-step-num">1</span>
            <span>Board Policies</span>
          </div>
          <div className="piq-step-line" />
          <div className={`piq-step-item${setupStep >= 2 ? " is-active" : ""}`}>
            <span className="piq-step-num">2</span>
            <span>Handbooks</span>
          </div>
          <div className="piq-step-line" />
          <div className={`piq-step-item${setupStep >= 3 ? " is-active" : ""}`}>
            <span className="piq-step-num">3</span>
            <span>Try a Scenario</span>
          </div>
        </div>

        {/* Step 1: Board Policies */}
        {setupStep === 1 && (
          <div className="piq-setup-card">
            <h3>Import Board Policies</h3>
            <p>
              Connect your district&apos;s policy website (BoardDocs, Sarasota table index, Accordion PDF) or upload a policy CSV file.
            </p>
            <div className="piq-setup-actions">
              <button
                type="button"
                className="piq-btn piq-btn-accent"
                onClick={onNavigateToAddSource}
              >
                Go to Source Importer ↗
              </button>
              <button
                type="button"
                className="piq-btn piq-btn-ghost"
                onClick={() => onStepChange(2)}
              >
                Next: Handbooks →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Handbooks */}
        {setupStep === 2 && (
          <div className="piq-setup-card">
            <h3>Upload Student & Staff Handbooks</h3>
            <p>
              Add student conduct codes or staff HR handbooks to complement board policies.
            </p>
            <div className="piq-setup-actions">
              <button
                type="button"
                className="piq-btn piq-btn-accent"
                onClick={onNavigateToAddSource}
              >
                Go to Handbook Upload ↗
              </button>
              <button
                type="button"
                className="piq-btn piq-btn-ghost"
                onClick={() => onStepChange(3)}
              >
                Next: Try a scenario →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Try a Scenario */}
        {setupStep === 3 && (
          <div className="piq-setup-card">
            <h3>Ready for your first question!</h3>
            <p>
              Describe a scenario in plain language in the Assistant tab to test your district&apos;s policy grounding.
            </p>
            <div className="piq-setup-actions">
              <button
                type="button"
                className="piq-btn piq-btn-accent"
                onClick={onFinishSetup}
              >
                Open Policy Assistant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
