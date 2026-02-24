"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type AssistantSectionKind = "general" | "policy" | "action" | "implications" | "disclaimer";

interface AssistantMessageSection {
  kind: AssistantSectionKind;
  content: string;
}

interface RenderedChatBubble {
  id: string;
  role: "user" | "assistant";
  kind: AssistantSectionKind;
  label?: string;
  content: string;
}

type AuthMode = "login" | "signup" | "forgot" | "reset";
const MESSAGE_LIST_NEAR_BOTTOM_PX = 120;

function isMessageListNearBottom(
  element: HTMLDivElement,
  thresholdPx: number = MESSAGE_LIST_NEAR_BOTTOM_PX,
): boolean {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

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
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const renderedMessages = useMemo(
    () => messages.flatMap((message) => expandChatMessage(message)),
    [messages],
  );

  const syncMessageListScrollState = useCallback(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      setShowScrollToLatest(false);
      nearBottomRef.current = true;
      return;
    }

    const nearBottom = isMessageListNearBottom(messageList);
    const hasOverflow = messageList.scrollHeight > messageList.clientHeight + 2;
    nearBottomRef.current = nearBottom;
    setShowScrollToLatest(hasOverflow && !nearBottom);
  }, []);

  const scrollToLatestMessage = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const messageList = messageListRef.current;
      if (!messageList) {
        return;
      }

      messageList.scrollTo({ top: messageList.scrollHeight, behavior });
      nearBottomRef.current = true;
      setShowScrollToLatest(false);
    },
    [],
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

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    const handleMessageListScroll = () => {
      syncMessageListScrollState();
    };

    handleMessageListScroll();
    messageList.addEventListener("scroll", handleMessageListScroll, { passive: true });
    return () => {
      messageList.removeEventListener("scroll", handleMessageListScroll);
    };
  }, [syncMessageListScrollState]);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    if (nearBottomRef.current) {
      scrollToLatestMessage("smooth");
      return;
    }

    syncMessageListScrollState();
  }, [messages, selectedConversationId, scrollToLatestMessage, syncMessageListScrollState]);

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
      <section className="panel assistant-auth-panel assistant-panel assistant-panel-centered">
        <h2 className="section-title">Loading Workspace</h2>
        <p className="small-muted">Checking account session...</p>
      </section>
    );
  }

  if (!authUser) {
    return (
      <section className="panel assistant-auth-panel assistant-panel assistant-panel-centered">
        <div className="assistant-panel-header">
          <div>
            <h2 className="section-title">{authTitleForMode(authMode)}</h2>
            <p className="assistant-panel-kicker">
              Secure workspace access with account-level data isolation.
            </p>
          </div>
        </div>

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

        <div className="assistant-feedback-stack">
          {authInfo ? <p className="policy-status">{authInfo}</p> : null}
          {authError ? <p className="policy-error">{authError}</p> : null}
        </div>
      </section>
    );
  }

  if (!authUser.emailVerifiedAt) {
    return (
      <section className="panel assistant-auth-panel assistant-panel assistant-panel-centered">
        <div className="assistant-panel-header">
          <div>
            <h2 className="section-title">Verify Your Email</h2>
            <p className="assistant-panel-kicker">
              Confirm your address to activate uploads, chat, and saved history.
            </p>
          </div>
          <button type="button" className="assistant-logout-button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
        <p className="small-muted assistant-identity">Signed in as {authUser.email}</p>
        <button
          type="button"
          className="action-button policy-button"
          onClick={handleResendVerification}
          disabled={isResendingVerification}
        >
          {isResendingVerification ? "Sending..." : "Resend Verification Email"}
        </button>
        <div className="assistant-feedback-stack">
          {authInfo ? <p className="policy-status">{authInfo}</p> : null}
          {authError ? <p className="policy-error">{authError}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="assistant-layout assistant-layout-pro">
      <section className="panel assistant-upload-panel assistant-panel">
        <div className="assistant-panel-header">
          <div>
            <h2 className="section-title">Policy Dataset</h2>
            <p className="assistant-panel-kicker">Upload and manage your district policy source of truth.</p>
          </div>
          <button type="button" className="assistant-logout-button" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
        <p className="small-muted assistant-identity">Signed in as {authUser.email}</p>

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

        <div className="assistant-feedback-stack">
          {uploadStatus ? <p className="policy-status">{uploadStatus}</p> : null}
          {uploadError ? <p className="policy-error">{uploadError}</p> : null}
        </div>
      </section>

      <section className="panel assistant-chat-panel assistant-panel">
        <div className="assistant-panel-header assistant-panel-header-tight">
          <div>
            <h2 className="section-title">Policy Assistant</h2>
            <p className="assistant-panel-kicker">
              Confidential, account-scoped guidance aligned to your uploaded policies.
            </p>
          </div>
        </div>

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
            className="assistant-auth-toggle assistant-secondary-button"
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

        <div className="assistant-feedback-stack">
          {isConversationLoading ? <p className="small-muted">Loading conversation history...</p> : null}
          {conversationError ? <p className="policy-error">{conversationError}</p> : null}
        </div>

        <div className="assistant-message-shell">
          <div className="assistant-message-list" ref={messageListRef}>
            {renderedMessages.length === 0 ? (
              <article className="assistant-message assistant-message-assistant">
                <p className="assistant-message-role">Assistant</p>
                <div className="assistant-message-body">
                  Describe a situation to generate policy-grounded guidance.
                </div>
              </article>
            ) : null}

            {renderedMessages.map((bubble) => (
              <article
                key={bubble.id}
                className={`assistant-message assistant-message-${bubble.role} assistant-message-kind-${bubble.kind}`}
              >
                {bubble.label ? <p className="assistant-message-role">{bubble.label}</p> : null}
                <div className="assistant-message-body">{bubble.content}</div>
              </article>
            ))}
          </div>

          {showScrollToLatest ? (
            <button
              type="button"
              className="assistant-scroll-latest"
              onClick={() => scrollToLatestMessage("smooth")}
            >
              Jump to Latest
            </button>
          ) : null}
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

        <div className="assistant-feedback-stack">
          {chatError ? <p className="policy-error">{chatError}</p> : null}
        </div>
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

function expandChatMessage(message: ChatMessage): RenderedChatBubble[] {
  if (message.role === "user") {
    return [
      {
        id: message.id,
        role: "user",
        kind: "general",
        content: message.content.trim(),
      },
    ];
  }

  const sections = splitAssistantMessageIntoSections(message.content);
  if (sections.length === 0) {
    return [
      {
        id: message.id,
        role: "assistant",
        kind: "general",
        label: "Assistant",
        content: message.content.trim(),
      },
    ];
  }

  let policyCount = 0;
  return sections.map((section, index) => {
    let label = "Assistant";
    if (section.kind === "policy") {
      policyCount += 1;
      label = `Policy ${policyCount}`;
    } else if (section.kind === "action") {
      label = "Action Plan";
    } else if (section.kind === "implications") {
      label = "Implications";
    } else if (section.kind === "disclaimer") {
      label = "Important Note";
    }

    return {
      id: `${message.id}-${index + 1}`,
      role: "assistant",
      kind: section.kind,
      label,
      content: section.content,
    };
  });
}

function splitAssistantMessageIntoSections(content: string): AssistantMessageSection[] {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const disclaimerMatch = /(?:^|\n)\s*(?:\*\*)?Please remember[\s\S]*$/i.exec(normalized);
  const disclaimerText = disclaimerMatch?.[0]?.trim() ?? "";
  const bodyText =
    disclaimerMatch && typeof disclaimerMatch.index === "number"
      ? normalized.slice(0, disclaimerMatch.index).trim()
      : normalized;

  const policyBlocks: string[][] = [];
  const preface: string[] = [];
  const actionLines: string[] = [];
  const implicationsLines: string[] = [];
  let currentPolicy: string[] = [];
  let mode: "preface" | "policy" | "action" | "implications" = "preface";

  for (const rawLine of bodyText.split("\n")) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (!trimmed) {
      if (mode === "policy" && currentPolicy.length > 0) {
        currentPolicy.push("");
      } else if (mode === "action" && actionLines.length > 0) {
        actionLines.push("");
      } else if (mode === "implications" && implicationsLines.length > 0) {
        implicationsLines.push("");
      } else if (mode === "preface" && preface.length > 0) {
        preface.push("");
      }
      continue;
    }

    if (isRelevantPoliciesHeading(trimmed)) {
      continue;
    }

    if (isActionStepsHeading(trimmed)) {
      if (currentPolicy.length > 0) {
        policyBlocks.push(currentPolicy);
        currentPolicy = [];
      }
      mode = "action";
      actionLines.push("Action Steps:");
      continue;
    }

    if (isImplicationsHeading(trimmed)) {
      if (currentPolicy.length > 0) {
        policyBlocks.push(currentPolicy);
        currentPolicy = [];
      }
      mode = "implications";
      implicationsLines.push("Legal, Ethical, and Academic Implications:");
      continue;
    }

    if (isPolicySectionLine(trimmed)) {
      if (mode === "policy" && currentPolicy.length > 0) {
        policyBlocks.push(currentPolicy);
        currentPolicy = [];
      }
      mode = "policy";
      currentPolicy.push(cleanSectionLine(trimmed));
      continue;
    }

    if (mode === "policy") {
      currentPolicy.push(line);
      continue;
    }

    if (mode === "action") {
      actionLines.push(line);
      continue;
    }

    if (mode === "implications") {
      implicationsLines.push(line);
      continue;
    }

    preface.push(line);
  }

  if (currentPolicy.length > 0) {
    policyBlocks.push(currentPolicy);
  }

  const sections: AssistantMessageSection[] = [];
  const prefaceText = preface.join("\n").trim();
  if (prefaceText) {
    sections.push({ kind: "general", content: prefaceText });
  }

  for (const block of policyBlocks) {
    const blockText = block.join("\n").trim();
    if (blockText) {
      sections.push({ kind: "policy", content: blockText });
    }
  }

  const actionText = actionLines.join("\n").trim();
  if (actionText && actionText !== "Action Steps:") {
    sections.push({ kind: "action", content: actionText });
  }

  const implicationsText = implicationsLines.join("\n").trim();
  if (implicationsText && implicationsText !== "Legal, Ethical, and Academic Implications:") {
    sections.push({ kind: "implications", content: implicationsText });
  }

  if (disclaimerText) {
    sections.push({ kind: "disclaimer", content: disclaimerText });
  }

  if (sections.length === 0) {
    sections.push({ kind: "general", content: normalized });
  }

  return sections;
}

function isRelevantPoliciesHeading(line: string): boolean {
  const normalized = normalizeHeading(line);
  return normalized === "relevant policies" || normalized === "relevant policies:";
}

function isActionStepsHeading(line: string): boolean {
  const normalized = normalizeHeading(line);
  return normalized === "action steps:" || normalized === "action steps";
}

function isImplicationsHeading(line: string): boolean {
  const normalized = normalizeHeading(line);
  return (
    normalized === "legal, ethical, and academic implications:" ||
    normalized === "legal, ethical, and academic implications"
  );
}

function isPolicySectionLine(line: string): boolean {
  return /^(?:[-*]\s*)?policy section\s*:/i.test(line);
}

function cleanSectionLine(line: string): string {
  return line.replace(/^(?:[-*]\s*)?/, "").replace(/\*\*/g, "").trim();
}

function normalizeHeading(line: string): string {
  return line.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "").trim().toLowerCase();
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
