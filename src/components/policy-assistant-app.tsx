"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AppView,
  AuthMode,
  AuthUser,
  ChatMessage,
  ConversationMessage,
  ConversationSummary,
  DetailView,
  EvidenceItem,
  HandbookDocument,
  HandbookType,
  HelpTab,
  HIGH_CONTRAST_STORAGE_KEY,
  LibraryFilter,
  LibraryPolicyRecord,
  LoadedReferenceDetail,
  NormalizedPolicyRow,
  PinnedAnswer,
  PolicyAnswerEvidenceSnapshot,
  PolicyDataset,
  PolicyImportPreview,
  PolicyImportQuality,
  PolicyImportSummary,
  PolicyPlatform,
  REDUCED_MOTION_STORAGE_KEY,
  ReferenceCard,
  ReferenceField,
  ReferenceLookup,
  RetrievalDebugData,
  SourceTab,
  STARTER_PROMPTS,
  StoredPinnedAnswerPayload,
  TEXT_SIZE_OPTIONS,
  TEXT_SIZE_STORAGE_KEY,
  TextSize,
} from "@/components/policy-assistant/types";

import {
  authButtonLabel,
  authTitleForMode,
  buildClientId,
  buildPolicyImportQualityMessages,
  clearAuthQueryParams,
  deriveFirstName,
  deriveInitials,
  expandChatMessage,
  findMetadataValue,
  findRelatedPolicies,
  formatDatasetSource,
  formatHandbookTypeLabel,
  formatLongDate,
  formatRelativeDate,
  formatShortDate,
  isMessageListNearBottom,
  readSetupDone,
  totalPolicyCount,
  truncateReferenceSummary,
  upsertConversation,
  writeSetupDone,
} from "@/components/policy-assistant/helpers";

import { IconRail } from "@/components/policy-assistant/IconRail";
import { ChatPanel } from "@/components/policy-assistant/ChatPanel";
import { EvidenceDrawer } from "@/components/policy-assistant/EvidenceDrawer";
import { LibraryView } from "@/components/policy-assistant/LibraryView";
import { SourceImporter } from "@/components/policy-assistant/SourceImporter";
import { HistoryView } from "@/components/policy-assistant/HistoryView";
import { PinnedView } from "@/components/policy-assistant/PinnedView";
import { PolicyDetailView } from "@/components/policy-assistant/PolicyDetailView";
import { AuthView } from "@/components/policy-assistant/AuthView";
import { SetupWizard } from "@/components/policy-assistant/SetupWizard";
import { HelpView } from "@/components/policy-assistant/HelpView";
import { ProfileModal } from "@/components/policy-assistant/ProfileModal";

export function PolicyAssistantApp(): ReactNode {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDistrictName, setAuthDistrictName] = useState("");
  const [authFirstName, setAuthFirstName] = useState("");
  const [authLastName, setAuthLastName] = useState("");

  const [profileDraftFirst, setProfileDraftFirst] = useState("");
  const [profileDraftLast, setProfileDraftLast] = useState("");
  const [profileDraftDistrict, setProfileDraftDistrict] = useState("");
  const [profileDraftRole, setProfileDraftRole] = useState("");
  const [profileDraftContext, setProfileDraftContext] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [sessionsStatus, setSessionsStatus] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [resetToken, setResetToken] = useState("");

  const [policyImportUrl, setPolicyImportUrl] = useState("");
  const [policyImportDatasetTitle, setPolicyImportDatasetTitle] = useState("");
  const [policyImportPlatform, setPolicyImportPlatform] = useState<PolicyPlatform>("auto");
  const [policyImportIncludeAllBooks, setPolicyImportIncludeAllBooks] = useState(false);
  const [isImportingPolicies, setIsImportingPolicies] = useState(false);
  const [isCommittingPolicyImport, setIsCommittingPolicyImport] = useState(false);
  const [policyImportStatus, setPolicyImportStatus] = useState("");
  const [policyImportError, setPolicyImportError] = useState("");
  const [policyImportPreview, setPolicyImportPreview] = useState<PolicyImportPreview | null>(null);
  const [policyImportSummary, setPolicyImportSummary] = useState<PolicyImportSummary | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDatasetTitle, setUploadDatasetTitle] = useState("");
  const [studentHandbookFile, setStudentHandbookFile] = useState<File | null>(null);
  const [staffHandbookFile, setStaffHandbookFile] = useState<File | null>(null);
  const [studentHandbookTitle, setStudentHandbookTitle] = useState("");
  const [staffHandbookTitle, setStaffHandbookTitle] = useState("");

  const [datasets, setDatasets] = useState<PolicyDataset[]>([]);
  const [handbookDocuments, setHandbookDocuments] = useState<HandbookDocument[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [scenario, setScenario] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isStudentHandbookUploading, setIsStudentHandbookUploading] = useState(false);
  const [isStaffHandbookUploading, setIsStaffHandbookUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [datasetStatus, setDatasetStatus] = useState("");
  const [datasetError, setDatasetError] = useState("");
  const [busyDatasetId, setBusyDatasetId] = useState("");
  const [studentHandbookStatus, setStudentHandbookStatus] = useState("");
  const [studentHandbookError, setStudentHandbookError] = useState("");
  const [staffHandbookStatus, setStaffHandbookStatus] = useState("");
  const [staffHandbookError, setStaffHandbookError] = useState("");
  const [handbookManagementStatus, setHandbookManagementStatus] = useState("");
  const [handbookManagementError, setHandbookManagementError] = useState("");
  const [busyHandbookDocumentId, setBusyHandbookDocumentId] = useState("");
  const [chatError, setChatError] = useState("");
  const [conversationError, setConversationError] = useState("");
  const [retrievalDebug, setRetrievalDebug] = useState<RetrievalDebugData | null>(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);

  const [view, setView] = useState<AppView>("assistant");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceItem | null>(null);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const [pinnedAnswers, setPinnedAnswers] = useState<PinnedAnswer[]>([]);
  const [isPinsLoading, setIsPinsLoading] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [textSize, setTextSize] = useState<TextSize>("standard");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>("import");
  const [setupStep, setSetupStep] = useState(1);
  const [helpTab, setHelpTab] = useState<HelpTab>("start");
  const [isSetupDismissed, setIsSetupDismissed] = useState(false);
  const [isSetupEngaged, setIsSetupEngaged] = useState(false);
  const [datasetPolicies, setDatasetPolicies] = useState<Record<string, LibraryPolicyRecord[]>>({});
  const [isPolicyIndexLoading, setIsPolicyIndexLoading] = useState(false);
  const [policyIndexError, setPolicyIndexError] = useState("");
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState("");

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const historyPopRef = useRef(false);

  /* ------------------------------------------- History and swipe-back */
  useEffect(() => {
    const existing = (window.history.state ?? {}) as Record<string, unknown>;
    const savedView =
      typeof existing.piqView === "string" &&
      ["assistant", "history", "pinned", "library", "policy", "source", "help", "profile"].includes(
        existing.piqView,
      )
        ? (existing.piqView as AppView)
        : null;
    if (savedView && savedView !== viewRef.current) {
      historyPopRef.current = true;
      setView(savedView);
    }
    if (!savedView) {
      window.history.replaceState({ ...existing, piqView: viewRef.current }, "");
    }
    const onPopState = (event: PopStateEvent): void => {
      const target = (event.state as { piqView?: AppView } | null)?.piqView;
      if (!target || target === viewRef.current) {
        return;
      }
      historyPopRef.current = true;
      setView(target);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (historyPopRef.current) {
      historyPopRef.current = false;
      return;
    }
    const current = (window.history.state as { piqView?: AppView } | null)?.piqView;
    if (current === view) {
      return;
    }
    window.history.pushState({ piqView: view }, "");
  }, [view]);

  const activeDatasets = useMemo(
    () => datasets.filter((dataset) => !dataset.archivedAt),
    [datasets],
  );

  const selectedDataset = useMemo(
    () => activeDatasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [activeDatasets, selectedDatasetId],
  );

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const activeStudentHandbookDocuments = useMemo(
    () =>
      handbookDocuments.filter(
        (document) => document.handbookType === "student" && !document.archivedAt,
      ),
    [handbookDocuments],
  );

  const activeStaffHandbookDocuments = useMemo(
    () =>
      handbookDocuments.filter(
        (document) => document.handbookType === "staff" && !document.archivedAt,
      ),
    [handbookDocuments],
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

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = "smooth") => {
    const messageList = messageListRef.current;
    if (!messageList) return;
    messageList.scrollTo({ top: messageList.scrollHeight, behavior });
    nearBottomRef.current = true;
    setShowScrollToLatest(false);
  }, []);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === "1") {
      setHighContrast(true);
    }

    try {
      const storedSize = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
      if (storedSize === "large" || storedSize === "larger") {
        setTextSize(storedSize);
      }
      if (window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY) === "1") {
        setReducedMotion(true);
      }
    } catch {
      // Ignore preference read errors.
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("hc", highContrast);
    document.documentElement.dataset.contrast = highContrast ? "high" : "default";
  }, [highContrast]);

  useEffect(() => {
    document.documentElement.dataset.textsize = textSize;
    try {
      window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, textSize);
    } catch {
      // Ignore
    }
  }, [textSize]);

  useEffect(() => {
    document.documentElement.classList.toggle("rm", reducedMotion);
    try {
      window.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, reducedMotion ? "1" : "0");
    } catch {
      // Ignore
    }
  }, [reducedMotion]);

  useEffect(() => {
    const updateOnlineState = (): void => setIsOffline(!window.navigator.onLine);
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (evidenceOpen) {
        setEvidenceOpen(false);
      } else if (isAccountMenuOpen) {
        setIsAccountMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [evidenceOpen, isAccountMenuOpen]);

  useEffect(() => {
    if (!authUser || !authUser.emailVerifiedAt || !selectedDatasetId) {
      setPinnedAnswers([]);
      return;
    }

    let cancelled = false;
    setIsPinsLoading(true);

    (async () => {
      try {
        const response = await fetch(
          `/api/policy-assistant/pins?datasetId=${encodeURIComponent(selectedDatasetId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          pins?: StoredPinnedAnswerPayload[];
        };
        if (cancelled || !response.ok || !Array.isArray(payload.pins)) return;
        setPinnedAnswers(
          payload.pins.map((pin) => ({
            messageId: pin.messageId,
            title: pin.title,
            body: pin.body,
            meta: pin.meta,
            pinnedAt: pin.createdAt,
            conversationId: pin.conversationId,
          })),
        );
      } catch {
        // Non-critical pin loading
      } finally {
        if (!cancelled) setIsPinsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser, selectedDatasetId]);

  useEffect(() => {
    if (activeDatasets.length === 0) {
      if (selectedDatasetId) setSelectedDatasetId("");
      return;
    }
    if (!activeDatasets.some((d) => d.id === selectedDatasetId)) {
      setSelectedDatasetId(activeDatasets[0].id);
    }
  }, [activeDatasets, selectedDatasetId]);

  useEffect(() => {
    if (!authUser?.emailVerifiedAt || !selectedDatasetId) {
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
      setRetrievalDebug(null);
      return;
    }
    setMessages([]);
    setSelectedConversationId("");
    setRetrievalDebug(null);
    void loadConversations(selectedDatasetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.emailVerifiedAt, selectedDatasetId]);

  useEffect(() => {
    if (!authUser?.emailVerifiedAt || !selectedConversationId) return;
    void loadConversation(selectedConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.emailVerifiedAt, selectedConversationId]);

  async function bootstrap(): Promise<void> {
    setIsAuthLoading(true);
    setAuthError("");
    setAuthInfo("");

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const verifyToken = urlParams.get("verifyToken")?.trim();
      const resetTokenParam = urlParams.get("resetToken")?.trim();

      if (verifyToken) {
        await handleEmailVerificationToken(verifyToken);
        clearAuthQueryParams();
        return;
      }

      if (resetTokenParam) {
        setResetToken(resetTokenParam);
        setAuthMode("reset");
        setAuthInfo("Set your new password below.");
        clearAuthQueryParams();
        setIsAuthLoading(false);
        return;
      }

      await loadSession();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Initialization failed.");
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleEmailVerificationToken(token: string): Promise<void> {
    try {
      const response = await fetch(
        `/api/policy-assistant/auth/verify-email?token=${encodeURIComponent(token)}`,
      );
      const payload = (await response.json().catch(() => ({}))) as {
        user?: AuthUser;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? "Invalid or expired email verification link.");
      }

      setAuthUser(payload.user);
      setAuthInfo(payload.message ?? "Email verified successfully!");
      setAuthMode("login");
      await loadWorkspaceData();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Email verification failed.");
      setAuthMode("login");
    }
  }

  async function loadSession(): Promise<void> {
    try {
      const response = await fetch("/api/policy-assistant/auth/session", { cache: "no-store" });
      if (response.status === 401) {
        clearSessionState();
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { user?: AuthUser };
      if (!response.ok || !payload.user) {
        clearSessionState();
        return;
      }

      setAuthUser(payload.user);
      setProfileDraftFirst(payload.user.firstName);
      setProfileDraftLast(payload.user.lastName);
      setProfileDraftDistrict(payload.user.districtName);
      setProfileDraftRole(payload.user.roleTitle || "");
      setProfileDraftContext(payload.user.profileContext || "");

      if (payload.user.emailVerifiedAt) {
        await loadWorkspaceData();
      }
    } catch {
      clearSessionState();
    }
  }

  async function loadWorkspaceData(): Promise<void> {
    setIsWorkspaceLoading(true);
    try {
      await Promise.all([loadDatasets(), loadHandbookDocuments()]);
    } finally {
      setIsWorkspaceLoading(false);
    }
  }

  async function loadDatasets(): Promise<void> {
    try {
      const response = await fetch("/api/policy-assistant/datasets?includeArchived=1", {
        cache: "no-store",
      });
      if (response.status === 401) {
        clearSessionState();
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { datasets?: PolicyDataset[] };
      if (!response.ok || !Array.isArray(payload.datasets)) return;
      setDatasets(payload.datasets);
    } catch {
      // Non-critical
    }
  }

  async function loadHandbookDocuments(): Promise<void> {
    try {
      const response = await fetch("/api/policy-assistant/handbooks?includeArchived=1", {
        cache: "no-store",
      });
      if (response.status === 401) {
        clearSessionState();
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        documents?: HandbookDocument[];
      };
      if (!response.ok || !Array.isArray(payload.documents)) return;
      setHandbookDocuments(payload.documents);
    } catch {
      // Non-critical
    }
  }

  async function loadConversations(datasetId: string): Promise<void> {
    try {
      const response = await fetch(
        `/api/policy-assistant/conversations?datasetId=${encodeURIComponent(datasetId)}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        clearSessionState();
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        conversations?: ConversationSummary[];
      };
      if (!response.ok || !Array.isArray(payload.conversations)) return;
      setConversations(payload.conversations);
    } catch {
      // Non-critical
    }
  }

  async function loadConversation(conversationId: string): Promise<void> {
    setIsConversationLoading(true);
    setConversationError("");
    try {
      const response = await fetch(
        `/api/policy-assistant/conversations/${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        clearSessionState();
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as {
        conversation?: ConversationSummary;
        messages?: ConversationMessage[];
      };
      if (!response.ok || !payload.conversation || !Array.isArray(payload.messages)) return;

      setMessages(
        payload.messages.map((m) => ({
          id: `msg-${m.id}`,
          storedId: m.id,
          role: m.role,
          content: m.content,
          answerEvidence: m.answerEvidence,
        })),
      );
    } catch (error) {
      setConversationError(
        error instanceof Error ? error.message : "Could not load conversation history.",
      );
    } finally {
      setIsConversationLoading(false);
    }
  }

  function clearSessionState(): void {
    setAuthUser(null);
    setDatasets([]);
    setHandbookDocuments([]);
    setSelectedDatasetId("");
    setConversations([]);
    setSelectedConversationId("");
    setMessages([]);
    setPinnedAnswers([]);
    setRetrievalDebug(null);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthError("");
    setAuthInfo("");
    setIsAuthenticating(true);

    try {
      if (authMode === "signup") {
        const response = await fetch("/api/policy-assistant/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: authEmail.trim(),
            password: authPassword,
            firstName: authFirstName.trim(),
            lastName: authLastName.trim(),
            districtName: authDistrictName.trim(),
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          user?: AuthUser;
          message?: string;
          error?: string;
        };
        if (!response.ok || !payload.user) {
          throw new Error(payload.error ?? "Signup failed.");
        }
        setAuthUser(payload.user);
        setAuthInfo(payload.message ?? "Account created! Check your email to verify.");
        return;
      }

      if (authMode === "login") {
        const response = await fetch("/api/policy-assistant/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          user?: AuthUser;
          error?: string;
        };
        if (!response.ok || !payload.user) {
          throw new Error(payload.error ?? "Invalid credentials.");
        }
        setAuthUser(payload.user);
        if (payload.user.emailVerifiedAt) {
          await loadWorkspaceData();
        } else {
          setAuthInfo("Verification required before starting questions.");
        }
        return;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication error.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  const handleSendScenario = async (promptOverride?: string): Promise<void> => {
    const textToSend = (promptOverride || scenario).trim();
    if (!textToSend || isSending) return;

    if (!selectedDatasetId) {
      setChatError("Select or upload an active district policy dataset in the Library first.");
      return;
    }

    setChatError("");
    setIsSending(true);

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `asst-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: textToSend },
    ]);
    if (!promptOverride) setScenario("");

    try {
      const response = await fetch("/api/policy-assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          datasetId: selectedDatasetId,
          scenario: textToSend,
          conversationId: selectedConversationId || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        answer?: string;
        conversationId?: string;
        evidence?: PolicyAnswerEvidenceSnapshot;
        retrievalDebug?: RetrievalDebugData;
        error?: string;
      };

      if (!response.ok || !payload.answer) {
        throw new Error(payload.error ?? "Policy assistant failed to respond.");
      }

      if (payload.conversationId) {
        setSelectedConversationId(payload.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: payload.answer ?? "",
          answerEvidence: payload.evidence,
        },
      ]);
      if (payload.retrievalDebug) {
        setRetrievalDebug(payload.retrievalDebug);
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Could not complete chat request.");
    } finally {
      setIsSending(false);
    }
  };

  const handleOpenEvidence = (item: EvidenceItem): void => {
    setActiveEvidence(item);
    setEvidenceOpen(true);
  };

  const handleOpenReferenceDetail = async (lookup: ReferenceLookup): Promise<void> => {
    setIsEvidenceLoading(true);
    try {
      const response = await fetch("/api/policy-assistant/reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lookup),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: LoadedReferenceDetail;
        error?: string;
      };
      if (!response.ok || !payload.detail) {
        throw new Error(payload.error ?? "Source detail could not be retrieved.");
      }

      setDetailView({
        kind: lookup.kind,
        code:
          lookup.kind === "policy"
            ? lookup.policyCode || findMetadataValue(payload.detail.metadata, "Policy Code")
            : formatHandbookTypeLabel(lookup.handbookType),
        title:
          lookup.kind === "policy"
            ? findMetadataValue(payload.detail.metadata, "Policy Title") || lookup.policyTitle
            : lookup.sectionTitle,
        section: lookup.kind === "policy" ? findMetadataValue(payload.detail.metadata, "Section") : "",
        metadata: payload.detail.metadata,
        bodyText: payload.detail.bodyText,
        relatedText: selectedDataset?.title ?? "",
      });
      setView("policy");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Could not open source reader.");
    } finally {
      setIsEvidenceLoading(false);
    }
  };

  const handlePinMessage = async (messageId: number): Promise<void> => {
    if (!selectedDatasetId) return;
    try {
      const response = await fetch("/api/policy-assistant/pins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, datasetId: selectedDatasetId }),
      });
      if (response.ok) {
        setPinnedAnswers((prev) => [
          ...prev,
          {
            messageId,
            title: "Pinned Answer",
            body: "Saved answer guidance",
            meta: selectedDataset?.title || "Board Policies",
            pinnedAt: new Date().toISOString(),
            conversationId: selectedConversationId,
          },
        ]);
      }
    } catch {
      // Non-critical
    }
  };

  const handleUnpinMessage = async (messageId: number): Promise<void> => {
    try {
      await fetch(`/api/policy-assistant/pins?messageId=${messageId}`, { method: "DELETE" });
      setPinnedAnswers((prev) => prev.filter((p) => p.messageId !== messageId));
    } catch {
      // Non-critical
    }
  };

  const handleCopyMessage = (id: string, text: string): void => {
    if (typeof window !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedMessageId(id);
      setTimeout(() => setCopiedMessageId(""), 2000);
    }
  };

  const handleLogout = async (): Promise<void> => {
    try {
      await fetch("/api/policy-assistant/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout failures
    }
    clearSessionState();
  };

  const handleStartNewQuestion = (): void => {
    setSelectedConversationId("");
    setMessages([]);
    setScenario("");
    setChatError("");
    setEvidenceOpen(false);
    setActiveEvidence(null);
    setView("assistant");
  };

  if (isAuthLoading) {
    return (
      <div className="piq-loading-screen">
        <span className="piq-logo-mark">P</span>
        <p>Loading PolicyIQ...</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <AuthView
        authMode={authMode}
        authEmail={authEmail}
        authPassword={authPassword}
        authDistrictName={authDistrictName}
        authFirstName={authFirstName}
        authLastName={authLastName}
        authError={authError}
        authInfo={authInfo}
        isAuthenticating={isAuthenticating}
        isResendingVerification={isResendingVerification}
        resetToken={resetToken}
        onAuthEmailChange={setAuthEmail}
        onAuthPasswordChange={setAuthPassword}
        onAuthDistrictNameChange={setAuthDistrictName}
        onAuthFirstNameChange={setAuthFirstName}
        onAuthLastNameChange={setAuthLastName}
        onAuthModeChange={setAuthMode}
        onAuthSubmit={handleAuthSubmit}
        onResendVerification={() => {}}
      />
    );
  }

  return (
    <div className={`piq-app-layout${highContrast ? " hc" : ""}`}>
      {/* Icon Navigation Rail */}
      <IconRail
        view={view}
        authUser={authUser}
        highContrast={highContrast}
        onNavigate={setView}
        onToggleHighContrast={() => setHighContrast((prev) => !prev)}
        onNewQuestion={handleStartNewQuestion}
        onOpenProfile={() => setView("profile")}
      />

      {/* Primary Workspace View Switcher */}
      <div className="piq-workspace-content">
        {view === "assistant" && (
          <div className="piq-assistant-layout">
            <ChatPanel
              authUser={authUser}
              selectedDataset={selectedDataset}
              datasets={datasets}
              activeStudentHandbookDocuments={activeStudentHandbookDocuments}
              activeStaffHandbookDocuments={activeStaffHandbookDocuments}
              scenario={scenario}
              messages={messages}
              isSending={isSending}
              isOffline={isOffline}
              chatError={chatError}
              selectedConversation={selectedConversation}
              copiedMessageId={copiedMessageId}
              pinnedAnswers={pinnedAnswers}
              showScrollToLatest={showScrollToLatest}
              onScenarioChange={setScenario}
              onSendScenario={handleSendScenario}
              onOpenEvidence={handleOpenEvidence}
              onOpenReferenceDetail={handleOpenReferenceDetail}
              onPinMessage={handlePinMessage}
              onCopyMessage={handleCopyMessage}
              onNavigate={setView}
              onScrollToBottom={() => scrollToLatestMessage("smooth")}
              messageListRef={messageListRef}
              composerRef={composerRef}
            />

            <EvidenceDrawer
              evidenceOpen={evidenceOpen}
              activeEvidence={activeEvidence}
              isEvidenceLoading={isEvidenceLoading}
              pinnedAnswers={pinnedAnswers}
              onClose={() => setEvidenceOpen(false)}
              onOpenReferenceDetail={handleOpenReferenceDetail}
              onPinMessage={handlePinMessage}
            />
          </div>
        )}

        {view === "library" && (
          <LibraryView
            datasets={datasets}
            handbookDocuments={handbookDocuments}
            selectedDatasetId={selectedDatasetId}
            librarySearchQuery={librarySearchQuery}
            libraryFilter={libraryFilter}
            showArchived={showArchived}
            datasetStatus={datasetStatus}
            datasetError={datasetError}
            busyDatasetId={busyDatasetId}
            busyHandbookDocumentId={busyHandbookDocumentId}
            onSearchQueryChange={setLibrarySearchQuery}
            onFilterChange={setLibraryFilter}
            onToggleShowArchived={() => setShowArchived((prev) => !prev)}
            onSelectDataset={setSelectedDatasetId}
            onDatasetRename={() => {}}
            onDatasetArchive={() => {}}
            onDatasetDelete={() => {}}
            onHandbookArchive={() => {}}
            onHandbookDelete={() => {}}
            onNavigate={setView}
          />
        )}

        {view === "source" && (
          <SourceImporter
            authUser={authUser}
            sourceTab={sourceTab}
            policyImportUrl={policyImportUrl}
            policyImportPlatform={policyImportPlatform}
            policyImportIncludeAllBooks={policyImportIncludeAllBooks}
            policyImportDatasetTitle={policyImportDatasetTitle}
            isImportingPolicies={isImportingPolicies}
            isCommittingPolicyImport={isCommittingPolicyImport}
            policyImportStatus={policyImportStatus}
            policyImportError={policyImportError}
            policyImportPreview={policyImportPreview}
            policyImportSummary={policyImportSummary}
            uploadFile={uploadFile}
            uploadDatasetTitle={uploadDatasetTitle}
            isUploading={isUploading}
            uploadStatus={uploadStatus}
            uploadError={uploadError}
            studentHandbookFile={studentHandbookFile}
            staffHandbookFile={staffHandbookFile}
            studentHandbookTitle={studentHandbookTitle}
            staffHandbookTitle={staffHandbookTitle}
            isStudentHandbookUploading={isStudentHandbookUploading}
            isStaffHandbookUploading={isStaffHandbookUploading}
            studentHandbookStatus={studentHandbookStatus}
            studentHandbookError={studentHandbookError}
            staffHandbookStatus={staffHandbookStatus}
            staffHandbookError={staffHandbookError}
            onSourceTabChange={setSourceTab}
            onPolicyImportUrlChange={setPolicyImportUrl}
            onPolicyImportPlatformChange={setPolicyImportPlatform}
            onPolicyImportIncludeAllBooksChange={setPolicyImportIncludeAllBooks}
            onPolicyImportDatasetTitleChange={setPolicyImportDatasetTitle}
            onPolicyImportSubmit={(e) => e.preventDefault()}
            onPolicyImportCommit={() => {}}
            onPolicyImportDiscard={() => setPolicyImportPreview(null)}
            onPolicyPreviewDownload={() => {}}
            onUploadFileChange={setUploadFile}
            onUploadDatasetTitleChange={setUploadDatasetTitle}
            onUploadSubmit={(e) => e.preventDefault()}
            onStudentHandbookFileChange={setStudentHandbookFile}
            onStaffHandbookFileChange={setStaffHandbookFile}
            onStudentHandbookTitleChange={setStudentHandbookTitle}
            onStaffHandbookTitleChange={setStaffHandbookTitle}
            onStudentHandbookSubmit={(e) => e.preventDefault()}
            onStaffHandbookSubmit={(e) => e.preventDefault()}
          />
        )}

        {view === "history" && (
          <HistoryView
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={(id) => {
              setSelectedConversationId(id);
              setView("assistant");
            }}
            onNewQuestion={handleStartNewQuestion}
          />
        )}

        {view === "pinned" && (
          <PinnedView
            pinnedAnswers={pinnedAnswers}
            onSelectConversation={(id) => {
              setSelectedConversationId(id);
              setView("assistant");
            }}
            onUnpinMessage={handleUnpinMessage}
          />
        )}

        {view === "policy" && (
          <PolicyDetailView
            detailView={detailView}
            onBack={() => setView("library")}
            onAskAboutPolicy={(code, title) => {
              setScenario(`What does policy ${code} (${title}) require us to do?`);
              setView("assistant");
            }}
            onCopyText={(text) => {
              if (typeof window !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(text);
              }
            }}
          />
        )}

        {view === "help" && (
          <HelpView helpTab={helpTab} onHelpTabChange={setHelpTab} />
        )}
      </div>

      {/* Profile & Settings Modal */}
      <ProfileModal
        authUser={authUser}
        isOpen={view === "profile"}
        profileDraftFirst={profileDraftFirst}
        profileDraftLast={profileDraftLast}
        profileDraftDistrict={profileDraftDistrict}
        profileDraftRole={profileDraftRole}
        profileDraftContext={profileDraftContext}
        profileStatus={profileStatus}
        profileError={profileError}
        isSavingProfile={isSavingProfile}
        passwordCurrent={passwordCurrent}
        passwordNew={passwordNew}
        passwordConfirm={passwordConfirm}
        passwordStatus={passwordStatus}
        passwordError={passwordError}
        isChangingPassword={isChangingPassword}
        sessionsStatus={sessionsStatus}
        deletePassword={deletePassword}
        deleteConfirmText={deleteConfirmText}
        deleteError={deleteError}
        isDeletingAccount={isDeletingAccount}
        highContrast={highContrast}
        textSize={textSize}
        reducedMotion={reducedMotion}
        onClose={() => setView("assistant")}
        onProfileDraftFirstChange={setProfileDraftFirst}
        onProfileDraftLastChange={setProfileDraftLast}
        onProfileDraftDistrictChange={setProfileDraftDistrict}
        onProfileDraftRoleChange={setProfileDraftRole}
        onProfileDraftContextChange={setProfileDraftContext}
        onSaveProfile={(e) => e.preventDefault()}
        onPasswordCurrentChange={setPasswordCurrent}
        onPasswordNewChange={setPasswordNew}
        onPasswordConfirmChange={setPasswordConfirm}
        onChangePassword={(e) => e.preventDefault()}
        onSignOutEverywhere={() => {}}
        onDeletePasswordChange={setDeletePassword}
        onDeleteConfirmTextChange={setDeleteConfirmText}
        onDeleteAccount={(e) => e.preventDefault()}
        onToggleHighContrast={() => setHighContrast((prev) => !prev)}
        onTextSizeChange={setTextSize}
        onToggleReducedMotion={() => setReducedMotion((prev) => !prev)}
        onLogout={handleLogout}
      />
    </div>
  );
}
