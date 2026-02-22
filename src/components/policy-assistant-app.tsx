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
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [chatError, setChatError] = useState("");

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
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
      setMessages([]);
      setUploadError("");
      setChatError("");
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
      setUploadStatus(
        `Uploaded ${payload.dataset.policyCount} policies for ${payload.dataset.districtName}.`,
      );
      setUploadFile(null);
      setMessages([]);
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
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 401) {
          clearSessionState();
          throw new Error("Your session expired. Please sign in again.");
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
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Assistant request failed.");
    } finally {
      setIsSending(false);
    }
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

  function clearSessionState(): void {
    setAuthUser(null);
    setDatasets([]);
    setSelectedDatasetId("");
    setMessages([]);
    setScenario("");
    setUploadFile(null);
    setUploadStatus("");
    setUploadError("");
    setChatError("");
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
