"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

interface PolicyDataset {
  id: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  policyCount: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
  emailVerifiedAt: string | null;
}

interface ConversationSummary {
  id: string;
  datasetId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
}

interface ConversationMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

type AuthMode = "login" | "signup" | "forgot" | "reset";

export function PolicyAssistantApp() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [resetToken, setResetToken] = useState("");

  const [districtName, setDistrictName] = useState("West Lafayette Community School Corporation");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [datasets, setDatasets] = useState<PolicyDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [scenario, setScenario] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [chatError, setChatError] = useState("");
  const [conversationError, setConversationError] = useState("");

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDatasetId && datasets.length > 0) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [datasets, selectedDatasetId]);

  useEffect(() => {
    if (!authUser?.emailVerifiedAt || !selectedDatasetId) {
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
      return;
    }

    setMessages([]);
    setSelectedConversationId("");
    void loadConversations(selectedDatasetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.emailVerifiedAt, selectedDatasetId]);

  useEffect(() => {
    if (!authUser?.emailVerifiedAt || !selectedConversationId) {
      return;
    }

    void loadConversation(selectedConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.emailVerifiedAt, selectedConversationId]);

  async function bootstrap(): Promise<void> {
    setIsAuthLoading(true);
    setAuthError("");
    setAuthInfo("");

    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get("verifyToken")?.trim() ?? "";
    const resetTokenFromUrl = params.get("resetToken")?.trim() ?? "";

    if (verifyToken) {
      try {
        await handleEmailVerificationToken(verifyToken);
      } catch (error) {
        setAuthError(error instanceof Error ? error.message : "Email verification failed.");
      }
    }

    if (resetTokenFromUrl) {
      setResetToken(resetTokenFromUrl);
      setAuthMode("reset");
      setAuthInfo("Enter a new password to complete your password reset.");
    }

    if (verifyToken || resetTokenFromUrl) {
      clearAuthQueryParams();
    }

    try {
      await loadSession();
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleEmailVerificationToken(token: string): Promise<void> {
    const response = await fetch("/api/policy-assistant/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      user?: AuthUser;
      message?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Email verification failed.");
    }

    if (payload.user) {
      setAuthUser(payload.user);
      setAuthInfo(payload.message ?? "Email verified successfully.");
      if (payload.user.emailVerifiedAt) {
        await loadDatasets();
      }
    }
  }

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAuthError("");
    setAuthInfo("");

    if (authMode === "forgot") {
      await handlePasswordResetRequest();
      return;
    }

    if (authMode === "reset") {
      await handlePasswordResetConfirm();
      return;
    }

    const endpoint =
      authMode === "signup"
        ? "/api/policy-assistant/auth/signup"
        : "/api/policy-assistant/auth/login";

    const email = authEmail.trim().toLowerCase();
    const password = authPassword.trim();

    if (!email || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    setIsAuthenticating(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        user?: AuthUser;
        error?: string;
        message?: string;
        requiresEmailVerification?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Authentication failed with status ${response.status}.`);
      }

      if (!payload.user) {
        throw new Error("Authentication completed, but no user was returned.");
      }

      setAuthUser(payload.user);
      setAuthEmail("");
      setAuthPassword("");
      setAuthInfo(payload.message ?? "");
      setDatasets([]);
      setSelectedDatasetId("");
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
      setUploadError("");
      setChatError("");
      setConversationError("");

      if (payload.user.emailVerifiedAt) {
        await loadDatasets();
      } else {
        setAuthInfo("Check your inbox to verify your email before using datasets and chat.");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  async function handlePasswordResetRequest(): Promise<void> {
    const email = authEmail.trim().toLowerCase();
    if (!email) {
      setAuthError("Enter your email address.");
      return;
    }

    setIsAuthenticating(true);
    try {
      const response = await fetch("/api/policy-assistant/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not request password reset.");
      }

      setAuthInfo(
        payload.message ??
          "If an account exists for this email, a password reset link has been sent.",
      );
      setAuthMode("login");
      setAuthPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not request password reset.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handlePasswordResetConfirm(): Promise<void> {
    const password = authPassword.trim();
    if (!password) {
      setAuthError("Enter your new password.");
      return;
    }

    if (!resetToken) {
      setAuthError("Missing password reset token. Request a new password reset link.");
      return;
    }

    setIsAuthenticating(true);
    try {
      const response = await fetch("/api/policy-assistant/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: resetToken, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        user?: AuthUser;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not reset password.");
      }

      if (!payload.user) {
        throw new Error("Password was reset, but no user session was returned.");
      }

      setResetToken("");
      setAuthMode("login");
      setAuthPassword("");
      setAuthUser(payload.user);
      setAuthInfo(payload.message ?? "Password updated successfully.");

      if (payload.user.emailVerifiedAt) {
        await loadDatasets();
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not reset password.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  const handleResendVerification = async (): Promise<void> => {
    if (!authUser) {
      return;
    }

    setIsResendingVerification(true);
    setAuthError("");
    setAuthInfo("");

    try {
      const response = await fetch("/api/policy-assistant/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: authUser.email }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not resend verification email.");
      }

      setAuthInfo(payload.message ?? "Verification email sent.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not resend verification email.");
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleResendVerificationForEnteredEmail = async (): Promise<void> => {
    const email = authEmail.trim().toLowerCase();
    if (!email) {
      setAuthError("Enter your email address first.");
      return;
    }

    setIsResendingVerification(true);
    setAuthError("");
    setAuthInfo("");

    try {
      const response = await fetch("/api/policy-assistant/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not resend verification email.");
      }

      setAuthInfo(payload.message ?? "If the account is pending verification, a link has been sent.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not resend verification email.");
    } finally {
      setIsResendingVerification(false);
    }
  };

  const handleLogout = async (): Promise<void> => {
    setAuthError("");

    try {
      await fetch("/api/policy-assistant/auth/logout", {
        method: "POST",
      });
    } catch {
      // Ignore logout network failures and clear local state anyway.
    }

    clearSessionState();
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setUploadError("");
    setUploadStatus("");

    if (!authUser) {
      setUploadError("Sign in to upload and manage your district policy dataset.");
      return;
    }

    if (!authUser.emailVerifiedAt) {
      setUploadError("Verify your email before uploading policies.");
      return;
    }

    if (!uploadFile) {
      setUploadError("Choose a CSV file before uploading.");
      return;
    }

    const formData = new FormData();
    formData.set("file", uploadFile);
    formData.set("districtName", districtName);

    setIsUploading(true);
    setUploadStatus("Uploading and indexing policy CSV...");

    try {
      const response = await fetch("/api/policy-assistant/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        dataset?: PolicyDataset;
      };

      if (!response.ok) {
        if (response.status === 401) {
          clearSessionState();
          throw new Error("Your session expired. Please sign in again.");
        }
        throw new Error(payload.error ?? `Upload failed with status ${response.status}.`);
      }

      if (!payload.dataset) {
        throw new Error("Upload completed but no dataset metadata was returned.");
      }

      setDatasets((previous) => [payload.dataset as PolicyDataset, ...previous]);
      setSelectedDatasetId(payload.dataset.id);
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
      setUploadStatus(
        `Uploaded ${payload.dataset.policyCount} policies for ${payload.dataset.districtName}.`,
      );
      setUploadFile(null);
    } catch (error) {
      setUploadStatus("");
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleScenarioSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setChatError("");

    if (!authUser) {
      setChatError("Sign in to access your policy guidance workspace.");
      return;
    }

    if (!authUser.emailVerifiedAt) {
      setChatError("Verify your email before using the assistant.");
      return;
    }

    if (!selectedDatasetId) {
      setChatError("Upload a CSV and select a dataset first.");
      return;
    }

    const trimmedScenario = scenario.trim();
    if (!trimmedScenario) {
      setChatError("Describe a scenario before sending.");
      return;
    }

    const userMessage: ChatMessage = {
      id: buildClientId("user"),
      role: "user",
      content: trimmedScenario,
    };

    setScenario("");
    setMessages((previous) => [...previous, userMessage]);
    setIsSending(true);

    try {
      const response = await fetch("/api/policy-assistant/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          datasetId: selectedDatasetId,
          scenario: trimmedScenario,
          conversationId: selectedConversationId || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
        conversation?: ConversationSummary;
      };

      if (!response.ok) {
        if (response.status === 401) {
          clearSessionState();
          throw new Error("Your session expired. Please sign in again.");
        }

        if (response.status === 404 && selectedConversationId) {
          setSelectedConversationId("");
          setConversations((previous) =>
            previous.filter((conversation) => conversation.id !== selectedConversationId),
          );
        }

        throw new Error(payload.error ?? `Assistant request failed with status ${response.status}.`);
      }

      if (!payload.answer) {
        throw new Error("Assistant response was empty.");
      }

      const assistantMessage: ChatMessage = {
        id: buildClientId("assistant"),
        role: "assistant",
        content: payload.answer,
      };

      setMessages((previous) => [...previous, assistantMessage]);

      if (payload.conversation) {
        const savedConversation = payload.conversation;
        setSelectedConversationId(savedConversation.id);
        setConversations((previous) => upsertConversation(previous, savedConversation));
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Assistant request failed.");
    } finally {
      setIsSending(false);
    }
  };

  const handleStartNewConversation = (): void => {
    setSelectedConversationId("");
    setMessages([]);
    setChatError("");
    setConversationError("");
  };

  if (isAuthLoading) {
    return (
      <section className="panel assistant-auth-panel">
        <h2 className="section-title">Loading Workspace</h2>
        <p className="small-muted">Checking account session...</p>
      </section>
    );
  }

  if (!authUser) {
    return (
      <section className="panel assistant-auth-panel">
        <h2 className="section-title">{authTitleForMode(authMode)}</h2>
        <p className="small-muted">
          Each account has isolated policy datasets and private conversation history.
        </p>

        <form className="assistant-auth-form" onSubmit={handleAuthSubmit}>
          {authMode !== "reset" ? (
            <>
              <label htmlFor="auth-email" className="policy-label">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                required
              />
            </>
          ) : (
            <p className="small-muted">Reset token detected. Enter a new password below.</p>
          )}

          {authMode !== "forgot" ? (
            <>
              <label htmlFor="auth-password" className="policy-label">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                required
                placeholder={
                  authMode === "reset" ? "Enter your new password" : "Enter your password"
                }
              />
            </>
          ) : null}

          <button className="action-button policy-button" type="submit" disabled={isAuthenticating}>
            {isAuthenticating ? "Please wait..." : authButtonLabel(authMode)}
          </button>
        </form>

        <div className="assistant-auth-links">
          {authMode !== "signup" ? (
            <button
              type="button"
              className="assistant-auth-toggle"
              onClick={() => {
                setAuthMode("signup");
                setAuthError("");
                setAuthInfo("");
              }}
            >
              Need an account? Create one
            </button>
          ) : null}

          {authMode !== "login" ? (
            <button
              type="button"
              className="assistant-auth-toggle"
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
                setAuthInfo("");
              }}
            >
              Back to Sign In
            </button>
          ) : null}

          {authMode === "login" ? (
            <button
              type="button"
              className="assistant-auth-toggle"
              onClick={() => {
                setAuthMode("forgot");
                setAuthPassword("");
                setAuthError("");
                setAuthInfo("");
              }}
            >
              Forgot your password?
            </button>
          ) : null}

          {authMode === "login" ? (
            <button
              type="button"
              className="assistant-auth-toggle"
              onClick={handleResendVerificationForEnteredEmail}
              disabled={isResendingVerification}
            >
              {isResendingVerification ? "Sending..." : "Resend Verification"}
            </button>
          ) : null}
        </div>

        {authInfo ? <p className="policy-status">{authInfo}</p> : null}
        {authError ? <p className="policy-error">{authError}</p> : null}
      </section>
    );
  }

  if (!authUser.emailVerifiedAt) {
    return (
      <section className="panel assistant-auth-panel">
        <div className="assistant-account-row">
          <h2 className="section-title">Verify Your Email</h2>
          <button type="button" className="assistant-logout-button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
        <p className="small-muted">Signed in as {authUser.email}</p>
        <p className="small-muted">
          Please verify your email address to unlock dataset upload and policy guidance.
        </p>
        <button
          type="button"
          className="action-button policy-button"
          onClick={handleResendVerification}
          disabled={isResendingVerification}
        >
          {isResendingVerification ? "Sending..." : "Resend Verification Email"}
        </button>
        {authInfo ? <p className="policy-status">{authInfo}</p> : null}
        {authError ? <p className="policy-error">{authError}</p> : null}
      </section>
    );
  }

  return (
    <section className="assistant-layout">
      <section className="panel assistant-upload-panel">
        <div className="assistant-account-row">
          <h2 className="section-title">Policy Dataset</h2>
          <button type="button" className="assistant-logout-button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
        <p className="small-muted">Signed in as {authUser.email}</p>

        <form
          className="assistant-upload-form"
          method="post"
          action="/api/policy-assistant/upload"
          encType="multipart/form-data"
          onSubmit={handleUpload}
        >
          <label htmlFor="district-name" className="policy-label">
            District Name
          </label>
          <input
            id="district-name"
            name="districtName"
            type="text"
            value={districtName}
            onChange={(event) => setDistrictName(event.target.value)}
            placeholder="West Lafayette Community School Corporation"
            required
          />

          <label htmlFor="policy-csv" className="policy-label">
            Policy CSV
          </label>
          <input
            id="policy-csv"
            name="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            required
          />

          <button className="action-button policy-button" type="submit" disabled={isUploading}>
            {isUploading ? "Uploading..." : "Upload CSV to Database"}
          </button>
        </form>

        <div className="assistant-dataset-picker">
          <label htmlFor="dataset-select" className="policy-label">
            Active Dataset
          </label>
          <select
            id="dataset-select"
            value={selectedDatasetId}
            onChange={(event) => setSelectedDatasetId(event.target.value)}
            disabled={datasets.length === 0}
          >
            {datasets.length === 0 ? (
              <option value="">No datasets uploaded yet</option>
            ) : (
              datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {formatDatasetOption(dataset)}
                </option>
              ))
            )}
          </select>
        </div>

        {selectedDataset ? (
          <p className="small-muted">
            Loaded: {selectedDataset.filename} on {new Date(selectedDataset.uploadedAt).toLocaleString()}
          </p>
        ) : null}

        {uploadStatus ? <p className="policy-status">{uploadStatus}</p> : null}
        {uploadError ? <p className="policy-error">{uploadError}</p> : null}
      </section>

      <section className="panel assistant-chat-panel">
        <h2 className="section-title">Policy Assistant</h2>

        <div className="assistant-conversation-row">
          <div className="assistant-conversation-picker">
            <label htmlFor="conversation-select" className="policy-label">
              Conversation History
            </label>
            <select
              id="conversation-select"
              value={selectedConversationId}
              onChange={(event) => setSelectedConversationId(event.target.value)}
              disabled={conversations.length === 0 || isConversationLoading}
            >
              {conversations.length === 0 ? (
                <option value="">No saved conversations yet</option>
              ) : (
                conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {formatConversationOption(conversation)}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="button"
            className="assistant-auth-toggle"
            onClick={handleStartNewConversation}
            disabled={!selectedDatasetId || isSending}
          >
            New Conversation
          </button>
        </div>

        {selectedConversation ? (
          <p className="small-muted">
            Continuing: {selectedConversation.title} ({selectedConversation.messageCount} messages)
          </p>
        ) : (
          <p className="small-muted">Describe a situation to start a new saved conversation.</p>
        )}

        {isConversationLoading ? <p className="small-muted">Loading conversation history...</p> : null}
        {conversationError ? <p className="policy-error">{conversationError}</p> : null}

        <div className="assistant-message-list">
          {messages.length === 0 ? (
            <article className="assistant-message assistant-message-assistant">
              <p className="assistant-message-role">Assistant</p>
              <pre>Describe a situation to generate policy-grounded guidance.</pre>
            </article>
          ) : null}

          {messages.map((message) => (
            <article key={message.id} className={`assistant-message assistant-message-${message.role}`}>
              <p className="assistant-message-role">{message.role === "assistant" ? "Assistant" : "You"}</p>
              <pre>{message.content}</pre>
            </article>
          ))}
        </div>

        <form className="assistant-chat-form" onSubmit={handleScenarioSubmit}>
          <label htmlFor="scenario" className="policy-label">
            Describe The Situation
          </label>
          <textarea
            id="scenario"
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            placeholder="Example: A parent has filed a formal complaint alleging their child with special needs is not receiving services required by the IEP."
            rows={5}
          />
          <button className="action-button policy-button" type="submit" disabled={isSending}>
            {isSending ? "Analyzing..." : "Get Policy-Grounded Guidance"}
          </button>
        </form>

        {chatError ? <p className="policy-error">{chatError}</p> : null}
      </section>
    </section>
  );

  async function loadSession(): Promise<void> {
    setAuthError("");

    try {
      const response = await fetch("/api/policy-assistant/auth/me", {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        user?: AuthUser | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Session check failed with status ${response.status}.`);
      }

      if (payload.user) {
        setAuthUser(payload.user);
        if (payload.user.emailVerifiedAt) {
          await loadDatasets();
        }
      } else {
        setAuthUser(null);
        setDatasets([]);
        setSelectedDatasetId("");
        setConversations([]);
        setSelectedConversationId("");
        setMessages([]);
        setScenario("");
        setUploadFile(null);
        setUploadStatus("");
        setUploadError("");
        setChatError("");
        setConversationError("");
      }
    } catch (error) {
      setAuthUser(null);
      setAuthError(error instanceof Error ? error.message : "Could not verify your session.");
    }
  }

  async function loadDatasets(): Promise<void> {
    try {
      const response = await fetch("/api/policy-assistant/upload", {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        datasets?: PolicyDataset[];
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        return;
      }

      if (response.status === 403) {
        setUploadError(payload.error ?? "Please verify your email before loading datasets.");
        return;
      }

      if (!response.ok || !Array.isArray(payload.datasets)) {
        throw new Error(payload.error ?? "Could not load datasets.");
      }

      setDatasets(payload.datasets);
      if (payload.datasets.length === 0) {
        setSelectedDatasetId("");
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not load existing datasets.");
    }
  }

  async function loadConversations(datasetId: string): Promise<void> {
    setIsConversationLoading(true);
    setConversationError("");

    try {
      const response = await fetch(
        `/api/policy-assistant/conversations?datasetId=${encodeURIComponent(datasetId)}&limit=50`,
        {
          cache: "no-store",
        },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        conversations?: ConversationSummary[];
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        return;
      }

      if (response.status === 403) {
        setConversationError(payload.error ?? "Verify your email before viewing conversations.");
        setConversations([]);
        setSelectedConversationId("");
        setMessages([]);
        return;
      }

      if (!response.ok || !Array.isArray(payload.conversations)) {
        throw new Error(payload.error ?? "Could not load conversation history.");
      }

      const loadedConversations = payload.conversations as ConversationSummary[];

      setConversations(loadedConversations);

      if (loadedConversations.length === 0) {
        setSelectedConversationId("");
        setMessages([]);
        return;
      }

      setSelectedConversationId((currentId) => {
        if (currentId && loadedConversations.some((conversation) => conversation.id === currentId)) {
          return currentId;
        }
        return loadedConversations[0].id;
      });
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Could not load conversation history.");
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
    } finally {
      setIsConversationLoading(false);
    }
  }

  async function loadConversation(conversationId: string): Promise<void> {
    setIsConversationLoading(true);
    setConversationError("");

    try {
      const response = await fetch(`/api/policy-assistant/conversations/${conversationId}`, {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        conversation?: ConversationSummary;
        messages?: ConversationMessage[];
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        return;
      }

      if (response.status === 403) {
        setConversationError(payload.error ?? "Verify your email before viewing conversations.");
        setConversations([]);
        setSelectedConversationId("");
        setMessages([]);
        return;
      }

      if (response.status === 404) {
        setConversations((previous) =>
          previous.filter((conversation) => conversation.id !== conversationId),
        );
        setSelectedConversationId("");
        setMessages([]);
        throw new Error("Conversation not found. Start a new conversation.");
      }

      if (!response.ok || !payload.conversation || !Array.isArray(payload.messages)) {
        throw new Error(payload.error ?? "Could not load conversation messages.");
      }

      setConversations((previous) =>
        upsertConversation(previous, payload.conversation as ConversationSummary),
      );

      setMessages(
        payload.messages.map((message) => ({
          id: `stored-${message.id}`,
          role: message.role,
          content: message.content,
        })),
      );
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "Could not load conversation.");
    } finally {
      setIsConversationLoading(false);
    }
  }

  function clearSessionState(): void {
    setAuthUser(null);
    setDatasets([]);
    setSelectedDatasetId("");
    setConversations([]);
    setSelectedConversationId("");
    setMessages([]);
    setScenario("");
    setUploadFile(null);
    setUploadStatus("");
    setUploadError("");
    setChatError("");
    setConversationError("");
    setAuthInfo("");
    setAuthMode("login");
    setAuthEmail("");
    setAuthPassword("");
    setResetToken("");
  }
}

function buildClientId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

function formatDatasetOption(dataset: PolicyDataset): string {
  const label = `${dataset.districtName} (${dataset.policyCount} policies)`;
  if (label.length <= 58) {
    return label;
  }
  return `${label.slice(0, 55)}...`;
}

function formatConversationOption(conversation: ConversationSummary): string {
  const base = conversation.title.trim() || "Untitled conversation";
  const title = base.length > 45 ? `${base.slice(0, 42)}...` : base;
  const timestamp = new Date(conversation.lastMessageAt || conversation.updatedAt).toLocaleString();
  return `${title} (${timestamp})`;
}

function upsertConversation(
  previous: ConversationSummary[],
  incoming: ConversationSummary,
): ConversationSummary[] {
  const withoutIncoming = previous.filter((conversation) => conversation.id !== incoming.id);
  const merged = [incoming, ...withoutIncoming];

  return merged.sort(
    (left, right) =>
      new Date(right.lastMessageAt || right.updatedAt).getTime() -
      new Date(left.lastMessageAt || left.updatedAt).getTime(),
  );
}

function authTitleForMode(mode: AuthMode): string {
  if (mode === "signup") {
    return "Create Account";
  }

  if (mode === "forgot") {
    return "Reset Password";
  }

  if (mode === "reset") {
    return "Set New Password";
  }

  return "Sign In";
}

function authButtonLabel(mode: AuthMode): string {
  if (mode === "signup") {
    return "Create Account";
  }

  if (mode === "forgot") {
    return "Send Reset Link";
  }

  if (mode === "reset") {
    return "Update Password";
  }

  return "Sign In";
}

function clearAuthQueryParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("verifyToken");
  url.searchParams.delete("resetToken");
  window.history.replaceState({}, "", url.toString());
}
