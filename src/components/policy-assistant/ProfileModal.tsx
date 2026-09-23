import { FormEvent, ReactNode } from "react";
import { AuthUser, TEXT_SIZE_OPTIONS, TextSize } from "./types";

interface ProfileModalProps {
  authUser: AuthUser | null;
  isOpen: boolean;
  profileDraftFirst: string;
  profileDraftLast: string;
  profileDraftDistrict: string;
  profileDraftRole: string;
  profileDraftContext: string;
  profileStatus: string;
  profileError: string;
  isSavingProfile: boolean;
  passwordCurrent: string;
  passwordNew: string;
  passwordConfirm: string;
  passwordStatus: string;
  passwordError: string;
  isChangingPassword: boolean;
  sessionsStatus: string;
  deletePassword: string;
  deleteConfirmText: string;
  deleteError: string;
  isDeletingAccount: boolean;
  highContrast: boolean;
  textSize: TextSize;
  reducedMotion: boolean;
  onClose: () => void;
  onProfileDraftFirstChange: (val: string) => void;
  onProfileDraftLastChange: (val: string) => void;
  onProfileDraftDistrictChange: (val: string) => void;
  onProfileDraftRoleChange: (val: string) => void;
  onProfileDraftContextChange: (val: string) => void;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void;
  onPasswordCurrentChange: (val: string) => void;
  onPasswordNewChange: (val: string) => void;
  onPasswordConfirmChange: (val: string) => void;
  onChangePassword: (event: FormEvent<HTMLFormElement>) => void;
  onSignOutEverywhere: () => void;
  onDeletePasswordChange: (val: string) => void;
  onDeleteConfirmTextChange: (val: string) => void;
  onDeleteAccount: (event: FormEvent<HTMLFormElement>) => void;
  onToggleHighContrast: () => void;
  onTextSizeChange: (size: TextSize) => void;
  onToggleReducedMotion: () => void;
  onLogout: () => void;
}

export function ProfileModal({
  authUser,
  isOpen,
  profileDraftFirst,
  profileDraftLast,
  profileDraftDistrict,
  profileDraftRole,
  profileDraftContext,
  profileStatus,
  profileError,
  isSavingProfile,
  passwordCurrent,
  passwordNew,
  passwordConfirm,
  passwordStatus,
  passwordError,
  isChangingPassword,
  sessionsStatus,
  deletePassword,
  deleteConfirmText,
  deleteError,
  isDeletingAccount,
  highContrast,
  textSize,
  reducedMotion,
  onClose,
  onProfileDraftFirstChange,
  onProfileDraftLastChange,
  onProfileDraftDistrictChange,
  onProfileDraftRoleChange,
  onProfileDraftContextChange,
  onSaveProfile,
  onPasswordCurrentChange,
  onPasswordNewChange,
  onPasswordConfirmChange,
  onChangePassword,
  onSignOutEverywhere,
  onDeletePasswordChange,
  onDeleteConfirmTextChange,
  onDeleteAccount,
  onToggleHighContrast,
  onTextSizeChange,
  onToggleReducedMotion,
  onLogout,
}: ProfileModalProps): ReactNode {
  if (!isOpen || !authUser) {
    return null;
  }

  return (
    <div className="piq-modal-overlay" aria-modal="true" role="dialog">
      <div className="piq-modal-card">
        <div className="piq-modal-header">
          <h2>Account Settings & Profile</h2>
          <button
            type="button"
            className="piq-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="piq-modal-body">
          {/* Profile Details Form */}
          <form className="piq-form" onSubmit={onSaveProfile}>
            <h3>Administrator Profile</h3>
            {profileStatus && <div className="piq-banner piq-banner-success">{profileStatus}</div>}
            {profileError && <div className="piq-banner piq-banner-error">{profileError}</div>}

            <div className="piq-form-row">
              <div className="piq-form-group">
                <label className="piq-label">First Name</label>
                <input
                  type="text"
                  className="piq-input"
                  value={profileDraftFirst}
                  onChange={(e) => onProfileDraftFirstChange(e.target.value)}
                />
              </div>
              <div className="piq-form-group">
                <label className="piq-label">Last Name</label>
                <input
                  type="text"
                  className="piq-input"
                  value={profileDraftLast}
                  onChange={(e) => onProfileDraftLastChange(e.target.value)}
                />
              </div>
            </div>

            <div className="piq-form-group">
              <label className="piq-label">District Name</label>
              <input
                type="text"
                className="piq-input"
                value={profileDraftDistrict}
                onChange={(e) => onProfileDraftDistrictChange(e.target.value)}
              />
            </div>

            <div className="piq-form-group">
              <label className="piq-label">Role Title (Optional)</label>
              <input
                type="text"
                className="piq-input"
                placeholder="e.g. High School Assistant Principal"
                value={profileDraftRole}
                onChange={(e) => onProfileDraftRoleChange(e.target.value)}
              />
            </div>

            <div className="piq-form-group">
              <label className="piq-label">Profile Context (Optional)</label>
              <textarea
                className="piq-input"
                rows={2}
                placeholder="Background details to tailor guidance..."
                value={profileDraftContext}
                onChange={(e) => onProfileDraftContextChange(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="piq-btn piq-btn-accent"
              disabled={isSavingProfile}
            >
              {isSavingProfile ? "Saving..." : "Save Profile"}
            </button>
          </form>

          <hr className="piq-divider" />

          {/* Password Change */}
          <form className="piq-form" onSubmit={onChangePassword}>
            <h3>Security & Password</h3>
            {passwordStatus && <div className="piq-banner piq-banner-success">{passwordStatus}</div>}
            {passwordError && <div className="piq-banner piq-banner-error">{passwordError}</div>}

            <div className="piq-form-group">
              <label className="piq-label">Current Password</label>
              <input
                type="password"
                className="piq-input"
                value={passwordCurrent}
                onChange={(e) => onPasswordCurrentChange(e.target.value)}
              />
            </div>

            <div className="piq-form-row">
              <div className="piq-form-group">
                <label className="piq-label">New Password</label>
                <input
                  type="password"
                  className="piq-input"
                  minLength={8}
                  value={passwordNew}
                  onChange={(e) => onPasswordNewChange(e.target.value)}
                />
              </div>
              <div className="piq-form-group">
                <label className="piq-label">Confirm New Password</label>
                <input
                  type="password"
                  className="piq-input"
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(e) => onPasswordConfirmChange(e.target.value)}
                />
              </div>
            </div>

            <div className="piq-btn-row">
              <button
                type="submit"
                className="piq-btn piq-btn-accent"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Updating..." : "Update Password"}
              </button>

              <button
                type="button"
                className="piq-btn piq-btn-ghost"
                onClick={onSignOutEverywhere}
              >
                Sign out everywhere
              </button>
            </div>
            {sessionsStatus && <p className="piq-hint">{sessionsStatus}</p>}
          </form>

          <hr className="piq-divider" />

          {/* Accessibility Controls */}
          <div className="piq-settings-section">
            <h3>Accessibility Controls</h3>
            <div className="piq-settings-options">
              <label className="piq-checkbox-label">
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={onToggleHighContrast}
                />
                High Contrast Mode
              </label>

              <label className="piq-checkbox-label">
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={onToggleReducedMotion}
                />
                Reduced Motion
              </label>

              <div className="piq-form-group" style={{ marginTop: "8px" }}>
                <label className="piq-label">Text Size</label>
                <div className="piq-btn-group">
                  {TEXT_SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      className={`piq-btn piq-btn-sm ${textSize === opt.key ? "piq-btn-accent" : "piq-btn-ghost"}`}
                      onClick={() => onTextSizeChange(opt.key)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <hr className="piq-divider" />

          {/* Sign Out Button */}
          <div className="piq-modal-footer-actions">
            <button
              type="button"
              className="piq-btn piq-btn-danger"
              onClick={onLogout}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
