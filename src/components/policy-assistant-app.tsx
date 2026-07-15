"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PolicyDataset {
  id: string;
  title: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  policyCount: number;
  sourceType: "csv_upload" | "scraper_import";
  sourceUrl: string;
  sourcePlatform: string;
  archivedAt: string | null;
}

interface HandbookDocument {
  id: string;
  title: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  chunkCount: number;
  handbookType: "student" | "staff";
  archivedAt: string | null;
}

type PolicyPlatform = "auto" | "boarddocs" | "table-link" | "accordion-pdf";

interface PolicyImportSummary {
  platform: Exclude<PolicyPlatform, "auto">;
  platformLabel: string;
  sourceUrl: string;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
  policyCount: number;
  filename: string;
}

interface PolicyImportQuality {
  missingTitleCount: number;
  missingWordingCount: number;
  missingCodeCount: number;
  duplicateCodeCount: number;
}

interface PolicyImportPreviewRow {
  policySection: string;
  policyCode: string;
  policyTitle: string;
  policyWordingPreview: string;
}

interface PolicyImportPreview extends PolicyImportSummary {
  id: string;
  expiresAt: string;
  quality: PolicyImportQuality;
  sampleRows: PolicyImportPreviewRow[];
}

interface PolicyAnswerEvidenceDataset {
  id: string;
  title: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  policyCount: number;
  sourceType: "csv_upload" | "scraper_import";
  sourceUrl: string;
  sourcePlatform: string;
}

interface PolicyAnswerEvidencePolicyMatch {
  id: number;
  policySection: string;
  policyCode: string;
  policyTitle: string;
  revisedDate: string;
}

interface PolicyAnswerEvidenceHandbookExcerpt {
  id: number;
  sectionTitle: string;
  sourceIndex: number;
}

interface PolicyAnswerEvidenceHandbookVersion {
  id: string;
  title: string;
  handbookType: "student" | "staff";
  filename: string;
  uploadedAt: string;
  chunkCount: number;
  matchedExcerpts: PolicyAnswerEvidenceHandbookExcerpt[];
}

interface PolicyAnswerEvidenceSnapshot {
  capturedAt: string;
  policyDataset: PolicyAnswerEvidenceDataset;
  policyMatches: PolicyAnswerEvidencePolicyMatch[];
  handbookVersions: PolicyAnswerEvidenceHandbookVersion[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  answerEvidence?: PolicyAnswerEvidenceSnapshot | null;
}

interface AuthUser {
  id: string;
  email: string;
  districtName: string;
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
  answerEvidence: PolicyAnswerEvidenceSnapshot | null;
}

interface RetrievalPolicyMatch {
  id: number;
  policySection: string;
  policyCode: string;
  policyTitle: string;
  relevanceScore: number;
  excerpt: string;
}

interface RetrievalHandbookMatch {
  id: number;
  handbookType: "student" | "staff";
  sectionTitle: string;
  relevanceScore: number;
  excerpt: string;
}

interface RetrievalPostgresPolicyCandidate {
  id: number;
  policySection: string;
  policyCode: string;
  policyTitle: string;
  fullTextRank: number;
  trigramScore: number;
  combinedRank: number;
  selectedByCurrentRetrieval: boolean;
  excerpt: string;
}

interface RetrievalPostgresHandbookCandidate {
  id: number;
  handbookType: "student" | "staff";
  sectionTitle: string;
  fullTextRank: number;
  trigramScore: number;
  combinedRank: number;
  selectedByCurrentRetrieval: boolean;
  excerpt: string;
}

interface RetrievalPostgresComparison {
  query: string;
  policyCandidateCount: number;
  handbookCandidateCount: number;
  policyCandidates?: RetrievalPostgresPolicyCandidate[];
  handbookCandidates?: RetrievalPostgresHandbookCandidate[];
}

interface RetrievalSemanticPolicyCandidate {
  id: number;
  policySection: string;
  policyCode: string;
  policyTitle: string;
  semanticScore: number;
  subIssues: string[];
  selectedByCurrentRetrieval: boolean;
  excerpt: string;
}

interface RetrievalSemanticHandbookCandidate {
  id: number;
  handbookType: "student" | "staff";
  sectionTitle: string;
  semanticScore: number;
  subIssues: string[];
  selectedByCurrentRetrieval: boolean;
  excerpt: string;
}

interface RetrievalSemanticComparison {
  policyCandidateCount: number;
  handbookCandidateCount: number;
  policyCandidates?: RetrievalSemanticPolicyCandidate[];
  handbookCandidates?: RetrievalSemanticHandbookCandidate[];
}

interface RetrievalDebugData {
  retrievalMode?: string;
  subIssues?: string[];
  semanticComparison?: RetrievalSemanticComparison;
  policyCount: number;
  handbookCount: number;
  matchedTerms: string[];
  policyMatches?: RetrievalPolicyMatch[];
  handbookMatches?: RetrievalHandbookMatch[];
  postgresComparison?: RetrievalPostgresComparison;
}

type AssistantSectionKind =
  | "general"
  | "policy"
  | "handbook"
  | "action"
  | "implications"
  | "disclaimer";

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
  answerEvidence?: PolicyAnswerEvidenceSnapshot | null;
  referenceCard?: ReferenceCard;
}

interface ReferenceField {
  label: string;
  value: string;
}

type ReferenceLookup =
  | {
      kind: "policy";
      datasetId: string;
      policyCode: string;
      policyTitle: string;
    }
  | {
      kind: "handbook";
      handbookType: "student" | "staff";
      sectionTitle: string;
    };

interface ReferenceCard {
  label: string;
  title: string;
  compactSummary: string;
  summary: string;
  summaryLabel: string;
  detailButtonLabel: string;
  fullTextLabel: string;
  metadata: ReferenceField[];
  lookup?: ReferenceLookup;
}

interface LoadedReferenceDetail {
  metadata: ReferenceField[];
  bodyLabel: string;
  bodyText: string;
}

interface ReferenceDetailState {
  status: "idle" | "loading" | "loaded" | "error";
  detail?: LoadedReferenceDetail;
  error?: string;
}

type AuthMode = "login" | "signup" | "forgot" | "reset";
type KnowledgeBaseTab = "policies" | "student" | "staff";
const MESSAGE_LIST_NEAR_BOTTOM_PX = 120;

const EXAMPLE_SCENARIOS = [
  "A student is being bullied online by classmates. What does our policy require us to do?",
  "A parent requested their child's education records. What are we required to provide, and how quickly?",
  "A teacher needs extended medical leave mid-semester. What does our staff handbook allow?",
];

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
  const [authDistrictName, setAuthDistrictName] = useState("");
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
  const [kbTab, setKbTab] = useState<KnowledgeBaseTab>("policies");
  const [mobileView, setMobileView] = useState<"knowledge" | "assistant">("assistant");
  const [selectedDatasetTitleDraft, setSelectedDatasetTitleDraft] = useState("");
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
  const [isDatasetTitleSaving, setIsDatasetTitleSaving] = useState(false);
  const [busyDatasetId, setBusyDatasetId] = useState("");
  const [studentHandbookStatus, setStudentHandbookStatus] = useState("");
  const [studentHandbookError, setStudentHandbookError] = useState("");
  const [staffHandbookStatus, setStaffHandbookStatus] = useState("");
  const [staffHandbookError, setStaffHandbookError] = useState("");
  const [handbookManagementStatus, setHandbookManagementStatus] = useState("");
  const [handbookManagementError, setHandbookManagementError] = useState("");
  const [handbookTitleDrafts, setHandbookTitleDrafts] = useState<Record<string, string>>({});
  const [busyHandbookDocumentId, setBusyHandbookDocumentId] = useState("");
  const [chatError, setChatError] = useState("");
  const [conversationError, setConversationError] = useState("");
  const [retrievalDebug, setRetrievalDebug] = useState<RetrievalDebugData | null>(null);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [expandedReferenceIds, setExpandedReferenceIds] = useState<Record<string, boolean>>({});
  const [referenceDetailStates, setReferenceDetailStates] = useState<
    Record<string, ReferenceDetailState>
  >({});
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const scenarioInputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeDatasets = useMemo(
    () => datasets.filter((dataset) => !dataset.archivedAt),
    [datasets],
  );

  const archivedDatasets = useMemo(
    () => datasets.filter((dataset) => Boolean(dataset.archivedAt)),
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

  const policyImportQualityMessages = useMemo(
    () => (policyImportPreview ? buildPolicyImportQualityMessages(policyImportPreview.quality) : []),
    [policyImportPreview],
  );

  const conversationGroups = useMemo(
    () =>
      messages.map((message) => ({
        message,
        items: expandChatMessage(message, selectedDatasetId),
      })),
    [messages, selectedDatasetId],
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

  const archivedHandbookDocuments = useMemo(
    () => handbookDocuments.filter((document) => Boolean(document.archivedAt)),
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

  const toggleReferenceDetails = useCallback(async (bubble: RenderedChatBubble) => {
    if (!bubble.referenceCard) {
      return;
    }

    let shouldExpand = false;
    setExpandedReferenceIds((previous) => {
      const nextExpanded = !previous[bubble.id];
      shouldExpand = nextExpanded;
      return {
        ...previous,
        [bubble.id]: nextExpanded,
      };
    });

    if (!shouldExpand || !bubble.referenceCard.lookup) {
      return;
    }

    const existingState = referenceDetailStates[bubble.id];
    if (existingState?.status === "loading" || existingState?.status === "loaded") {
      return;
    }

    setReferenceDetailStates((previous) => ({
      ...previous,
      [bubble.id]: {
        status: "loading",
      },
    }));

    try {
      const query = new URLSearchParams();
      if (bubble.referenceCard.lookup.kind === "policy") {
        query.set("kind", "policy");
        query.set("datasetId", bubble.referenceCard.lookup.datasetId);
        query.set("policyCode", bubble.referenceCard.lookup.policyCode);
        query.set("policyTitle", bubble.referenceCard.lookup.policyTitle);
      } else {
        query.set("kind", "handbook");
        query.set("handbookType", bubble.referenceCard.lookup.handbookType);
        query.set("sectionTitle", bubble.referenceCard.lookup.sectionTitle);
      }

      const response = await fetch(`/api/policy-assistant/reference?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: LoadedReferenceDetail;
        error?: string;
      };

      if (!response.ok || !payload.detail) {
        throw new Error(payload.error ?? "Could not load full details.");
      }

      setReferenceDetailStates((previous) => ({
        ...previous,
        [bubble.id]: {
          status: "loaded",
          detail: payload.detail,
        },
      }));
    } catch (error) {
      setReferenceDetailStates((previous) => ({
        ...previous,
        [bubble.id]: {
          status: "error",
          error: error instanceof Error ? error.message : "Could not load full details.",
        },
      }));
    }
  }, [referenceDetailStates]);

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeDatasets.length === 0) {
      if (selectedDatasetId) {
        setSelectedDatasetId("");
      }
      return;
    }

    if (!activeDatasets.some((dataset) => dataset.id === selectedDatasetId)) {
      setSelectedDatasetId(activeDatasets[0].id);
    }
  }, [activeDatasets, selectedDatasetId]);

  useEffect(() => {
    setSelectedDatasetTitleDraft(selectedDataset?.title ?? "");
  }, [selectedDataset?.id, selectedDataset?.title]);

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
    setExpandedReferenceIds({});
    setReferenceDetailStates({});
  }, [selectedConversationId, selectedDatasetId]);

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
        await loadWorkspaceData();
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
    const districtName = authDistrictName.trim();

    if (!email || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    if (authMode === "signup" && !districtName) {
      setAuthError("District name is required.");
      return;
    }

    setIsAuthenticating(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          districtName: authMode === "signup" ? districtName : undefined,
        }),
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
      setAuthDistrictName("");
      setAuthInfo(payload.message ?? "");
      setDatasets([]);
      setHandbookDocuments([]);
      setSelectedDatasetId("");
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
      setRetrievalDebug(null);
      setUploadFile(null);
      setPolicyImportUrl("");
      setPolicyImportDatasetTitle("");
      setPolicyImportPlatform("auto");
      setPolicyImportIncludeAllBooks(false);
      setPolicyImportStatus("");
      setPolicyImportError("");
      setPolicyImportPreview(null);
      setPolicyImportSummary(null);
      setUploadDatasetTitle("");
      setStudentHandbookFile(null);
      setStaffHandbookFile(null);
      setStudentHandbookTitle("");
      setStaffHandbookTitle("");
      setUploadStatus("");
      setUploadError("");
      setDatasetStatus("");
      setDatasetError("");
      setSelectedDatasetTitleDraft("");
      setStudentHandbookError("");
      setStudentHandbookStatus("");
      setStaffHandbookError("");
      setStaffHandbookStatus("");
      setHandbookManagementStatus("");
      setHandbookManagementError("");
      setHandbookTitleDrafts({});
      setChatError("");
      setConversationError("");

      if (payload.user.emailVerifiedAt) {
        await loadWorkspaceData();
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
        await loadWorkspaceData();
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

  const handlePolicyImport = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPolicyImportError("");
    setPolicyImportStatus("");
    setPolicyImportPreview(null);
    setPolicyImportSummary(null);

    if (!authUser) {
      setPolicyImportError("Sign in to preview district policies.");
      return;
    }

    if (!authUser.emailVerifiedAt) {
      setPolicyImportError("Verify your email before previewing policies.");
      return;
    }

    const sourceUrl = policyImportUrl.trim();
    if (!sourceUrl) {
      setPolicyImportError("Enter a district policy URL before building a preview.");
      return;
    }

    setIsImportingPolicies(true);
    setPolicyImportStatus("Scraping policies and building an import preview...");

    try {
      const response = await fetch("/api/policy-assistant/import-policies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "preview",
          url: sourceUrl,
          platform: policyImportPlatform,
          includeAllBooks: policyImportIncludeAllBooks,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        preview?: PolicyImportPreview;
      };

      if (!response.ok) {
        if (response.status === 401) {
          clearSessionState();
          throw new Error("Your session expired. Please sign in again.");
        }
        throw new Error(payload.error ?? `Policy preview failed with status ${response.status}.`);
      }

      if (!payload.preview) {
        throw new Error("Policy preview completed but no preview metadata was returned.");
      }

      setPolicyImportPreview(payload.preview);
      setPolicyImportStatus(
        `Preview ready: ${payload.preview.policyCount} policies found from ${payload.preview.platformLabel}.`,
      );
    } catch (error) {
      setPolicyImportStatus("");
      setPolicyImportError(error instanceof Error ? error.message : "Policy preview failed.");
    } finally {
      setIsImportingPolicies(false);
    }
  };

  const handlePolicyImportCommit = async (): Promise<void> => {
    if (!policyImportPreview) {
      setPolicyImportError("Create a policy import preview first.");
      return;
    }

    setPolicyImportError("");
    setPolicyImportStatus("Importing previewed policies into your workspace...");
    setIsCommittingPolicyImport(true);

    try {
      const response = await fetch("/api/policy-assistant/import-policies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "commit",
          previewId: policyImportPreview.id,
          title: policyImportDatasetTitle.trim() || undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        dataset?: PolicyDataset;
        import?: PolicyImportSummary;
      };

      if (!response.ok) {
        if (response.status === 401) {
          clearSessionState();
          throw new Error("Your session expired. Please sign in again.");
        }
        throw new Error(payload.error ?? `Policy import failed with status ${response.status}.`);
      }

      if (!payload.dataset) {
        throw new Error("Policy import completed but no dataset metadata was returned.");
      }

      setDatasets((previous) => [payload.dataset as PolicyDataset, ...previous]);
      setSelectedDatasetId(payload.dataset.id);
      setConversations([]);
      setSelectedConversationId("");
      setMessages([]);
      setRetrievalDebug(null);
      setPolicyImportPreview(null);
      setPolicyImportSummary(payload.import ?? null);
      setPolicyImportDatasetTitle("");
      setPolicyImportStatus(
        `Imported ${payload.dataset.policyCount} policies for ${payload.dataset.districtName}.`,
      );
    } catch (error) {
      setPolicyImportStatus("");
      setPolicyImportError(error instanceof Error ? error.message : "Policy import failed.");
    } finally {
      setIsCommittingPolicyImport(false);
    }
  };

  const handlePolicyImportDiscard = (): void => {
    setPolicyImportPreview(null);
    setPolicyImportStatus("");
    setPolicyImportError("");
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
    if (uploadDatasetTitle.trim()) {
      formData.set("title", uploadDatasetTitle.trim());
    }

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
      setUploadDatasetTitle("");
    } catch (error) {
      setUploadStatus("");
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDatasetTitleSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!selectedDataset) {
      setDatasetError("Select an active dataset before saving a title.");
      return;
    }

    const title = selectedDatasetTitleDraft.trim();
    if (!title) {
      setDatasetError("Dataset title is required.");
      return;
    }

    setDatasetError("");
    setDatasetStatus("");
    setIsDatasetTitleSaving(true);

    try {
      const dataset = await patchDataset(selectedDataset.id, { title });
      setDatasets((previous) =>
        previous.map((item) => (item.id === dataset.id ? dataset : item)),
      );
      setDatasetStatus(`Saved title for ${dataset.title}.`);
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : "Could not save dataset title.");
    } finally {
      setIsDatasetTitleSaving(false);
    }
  };

  const handleDatasetArchive = async (
    dataset: PolicyDataset,
    archived: boolean,
  ): Promise<void> => {
    setDatasetError("");
    setDatasetStatus("");
    setBusyDatasetId(dataset.id);

    try {
      const updatedDataset = await patchDataset(dataset.id, { archived });
      setDatasets((previous) =>
        previous.map((item) => (item.id === updatedDataset.id ? updatedDataset : item)),
      );
      setDatasetStatus(
        archived
          ? `Archived ${updatedDataset.title}.`
          : `Restored ${updatedDataset.title} to active datasets.`,
      );
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : "Could not update dataset archive.");
    } finally {
      setBusyDatasetId("");
    }
  };

  const handleDatasetDelete = async (dataset: PolicyDataset): Promise<void> => {
    const confirmed = window.confirm(
      `Delete "${dataset.title}" permanently? Its policies and saved conversations will be removed.`,
    );
    if (!confirmed) {
      return;
    }

    setDatasetError("");
    setDatasetStatus("");
    setBusyDatasetId(dataset.id);

    try {
      const response = await fetch(
        `/api/policy-assistant/datasets/${encodeURIComponent(dataset.id)}`,
        { method: "DELETE" },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        deleted?: boolean;
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        throw new Error("Your session expired. Please sign in again.");
      }

      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error ?? "Could not delete dataset.");
      }

      setDatasets((previous) => previous.filter((item) => item.id !== dataset.id));
      setDatasetStatus(`Deleted ${dataset.title}.`);
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : "Could not delete dataset.");
    } finally {
      setBusyDatasetId("");
    }
  };

  const patchDataset = async (
    datasetId: string,
    updates: { title?: string; archived?: boolean },
  ): Promise<PolicyDataset> => {
    const response = await fetch(
      `/api/policy-assistant/datasets/${encodeURIComponent(datasetId)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(updates),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      dataset?: PolicyDataset;
      error?: string;
    };

    if (response.status === 401) {
      clearSessionState();
      throw new Error("Your session expired. Please sign in again.");
    }

    if (!response.ok || !payload.dataset) {
      throw new Error(payload.error ?? "Could not update dataset.");
    }

    return payload.dataset;
  };

  const handleHandbookUpload =
    (handbookType: "student" | "staff") =>
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      const selectedFile = handbookType === "staff" ? staffHandbookFile : studentHandbookFile;
      const handbookLabel = handbookType === "staff" ? "staff handbook" : "student handbook";
      const setError =
        handbookType === "staff" ? setStaffHandbookError : setStudentHandbookError;
      const setStatus =
        handbookType === "staff" ? setStaffHandbookStatus : setStudentHandbookStatus;
      const setFile =
        handbookType === "staff" ? setStaffHandbookFile : setStudentHandbookFile;
      const handbookTitle =
        handbookType === "staff" ? staffHandbookTitle : studentHandbookTitle;
      const setTitle =
        handbookType === "staff" ? setStaffHandbookTitle : setStudentHandbookTitle;
      const setUploading =
        handbookType === "staff"
          ? setIsStaffHandbookUploading
          : setIsStudentHandbookUploading;

      setError("");
      setStatus("");

      if (!authUser) {
        setError(`Sign in to upload a ${handbookLabel}.`);
        return;
      }

      if (!authUser.emailVerifiedAt) {
        setError("Verify your email before uploading handbooks.");
        return;
      }

      if (!selectedFile) {
        setError(`Choose a ${handbookLabel} file before uploading.`);
        return;
      }

      const formData = new FormData();
      formData.set("file", selectedFile);
      formData.set("handbookType", handbookType);
      if (handbookTitle.trim()) {
        formData.set("title", handbookTitle.trim());
      }

      setUploading(true);
      setStatus(`Uploading and indexing ${handbookLabel}...`);

      try {
        const response = await fetch("/api/policy-assistant/handbooks", {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          document?: HandbookDocument;
        };

        if (!response.ok) {
          if (response.status === 401) {
            clearSessionState();
            throw new Error("Your session expired. Please sign in again.");
          }
          throw new Error(payload.error ?? `Handbook upload failed with status ${response.status}.`);
        }

        if (!payload.document) {
          throw new Error("Upload completed but no handbook document metadata was returned.");
        }

        setHandbookDocuments((previous) => [payload.document as HandbookDocument, ...previous]);
        setStatus(
          `Uploaded ${handbookLabel} "${payload.document.title}" with ${payload.document.chunkCount} guidance excerpts.`,
        );
        setFile(null);
        setTitle("");
      } catch (error) {
        setStatus("");
        setError(error instanceof Error ? error.message : "Handbook upload failed.");
      } finally {
        setUploading(false);
      }
    };

  const handleHandbookTitleSave = async (
    event: FormEvent<HTMLFormElement>,
    document: HandbookDocument,
  ): Promise<void> => {
    event.preventDefault();

    const title = (handbookTitleDrafts[document.id] ?? document.title).trim();
    if (!title) {
      setHandbookManagementError("Handbook title is required.");
      return;
    }

    setHandbookManagementError("");
    setHandbookManagementStatus("");
    setBusyHandbookDocumentId(document.id);

    try {
      const updatedDocument = await patchHandbookDocument(document.id, { title });
      setHandbookDocuments((previous) =>
        previous.map((item) => (item.id === updatedDocument.id ? updatedDocument : item)),
      );
      setHandbookTitleDrafts((previous) => ({
        ...previous,
        [updatedDocument.id]: updatedDocument.title,
      }));
      setHandbookManagementStatus(`Saved title for ${updatedDocument.title}.`);
    } catch (error) {
      setHandbookManagementError(
        error instanceof Error ? error.message : "Could not save handbook title.",
      );
    } finally {
      setBusyHandbookDocumentId("");
    }
  };

  const handleHandbookArchive = async (
    document: HandbookDocument,
    archived: boolean,
  ): Promise<void> => {
    setHandbookManagementError("");
    setHandbookManagementStatus("");
    setBusyHandbookDocumentId(document.id);

    try {
      const updatedDocument = await patchHandbookDocument(document.id, { archived });
      setHandbookDocuments((previous) =>
        previous.map((item) => (item.id === updatedDocument.id ? updatedDocument : item)),
      );
      setHandbookManagementStatus(
        archived
          ? `Archived ${updatedDocument.title}. It will not be used in new handbook retrieval.`
          : `Restored ${updatedDocument.title} to active handbook retrieval.`,
      );
    } catch (error) {
      setHandbookManagementError(
        error instanceof Error ? error.message : "Could not update handbook archive.",
      );
    } finally {
      setBusyHandbookDocumentId("");
    }
  };

  const handleHandbookDelete = async (document: HandbookDocument): Promise<void> => {
    const confirmed = window.confirm(
      `Delete "${document.title}" permanently? Its extracted handbook excerpts will be removed.`,
    );
    if (!confirmed) {
      return;
    }

    setHandbookManagementError("");
    setHandbookManagementStatus("");
    setBusyHandbookDocumentId(document.id);

    try {
      const response = await fetch(
        `/api/policy-assistant/handbooks/${encodeURIComponent(document.id)}`,
        { method: "DELETE" },
      );

      const payload = (await response.json().catch(() => ({}))) as {
        deleted?: boolean;
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        throw new Error("Your session expired. Please sign in again.");
      }

      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error ?? "Could not delete handbook.");
      }

      setHandbookDocuments((previous) => previous.filter((item) => item.id !== document.id));
      setHandbookManagementStatus(`Deleted ${document.title}.`);
    } catch (error) {
      setHandbookManagementError(
        error instanceof Error ? error.message : "Could not delete handbook.",
      );
    } finally {
      setBusyHandbookDocumentId("");
    }
  };

  const patchHandbookDocument = async (
    documentId: string,
    updates: { title?: string; archived?: boolean },
  ): Promise<HandbookDocument> => {
    const response = await fetch(
      `/api/policy-assistant/handbooks/${encodeURIComponent(documentId)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(updates),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      document?: HandbookDocument;
      error?: string;
    };

    if (response.status === 401) {
      clearSessionState();
      throw new Error("Your session expired. Please sign in again.");
    }

    if (!response.ok || !payload.document) {
      throw new Error(payload.error ?? "Could not update handbook.");
    }

    return payload.document;
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
        answerEvidence?: PolicyAnswerEvidenceSnapshot;
        error?: string;
        conversation?: ConversationSummary;
        retrieval?: RetrievalDebugData;
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
        answerEvidence: payload.answerEvidence ?? null,
      };

      setMessages((previous) => [...previous, assistantMessage]);
      setRetrievalDebug(payload.retrieval ?? null);

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
    setRetrievalDebug(null);
  };

  const handleExamplePrompt = (text: string): void => {
    setScenario(text);
    setChatError("");
    scenarioInputRef.current?.focus();
  };

  if (isAuthLoading) {
    return (
      <section
        className="panel assistant-auth-panel assistant-panel assistant-panel-centered assistant-loading-panel"
        role="status"
        aria-live="polite"
      >
        <span className="assistant-spinner" aria-hidden="true" />
        <h2 className="section-title">Loading workspace</h2>
        <p className="small-muted">Checking your account session&hellip;</p>
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
              {authMode === "signup" ? (
                <>
                  <label htmlFor="auth-district-name" className="policy-label">
                    District Name
                  </label>
                  <input
                    id="auth-district-name"
                    type="text"
                    autoComplete="organization"
                    value={authDistrictName}
                    onChange={(event) => setAuthDistrictName(event.target.value)}
                    required
                    placeholder="Example: West Lafayette Community School Corporation"
                  />
                </>
              ) : null}

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
                setAuthDistrictName("");
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
                setAuthDistrictName("");
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

        <div className="assistant-feedback-stack" aria-live="polite">
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
        <div className="assistant-feedback-stack" aria-live="polite">
          {authInfo ? <p className="policy-status">{authInfo}</p> : null}
          {authError ? <p className="policy-error">{authError}</p> : null}
        </div>
      </section>
    );
  }

  const renderReferenceOrBody = (bubble: RenderedChatBubble) => {
    if (!bubble.referenceCard) {
      return <div className="assistant-message-body">{bubble.content}</div>;
    }

    const referenceCard = bubble.referenceCard;
    const detailState = referenceDetailStates[bubble.id];
    const detailMetadata =
      detailState?.status === "loaded" && detailState.detail
        ? detailState.detail.metadata.filter(
            (field) =>
              !referenceCard.metadata.some(
                (existingField) =>
                  existingField.label === field.label &&
                  existingField.value === field.value,
              ),
          )
        : [];

    return (
      <div className="assistant-reference-card">
        <h3 className="assistant-reference-title">{referenceCard.title}</h3>
        <p className="assistant-reference-summary">{referenceCard.compactSummary}</p>
        {referenceCard.lookup ? (
          <button
            type="button"
            className="assistant-reference-toggle"
            onClick={() => {
              void toggleReferenceDetails(bubble);
            }}
          >
            {expandedReferenceIds[bubble.id] ? "Hide details" : referenceCard.detailButtonLabel}
          </button>
        ) : null}

        {expandedReferenceIds[bubble.id] ? (
          <div className="assistant-reference-details">
            <div className="assistant-reference-meta-grid">
              {referenceCard.metadata.map((field) => (
                <div key={`${bubble.id}-${field.label}`} className="assistant-reference-meta-item">
                  <p className="assistant-reference-meta-label">{field.label}</p>
                  <p className="assistant-reference-meta-value">{field.value}</p>
                </div>
              ))}
              {detailMetadata.map((field) => (
                <div
                  key={`${bubble.id}-detail-${field.label}`}
                  className="assistant-reference-meta-item"
                >
                  <p className="assistant-reference-meta-label">{field.label}</p>
                  <p className="assistant-reference-meta-value">{field.value}</p>
                </div>
              ))}
            </div>

            <div className="assistant-reference-detail-block">
              <p className="assistant-reference-detail-label">{referenceCard.summaryLabel}</p>
              <p className="assistant-reference-detail-text">{referenceCard.summary}</p>
            </div>

            {detailState?.status === "loading" ? (
              <p className="assistant-reference-loading">Loading full text...</p>
            ) : null}

            {detailState?.status === "error" ? (
              <p className="assistant-reference-error">
                {detailState.error ?? "Could not load the full text right now."}
              </p>
            ) : null}

            {detailState?.status === "loaded" && detailState.detail ? (
              <div className="assistant-reference-detail-block">
                <p className="assistant-reference-detail-label">
                  {detailState.detail.bodyLabel ?? referenceCard.fullTextLabel}
                </p>
                <div className="assistant-reference-detail-copy">{detailState.detail.bodyText}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const knowledgeBaseHint =
    activeDatasets.length === 0
      ? "Start by adding your district policies."
      : activeStudentHandbookDocuments.length === 0
        ? "Next: add your student handbook so guidance reflects student rules."
        : activeStaffHandbookDocuments.length === 0
          ? "Next: add your staff handbook to cover employee scenarios."
          : "Your knowledge base is ready — ask a scenario question in the Policy Assistant.";

  return (
    <section className="assistant-layout assistant-layout-pro" data-mobile-view={mobileView}>
      <div className="workspace-bar">
        <div className="workspace-bar-identity">
          <strong>{authUser.email}</strong>
          <span>District: {authUser.districtName || "Not set"}</span>
        </div>
        <button type="button" className="assistant-logout-button" onClick={handleLogout}>
          Sign Out
        </button>
      </div>

      <div className="mobile-view-switch" role="group" aria-label="Choose panel">
        <button
          type="button"
          className={`mobile-view-btn${mobileView === "knowledge" ? " is-active" : ""}`}
          aria-pressed={mobileView === "knowledge"}
          onClick={() => setMobileView("knowledge")}
        >
          Knowledge Base
        </button>
        <button
          type="button"
          className={`mobile-view-btn${mobileView === "assistant" ? " is-active" : ""}`}
          aria-pressed={mobileView === "assistant"}
          onClick={() => setMobileView("assistant")}
        >
          Assistant
        </button>
      </div>

      <section className="panel assistant-upload-panel assistant-panel">
        <div className="assistant-panel-header">
          <div>
            <h2 className="section-title">District Knowledge Base</h2>
            <p className="assistant-panel-kicker">
              Upload and manage district policies plus student and staff handbook guidance.
            </p>
          </div>
        </div>

        <div className="kb-tabs" role="tablist" aria-label="Knowledge base sections">
          <button
            type="button"
            role="tab"
            aria-selected={kbTab === "policies"}
            className={`kb-tab${kbTab === "policies" ? " is-active" : ""}`}
            onClick={() => setKbTab("policies")}
          >
            <span
              className={`kb-tab-status${activeDatasets.length > 0 ? " is-done" : ""}`}
              aria-hidden="true"
            />
            Policies
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kbTab === "student"}
            className={`kb-tab${kbTab === "student" ? " is-active" : ""}`}
            onClick={() => setKbTab("student")}
          >
            <span
              className={`kb-tab-status${activeStudentHandbookDocuments.length > 0 ? " is-done" : ""}`}
              aria-hidden="true"
            />
            Student Handbook
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kbTab === "staff"}
            className={`kb-tab${kbTab === "staff" ? " is-active" : ""}`}
            onClick={() => setKbTab("staff")}
          >
            <span
              className={`kb-tab-status${activeStaffHandbookDocuments.length > 0 ? " is-done" : ""}`}
              aria-hidden="true"
            />
            Staff Handbook
          </button>
        </div>

        <p className="kb-hint">{knowledgeBaseHint}</p>

        {kbTab === "policies" ? (
          <>
        <form className="assistant-upload-form" onSubmit={handlePolicyImport}>
          <label htmlFor="policy-import-url" className="policy-label">
            District Policy URL
          </label>
          <input
            id="policy-import-url"
            type="url"
            value={policyImportUrl}
            onChange={(event) => {
              setPolicyImportUrl(event.target.value);
              setPolicyImportPreview(null);
              setPolicyImportSummary(null);
              setPolicyImportStatus("");
              setPolicyImportError("");
            }}
            placeholder="https://go.boarddocs.com/in/blm/Board.nsf/Public"
            required
          />

          <label htmlFor="policy-import-title" className="policy-label">
            Dataset Title
          </label>
          <input
            id="policy-import-title"
            type="text"
            value={policyImportDatasetTitle}
            onChange={(event) => setPolicyImportDatasetTitle(event.target.value)}
            placeholder="Current district policies"
            maxLength={160}
          />

          <label htmlFor="policy-import-platform" className="policy-label">
            Policy Platform
          </label>
          <select
            id="policy-import-platform"
            value={policyImportPlatform}
            onChange={(event) => {
              setPolicyImportPlatform(event.target.value as PolicyPlatform);
              setPolicyImportPreview(null);
              setPolicyImportSummary(null);
              setPolicyImportStatus("");
              setPolicyImportError("");
            }}
          >
            <option value="auto">Auto-detect</option>
            <option value="boarddocs">BoardDocs</option>
            <option value="table-link">Table-based</option>
            <option value="accordion-pdf">Accordion + PDF</option>
          </select>

          {policyImportPlatform === "boarddocs" || policyImportPlatform === "auto" ? (
            <label className="policy-checkbox">
              <input
                type="checkbox"
                checked={policyImportIncludeAllBooks}
                onChange={(event) => {
                  setPolicyImportIncludeAllBooks(event.target.checked);
                  setPolicyImportPreview(null);
                  setPolicyImportSummary(null);
                  setPolicyImportStatus("");
                  setPolicyImportError("");
                }}
              />
              Include all books
            </label>
          ) : null}

          <button
            className="action-button policy-button"
            type="submit"
            disabled={isImportingPolicies || isCommittingPolicyImport}
          >
            {isImportingPolicies ? "Building Preview..." : "Preview Policies"}
          </button>
        </form>

        {policyImportPreview ? (
          <section className="policy-import-preview" aria-labelledby="policy-import-preview-title">
            <div className="policy-import-preview-header">
              <div>
                <p className="policy-import-preview-eyebrow">Import Preview</p>
                <h3 id="policy-import-preview-title">Review Before Import</h3>
              </div>
              <span className="policy-import-preview-count">
                {policyImportPreview.policyCount} policies
              </span>
            </div>

            <div className="policy-import-preview-meta">
              <div>
                <span>Platform</span>
                <strong>{policyImportPreview.platformLabel}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>
                  {policyImportPreview.sourceCount} {policyImportPreview.sourceLabel}
                </strong>
              </div>
              <div>
                <span>File Name</span>
                <strong>{policyImportPreview.filename}</strong>
              </div>
              <div>
                <span>Preview Expires</span>
                <strong>{new Date(policyImportPreview.expiresAt).toLocaleTimeString()}</strong>
              </div>
            </div>

            {policyImportQualityMessages.length > 0 ? (
              <div className="policy-import-preview-warning">
                <p className="policy-label">Review Flags</p>
                <ul className="assistant-uploaded-list">
                  {policyImportQualityMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="policy-import-preview-clear">
                No missing titles, policy text, or policy codes detected in this preview.
              </p>
            )}

            {policyImportPreview.failedCount > 0 ? (
              <p className="policy-import-preview-note">
                {policyImportPreview.failedCount} source item(s) were skipped during scraping.
              </p>
            ) : null}

            <div className="policy-import-preview-sample">
              <p className="policy-label">Sample Policies</p>
              {policyImportPreview.sampleRows.map((row, index) => (
                <article
                  className="policy-import-preview-row"
                  key={`${row.policyCode || "policy"}-${index}`}
                >
                  <p className="policy-import-preview-row-title">
                    {[row.policyCode, row.policyTitle || "Untitled policy"]
                      .filter(Boolean)
                      .join(" - ")}
                  </p>
                  {row.policySection ? (
                    <p className="policy-import-preview-row-meta">{row.policySection}</p>
                  ) : null}
                  <p className="policy-import-preview-row-copy">
                    {row.policyWordingPreview || "No wording preview available."}
                  </p>
                </article>
              ))}
            </div>

            <div className="policy-import-preview-actions">
              <button
                type="button"
                className="action-button policy-button"
                onClick={handlePolicyImportCommit}
                disabled={isCommittingPolicyImport || isImportingPolicies}
              >
                {isCommittingPolicyImport ? "Importing..." : "Import Previewed Policies"}
              </button>
              <button
                type="button"
                className="assistant-auth-toggle"
                onClick={handlePolicyImportDiscard}
                disabled={isCommittingPolicyImport}
              >
                Discard Preview
              </button>
            </div>
          </section>
        ) : null}

        <form
          className="assistant-upload-form assistant-handbook-form"
          method="post"
          action="/api/policy-assistant/upload"
          encType="multipart/form-data"
          onSubmit={handleUpload}
        >
          <label htmlFor="policy-csv-title" className="policy-label">
            Dataset Title
          </label>
          <input
            id="policy-csv-title"
            name="title"
            type="text"
            value={uploadDatasetTitle}
            onChange={(event) => setUploadDatasetTitle(event.target.value)}
            placeholder="Policy CSV import"
            maxLength={160}
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
          </>
        ) : null}

        {kbTab === "student" ? (
          <>
        <form
          className="assistant-upload-form assistant-handbook-form"
          method="post"
          action="/api/policy-assistant/handbooks"
          encType="multipart/form-data"
          onSubmit={handleHandbookUpload("student")}
        >
          <label htmlFor="student-handbook-title" className="policy-label">
            Student Handbook Title
          </label>
          <input
            id="student-handbook-title"
            name="title"
            type="text"
            value={studentHandbookTitle}
            onChange={(event) => setStudentHandbookTitle(event.target.value)}
            placeholder="2026-2027 student handbook"
            maxLength={160}
          />

          <label htmlFor="student-handbook-file" className="policy-label">
            Student Handbook
          </label>
          <input
            id="student-handbook-file"
            name="file"
            type="file"
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            onChange={(event) => setStudentHandbookFile(event.target.files?.[0] ?? null)}
            required
          />

          <button
            className="action-button policy-button"
            type="submit"
            disabled={isStudentHandbookUploading}
          >
            {isStudentHandbookUploading ? "Uploading..." : "Upload Student Handbook"}
          </button>
        </form>
          </>
        ) : null}

        {kbTab === "staff" ? (
          <>
        <form
          className="assistant-upload-form assistant-handbook-form"
          method="post"
          action="/api/policy-assistant/handbooks"
          encType="multipart/form-data"
          onSubmit={handleHandbookUpload("staff")}
        >
          <label htmlFor="staff-handbook-title" className="policy-label">
            Staff Handbook Title
          </label>
          <input
            id="staff-handbook-title"
            name="title"
            type="text"
            value={staffHandbookTitle}
            onChange={(event) => setStaffHandbookTitle(event.target.value)}
            placeholder="2026-2027 staff handbook"
            maxLength={160}
          />

          <label htmlFor="staff-handbook-file" className="policy-label">
            Staff Handbook
          </label>
          <input
            id="staff-handbook-file"
            name="file"
            type="file"
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            onChange={(event) => setStaffHandbookFile(event.target.files?.[0] ?? null)}
            required
          />

          <button
            className="action-button policy-button"
            type="submit"
            disabled={isStaffHandbookUploading}
          >
            {isStaffHandbookUploading ? "Uploading..." : "Upload Staff Handbook"}
          </button>
        </form>
          </>
        ) : null}

        {kbTab === "policies" ? (
          <>
        <div className="assistant-dataset-picker">
          <label htmlFor="dataset-select" className="policy-label">
            Active Dataset
          </label>
          <select
            id="dataset-select"
            value={selectedDatasetId}
            onChange={(event) => setSelectedDatasetId(event.target.value)}
            disabled={activeDatasets.length === 0}
          >
            {activeDatasets.length === 0 ? (
              <option value="">No active datasets yet</option>
            ) : (
              activeDatasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {formatDatasetOption(dataset)}
                </option>
              ))
            )}
          </select>
        </div>

        {selectedDataset ? (
          <section className="assistant-dataset-manager" aria-label="Active dataset details">
            <div className="assistant-dataset-summary">
              <div>
                <p className="policy-label">Active Dataset Details</p>
                <h3>{selectedDataset.title}</h3>
              </div>
              <span>{selectedDataset.policyCount} policies</span>
            </div>

            <dl className="assistant-dataset-meta">
              <div>
                <dt>Source</dt>
                <dd>{formatDatasetSource(selectedDataset)}</dd>
              </div>
              {selectedDataset.sourceUrl ? (
                <div>
                  <dt>URL</dt>
                  <dd>{selectedDataset.sourceUrl}</dd>
                </div>
              ) : null}
              <div>
                <dt>Imported</dt>
                <dd>{new Date(selectedDataset.uploadedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>File</dt>
                <dd>{selectedDataset.filename}</dd>
              </div>
            </dl>

            <form className="assistant-dataset-title-form" onSubmit={handleDatasetTitleSave}>
              <label htmlFor="active-dataset-title" className="policy-label">
                Rename Dataset
              </label>
              <div>
                <input
                  id="active-dataset-title"
                  type="text"
                  value={selectedDatasetTitleDraft}
                  onChange={(event) => setSelectedDatasetTitleDraft(event.target.value)}
                  maxLength={160}
                  required
                />
                <button
                  type="submit"
                  className="assistant-auth-toggle"
                  disabled={
                    isDatasetTitleSaving ||
                    selectedDatasetTitleDraft.trim() === selectedDataset.title
                  }
                >
                  {isDatasetTitleSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>

            <div className="assistant-dataset-actions">
              <a
                className="assistant-auth-toggle assistant-view-library-link"
                href={`/policy-assistant/library/policies/${selectedDataset.id}`}
                target="_blank"
                rel="noreferrer"
              >
                View Full Policies
              </a>
              <button
                type="button"
                className="assistant-auth-toggle"
                onClick={() => handleDatasetArchive(selectedDataset, true)}
                disabled={busyDatasetId === selectedDataset.id}
              >
                Archive Dataset
              </button>
              <button
                type="button"
                className="assistant-danger-button"
                onClick={() => handleDatasetDelete(selectedDataset)}
                disabled={busyDatasetId === selectedDataset.id}
              >
                Delete Permanently
              </button>
            </div>
          </section>
        ) : null}

        {archivedDatasets.length > 0 ? (
          <details className="assistant-archived-datasets">
            <summary>Archived Datasets ({archivedDatasets.length})</summary>
            <ul>
              {archivedDatasets.map((dataset) => (
                <li key={dataset.id}>
                  <div>
                    <strong>{dataset.title}</strong>
                    <span>
                      {dataset.policyCount} policies | Archived{" "}
                      {new Date(dataset.archivedAt ?? dataset.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="assistant-auth-toggle"
                      onClick={() => handleDatasetArchive(dataset, false)}
                      disabled={busyDatasetId === dataset.id}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="assistant-danger-button"
                      onClick={() => handleDatasetDelete(dataset)}
                      disabled={busyDatasetId === dataset.id}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
          </>
        ) : null}

        {kbTab === "student" ? (
          <>
        <section className="assistant-handbook-list" aria-label="Student handbook versions">
          <p className="policy-label">Active Student Handbook Versions</p>
          {activeStudentHandbookDocuments.length === 0 ? (
            <p className="small-muted">No active student handbook versions uploaded yet.</p>
          ) : (
            <div className="assistant-handbook-versions">
              {activeStudentHandbookDocuments.map((document) => (
                <article className="assistant-handbook-version" key={document.id}>
                  <div className="assistant-handbook-version-summary">
                    <div>
                      <h3>{document.title}</h3>
                      <p>{document.filename}</p>
                    </div>
                    <span>{document.chunkCount} excerpts</span>
                  </div>
                  <p className="assistant-handbook-version-meta">
                    Uploaded {new Date(document.uploadedAt).toLocaleString()}
                  </p>
                  <form
                    className="assistant-handbook-title-form"
                    onSubmit={(event) => handleHandbookTitleSave(event, document)}
                  >
                    <label htmlFor={`handbook-title-${document.id}`} className="policy-label">
                      Rename Version
                    </label>
                    <div>
                      <input
                        id={`handbook-title-${document.id}`}
                        type="text"
                        value={handbookTitleDrafts[document.id] ?? document.title}
                        onChange={(event) =>
                          setHandbookTitleDrafts((previous) => ({
                            ...previous,
                            [document.id]: event.target.value,
                          }))
                        }
                        maxLength={160}
                        required
                      />
                      <button
                        type="submit"
                        className="assistant-auth-toggle"
                        disabled={
                          busyHandbookDocumentId === document.id ||
                          (handbookTitleDrafts[document.id] ?? document.title).trim() ===
                            document.title
                        }
                      >
                        Save
                      </button>
                    </div>
                  </form>
                  <div className="assistant-handbook-version-actions">
                    <a
                      className="assistant-auth-toggle assistant-view-library-link"
                      href={`/policy-assistant/library/handbooks/${document.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Handbook
                    </a>
                    <button
                      type="button"
                      className="assistant-auth-toggle"
                      onClick={() => handleHandbookArchive(document, true)}
                      disabled={busyHandbookDocumentId === document.id}
                    >
                      Archive Version
                    </button>
                    <button
                      type="button"
                      className="assistant-danger-button"
                      onClick={() => handleHandbookDelete(document)}
                      disabled={busyHandbookDocumentId === document.id}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
          </>
        ) : null}

        {kbTab === "staff" ? (
          <>
        <section className="assistant-handbook-list" aria-label="Staff handbook versions">
          <p className="policy-label">Active Staff Handbook Versions</p>
          {activeStaffHandbookDocuments.length === 0 ? (
            <p className="small-muted">No active staff handbook versions uploaded yet.</p>
          ) : (
            <div className="assistant-handbook-versions">
              {activeStaffHandbookDocuments.map((document) => (
                <article className="assistant-handbook-version" key={document.id}>
                  <div className="assistant-handbook-version-summary">
                    <div>
                      <h3>{document.title}</h3>
                      <p>{document.filename}</p>
                    </div>
                    <span>{document.chunkCount} excerpts</span>
                  </div>
                  <p className="assistant-handbook-version-meta">
                    Uploaded {new Date(document.uploadedAt).toLocaleString()}
                  </p>
                  <form
                    className="assistant-handbook-title-form"
                    onSubmit={(event) => handleHandbookTitleSave(event, document)}
                  >
                    <label htmlFor={`handbook-title-${document.id}`} className="policy-label">
                      Rename Version
                    </label>
                    <div>
                      <input
                        id={`handbook-title-${document.id}`}
                        type="text"
                        value={handbookTitleDrafts[document.id] ?? document.title}
                        onChange={(event) =>
                          setHandbookTitleDrafts((previous) => ({
                            ...previous,
                            [document.id]: event.target.value,
                          }))
                        }
                        maxLength={160}
                        required
                      />
                      <button
                        type="submit"
                        className="assistant-auth-toggle"
                        disabled={
                          busyHandbookDocumentId === document.id ||
                          (handbookTitleDrafts[document.id] ?? document.title).trim() ===
                            document.title
                        }
                      >
                        Save
                      </button>
                    </div>
                  </form>
                  <div className="assistant-handbook-version-actions">
                    <a
                      className="assistant-auth-toggle assistant-view-library-link"
                      href={`/policy-assistant/library/handbooks/${document.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Handbook
                    </a>
                    <button
                      type="button"
                      className="assistant-auth-toggle"
                      onClick={() => handleHandbookArchive(document, true)}
                      disabled={busyHandbookDocumentId === document.id}
                    >
                      Archive Version
                    </button>
                    <button
                      type="button"
                      className="assistant-danger-button"
                      onClick={() => handleHandbookDelete(document)}
                      disabled={busyHandbookDocumentId === document.id}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
          </>
        ) : null}

        {archivedHandbookDocuments.length > 0 ? (
          <details className="assistant-archived-handbooks">
            <summary>Archived Handbook Versions ({archivedHandbookDocuments.length})</summary>
            <ul>
              {archivedHandbookDocuments.map((document) => (
                <li key={document.id}>
                  <div>
                    <strong>{document.title}</strong>
                    <span>
                      {formatHandbookTypeLabel(document.handbookType)} | {document.chunkCount} excerpts
                    </span>
                  </div>
                  <div>
                    <span>
                      Archived{" "}
                      {new Date(document.archivedAt ?? document.uploadedAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      className="assistant-auth-toggle"
                      onClick={() => handleHandbookArchive(document, false)}
                      disabled={busyHandbookDocumentId === document.id}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="assistant-danger-button"
                      onClick={() => handleHandbookDelete(document)}
                      disabled={busyHandbookDocumentId === document.id}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="assistant-feedback-stack" aria-live="polite">
          {policyImportStatus ? <p className="policy-status">{policyImportStatus}</p> : null}
          {policyImportError ? <p className="policy-error">{policyImportError}</p> : null}
          {policyImportSummary ? (
            <p className="small-muted">
              Source: {policyImportSummary.platformLabel} | {policyImportSummary.sourceCount}{" "}
              {policyImportSummary.sourceLabel}
              {policyImportSummary.failedCount > 0
                ? ` | ${policyImportSummary.failedCount} skipped`
                : ""}
            </p>
          ) : null}
          {uploadStatus ? <p className="policy-status">{uploadStatus}</p> : null}
          {uploadError ? <p className="policy-error">{uploadError}</p> : null}
          {datasetStatus ? <p className="policy-status">{datasetStatus}</p> : null}
          {datasetError ? <p className="policy-error">{datasetError}</p> : null}
          {studentHandbookStatus ? <p className="policy-status">{studentHandbookStatus}</p> : null}
          {studentHandbookError ? <p className="policy-error">{studentHandbookError}</p> : null}
          {staffHandbookStatus ? <p className="policy-status">{staffHandbookStatus}</p> : null}
          {staffHandbookError ? <p className="policy-error">{staffHandbookError}</p> : null}
          {handbookManagementStatus ? (
            <p className="policy-status">{handbookManagementStatus}</p>
          ) : null}
          {handbookManagementError ? <p className="policy-error">{handbookManagementError}</p> : null}
        </div>
      </section>

      <section className="panel assistant-chat-panel assistant-panel">
        <div className="assistant-panel-header assistant-panel-header-tight">
          <div>
            <h2 className="section-title">Policy Assistant</h2>
            <p className="assistant-panel-kicker">
              Confidential, account-scoped guidance aligned to your uploaded policies, student handbooks, and staff handbooks.
            </p>
          </div>
        </div>

        <label htmlFor="conversation-select" className="policy-label assistant-conversation-label">
          Conversation History
        </label>

        <div className="assistant-conversation-row">
          <div className="assistant-conversation-picker">
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

        <div className="assistant-feedback-stack" aria-live="polite">
          {isConversationLoading ? <p className="small-muted">Loading conversation history...</p> : null}
          {conversationError ? <p className="policy-error">{conversationError}</p> : null}
        </div>

        <div className="assistant-message-shell">
          <div className="assistant-message-list" ref={messageListRef}>
            {isConversationLoading ? (
              <div className="assistant-loading-list" aria-hidden="true">
                <div className="assistant-skeleton skeleton-bubble skeleton-bubble-user" />
                <div className="assistant-skeleton skeleton-bubble skeleton-bubble-assistant" />
                <div className="assistant-skeleton skeleton-bubble skeleton-bubble-assistant skeleton-short" />
              </div>
            ) : conversationGroups.length === 0 ? (
              <div className="assistant-empty-state">
                <span className="assistant-empty-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="26"
                    height="26"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.45L3 21l2.05-5.4A8.5 8.5 0 1 1 21 11.5z" />
                  </svg>
                </span>
                {activeDatasets.length === 0 ? (
                  <>
                    <h3 className="assistant-empty-title">Add your district policies to begin</h3>
                    <p className="assistant-empty-text">
                      Use the District Knowledge Base on the left to add a policy set and your
                      student and staff handbooks. Once they&rsquo;re in, ask a scenario question
                      here.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="assistant-empty-title">How can I help today?</h3>
                    <p className="assistant-empty-text">
                      Describe a real situation and I&rsquo;ll ground the guidance in your uploaded
                      policies and handbooks. Try one to start:
                    </p>
                    <div className="assistant-empty-prompts">
                      {EXAMPLE_SCENARIOS.map((text) => (
                        <button
                          type="button"
                          key={text}
                          className="assistant-empty-prompt"
                          onClick={() => handleExamplePrompt(text)}
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {!isConversationLoading &&
              conversationGroups.map(({ message, items }) => {
              if (message.role === "user") {
                return (
                  <article
                    key={message.id}
                    className="assistant-message assistant-message-user"
                  >
                    <div className="assistant-message-body">{message.content.trim()}</div>
                  </article>
                );
              }

              const generalItems = items.filter((item) => item.kind === "general");
              const policyItems = items.filter((item) => item.kind === "policy");
              const handbookItems = items.filter((item) => item.kind === "handbook");
              const actionItems = items.filter((item) => item.kind === "action");
              const implicationItems = items.filter((item) => item.kind === "implications");
              const disclaimerItems = items.filter((item) => item.kind === "disclaimer");
              const evidence = message.answerEvidence;
              const handbookExcerptCount = evidence ? countHandbookEvidenceExcerpts(evidence) : 0;

              return (
                <article
                  key={message.id}
                  className="assistant-message assistant-message-assistant assistant-answer-card"
                >
                  <p className="assistant-message-role">Policy IQ</p>

                  {generalItems.map((item) => (
                    <div key={item.id} className="assistant-message-body answer-lead">
                      {item.content}
                    </div>
                  ))}

                  {policyItems.length > 0 ? (
                    <section className="answer-section">
                      <h4 className="answer-section-title">Relevant Policies</h4>
                      <div className="answer-section-items">
                        {policyItems.map((item) => (
                          <div key={item.id} className="answer-item">
                            {renderReferenceOrBody(item)}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {handbookItems.length > 0 ? (
                    <section className="answer-section">
                      <h4 className="answer-section-title">Handbook Guidance</h4>
                      <div className="answer-section-items">
                        {handbookItems.map((item) => (
                          <div key={item.id} className="answer-item">
                            {renderReferenceOrBody(item)}
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {actionItems.map((item) => (
                    <section key={item.id} className="answer-section">
                      <h4 className="answer-section-title">Action Steps</h4>
                      <div className="assistant-message-body">
                        {stripLeadingSectionLabel(item.content)}
                      </div>
                    </section>
                  ))}

                  {implicationItems.map((item) => (
                    <section key={item.id} className="answer-section">
                      <h4 className="answer-section-title">Implications</h4>
                      <div className="assistant-message-body">
                        {stripLeadingSectionLabel(item.content)}
                      </div>
                    </section>
                  ))}

                  {disclaimerItems.map((item) => (
                    <p key={item.id} className="answer-disclaimer">
                      {item.content}
                    </p>
                  ))}

                  {evidence ? (
                    <details className="answer-sources">
                      <summary>
                        Sources used
                        <span>
                          {evidence.policyMatches.length} policy{" "}
                          {evidence.policyMatches.length === 1 ? "match" : "matches"}
                          {" · "}
                          {handbookExcerptCount} handbook{" "}
                          {handbookExcerptCount === 1 ? "excerpt" : "excerpts"}
                        </span>
                      </summary>
                      {evidence.policyMatches.length > 0 ? (
                        <div className="answer-sources-group">
                          <p className="answer-sources-group-label">
                            Policies — {evidence.policyDataset.title}
                          </p>
                          <ul>
                            {evidence.policyMatches.map((match) => (
                              <li key={`${message.id}-src-policy-${match.id}`}>
                                {[match.policyCode, match.policyTitle]
                                  .filter(Boolean)
                                  .join(" — ") || "Policy"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {evidence.handbookVersions.length > 0 ? (
                        <div className="answer-sources-group">
                          <p className="answer-sources-group-label">Handbooks</p>
                          <ul>
                            {evidence.handbookVersions.map((version) => (
                              <li key={`${message.id}-src-hb-${version.id}`}>
                                {version.title}{" "}
                                <span>
                                  {formatHandbookTypeLabel(version.handbookType)} {"·"}{" "}
                                  {version.matchedExcerpts.length}{" "}
                                  {version.matchedExcerpts.length === 1 ? "excerpt" : "excerpts"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>

          <p className="assistant-context-note">
            Guidance only. Not legal advice. Consult your district attorney for legal interpretation.
          </p>

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
          <p id="scenario-privacy-note" className="small-muted assistant-privacy-notice">
            Protect student and staff privacy: do not include real names or other identifying
            details. Use placeholders such as Student A, Student B, or Teacher C instead.
          </p>
          <textarea
            id="scenario"
            ref={scenarioInputRef}
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            placeholder="Example: A parent has filed a formal complaint alleging their child with special needs is not receiving services required by the IEP."
            rows={5}
            maxLength={8000}
            aria-describedby="scenario-privacy-note"
          />
          <button
            className="action-button policy-button assistant-guidance-button"
            type="submit"
            disabled={isSending}
          >
            {isSending ? "Analyzing..." : "Get Policy-Grounded Guidance"}
          </button>
        </form>

        <div className="assistant-feedback-stack" aria-live="polite">
          {chatError ? <p className="policy-error">{chatError}</p> : null}
        </div>

        {retrievalDebug ? (
          <details className="assistant-debug-panel">
            <summary>Retrieval Debug</summary>
            <p className="small-muted">
              Retrieval mode:{" "}
              <strong>{retrievalDebug.retrievalMode || "lexical (legacy response)"}</strong>
            </p>
            {retrievalDebug.subIssues && retrievalDebug.subIssues.length > 0 ? (
              <div className="assistant-debug-section">
                <p className="policy-label">Detected Sub-Issues</p>
                <ul className="assistant-uploaded-list">
                  {retrievalDebug.subIssues.map((subIssue, index) => (
                    <li key={`sub-issue-${index}`}>{subIssue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="small-muted">
                Sub-issues: none detected (single-issue scenario or decomposition unavailable)
              </p>
            )}
            <p className="small-muted">
              Matched terms:{" "}
              {retrievalDebug.matchedTerms.length > 0
                ? retrievalDebug.matchedTerms.join(", ")
                : "None"}
            </p>
            <p className="small-muted">
              Policy matches: {retrievalDebug.policyCount} | Handbook matches:{" "}
              {retrievalDebug.handbookCount}
            </p>

            <div className="assistant-debug-section">
              <p className="policy-label">Policy Matches</p>
              {retrievalDebug.policyMatches && retrievalDebug.policyMatches.length > 0 ? (
                <ul className="assistant-uploaded-list">
                  {retrievalDebug.policyMatches.map((match) => (
                    <li key={`policy-match-${match.id}`}>
                      [{match.relevanceScore}] {match.policySection || "Section ?"} {match.policyCode || ""} -{" "}
                      {match.policyTitle || "Untitled"}
                      {match.excerpt ? (
                        <span className="assistant-debug-excerpt"> - {match.excerpt}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small-muted">No policy matches returned.</p>
              )}
            </div>

            <div className="assistant-debug-section">
              <p className="policy-label">Handbook Matches</p>
              {retrievalDebug.handbookMatches && retrievalDebug.handbookMatches.length > 0 ? (
                <ul className="assistant-uploaded-list">
                  {retrievalDebug.handbookMatches.map((match) => (
                    <li key={`handbook-match-${match.id}`}>
                      [{match.relevanceScore}] {formatHandbookTypeLabel(match.handbookType)}:{" "}
                      {match.sectionTitle || "General Guidance"}
                      {match.excerpt ? (
                        <span className="assistant-debug-excerpt"> - {match.excerpt}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small-muted">No handbook matches returned.</p>
              )}
            </div>

            {retrievalDebug.semanticComparison ? (
              <div className="assistant-debug-section">
                <p className="policy-label">Semantic Candidates</p>
                <p className="small-muted">
                  Policy candidates: {retrievalDebug.semanticComparison.policyCandidateCount} |
                  Handbook candidates: {retrievalDebug.semanticComparison.handbookCandidateCount}
                </p>

                <div className="assistant-debug-subsection">
                  <p className="policy-label">Semantic Policy Candidates</p>
                  {retrievalDebug.semanticComparison.policyCandidates &&
                  retrievalDebug.semanticComparison.policyCandidates.length > 0 ? (
                    <ul className="assistant-uploaded-list">
                      {retrievalDebug.semanticComparison.policyCandidates.map((candidate) => (
                        <li key={`semantic-policy-${candidate.id}`}>
                          [{formatDebugRank(candidate.semanticScore)}]{" "}
                          {candidate.selectedByCurrentRetrieval ? "selected | " : ""}
                          {candidate.policySection || "Section ?"} {candidate.policyCode || ""} -{" "}
                          {candidate.policyTitle || "Untitled"}
                          {candidate.subIssues.length > 0 ? (
                            <span className="assistant-debug-score-detail">
                              {" "}
                              via: {candidate.subIssues.join(" | ")}
                            </span>
                          ) : null}
                          {candidate.excerpt ? (
                            <span className="assistant-debug-excerpt">
                              {" "}
                              - {candidate.excerpt}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small-muted">No semantic policy candidates returned.</p>
                  )}
                </div>

                <div className="assistant-debug-subsection">
                  <p className="policy-label">Semantic Handbook Candidates</p>
                  {retrievalDebug.semanticComparison.handbookCandidates &&
                  retrievalDebug.semanticComparison.handbookCandidates.length > 0 ? (
                    <ul className="assistant-uploaded-list">
                      {retrievalDebug.semanticComparison.handbookCandidates.map((candidate) => (
                        <li key={`semantic-handbook-${candidate.id}`}>
                          [{formatDebugRank(candidate.semanticScore)}]{" "}
                          {candidate.selectedByCurrentRetrieval ? "selected | " : ""}
                          {formatHandbookTypeLabel(candidate.handbookType)}:{" "}
                          {candidate.sectionTitle || "General Guidance"}
                          {candidate.subIssues.length > 0 ? (
                            <span className="assistant-debug-score-detail">
                              {" "}
                              via: {candidate.subIssues.join(" | ")}
                            </span>
                          ) : null}
                          {candidate.excerpt ? (
                            <span className="assistant-debug-excerpt">
                              {" "}
                              - {candidate.excerpt}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small-muted">No semantic handbook candidates returned.</p>
                  )}
                </div>
              </div>
            ) : null}

            {retrievalDebug.postgresComparison ? (
              <div className="assistant-debug-section">
                <p className="policy-label">Postgres Candidate Comparison</p>
                <p className="small-muted">
                  Query: {retrievalDebug.postgresComparison.query || "None"}
                </p>
                <p className="small-muted">
                  Policy candidates: {retrievalDebug.postgresComparison.policyCandidateCount} |
                  Handbook candidates: {retrievalDebug.postgresComparison.handbookCandidateCount}
                </p>

                <div className="assistant-debug-subsection">
                  <p className="policy-label">Postgres Policy Candidates</p>
                  {retrievalDebug.postgresComparison.policyCandidates &&
                  retrievalDebug.postgresComparison.policyCandidates.length > 0 ? (
                    <ul className="assistant-uploaded-list">
                      {retrievalDebug.postgresComparison.policyCandidates.map((candidate) => (
                        <li key={`postgres-policy-${candidate.id}`}>
                          [{formatDebugRank(candidate.combinedRank)}]{" "}
                          {candidate.selectedByCurrentRetrieval ? "selected | " : ""}
                          {candidate.policySection || "Section ?"} {candidate.policyCode || ""} -{" "}
                          {candidate.policyTitle || "Untitled"}
                          <span className="assistant-debug-score-detail">
                            {" "}
                            FTS {formatDebugRank(candidate.fullTextRank)} | Trigram{" "}
                            {formatDebugRank(candidate.trigramScore)}
                          </span>
                          {candidate.excerpt ? (
                            <span className="assistant-debug-excerpt">
                              {" "}
                              - {candidate.excerpt}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small-muted">No Postgres policy candidates returned.</p>
                  )}
                </div>

                <div className="assistant-debug-subsection">
                  <p className="policy-label">Postgres Handbook Candidates</p>
                  {retrievalDebug.postgresComparison.handbookCandidates &&
                  retrievalDebug.postgresComparison.handbookCandidates.length > 0 ? (
                    <ul className="assistant-uploaded-list">
                      {retrievalDebug.postgresComparison.handbookCandidates.map((candidate) => (
                        <li key={`postgres-handbook-${candidate.id}`}>
                          [{formatDebugRank(candidate.combinedRank)}]{" "}
                          {candidate.selectedByCurrentRetrieval ? "selected | " : ""}
                          {formatHandbookTypeLabel(candidate.handbookType)}:{" "}
                          {candidate.sectionTitle || "General Guidance"}
                          <span className="assistant-debug-score-detail">
                            {" "}
                            FTS {formatDebugRank(candidate.fullTextRank)} | Trigram{" "}
                            {formatDebugRank(candidate.trigramScore)}
                          </span>
                          {candidate.excerpt ? (
                            <span className="assistant-debug-excerpt">
                              {" "}
                              - {candidate.excerpt}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small-muted">No Postgres handbook candidates returned.</p>
                  )}
                </div>
              </div>
            ) : null}
          </details>
        ) : null}
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
          await loadWorkspaceData();
        }
      } else {
        setAuthUser(null);
        setDatasets([]);
        setHandbookDocuments([]);
        setSelectedDatasetId("");
        setConversations([]);
        setSelectedConversationId("");
        setMessages([]);
        setScenario("");
        setUploadFile(null);
        setPolicyImportUrl("");
        setPolicyImportPlatform("auto");
        setPolicyImportIncludeAllBooks(false);
        setPolicyImportStatus("");
        setPolicyImportError("");
        setPolicyImportPreview(null);
        setPolicyImportSummary(null);
        setStudentHandbookFile(null);
        setStaffHandbookFile(null);
        setUploadStatus("");
        setUploadError("");
        setStudentHandbookStatus("");
        setStudentHandbookError("");
        setStaffHandbookStatus("");
        setStaffHandbookError("");
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

  async function loadHandbookDocuments(): Promise<void> {
    setStudentHandbookError("");
    setStaffHandbookError("");

    try {
      const response = await fetch("/api/policy-assistant/handbooks", {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        documents?: HandbookDocument[];
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        return;
      }

      if (response.status === 403) {
        const message = payload.error ?? "Please verify your email before loading handbook documents.";
        setStudentHandbookError(message);
        setStaffHandbookError(message);
        return;
      }

      if (!response.ok || !Array.isArray(payload.documents)) {
        throw new Error(payload.error ?? "Could not load handbook documents.");
      }

      setHandbookDocuments(payload.documents);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load handbook documents.";
      setStudentHandbookError(message);
      setStaffHandbookError(message);
    }
  }

  async function loadWorkspaceData(): Promise<void> {
    await Promise.all([loadDatasets(), loadHandbookDocuments()]);
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
        setRetrievalDebug(null);
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
        setRetrievalDebug(null);
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
      setRetrievalDebug(null);
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
        setRetrievalDebug(null);
        return;
      }

      if (response.status === 404) {
        setConversations((previous) =>
          previous.filter((conversation) => conversation.id !== conversationId),
        );
        setSelectedConversationId("");
        setMessages([]);
        setRetrievalDebug(null);
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
          answerEvidence: message.answerEvidence,
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
    setHandbookDocuments([]);
    setSelectedDatasetId("");
    setConversations([]);
    setSelectedConversationId("");
    setMessages([]);
    setRetrievalDebug(null);
    setScenario("");
    setUploadFile(null);
    setPolicyImportUrl("");
    setPolicyImportDatasetTitle("");
    setPolicyImportPlatform("auto");
    setPolicyImportIncludeAllBooks(false);
    setPolicyImportStatus("");
    setPolicyImportError("");
    setPolicyImportPreview(null);
    setPolicyImportSummary(null);
    setUploadDatasetTitle("");
    setStudentHandbookFile(null);
    setStaffHandbookFile(null);
    setStudentHandbookTitle("");
    setStaffHandbookTitle("");
    setUploadStatus("");
    setUploadError("");
    setDatasetStatus("");
    setDatasetError("");
    setSelectedDatasetTitleDraft("");
    setStudentHandbookStatus("");
    setStudentHandbookError("");
    setStaffHandbookStatus("");
    setStaffHandbookError("");
    setHandbookManagementStatus("");
    setHandbookManagementError("");
    setHandbookTitleDrafts({});
    setChatError("");
    setConversationError("");
    setAuthInfo("");
    setAuthMode("login");
    setAuthEmail("");
    setAuthPassword("");
    setAuthDistrictName("");
    setResetToken("");
  }
}

function buildClientId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

function buildPolicyImportQualityMessages(quality: PolicyImportQuality): string[] {
  const messages: string[] = [];

  if (quality.missingTitleCount > 0) {
    messages.push(`${quality.missingTitleCount} row(s) are missing a policy title.`);
  }

  if (quality.missingCodeCount > 0) {
    messages.push(`${quality.missingCodeCount} row(s) are missing a policy code.`);
  }

  if (quality.missingWordingCount > 0) {
    messages.push(`${quality.missingWordingCount} row(s) are missing policy wording.`);
  }

  if (quality.duplicateCodeCount > 0) {
    messages.push(`${quality.duplicateCodeCount} policy code(s) appear more than once.`);
  }

  return messages;
}

function expandChatMessage(message: ChatMessage, selectedDatasetId: string): RenderedChatBubble[] {
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
        answerEvidence: message.answerEvidence,
      },
    ];
  }

  return sections.map((section, index) => {
    let label = "Assistant";
    const referenceCard =
      section.kind === "policy" || section.kind === "handbook"
        ? buildReferenceCard(section, selectedDatasetId)
        : undefined;

    if (section.kind === "policy") {
      label = referenceCard?.label ?? "Policy";
    } else if (section.kind === "handbook") {
      label = referenceCard?.label ?? formatHandbookBubbleLabel(section.content);
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
      answerEvidence: index === 0 ? message.answerEvidence : null,
      referenceCard,
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
  const handbookBlocks: string[][] = [];
  const preface: string[] = [];
  const actionLines: string[] = [];
  const implicationsLines: string[] = [];
  let currentPolicy: string[] = [];
  let currentHandbook: string[] = [];
  let mode: "preface" | "policy" | "handbook" | "action" | "implications" = "preface";

  for (const rawLine of bodyText.split("\n")) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (!trimmed) {
      if (mode === "policy" && currentPolicy.length > 0) {
        currentPolicy.push("");
      } else if (mode === "handbook" && currentHandbook.length > 0) {
        currentHandbook.push("");
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

    if (isRelevantHandbookHeading(trimmed)) {
      if (mode === "policy" && currentPolicy.length > 0) {
        policyBlocks.push(currentPolicy);
        currentPolicy = [];
      }
      mode = "handbook";
      continue;
    }

    if (isActionStepsHeading(trimmed)) {
      if (currentPolicy.length > 0) {
        policyBlocks.push(currentPolicy);
        currentPolicy = [];
      }
      if (currentHandbook.length > 0) {
        handbookBlocks.push(currentHandbook);
        currentHandbook = [];
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
      if (currentHandbook.length > 0) {
        handbookBlocks.push(currentHandbook);
        currentHandbook = [];
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

    if (isHandbookSectionLine(trimmed)) {
      if (mode === "handbook" && currentHandbook.length > 0) {
        handbookBlocks.push(currentHandbook);
        currentHandbook = [];
      }
      mode = "handbook";
      currentHandbook.push(cleanSectionLine(trimmed));
      continue;
    }

    if (mode === "policy") {
      currentPolicy.push(line);
      continue;
    }

    if (mode === "handbook") {
      if (
        /^no matching handbook guidance found\.?$/i.test(trimmed) &&
        (currentHandbook.length > 0 || handbookBlocks.length > 0)
      ) {
        continue;
      }
      currentHandbook.push(line);
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

  if (currentHandbook.length > 0) {
    handbookBlocks.push(currentHandbook);
  }

  const sections: AssistantMessageSection[] = [];
  const prefaceText = preface.join("\n").trim();
  if (prefaceText) {
    sections.push({ kind: "general", content: prefaceText });
  }

  for (const block of policyBlocks) {
    const blockText = block.join("\n").trim();
    if (isSubstantivePolicyBlock(blockText)) {
      sections.push({ kind: "policy", content: blockText });
    }
  }

  for (const block of handbookBlocks) {
    const blockText = block.join("\n").trim();
    if (isSubstantiveHandbookBlock(blockText)) {
      sections.push({ kind: "handbook", content: blockText });
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

function isRelevantHandbookHeading(line: string): boolean {
  const normalized = normalizeHeading(line);
  return (
    normalized === "relevant handbook guidance" ||
    normalized === "relevant handbook guidance:" ||
    normalized === "relevant student handbook guidance" ||
    normalized === "relevant student handbook guidance:" ||
    normalized === "relevant staff handbook guidance" ||
    normalized === "relevant staff handbook guidance:"
  );
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

function isHandbookSectionLine(line: string): boolean {
  return /^(?:[-*]\s*)?handbook section\s*:/i.test(line);
}

function cleanSectionLine(line: string): string {
  return line.replace(/^(?:[-*]\s*)?/, "").replace(/\*\*/g, "").trim();
}

function normalizeHeading(line: string): string {
  return line.replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "").trim().toLowerCase();
}

function stripLeadingSectionLabel(content: string): string {
  return content
    .replace(/^\s*(?:\*\*)?\s*Action Steps\s*:?\s*(?:\*\*)?\s*\n?/i, "")
    .replace(
      /^\s*(?:\*\*)?\s*Legal,\s*Ethical,\s*and\s*Academic Implications\s*:?\s*(?:\*\*)?\s*\n?/i,
      "",
    )
    .trim();
}

function isSubstantivePolicyBlock(blockText: string): boolean {
  if (!blockText) {
    return false;
  }

  if (!/policy wording\s*:/i.test(blockText) && !/policy title\s*:/i.test(blockText)) {
    return false;
  }

  return blockText.replace(/\s+/g, "").length > 40;
}

function isSubstantiveHandbookBlock(blockText: string): boolean {
  if (!blockText) {
    return false;
  }

  if (blockText.toLowerCase() === "no matching handbook guidance found.") {
    return false;
  }

  if (!/handbook guidance\s*:/i.test(blockText)) {
    return false;
  }

  return blockText.replace(/\s+/g, "").length > 40;
}

function buildReferenceCard(
  section: AssistantMessageSection,
  selectedDatasetId: string,
): ReferenceCard | undefined {
  if (section.kind === "policy") {
    return buildPolicyReferenceCard(section.content, selectedDatasetId);
  }

  if (section.kind === "handbook") {
    return buildHandbookReferenceCard(section.content);
  }

  return undefined;
}

function buildPolicyReferenceCard(content: string, selectedDatasetId: string): ReferenceCard | undefined {
  const fields = parseReferenceFields(content);
  const policyTitle = fields.get("policy title") ?? "";
  const policyCode = fields.get("policy code") ?? "";
  const policyWording = normalizeReferenceSummary(fields.get("policy wording") ?? "");

  if (!policyTitle && !policyCode && !policyWording) {
    return undefined;
  }

  const title = [policyCode, policyTitle].filter(Boolean).join(" - ") || "District Policy";

  return {
    label: "Policy",
    title,
    compactSummary: truncateReferenceSummary(policyWording || "No summary provided."),
    summary: policyWording || "No summary provided.",
    summaryLabel: "Brief Summary",
    detailButtonLabel: "Show full policy",
    fullTextLabel: "Full Policy Wording",
    metadata: [
      buildReferenceField("Policy Section", fields.get("policy section")),
      buildReferenceField("Adopted", fields.get("date of policy adoption date")),
      buildReferenceField("Revised", fields.get("date of policy revision date")),
      buildReferenceField("Status", fields.get("policy status")),
    ].filter(isReferenceField),
    lookup:
      selectedDatasetId && (policyCode || policyTitle)
        ? {
            kind: "policy",
            datasetId: selectedDatasetId,
            policyCode,
            policyTitle,
          }
        : undefined,
  };
}

function buildHandbookReferenceCard(content: string): ReferenceCard | undefined {
  const fields = parseReferenceFields(content);
  const sectionTitle = fields.get("handbook section") ?? "";
  const handbookGuidance = normalizeReferenceSummary(fields.get("handbook guidance") ?? "");
  const handbookType = extractHandbookType(content);

  if (!sectionTitle && !handbookGuidance) {
    return undefined;
  }

  const isNoMatch = /^no matching .*handbook guidance$/i.test(sectionTitle);

  return {
    label:
      handbookType === "staff"
        ? "Staff Handbook"
        : handbookType === "student"
          ? "Student Handbook"
          : "Handbook",
    title: sectionTitle || "Handbook Guidance",
    compactSummary: truncateReferenceSummary(handbookGuidance || "No summary provided."),
    summary: handbookGuidance || "No summary provided.",
    summaryLabel: "Brief Summary",
    detailButtonLabel: "Show full guidance",
    fullTextLabel: "Full Handbook Guidance",
    metadata: [
      buildReferenceField(
        "Handbook Type",
        handbookType === "staff"
          ? "Staff Handbook"
          : handbookType === "student"
            ? "Student Handbook"
            : null,
      ),
    ].filter(isReferenceField),
    lookup:
      !isNoMatch && handbookType && sectionTitle
        ? {
            kind: "handbook",
            handbookType,
            sectionTitle,
          }
        : undefined,
  };
}

function parseReferenceFields(content: string): Map<string, string> {
  const fields = new Map<string, string>();
  let currentField = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = line.match(
      /^(Policy Section|Policy Code|Date of Policy Adoption Date|Date of Policy Revision Date|Policy Status|Policy Title|Policy Wording|Handbook Section|Handbook Guidance|Handbook Type)\s*:\s*(.*)$/i,
    );

    if (match) {
      currentField = match[1].trim().toLowerCase();
      fields.set(currentField, match[2].trim());
      continue;
    }

    if (!currentField) {
      continue;
    }

    const previous = fields.get(currentField) ?? "";
    fields.set(currentField, `${previous}\n${line}`.trim());
  }

  return fields;
}

function normalizeReferenceSummary(value: string): string {
  return value
    .replace(/^This is a summary of the handbook guidance:\s*/i, "")
    .replace(/^This is a summary of the policy:\s*/i, "")
    .replace(/\s*This is a summary of the handbook guidance\.?$/i, "")
    .replace(/\s*This is a summary of the policy\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateReferenceSummary(value: string, maxLength: number = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxLength);
  const safeBoundary = Math.max(truncated.lastIndexOf(" "), truncated.lastIndexOf("."), truncated.lastIndexOf(","));
  const summary = safeBoundary > 120 ? truncated.slice(0, safeBoundary) : truncated;
  return `${summary.trim()}...`;
}

function buildReferenceField(label: string, value: string | null | undefined): ReferenceField | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return { label, value: normalized };
}

function isReferenceField(value: ReferenceField | null): value is ReferenceField {
  return Boolean(value);
}

function formatHandbookBubbleLabel(content: string): string {
  const handbookType = extractHandbookType(content);
  if (handbookType === "staff") {
    return "Staff Handbook";
  }

  if (handbookType === "student") {
    return "Student Handbook";
  }

  return "Handbook";
}

function extractHandbookType(content: string): "student" | "staff" | null {
  const match = content.match(/handbook type\s*:\s*(student|staff)/i);
  if (!match) {
    if (
      /\bemployee\b|\bemployees\b|\bstaff\b|\bteacher\b|\bteachers\b|\bfmla\b|\bvacation\b|\bjury duty\b|\bsubpoena\b|\bbereavement\b|\bunion officers?\b/i.test(
        content,
      )
    ) {
      return "staff";
    }

    if (/\bstudent\b|\bstudents\b|\bpupil\b|\bpupils\b|\bparent\b|\bfamily\b/i.test(content)) {
      return "student";
    }

    return null;
  }

  return match[1].toLowerCase() === "staff" ? "staff" : "student";
}

function formatHandbookTypeLabel(handbookType: "student" | "staff"): string {
  return handbookType === "staff" ? "Staff Handbook" : "Student Handbook";
}

function countHandbookEvidenceExcerpts(evidence: PolicyAnswerEvidenceSnapshot): number {
  return evidence.handbookVersions.reduce(
    (total, version) => total + version.matchedExcerpts.length,
    0,
  );
}

function formatDebugRank(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

function formatDatasetOption(dataset: PolicyDataset): string {
  const label = `${dataset.title} (${dataset.policyCount} policies)`;
  if (label.length <= 58) {
    return label;
  }
  return `${label.slice(0, 55)}...`;
}

function formatDatasetSource(dataset: PolicyDataset): string {
  if (dataset.sourceType === "scraper_import") {
    const platform = formatDatasetSourcePlatform(dataset.sourcePlatform);
    return platform ? `Website import - ${platform}` : "Website import";
  }

  return "CSV upload";
}

function formatDatasetSourcePlatform(sourcePlatform: string): string {
  if (sourcePlatform === "boarddocs") {
    return "BoardDocs";
  }

  if (sourcePlatform === "table-link") {
    return "Table-based";
  }

  if (sourcePlatform === "accordion-pdf") {
    return "Accordion + PDF";
  }

  return sourcePlatform.trim();
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
