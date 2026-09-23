"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type UserAccountRole = "member" | "admin";

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  districtName: string;
  createdAt: string;
  emailVerifiedAt: string | null;
  accountRole: UserAccountRole;
  deactivatedAt: string | null;
  conversationCount: number;
  messageCount: number;
  datasetCount: number;
  handbookCount: number;
  lastActiveAt: string | null;
}

interface AdminAuditEvent {
  id: number;
  actorEmail: string;
  action: string;
  targetEmail: string;
  createdAt: string;
}

interface CurrentUser {
  id: string;
  email: string;
  accountRole?: UserAccountRole;
}

type PanelState = "loading" | "unauthorized" | "ready" | "error";

const ACTION_LABELS: Record<string, string> = {
  "admin.user.deactivate": "Deactivated account",
  "admin.user.reactivate": "Reactivated account",
  "admin.user.verify-email": "Marked email verified",
  "admin.user.delete": "Deleted account",
  "admin.user.reset-link": "Issued password reset link",
};

export default function AdminPanelPage() {
  const [panelState, setPanelState] = useState<PanelState>("loading");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [busyUserId, setBusyUserId] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [resetLinkTarget, setResetLinkTarget] = useState<AdminUser | null>(null);
  const [resetLink, setResetLink] = useState("");
  const [resetLinkExpiresAt, setResetLinkExpiresAt] = useState("");
  const [resetLinkCopied, setResetLinkCopied] = useState(false);

  const loadRoster = useCallback(async (): Promise<boolean> => {
    const [usersResponse, auditResponse] = await Promise.all([
      fetch("/api/policy-assistant/admin/users", { cache: "no-store" }),
      fetch("/api/policy-assistant/admin/audit-events?limit=25", { cache: "no-store" }),
    ]);

    if (usersResponse.status === 401 || usersResponse.status === 403) {
      return false;
    }
    if (!usersResponse.ok) {
      throw new Error("roster");
    }

    const usersPayload = await usersResponse.json().catch(() => ({}));
    setUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);

    if (auditResponse.ok) {
      const auditPayload = await auditResponse.json().catch(() => ({}));
      setAuditEvents(Array.isArray(auditPayload.events) ? auditPayload.events : []);
    }

    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const meResponse = await fetch("/api/policy-assistant/auth/me", { cache: "no-store" });
        const mePayload = await meResponse.json().catch(() => ({}));
        const me = (mePayload?.user ?? null) as CurrentUser | null;

        if (cancelled) {
          return;
        }

        if (!me || me.accountRole !== "admin") {
          setPanelState("unauthorized");
          return;
        }

        setCurrentUser(me);
        const authorized = await loadRoster();
        if (cancelled) {
          return;
        }
        setPanelState(authorized ? "ready" : "unauthorized");
      } catch {
        if (!cancelled) {
          setPanelState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadRoster]);

  const filteredUsers = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) {
      return users;
    }
    return users.filter((user) =>
      [user.firstName, user.lastName, user.email, user.districtName, user.roleTitle]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [users, filter]);

  const stats = useMemo(() => {
    const total = users.length;
    const verified = users.filter((user) => Boolean(user.emailVerifiedAt)).length;
    const deactivated = users.filter((user) => Boolean(user.deactivatedAt)).length;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activeThisWeek = users.filter((user) => {
      if (!user.lastActiveAt) {
        return false;
      }
      const at = new Date(user.lastActiveAt).getTime();
      return Number.isFinite(at) && at >= sevenDaysAgo;
    }).length;
    return { total, verified, deactivated, activeThisWeek };
  }, [users]);

  async function refreshRoster(): Promise<void> {
    try {
      const authorized = await loadRoster();
      if (!authorized) {
        setPanelState("unauthorized");
      }
    } catch {
      setActionError("Could not refresh the roster. Please try again.");
    }
  }

  async function runPatchAction(user: AdminUser, action: string): Promise<void> {
    const confirmKey = `${user.id}:${action}`;
    if (pendingConfirm !== confirmKey && (action === "deactivate" || action === "reactivate")) {
      setPendingConfirm(confirmKey);
      setActionError("");
      setActionNotice("");
      return;
    }

    setPendingConfirm("");
    setBusyUserId(user.id);
    setActionError("");
    setActionNotice("");

    try {
      const response = await fetch(
        `/api/policy-assistant/admin/users/${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setActionError(
          typeof payload.error === "string" ? payload.error : "That action did not complete.",
        );
        return;
      }

      setActionNotice(`${describeUser(user)}: ${ACTION_LABELS[`admin.user.${action}`] ?? action}.`);
      await refreshRoster();
    } catch {
      setActionError("That action did not complete. Please check your connection.");
    } finally {
      setBusyUserId("");
    }
  }

  async function requestResetLink(user: AdminUser): Promise<void> {
    setBusyUserId(user.id);
    setActionError("");
    setActionNotice("");
    setResetLinkCopied(false);

    try {
      const response = await fetch(
        `/api/policy-assistant/admin/users/${encodeURIComponent(user.id)}/reset-link`,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setActionError(
          typeof payload.error === "string"
            ? payload.error
            : "Could not create a password reset link.",
        );
        return;
      }

      setResetLinkTarget(user);
      setResetLink(typeof payload.resetLink === "string" ? payload.resetLink : "");
      setResetLinkExpiresAt(
        typeof payload.expiresAt === "string" ? payload.expiresAt : "",
      );
      await refreshRoster();
    } catch {
      setActionError("Could not create a password reset link. Please check your connection.");
    } finally {
      setBusyUserId("");
    }
  }

  function openDeleteModal(user: AdminUser): void {
    setDeleteTarget(user);
    setDeleteConfirmText("");
    setDeletePassword("");
    setDeleteError("");
    setActionError("");
    setActionNotice("");
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    try {
      const response = await fetch(
        `/api/policy-assistant/admin/users/${encodeURIComponent(deleteTarget.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: deleteConfirmText, password: deletePassword }),
        },
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDeleteError(
          typeof payload.error === "string" ? payload.error : "Deletion did not complete.",
        );
        return;
      }

      setActionNotice(`${describeUser(deleteTarget)}: account permanently deleted.`);
      setDeleteTarget(null);
      await refreshRoster();
    } catch {
      setDeleteError("Deletion did not complete. Please check your connection.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function copyResetLink(): Promise<void> {
    if (!resetLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(resetLink);
      setResetLinkCopied(true);
    } catch {
      setResetLinkCopied(false);
    }
  }

  if (panelState === "loading") {
    return (
      <main className="admin-page">
        <p className="admin-status">Loading the admin panel...</p>
      </main>
    );
  }

  if (panelState === "unauthorized") {
    return (
      <main className="admin-page">
        <div className="admin-denied">
          <h1>Admin access required</h1>
          <p>This page is limited to platform administrators.</p>
          <p>
            <Link href="/policy-assistant">Return to the assistant</Link>
          </p>
        </div>
      </main>
    );
  }

  if (panelState === "error") {
    return (
      <main className="admin-page">
        <div className="admin-error">
          <p>Could not load the admin panel. Please refresh and try again.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <Link href="/policy-assistant" className="admin-back-link">
            &larr; Back to Assistant
          </Link>
          <h1>Platform Administration</h1>
          <p className="admin-subtitle">
            Signed in as {currentUser?.email ?? "administrator"}. Admin actions are recorded in the
            audit log.
          </p>
        </div>
        <div className="admin-actions">
          <button type="button" onClick={() => void refreshRoster()}>
            Refresh
          </button>
        </div>
      </header>

      <section className="admin-stats" aria-label="Platform totals">
        <div className="admin-stat">
          <span className="admin-stat-value">{stats.total}</span>
          <span className="admin-stat-label">Accounts</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-value">{stats.verified}</span>
          <span className="admin-stat-label">Verified</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-value">{stats.activeThisWeek}</span>
          <span className="admin-stat-label">Active this week</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat-value">{stats.deactivated}</span>
          <span className="admin-stat-label">Deactivated</span>
        </div>
      </section>

      {actionError ? <div className="admin-error">{actionError}</div> : null}
      {actionNotice ? <div className="admin-notice">{actionNotice}</div> : null}

      <section className="admin-roster" aria-label="User roster">
        <div className="admin-roster-toolbar">
          <label htmlFor="admin-filter" className="admin-filter-label">
            Filter accounts
          </label>
          <input
            id="admin-filter"
            type="search"
            placeholder="Search name, email, or district..."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <span className="admin-roster-count">
            {filteredUsers.length} of {users.length} accounts
          </span>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">District and role</th>
                <th scope="col">Status</th>
                <th scope="col">Usage</th>
                <th scope="col">Joined</th>
                <th scope="col">Last active</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const isBusy = busyUserId === user.id;
                const deactivateKey = `${user.id}:deactivate`;
                const reactivateKey = `${user.id}:reactivate`;
                return (
                  <tr key={user.id} className={user.deactivatedAt ? "admin-row-deactivated" : ""}>
                    <td>
                      <div className="admin-user-name">
                        {formatName(user)}
                        {user.accountRole === "admin" ? (
                          <span className="admin-badge admin-badge-admin">Admin</span>
                        ) : null}
                        {isSelf ? <span className="admin-badge admin-badge-self">You</span> : null}
                      </div>
                      <div className="admin-user-email">{user.email}</div>
                    </td>
                    <td>
                      <div>{user.districtName || "No district"}</div>
                      <div className="admin-user-email">{user.roleTitle || "No role title"}</div>
                    </td>
                    <td>
                      {user.deactivatedAt ? (
                        <span className="admin-badge admin-badge-deactivated">Deactivated</span>
                      ) : user.emailVerifiedAt ? (
                        <span className="admin-badge admin-badge-verified">Verified</span>
                      ) : (
                        <span className="admin-badge admin-badge-pending">Pending verification</span>
                      )}
                    </td>
                    <td>
                      <div>{user.conversationCount} conversations</div>
                      <div className="admin-user-email">
                        {user.messageCount} messages | {user.datasetCount} datasets |{" "}
                        {user.handbookCount} handbooks
                      </div>
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>{user.lastActiveAt ? formatDate(user.lastActiveAt) : "Never"}</td>
                    <td>
                      <div className="admin-row-actions">
                        {!user.emailVerifiedAt && !user.deactivatedAt ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void runPatchAction(user, "verify-email")}
                          >
                            Mark verified
                          </button>
                        ) : null}
                        {!user.deactivatedAt && !isSelf && user.accountRole !== "admin" ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void requestResetLink(user)}
                          >
                            Reset link
                          </button>
                        ) : null}
                        {user.accountRole !== "admin" && !user.deactivatedAt ? (
                          <button
                            type="button"
                            className={pendingConfirm === deactivateKey ? "admin-confirming" : ""}
                            disabled={isBusy}
                            onClick={() => void runPatchAction(user, "deactivate")}
                          >
                            {pendingConfirm === deactivateKey ? "Confirm deactivate" : "Deactivate"}
                          </button>
                        ) : null}
                        {user.deactivatedAt ? (
                          <button
                            type="button"
                            className={pendingConfirm === reactivateKey ? "admin-confirming" : ""}
                            disabled={isBusy}
                            onClick={() => void runPatchAction(user, "reactivate")}
                          >
                            {pendingConfirm === reactivateKey ? "Confirm reactivate" : "Reactivate"}
                          </button>
                        ) : null}
                        {user.accountRole !== "admin" ? (
                          <button
                            type="button"
                            className="admin-danger-button"
                            disabled={isBusy}
                            onClick={() => openDeleteModal(user)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-empty">
                    {filter ? "No accounts match your filter." : "No accounts yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-audit" aria-label="Recent admin activity">
        <h2>Recent admin activity</h2>
        {auditEvents.length === 0 ? (
          <p className="admin-status">No admin actions recorded yet.</p>
        ) : (
          <ul className="admin-audit-list">
            {auditEvents.map((event) => (
              <li key={event.id}>
                <span className="admin-audit-time">{formatDateTime(event.createdAt)}</span>
                <span>
                  {ACTION_LABELS[event.action] ?? event.action}
                  {event.targetEmail ? ` for ${event.targetEmail}` : ""} by {event.actorEmail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deleteTarget ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <h2>Delete {describeUser(deleteTarget)}?</h2>
            <p>
              This permanently removes the account, its conversations, datasets, handbooks, and
              pinned answers. This cannot be undone. The deletion is recorded in the audit log.
            </p>
            <label htmlFor="admin-delete-confirm">Type DELETE to confirm</label>
            <input
              id="admin-delete-confirm"
              type="text"
              autoComplete="off"
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
            />
            <label htmlFor="admin-delete-password">Your admin password</label>
            <input
              id="admin-delete-password"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
            {deleteError ? <div className="admin-error">{deleteError}</div> : null}
            <div className="admin-modal-actions">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-danger-button"
                disabled={isDeleting || deleteConfirmText.trim() !== "DELETE" || !deletePassword}
                onClick={() => void handleDelete()}
              >
                {isDeleting ? "Deleting..." : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resetLinkTarget ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <h2>Password reset link for {describeUser(resetLinkTarget)}</h2>
            <p>
              Share this one-time link with the user through a channel you trust. It expires{" "}
              {resetLinkExpiresAt ? formatDateTime(resetLinkExpiresAt) : "in 60 minutes"} and can be
              used once.
            </p>
            <div className="admin-reset-link">{resetLink}</div>
            <div className="admin-modal-actions">
              <button type="button" onClick={() => void copyResetLink()}>
                {resetLinkCopied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setResetLinkTarget(null);
                  setResetLink("");
                  setResetLinkCopied(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function formatName(user: AdminUser): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name || user.email;
}

function describeUser(user: AdminUser): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name ? `${name} (${user.email})` : user.email;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
