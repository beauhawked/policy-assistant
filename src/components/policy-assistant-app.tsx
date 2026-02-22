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

type AuthMode = "login" | "signup";

export function PolicyAssistantApp() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

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
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDatasetId && datasets.length > 0) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [datasets, selectedDatasetId]);

  useEffect(() => {
    if (!authUser || !selectedDatasetId) {
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
      return;
    }

    setMessages([]);
    setSelectedConversationId("");
    void loadConversations(selectedDatasetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, selectedDatasetId]);

  useEffect(() => {
    if (!authUser || !selectedConversationId) {
      return;
    }

    void loadConversation(selectedConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, selectedConversationId]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAuthError("");

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
      setDatasets([]);
      setSelectedDatasetId("");
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
      setUploadError("");
      setChatError("");
      setConversationError("");
      await loadDatasets();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsAuthenticating(false);
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
        <h2 className="section-title">{authMode === "signup" ? "Create Account" : "Sign In"}</h2>
        <p className="small-muted">
          Each account has isolated policy datasets. Sign in once and continue asking policy questions without
          re-uploading each time.
        </p>

        <form className="assistant-auth-form" onSubmit={handleAuthSubmit}>
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
          />

          <button className="action-button policy-button" type="submit" disabled={isAuthenticating}>
            {isAuthenticating ? "Please wait..." : authMode === "signup" ? "Create Account" : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          className="assistant-auth-toggle"
          onClick={() => {
            setAuthMode((mode) => (mode === "login" ? "signup" : "login"));
            setAuthError("");
          }}
        >
          {authMode === "login"
            ? "Need an account? Create one"
            : "Already have an account? Sign in"}
        </button>

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
    setIsAuthLoading(true);
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
        await loadDatasets();
      } else {
        clearSessionState();
      }
    } catch (error) {
      clearSessionState();
      setAuthError(error instanceof Error ? error.message : "Could not verify your session.");
    } finally {
      setIsAuthLoading(false);
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

      setConversations((previous) => upsertConversation(previous, payload.conversation as ConversationSummary));

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
