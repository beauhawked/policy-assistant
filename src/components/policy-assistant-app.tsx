"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  /** Database id of the saved conversation message; stable across reloads. */
  storedId?: number;
  role: "user" | "assistant";
  content: string;
  answerEvidence?: PolicyAnswerEvidenceSnapshot | null;
}

interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleTitle: string;
  profileContext: string;
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

interface LibraryPolicyRecord {
  id: number;
  policySection: string;
  policyCode: string;
  adoptedDate: string;
  revisedDate: string;
  policyStatus: string;
  policyTitle: string;
  policyWording: string;
}

interface EvidenceItem {
  id: string;
  messageId: string;
  label: string;
  title: string;
  quote: string;
  meta: string;
  lookup?: ReferenceLookup;
}

interface PinnedAnswer {
  messageId: number;
  title: string;
  body: string;
  meta: string;
  pinnedAt: string;
  conversationId: string;
}

interface StoredPinnedAnswerPayload {
  messageId: number;
  conversationId: string;
  datasetId: string;
  title: string;
  body: string;
  meta: string;
  createdAt: string;
}

interface DetailView {
  kind: "policy" | "handbook";
  code: string;
  title: string;
  section: string;
  metadata: ReferenceField[];
  bodyText: string;
  relatedText: string;
}

type AuthMode = "login" | "signup" | "forgot" | "reset";
type AppView = "assistant" | "history" | "pinned" | "library" | "policy" | "source" | "help" | "profile";
type SourceTab = "import" | "csv" | "handbook";
type LibraryFilter = "all" | "policies" | "student" | "staff";

const MESSAGE_LIST_NEAR_BOTTOM_PX = 120;
const HIGH_CONTRAST_STORAGE_KEY = "piq-hc";
const TEXT_SIZE_STORAGE_KEY = "piq-textsize";
const REDUCED_MOTION_STORAGE_KEY = "piq-reduced-motion";

type TextSize = "standard" | "large" | "larger";

const TEXT_SIZE_OPTIONS: Array<{ key: TextSize; label: string }> = [
  { key: "standard", label: "Standard" },
  { key: "large", label: "Large" },
  { key: "larger", label: "Larger" },
];

// Retrieval debug is developer instrumentation: visible in local development,
// hidden in production unless explicitly enabled via env flag.
const SHOW_RETRIEVAL_DEBUG =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_RETRIEVAL_DEBUG === "1";

const EXAMPLE_SCENARIOS = [
  "A student is being bullied online by classmates. What does our policy require us to do?",
  "A parent requested their child's education records. What are we required to provide, and how quickly?",
  "A teacher needs extended medical leave mid-semester. What does our staff handbook allow?",
];

const STARTER_PROMPTS = [
  "A student is being bullied online — what must we do?",
  "A parent requested education records — what's the deadline?",
  "A teacher needs extended medical leave mid-semester.",
];

const NAV_ITEMS: Array<{
  key: AppView;
  label: string;
  shortLabel: string;
  paths: string[];
}> = [
  {
    key: "assistant",
    label: "Assistant",
    shortLabel: "Assistant",
    paths: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"],
  },
  {
    key: "history",
    label: "History",
    shortLabel: "History",
    paths: ["M12 8v4l3 2", "M3.05 11a9 9 0 1 1 .5 4"],
  },
  {
    key: "pinned",
    label: "Pinned",
    shortLabel: "Pinned",
    paths: [
      "M12 17l-5.878 3.09 1.123-6.545L2.49 8.91l6.572-.955L12 2l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545Z",
    ],
  },
  {
    key: "library",
    label: "Library",
    shortLabel: "Library",
    paths: [
      "M4 19.5A2.5 2.5 0 0 1 6.5 17H20",
      "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z",
    ],
  },
  {
    key: "source",
    label: "Add source",
    shortLabel: "Add",
    paths: ["M12 5v14", "M5 12h14"],
  },
  {
    key: "help",
    label: "Help",
    shortLabel: "Help",
    paths: [
      "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
      "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3",
      "M12 17h.01",
    ],
  },
];

type HelpTab = "start" | "faq" | "trust";

const HELP_TABS: Array<{ key: HelpTab; label: string }> = [
  { key: "start", label: "Getting started" },
  { key: "faq", label: "FAQ" },
  { key: "trust", label: "Trust and privacy" },
];

const HELP_DOWNLOADS: Array<{ label: string; file: string }> = [
  { label: "Quick-Start Guide (PDF)", file: "/help/Policy-to-Action-Quick-Start-Participants.pdf" },
  { label: "District Setup Guide (PDF)", file: "/help/Policy-to-Action-District-Setup-Guide.pdf" },
  { label: "User Manual (PDF)", file: "/help/Policy-to-Action-User-Manual.pdf" },
  {
    label: "Technical Blueprint for District IT (PDF)",
    file: "/help/Policy-to-Action-Technical-Blueprint.pdf",
  },
];

const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "My verification email has not arrived.",
    a: "Check your spam or quarantine folder; the sender is Policy to Action. You can request a fresh link with Resend verification on the sign-in screen. Some district mail filters take several minutes to release messages.",
  },
  {
    q: "An answer seems generic or cites nothing.",
    a: "Confirm the correct dataset shows as Active in the Library and its health reads Good. Then add specifics to your scenario: what happened, who was involved by role, and the decisions you need to make. Vague questions produce vague citations.",
  },
  {
    q: "The header says 0 sources.",
    a: "No active policy dataset exists yet. A setup administrator should open the Library, select Add source, and import your board policies from your district's policy site or a CSV export.",
  },
  {
    q: "How do I verify an answer before acting on it?",
    a: "Select any citation chip beneath an answer to open the evidence panel, which quotes the exact policy text the answer was grounded in. Open full source shows the complete policy. Policy to Action is decision support, not legal advice; verify consequential decisions against the cited source.",
  },
  {
    q: "Can I save an answer for later?",
    a: "Yes. Select Pin under any answer, or Pin this answer in the evidence panel. Pinned answers are saved to your account with their evidence and appear in the Pinned view from the left rail.",
  },
  {
    q: "How do I keep student information private?",
    a: "Use placeholders such as Student A or a seventh-grade student instead of real names. The reminder under the question box applies to every scenario you write.",
  },
  {
    q: "What happens when our board revises policies?",
    a: "A setup administrator re-imports from your policy site or uploads a fresh CSV, archives the outdated dataset, and sets the new one active. Answers immediately draw from the current manual, and the archived dataset is preserved for your records.",
  },
  {
    q: "Can I print or export an answer?",
    a: "Yes. Printing the page produces a clean document without navigation, suitable for board packets. The full policy reader also offers Print and Download Markdown for entire datasets.",
  },
];

const SOURCE_TABS: Array<{ key: SourceTab; label: string }> = [
  { key: "import", label: "Import from district website" },
  { key: "csv", label: "Upload CSV" },
  { key: "handbook", label: "Upload handbook PDF" },
];

function isMessageListNearBottom(
  element: HTMLDivElement,
  thresholdPx: number = MESSAGE_LIST_NEAR_BOTTOM_PX,
): boolean {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

function RailIcon({ paths }: { paths: string[] }): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

function HealthMark({ good }: { good: boolean }): ReactNode {
  return <span className={`piq-health-mark${good ? " is-good" : " is-warn"}`} aria-hidden="true" />;
}

function FileDropzone({
  id,
  title,
  hint,
  accept,
  glyph,
  file,
  onFile,
}: {
  id: string;
  title: string;
  hint: string;
  accept: string;
  glyph: string;
  file: File | null;
  onFile: (file: File | null) => void;
}): ReactNode {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      onFile(dropped);
    }
  };

  return (
    <label
      htmlFor={id}
      className={`piq-dropzone${isDragging ? " is-dragging" : ""}${file ? " is-filled" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <span className="piq-dropzone-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="piq-dropzone-title">{title}</span>
      <span className="piq-dropzone-hint">{file ? file.name : hint}</span>
      <input
        id={id}
        name="file"
        type="file"
        accept={accept}
        className="piq-dropzone-input"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onFile(event.target.files?.[0] ?? null)
        }
      />
    </label>
  );
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
  // Engaged means the guided setup was started for this user and stays visible
  // through all three steps until finished or skipped, even once data exists.
  const [isSetupEngaged, setIsSetupEngaged] = useState(false);
  const [datasetPolicies, setDatasetPolicies] = useState<Record<string, LibraryPolicyRecord[]>>({});
  const [isPolicyIndexLoading, setIsPolicyIndexLoading] = useState(false);
  const [policyIndexError, setPolicyIndexError] = useState("");
  const [detailView, setDetailView] = useState<DetailView | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState("");

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const drawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedBeforeDrawerRef = useRef<HTMLElement | null>(null);
  const nearBottomRef = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const historyPopRef = useRef(false);

  /* ------------------------------------------- History and swipe-back */
  // Every page change becomes a real browser history entry, so the iOS
  // edge swipe (and the Back button on the web) returns to the previously
  // viewed page, and a forward swipe only works after having gone back.
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
      // Coming back from an in-webview document (such as a PDF) reloads the
      // app; reopen the page the user was actually on instead of the default.
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

  const librarySources = useMemo(
    () => buildLibrarySources(datasets, handbookDocuments, busyDatasetId, busyHandbookDocumentId),
    [datasets, handbookDocuments, busyDatasetId, busyHandbookDocumentId],
  );

  const activeSourceCount =
    activeDatasets.length +
    activeStudentHandbookDocuments.length +
    activeStaffHandbookDocuments.length;

  const policyIndex = selectedDatasetId ? datasetPolicies[selectedDatasetId] : undefined;

  const relatedPolicies = useMemo<LibraryPolicyRecord[]>(() => {
    if (!detailView || detailView.kind !== "policy" || !policyIndex) {
      return [];
    }
    return findRelatedPolicies(detailView, policyIndex);
  }, [detailView, policyIndex]);

  const librarySearchResults = useMemo(() => {
    const query = librarySearchQuery.trim().toLowerCase();
    if (!query || !policyIndex) {
      return [];
    }

    return policyIndex
      .filter((policy) =>
        `${policy.policyCode} ${policy.policyTitle} ${policy.policySection} ${policy.policyWording}`
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 40);
  }, [librarySearchQuery, policyIndex]);

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
    if (!messageList) {
      return;
    }

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
      // Ignore preference read failures.
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
      // Ignore persistence failures.
    }
  }, [textSize]);

  useEffect(() => {
    document.documentElement.classList.toggle("rm", reducedMotion);
    try {
      window.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, reducedMotion ? "1" : "0");
    } catch {
      // Ignore persistence failures.
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

  // Escape dismisses the topmost transient surface: evidence drawer first,
  // then the account menu. Focus is managed by the drawer effect below.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      if (evidenceOpen) {
        setEvidenceOpen(false);
      } else if (isAccountMenuOpen) {
        setIsAccountMenuOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [evidenceOpen, isAccountMenuOpen]);

  // Move focus into the drawer when it opens; return it when it closes.
  useEffect(() => {
    if (evidenceOpen) {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        lastFocusedBeforeDrawerRef.current = active;
      }
      drawerCloseRef.current?.focus();
      return;
    }

    lastFocusedBeforeDrawerRef.current?.focus();
    lastFocusedBeforeDrawerRef.current = null;
  }, [evidenceOpen]);

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
        if (cancelled || !response.ok || !Array.isArray(payload.pins)) {
          return;
        }
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
        // Pin loading is non-critical; leave the list empty on failure.
      } finally {
        if (!cancelled) {
          setIsPinsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser, selectedDatasetId]);

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

    const handleMessageListScroll = (): void => {
      syncMessageListScrollState();
    };

    handleMessageListScroll();
    messageList.addEventListener("scroll", handleMessageListScroll, { passive: true });
    return () => {
      messageList.removeEventListener("scroll", handleMessageListScroll);
    };
  }, [syncMessageListScrollState, view]);

  useEffect(() => {
    setEvidenceOpen(false);
    setActiveEvidence(null);
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

  useEffect(() => {
    if (
      (view !== "library" && view !== "policy") ||
      !selectedDatasetId ||
      datasetPolicies[selectedDatasetId]
    ) {
      return;
    }

    void loadDatasetPolicies(selectedDatasetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedDatasetId]);

  useEffect(() => {
    if (isSetupEngaged && activeDatasets.length > 0 && setupStep === 1) {
      setSetupStep(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDatasets.length, isSetupEngaged]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) {
      return;
    }

    composer.style.height = "auto";
    composer.style.height = `${Math.min(composer.scrollHeight, 180)}px`;
  }, [scenario, view]);

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

    if (authMode === "signup" && !authFirstName.trim()) {
      setAuthError("First name is required.");
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
          firstName: authMode === "signup" ? authFirstName.trim() : undefined,
          lastName: authMode === "signup" ? authLastName.trim() : undefined,
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
      setAuthFirstName("");
      setAuthLastName("");
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
      setStudentHandbookError("");
      setStudentHandbookStatus("");
      setStaffHandbookError("");
      setStaffHandbookStatus("");
      setHandbookManagementStatus("");
      setHandbookManagementError("");
      setChatError("");
      setConversationError("");
      setView("assistant");
      setSetupStep(1);
      setIsSetupDismissed(false);
      setIsSetupEngaged(false);

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

  const openProfileView = (): void => {
    setProfileDraftFirst(authUser?.firstName ?? "");
    setProfileDraftLast(authUser?.lastName ?? "");
    setProfileDraftDistrict(authUser?.districtName ?? "");
    setProfileDraftRole(authUser?.roleTitle ?? "");
    setProfileDraftContext(authUser?.profileContext ?? "");
    setProfileError("");
    setProfileStatus("");
    setIsAccountMenuOpen(false);
    setView("profile");
  };

  const handleProfileSave = async (): Promise<void> => {
    const firstNameDraft = profileDraftFirst.trim();
    if (!firstNameDraft) {
      setProfileError("First name is required.");
      return;
    }
    if (!profileDraftDistrict.trim()) {
      setProfileError("District name is required.");
      return;
    }

    setIsSavingProfile(true);
    setProfileError("");
    setProfileStatus("");

    try {
      const response = await fetch("/api/policy-assistant/auth/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: firstNameDraft,
          lastName: profileDraftLast.trim(),
          districtName: profileDraftDistrict.trim(),
          roleTitle: profileDraftRole.trim(),
          profileContext: profileDraftContext.trim(),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        user?: AuthUser;
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        return;
      }

      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? "Could not save your profile.");
      }

      setAuthUser(payload.user);
      setProfileStatus("Profile saved. New answers will use this context.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setIsSavingProfile(false);
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
    setPolicyImportStatus("Scanning the district site and building an import preview...");

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
    setPolicyImportStatus("Importing previewed policies into your Library...");
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

      if (!isSetupActive) {
        setView("library");
      }
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

  const handlePolicyPreviewDownload = (): void => {
    if (!policyImportPreview) {
      return;
    }

    const rows = policyImportPreview.sampleRows.map((row) =>
      [row.policySection, row.policyCode, row.policyTitle, row.policyWordingPreview]
        .map((value) => `"${(value ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = ["Section,Code,Policy Title,Policy Wording", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = policyImportPreview.filename || "policy-preview-sample.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

  const handleDatasetRename = async (dataset: PolicyDataset): Promise<void> => {
    const nextTitle = window.prompt("Rename this source", dataset.title)?.trim();
    if (!nextTitle || nextTitle === dataset.title) {
      return;
    }

    setDatasetError("");
    setDatasetStatus("");
    setBusyDatasetId(dataset.id);

    try {
      const updatedDataset = await patchDataset(dataset.id, { title: nextTitle });
      setDatasets((previous) =>
        previous.map((item) => (item.id === updatedDataset.id ? updatedDataset : item)),
      );
      setDatasetStatus(`Saved title for ${updatedDataset.title}.`);
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : "Could not save dataset title.");
    } finally {
      setBusyDatasetId("");
    }
  };

  const handleDatasetArchive = async (dataset: PolicyDataset, archived: boolean): Promise<void> => {
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
          ? `Archived ${updatedDataset.title}. It is excluded from answers until restored.`
          : `Restored ${updatedDataset.title} to active sources.`,
      );
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : "Could not update dataset archive.");
    } finally {
      setBusyDatasetId("");
    }
  };

  const handleDatasetDelete = async (dataset: PolicyDataset): Promise<void> => {
    const confirmed = window.confirm(
      `Delete "${dataset.title}" permanently? Its policies, embeddings, and saved conversations will be removed and cannot be recovered.`,
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
      setDatasetPolicies((previous) => {
        const next = { ...previous };
        delete next[dataset.id];
        return next;
      });
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
    const response = await fetch(`/api/policy-assistant/datasets/${encodeURIComponent(datasetId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(updates),
    });

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
      const setError = handbookType === "staff" ? setStaffHandbookError : setStudentHandbookError;
      const setStatus = handbookType === "staff" ? setStaffHandbookStatus : setStudentHandbookStatus;
      const setFile = handbookType === "staff" ? setStaffHandbookFile : setStudentHandbookFile;
      const handbookTitle = handbookType === "staff" ? staffHandbookTitle : studentHandbookTitle;
      const setTitle = handbookType === "staff" ? setStaffHandbookTitle : setStudentHandbookTitle;
      const setUploading =
        handbookType === "staff" ? setIsStaffHandbookUploading : setIsStudentHandbookUploading;

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

  const handleHandbookRename = async (document: HandbookDocument): Promise<void> => {
    const nextTitle = window.prompt("Rename this source", document.title)?.trim();
    if (!nextTitle || nextTitle === document.title) {
      return;
    }

    setHandbookManagementError("");
    setHandbookManagementStatus("");
    setBusyHandbookDocumentId(document.id);

    try {
      const updatedDocument = await patchHandbookDocument(document.id, { title: nextTitle });
      setHandbookDocuments((previous) =>
        previous.map((item) => (item.id === updatedDocument.id ? updatedDocument : item)),
      );
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
      `Delete "${document.title}" permanently? Its extracted excerpts and embeddings will be removed and cannot be recovered.`,
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

  const sendScenario = async (text: string): Promise<void> => {
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
      setChatError("Add a policy source in the Library before asking a question.");
      return;
    }

    const trimmedScenario = text.trim();
    if (!trimmedScenario) {
      setChatError("Describe a scenario before sending.");
      return;
    }

    if (isSending) {
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
        messageIds?: { user?: number; assistant?: number };
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
        storedId: payload.messageIds?.assistant,
        role: "assistant",
        content: payload.answer,
        answerEvidence: payload.answerEvidence ?? null,
      };

      setMessages((previous) => [
        ...previous.map((message) =>
          message.id === userMessage.id
            ? { ...message, storedId: payload.messageIds?.user }
            : message,
        ),
        assistantMessage,
      ]);
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

  const handleScenarioSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void sendScenario(scenario);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendScenario(scenario);
    }
  };

  const focusComposer = (): void => {
    // On touch devices, programmatic focus summons the keyboard uninvited and
    // iOS shifts the whole webview upward to make room, wedging the header
    // under the status bar. Only auto-focus where a physical keyboard is likely.
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
      return;
    }
    composerRef.current?.focus();
  };

  const handleStartNewConversation = (): void => {
    setSelectedConversationId("");
    setMessages([]);
    setScenario("");
    setChatError("");
    setConversationError("");
    setRetrievalDebug(null);
    setEvidenceOpen(false);
    setActiveEvidence(null);
    focusComposer();
  };

  const handleConversationOpen = (conversationId: string): void => {
    setSelectedConversationId(conversationId);
    setView("assistant");
  };

  const handleConversationDelete = async (conversation: ConversationSummary): Promise<void> => {
    const confirmed = window.confirm(
      `Delete the conversation "${conversation.title}" permanently? Its questions and answers will be removed and cannot be recovered.`,
    );
    if (!confirmed) {
      return;
    }

    setConversationError("");

    try {
      const response = await fetch(
        `/api/policy-assistant/conversations/${encodeURIComponent(conversation.id)}`,
        { method: "DELETE" },
      );
      if (response.status === 401) {
        clearSessionState();
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string" ? payload.error : "Could not delete conversation.",
        );
      }

      setConversations((previous) => previous.filter((item) => item.id !== conversation.id));
      if (selectedConversationId === conversation.id) {
        setSelectedConversationId("");
        setMessages([]);
        setChatError("");
        setRetrievalDebug(null);
      }
    } catch (error) {
      setConversationError(
        error instanceof Error ? error.message : "Could not delete conversation.",
      );
    }
  };

  const handleNavigate = (nextView: AppView): void => {
    if (nextView === "assistant" && view === "assistant") {
      handleStartNewConversation();
      return;
    }

    setView(nextView);
  };

  const toggleHighContrast = (): void => {
    setHighContrast((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore persistence failures.
      }
      return next;
    });
  };

  const handleChangePassword = async (): Promise<void> => {
    if (!passwordCurrent || !passwordNew) {
      setPasswordError("Enter your current and new passwords.");
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    setPasswordError("");
    setPasswordStatus("");

    try {
      const response = await fetch("/api/policy-assistant/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: passwordCurrent, newPassword: passwordNew }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not change your password.");
      }

      setPasswordCurrent("");
      setPasswordNew("");
      setPasswordConfirm("");
      setPasswordStatus(payload.message ?? "Password updated.");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Could not change your password.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOutOthers = async (): Promise<void> => {
    setSessionsStatus("");
    try {
      const response = await fetch("/api/policy-assistant/auth/sign-out-others", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (response.status === 401) {
        clearSessionState();
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not sign out other sessions.");
      }
      setSessionsStatus(payload.message ?? "Other sessions signed out.");
    } catch (error) {
      setSessionsStatus(
        error instanceof Error ? error.message : "Could not sign out other sessions.",
      );
    }
  };

  const handleExportData = (): void => {
    window.location.assign("/api/policy-assistant/account/export");
  };

  const handleDeleteAccount = async (): Promise<void> => {
    setDeleteError("");

    if (deleteConfirmText.trim() !== "DELETE") {
      setDeleteError("Type DELETE in the confirmation field to proceed.");
      return;
    }
    if (!deletePassword) {
      setDeleteError("Enter your password to confirm deletion.");
      return;
    }

    const confirmed = window.confirm(
      "This permanently deletes your account, your uploaded sources, and every conversation and pinned answer. This cannot be undone. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingAccount(true);
    try {
      const response = await fetch("/api/policy-assistant/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmText.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not delete your account.");
      }
      clearSessionState();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Could not delete your account.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const openEvidence = async (evidence: EvidenceItem): Promise<void> => {
    setActiveEvidence(evidence);
    setEvidenceOpen(true);

    if (evidence.quote || !evidence.lookup) {
      return;
    }

    setIsEvidenceLoading(true);
    try {
      const detail = await fetchReferenceDetail(evidence.lookup);
      setActiveEvidence((previous) =>
        previous && previous.id === evidence.id
          ? {
              ...previous,
              quote: truncateReferenceSummary(detail.bodyText, 320),
              meta: previous.meta || detail.metadata.map((field) => field.value).join(" · "),
            }
          : previous,
      );
    } catch (error) {
      setActiveEvidence((previous) =>
        previous && previous.id === evidence.id
          ? {
              ...previous,
              quote:
                error instanceof Error
                  ? error.message
                  : "The source text could not be loaded right now.",
            }
          : previous,
      );
    } finally {
      setIsEvidenceLoading(false);
    }
  };

  const openReferenceDetail = async (lookup: ReferenceLookup): Promise<void> => {
    setIsEvidenceLoading(true);
    try {
      const detail = await fetchReferenceDetail(lookup);
      const metadata = detail.metadata;
      setDetailView({
        kind: lookup.kind,
        code:
          lookup.kind === "policy"
            ? lookup.policyCode || findMetadataValue(metadata, "Policy Code")
            : formatHandbookTypeLabel(lookup.handbookType),
        title:
          lookup.kind === "policy"
            ? findMetadataValue(metadata, "Policy Title") || lookup.policyTitle
            : lookup.sectionTitle,
        section: lookup.kind === "policy" ? findMetadataValue(metadata, "Section") : "",
        metadata,
        bodyText: detail.bodyText,
        relatedText:
          lookup.kind === "policy"
            ? selectedDataset?.title ?? ""
            : "Handbook guidance excerpt from your uploaded document.",
      });
      setView("policy");
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Could not open the full source right now.",
      );
    } finally {
      setIsEvidenceLoading(false);
    }
  };

  const openLibraryPolicy = (policy: LibraryPolicyRecord): void => {
    setDetailView({
      kind: "policy",
      code: policy.policyCode,
      title: policy.policyTitle || "Untitled policy",
      section: policy.policySection,
      metadata: [
        buildReferenceField("Section", policy.policySection),
        buildReferenceField("Adopted", policy.adoptedDate),
        buildReferenceField("Revised", policy.revisedDate),
        buildReferenceField("Status", policy.policyStatus),
        buildReferenceField("Dataset", selectedDataset?.title),
      ].filter(isReferenceField),
      bodyText: policy.policyWording,
      relatedText: selectedDataset?.title ?? "",
    });
    setView("policy");
  };

  const handleCopyAnswer = async (message: ChatMessage): Promise<void> => {
    try {
      await window.navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(""), 2000);
    } catch {
      setChatError("Your browser blocked clipboard access.");
    }
  };

  const handleTogglePin = async (
    message: ChatMessage,
    question: string,
    summary: string,
    chips: EvidenceItem[],
  ): Promise<void> => {
    if (!authUser) {
      return;
    }

    const messageId = message.storedId;
    if (!messageId) {
      setChatError("This answer is still saving; try pinning again in a moment.");
      return;
    }

    const alreadyPinned = pinnedAnswers.some((pin) => pin.messageId === messageId);

    if (alreadyPinned) {
      await handleUnpin(messageId);
      return;
    }

    const newPin: PinnedAnswer = {
      messageId,
      title: truncateReferenceSummary(question || summary, 90),
      body: truncateReferenceSummary(summary, 200),
      meta: [
        chips
          .slice(0, 2)
          .map((chip) => chip.title)
          .join(" + "),
        `pinned ${formatShortDate(new Date().toISOString())}`,
      ]
        .filter(Boolean)
        .join(" · "),
      pinnedAt: new Date().toISOString(),
      conversationId: selectedConversationId,
    };

    setPinnedAnswers((previous) => [newPin, ...previous]);

    try {
      const response = await fetch("/api/policy-assistant/pins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messageId,
          title: newPin.title,
          body: newPin.body,
          meta: newPin.meta,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not pin the answer.");
      }
    } catch (error) {
      setPinnedAnswers((previous) => previous.filter((pin) => pin.messageId !== messageId));
      setChatError(error instanceof Error ? error.message : "Could not pin the answer.");
    }
  };

  const handleDatasetActivate = (datasetId: string): void => {
    if (datasetId === selectedDatasetId) {
      return;
    }
    setSelectedDatasetId(datasetId);
    setSelectedConversationId("");
    setMessages([]);
    setChatError("");
    setRetrievalDebug(null);
    setEvidenceOpen(false);
    setActiveEvidence(null);
    const activated = datasets.find((dataset) => dataset.id === datasetId);
    setDatasetStatus(activated ? `${activated.title} is now the active policy source.` : "");
  };

  const togglePinForClientMessage = (clientMessageId: string): void => {
    const groupIndex = conversationGroups.findIndex(
      (group) => group.message.id === clientMessageId,
    );
    if (groupIndex < 0) {
      return;
    }

    const { message, items } = conversationGroups[groupIndex];
    const question = findPrecedingQuestion(conversationGroups, groupIndex);
    const prose = items
      .filter((item) => item.kind === "general")
      .map((item) => item.content)
      .join("\n\n");
    const summaries = items
      .filter(
        (item) => (item.kind === "policy" || item.kind === "handbook") && item.referenceCard,
      )
      .map((item) => item.referenceCard?.summary ?? "")
      .filter(Boolean)
      .join(" ");
    const chips = buildEvidenceChips(message, items);

    void handleTogglePin(message, question, prose || summaries, chips);
  };

  const isClientMessagePinned = (clientMessageId: string): boolean => {
    const group = conversationGroups.find((item) => item.message.id === clientMessageId);
    const storedId = group?.message.storedId;
    return Boolean(storedId && pinnedAnswers.some((pin) => pin.messageId === storedId));
  };

  const handleUnpin = async (messageId: number): Promise<void> => {
    if (!authUser) {
      return;
    }

    const removed = pinnedAnswers.find((pin) => pin.messageId === messageId);
    setPinnedAnswers((previous) => previous.filter((pin) => pin.messageId !== messageId));

    try {
      const response = await fetch(`/api/policy-assistant/pins/${messageId}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not remove the pin.");
      }
    } catch (error) {
      if (removed) {
        setPinnedAnswers((previous) => [removed, ...previous]);
      }
      setChatError(error instanceof Error ? error.message : "Could not remove the pin.");
    }
  };

  async function fetchReferenceDetail(lookup: ReferenceLookup): Promise<LoadedReferenceDetail> {
    const query = new URLSearchParams();
    if (lookup.kind === "policy") {
      query.set("kind", "policy");
      query.set("datasetId", lookup.datasetId);
      query.set("policyCode", lookup.policyCode);
      query.set("policyTitle", lookup.policyTitle);
    } else {
      query.set("kind", "handbook");
      query.set("handbookType", lookup.handbookType);
      query.set("sectionTitle", lookup.sectionTitle);
    }

    const response = await fetch(`/api/policy-assistant/reference?${query.toString()}`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: LoadedReferenceDetail;
      error?: string;
    };

    if (!response.ok || !payload.detail) {
      throw new Error(payload.error ?? "Could not load the full source.");
    }

    return payload.detail;
  }

  async function loadDatasetPolicies(datasetId: string): Promise<void> {
    setIsPolicyIndexLoading(true);
    setPolicyIndexError("");

    try {
      const response = await fetch(
        `/api/policy-assistant/datasets/${encodeURIComponent(datasetId)}/policies`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        policies?: LibraryPolicyRecord[];
        error?: string;
      };

      if (response.status === 401) {
        clearSessionState();
        return;
      }

      if (!response.ok || !Array.isArray(payload.policies)) {
        throw new Error(payload.error ?? "Could not load policies for search.");
      }

      setDatasetPolicies((previous) => ({ ...previous, [datasetId]: payload.policies ?? [] }));
    } catch (error) {
      setPolicyIndexError(
        error instanceof Error ? error.message : "Could not load policies for search.",
      );
    } finally {
      setIsPolicyIndexLoading(false);
    }
  }

  const districtName = authUser?.districtName?.trim() || "your district";
  const firstName = authUser?.firstName?.trim() || deriveFirstName(authUser?.email ?? "");
  const initials =
    authUser?.firstName?.trim()
      ? `${authUser.firstName.trim()[0]}${(authUser.lastName?.trim() || authUser.firstName.trim())[0]}`.toUpperCase()
      : deriveInitials(authUser?.email ?? "", authUser?.districtName ?? "");
  const isSetupActive =
    Boolean(authUser?.emailVerifiedAt) && isSetupEngaged && !isSetupDismissed;

  if (isAuthLoading) {
    return (
      <div className="piq-boot" role="status" aria-live="polite">
        <span className="piq-boot-mark" aria-hidden="true">
          <Image src="/logo-icon.png" alt="" width={32} height={27} className="piq-brand-logo" />
        </span>
        <span className="piq-spinner" aria-hidden="true" />
        <p>Checking your workspace session&hellip;</p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- Auth */

  if (!authUser) {
    const authTitle = authTitleForMode(authMode);
    const showPassword = authMode !== "forgot";
    const showEmail = authMode !== "reset";

    return (
      <div className="piq-split">
        <aside className="piq-split-brand">
          <span className="piq-brand">
            <span className="piq-brand-mark" aria-hidden="true">
              <Image src="/logo-icon.png" alt="" width={32} height={27} className="piq-brand-logo" />
            </span>
            <span className="piq-brand-word">Policy to Action</span>
          </span>
          <div className="piq-split-pitch">
            <h1>Every answer, grounded in your district&rsquo;s own policies.</h1>
            <p>
              Add your board policies and handbooks once, then ask scenario questions and get cited,
              actionable guidance.
            </p>
          </div>
          <p className="piq-split-footnote">
            Private to your district · Sources cited on every answer
          </p>
        </aside>

        <div className="piq-split-body">
          <section className="piq-auth-card">
            <h2>{authTitle}</h2>

            <form className="piq-form" onSubmit={handleAuthSubmit}>
              {authMode === "signup" ? (
                <>
                  <div className="piq-field-row">
                    <div className="piq-field">
                      <label htmlFor="auth-first-name">First name</label>
                      <input
                        id="auth-first-name"
                        type="text"
                        autoComplete="given-name"
                        value={authFirstName}
                        onChange={(event) => setAuthFirstName(event.target.value)}
                        placeholder="Jordan"
                        required
                      />
                    </div>
                    <div className="piq-field">
                      <label htmlFor="auth-last-name">Last name</label>
                      <input
                        id="auth-last-name"
                        type="text"
                        autoComplete="family-name"
                        value={authLastName}
                        onChange={(event) => setAuthLastName(event.target.value)}
                        placeholder="Avery"
                      />
                    </div>
                  </div>
                  <div className="piq-field">
                    <label htmlFor="auth-district-name">District name</label>
                    <input
                      id="auth-district-name"
                      type="text"
                      autoComplete="organization"
                      value={authDistrictName}
                      onChange={(event) => setAuthDistrictName(event.target.value)}
                      placeholder="Example: West Lafayette Community School Corporation"
                      required
                    />
                  </div>
                </>
              ) : null}

              {showEmail ? (
                <div className="piq-field">
                  <label htmlFor="auth-email">Work email</label>
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="you@district.org"
                    required
                  />
                </div>
              ) : (
                <p className="piq-note">Reset link verified. Choose a new password below.</p>
              )}

              {showPassword ? (
                <div className="piq-field">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={
                      authMode === "signup" || authMode === "reset"
                        ? "new-password"
                        : "current-password"
                    }
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder={
                      authMode === "reset" ? "Enter your new password" : "Enter your password"
                    }
                    required
                  />
                </div>
              ) : null}

              {authMode === "forgot" ? (
                <p className="piq-note">
                  We&rsquo;ll email a one-time reset link. It expires in 60 minutes.
                </p>
              ) : null}

              <button
                type="submit"
                className="piq-button piq-button-primary piq-button-block"
                data-tip={authButtonLabel(authMode)}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? "Please wait..." : authButtonLabel(authMode)}
              </button>
            </form>

            {authMode === "signup" ? (
              <p className="piq-note piq-note-tight">
                You&rsquo;ll verify your email before uploading data — your district&rsquo;s dataset
                stays private to your account.
              </p>
            ) : null}

            <p className="piq-auth-links">
              {authMode !== "forgot" ? (
                <button
                  type="button"
                  className="piq-link"
                  onClick={() => {
                    setAuthMode("forgot");
                    setAuthPassword("");
                    setAuthError("");
                    setAuthInfo("");
                  }}
                >
                  Forgot password?
                </button>
              ) : null}
              {authMode !== "signup" ? (
                <button
                  type="button"
                  className="piq-link"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError("");
                    setAuthInfo("");
                    setAuthDistrictName("");
                  }}
                >
                  Create a workspace
                </button>
              ) : null}
              {authMode !== "login" ? (
                <button
                  type="button"
                  className="piq-link"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                    setAuthInfo("");
                    setAuthDistrictName("");
                  }}
                >
                  Sign in
                </button>
              ) : null}
              {authMode === "login" ? (
                <button
                  type="button"
                  className="piq-link"
                  onClick={() => void handleResendVerificationForEnteredEmail()}
                  disabled={isResendingVerification}
                >
                  {isResendingVerification ? "Sending..." : "Resend verification"}
                </button>
              ) : null}
            </p>

            <div className="piq-feedback" aria-live="polite">
              {authInfo ? <p className="piq-status">{authInfo}</p> : null}
              {authError ? <p className="piq-error">{authError}</p> : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (!authUser.emailVerifiedAt) {
    return (
      <div className="piq-split">
        <aside className="piq-split-brand">
          <span className="piq-brand">
            <span className="piq-brand-mark" aria-hidden="true">
              <Image src="/logo-icon.png" alt="" width={32} height={27} className="piq-brand-logo" />
            </span>
            <span className="piq-brand-word">Policy to Action</span>
          </span>
          <div className="piq-split-pitch">
            <h1>One more step before your workspace opens.</h1>
            <p>
              Verifying your address keeps your district&rsquo;s policy data scoped to your account
              alone.
            </p>
          </div>
          <p className="piq-split-footnote">
            Private to your district · Sources cited on every answer
          </p>
        </aside>

        <div className="piq-split-body">
          <section className="piq-auth-card">
            <h2>Verify your email</h2>
            <p className="piq-note">
              We sent a verification link to <strong>{authUser.email}</strong>. Open it to activate
              uploads, the assistant, and saved history.
            </p>
            <button
              type="button"
              className="piq-button piq-button-primary piq-button-block"
              onClick={() => void handleResendVerification()}
              disabled={isResendingVerification}
              data-tip="Resend verification email"
            >
              {isResendingVerification ? "Sending..." : "Resend verification email"}
            </button>
            <p className="piq-auth-links">
              <button type="button" className="piq-link" onClick={() => void handleLogout()}>
                Sign out
              </button>
            </p>
            <div className="piq-feedback" aria-live="polite">
              {authInfo ? <p className="piq-status">{authInfo}</p> : null}
              {authError ? <p className="piq-error">{authError}</p> : null}
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------- Shared blocks */

  const importPanel = (
    <>
      <form className="piq-import-form" onSubmit={handlePolicyImport}>
        <div className="piq-import-row">
          <input
            id="policy-import-url"
            type="url"
            className="piq-input piq-input-grow"
            value={policyImportUrl}
            onChange={(event) => {
              setPolicyImportUrl(event.target.value);
              setPolicyImportPreview(null);
              setPolicyImportSummary(null);
              setPolicyImportStatus("");
              setPolicyImportError("");
            }}
            placeholder="https://go.boarddocs.com/in/blm/Board.nsf/Public"
            aria-label="District policy URL"
            required
          />
          <button
            type="submit"
            className="piq-button piq-button-primary"
            data-tip="Scan"
            disabled={isImportingPolicies || isCommittingPolicyImport}
          >
            {isImportingPolicies ? "Scanning..." : "Scan"}
          </button>
        </div>

        <div className="piq-import-options">
          <span className="piq-detect">
            <span
              className={`piq-dot${policyImportPreview ? "" : " is-warn"}`}
              aria-hidden="true"
            />
            {policyImportPreview && policyImportPlatform === "auto"
              ? `Detected: ${policyImportPreview.platformLabel}`
              : "Platform:"}
            <select
              className="piq-select"
              value={policyImportPlatform}
              aria-label="Policy platform"
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
          </span>

          {policyImportPlatform === "boarddocs" || policyImportPlatform === "auto" ? (
            <label className="piq-checkbox">
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

          <input
            type="text"
            className="piq-input piq-input-compact"
            value={policyImportDatasetTitle}
            onChange={(event) => setPolicyImportDatasetTitle(event.target.value)}
            placeholder="Source name (optional)"
            aria-label="Dataset title"
            maxLength={160}
          />
        </div>
      </form>

      {policyImportPreview ? (
        <div className="piq-preview">
          <div className="piq-preview-head">
            <span className="piq-preview-title">
              Preview — {policyImportPreview.policyCount} policies found
            </span>
            <span className="piq-spacer" />
            {policyImportQualityMessages.length > 0 ? (
              <span className="piq-quality-pill is-warn">
                <span className="piq-quality-dot" aria-hidden="true" />
                {policyImportPreview.quality.missingWordingCount} missing text
              </span>
            ) : null}
            <span
              className={`piq-quality-pill${
                policyImportPreview.quality.duplicateCodeCount > 0 ? " is-warn" : " is-good"
              }`}
            >
              <span className="piq-quality-dot" aria-hidden="true" />
              {policyImportPreview.quality.duplicateCodeCount} duplicates
            </span>
          </div>

          {policyImportPreview.sampleRows.map((row, index) => (
            <div className="piq-preview-row" key={`${row.policyCode || "policy"}-${index}`}>
              <span className="piq-preview-code">{row.policyCode || "—"}</span>
              <span className="piq-preview-name">{row.policyTitle || "Untitled policy"}</span>
              <span className="piq-preview-text">
                {row.policyWordingPreview || "No wording preview available."}
              </span>
            </div>
          ))}

          {policyImportQualityMessages.length > 0 ? (
            <ul className="piq-preview-flags">
              {policyImportQualityMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          {policyImportPreview.failedCount > 0 ? (
            <p className="piq-preview-note">
              {policyImportPreview.failedCount} source item(s) were skipped during scraping.
            </p>
          ) : null}
        </div>
      ) : null}

      {policyImportPreview ? (
        <div className="piq-actions-right">
          <button
            type="button"
            className="piq-button piq-button-ghost"
            onClick={handlePolicyImportDiscard}
            data-tip="Discard preview"
            disabled={isCommittingPolicyImport}
          >
            Discard
          </button>
          <button
            type="button"
            className="piq-button piq-button-ghost"
            onClick={handlePolicyPreviewDownload}
            data-tip="Download a CSV of the preview rows shown here"
          >
            Download sample CSV
          </button>
          <button
            type="button"
            className="piq-button piq-button-primary"
            onClick={() => void handlePolicyImportCommit()}
            data-tip="Import to Library"
            disabled={isCommittingPolicyImport || isImportingPolicies}
          >
            {isCommittingPolicyImport ? "Importing..." : "Import to Library"}
          </button>
        </div>
      ) : null}
    </>
  );

  const csvPanel = (
    <form className="piq-stack" onSubmit={handleUpload}>
      <FileDropzone
        id="policy-csv"
        title="Drop your policy CSV here"
        hint="or browse — headers like Section, Code, Policy Title and Policy Wording are mapped automatically"
        accept=".csv,text/csv"
        glyph="⇪"
        file={uploadFile}
        onFile={setUploadFile}
      />
      <p className="piq-note">
        Rows with no policy text and no title are skipped. You&rsquo;ll see a quality preview before
        anything is saved.
      </p>
      <div className="piq-import-options">
        <input
          type="text"
          className="piq-input piq-input-compact"
          value={uploadDatasetTitle}
          onChange={(event) => setUploadDatasetTitle(event.target.value)}
          placeholder="Source name (optional)"
          aria-label="Dataset title"
          maxLength={160}
        />
        <span className="piq-spacer" />
        <button
          type="submit"
          className="piq-button piq-button-primary"
          data-tip="Upload CSV"
          disabled={isUploading}
        >
          {isUploading ? "Uploading..." : "Upload CSV"}
        </button>
      </div>
    </form>
  );

  const handbookPanel = (
    <div className="piq-grid-2">
      <form className="piq-stack" onSubmit={handleHandbookUpload("student")}>
        <FileDropzone
          id="student-handbook-file"
          title="Student handbook"
          hint="PDF, TXT or MD"
          accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
          glyph="📄"
          file={studentHandbookFile}
          onFile={setStudentHandbookFile}
        />
        <input
          type="text"
          className="piq-input"
          value={studentHandbookTitle}
          onChange={(event) => setStudentHandbookTitle(event.target.value)}
          placeholder="2026-2027 student handbook"
          aria-label="Student handbook title"
          maxLength={160}
        />
        <button
          type="submit"
          className="piq-button piq-button-primary piq-button-block"
          data-tip="Upload student handbook"
          disabled={isStudentHandbookUploading}
        >
          {isStudentHandbookUploading ? "Uploading..." : "Upload student handbook"}
        </button>
      </form>

      <form className="piq-stack" onSubmit={handleHandbookUpload("staff")}>
        <FileDropzone
          id="staff-handbook-file"
          title="Staff handbook"
          hint="PDF, TXT or MD"
          accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
          glyph="📄"
          file={staffHandbookFile}
          onFile={setStaffHandbookFile}
        />
        <input
          type="text"
          className="piq-input"
          value={staffHandbookTitle}
          onChange={(event) => setStaffHandbookTitle(event.target.value)}
          placeholder="2026-2027 staff handbook"
          aria-label="Staff handbook title"
          maxLength={160}
        />
        <button
          type="submit"
          className="piq-button piq-button-primary piq-button-block"
          data-tip="Upload staff handbook"
          disabled={isStaffHandbookUploading}
        >
          {isStaffHandbookUploading ? "Uploading..." : "Upload staff handbook"}
        </button>
      </form>
    </div>
  );

  const sourceFeedback = (
    <div className="piq-feedback" aria-live="polite">
      {policyImportStatus ? <p className="piq-status">{policyImportStatus}</p> : null}
      {policyImportError ? <p className="piq-error">{policyImportError}</p> : null}
      {policyImportSummary ? (
        <p className="piq-note">
          Source: {policyImportSummary.platformLabel} · {policyImportSummary.sourceCount}{" "}
          {policyImportSummary.sourceLabel}
          {policyImportSummary.failedCount > 0
            ? ` · ${policyImportSummary.failedCount} skipped`
            : ""}
        </p>
      ) : null}
      {uploadStatus ? <p className="piq-status">{uploadStatus}</p> : null}
      {uploadError ? <p className="piq-error">{uploadError}</p> : null}
      {studentHandbookStatus ? <p className="piq-status">{studentHandbookStatus}</p> : null}
      {studentHandbookError ? <p className="piq-error">{studentHandbookError}</p> : null}
      {staffHandbookStatus ? <p className="piq-status">{staffHandbookStatus}</p> : null}
      {staffHandbookError ? <p className="piq-error">{staffHandbookError}</p> : null}
    </div>
  );

  /* ------------------------------------------------- First-run setup */

  if (isSetupActive) {
    const steps = [
      {
        title: "Board policies",
        hint:
          activeDatasets.length > 0
            ? `${activeDatasets[0].policyCount} imported`
            : "Import or upload your policy set",
        done: activeDatasets.length > 0,
      },
      {
        title: "Handbooks",
        hint: "Student & staff PDFs",
        done:
          activeStudentHandbookDocuments.length > 0 || activeStaffHandbookDocuments.length > 0,
      },
      { title: "Try a question", hint: "See a cited answer", done: false },
    ];

    return (
      <div className="piq-setup">
        <header className="piq-setup-bar">
          <span className="piq-brand-mark is-small" aria-hidden="true">
            <Image src="/logo-icon.png" alt="" width={32} height={27} className="piq-brand-logo" />
          </span>
          <span className="piq-setup-title">Set up your workspace</span>
          <span className="piq-spacer" />
          <span className="piq-setup-progress">
            {districtName} · Step {setupStep} of 3
          </span>
        </header>

        <div className="piq-setup-body">
          <ol className="piq-stepper">
            {steps.map((step, index) => {
              const stepNumber = index + 1;
              const isCurrent = stepNumber === setupStep;
              return (
                <li key={step.title}>
                  <button
                    type="button"
                    className={`piq-step${isCurrent ? " is-current" : ""}`}
                    onClick={() => setSetupStep(stepNumber)}
                  >
                    <span
                      className={`piq-step-marker${step.done ? " is-done" : ""}${
                        isCurrent ? " is-current" : ""
                      }`}
                      aria-hidden="true"
                    >
                      {step.done ? "✓" : stepNumber}
                    </span>
                    <span className="piq-step-copy">
                      <strong>{step.title}</strong>
                      <span>{step.hint}</span>
                    </span>
                  </button>
                  {stepNumber < steps.length ? (
                    <span className="piq-step-connector" aria-hidden="true" />
                  ) : null}
                </li>
              );
            })}
          </ol>

          <section className="piq-setup-card">
            {setupStep === 1 ? (
              <>
                <h2>Add your board policies</h2>
                <p className="piq-lead">
                  Import them straight from your district&rsquo;s policy site, or upload a CSV
                  export. Everything is previewed before it is saved.
                </p>
                <div className="piq-tabs">
                  {SOURCE_TABS.filter((tab) => tab.key !== "handbook").map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`piq-tab${sourceTab === tab.key ? " is-active" : ""}`}
                      aria-pressed={sourceTab === tab.key}
                      onClick={() => setSourceTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {sourceTab === "csv" ? csvPanel : importPanel}
                {sourceFeedback}
              </>
            ) : null}

            {setupStep === 2 ? (
              <>
                <h2>Add your handbooks</h2>
                <p className="piq-lead">
                  Handbooks let the assistant answer day-to-day questions your board policies
                  don&rsquo;t cover — leave, dress code, devices, discipline procedures.
                </p>
                {handbookPanel}
                {sourceFeedback}
              </>
            ) : null}

            {setupStep === 3 ? (
              <>
                <h2>Try your first question</h2>
                <p className="piq-lead">
                  Describe a real situation. Every claim comes back with the exact source text behind
                  it.
                </p>
                <div className="piq-starters">
                  {STARTER_PROMPTS.map((prompt, index) => (
                    <button
                      key={prompt}
                      type="button"
                      className="piq-starter"
                      onClick={() => {
                        setIsSetupDismissed(true);
                        setView("assistant");
                        void sendScenario(EXAMPLE_SCENARIOS[index] ?? prompt);
                      }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <div className="piq-actions-right piq-setup-actions">
              <button
                type="button"
                className="piq-button piq-button-ghost"
                data-tip="Skip for now"
                onClick={() => {
                  if (authUser) {
                    writeSetupDone(authUser.id);
                  }
                  setIsSetupDismissed(true);
                  setIsSetupEngaged(false);
                  setView("assistant");
                }}
              >
                Skip for now
              </button>
              <button
                type="button"
                className="piq-button piq-button-primary"
                data-tip="Continue"
                onClick={() => {
                  if (setupStep < 3) {
                    setSetupStep(setupStep + 1);
                    return;
                  }
                  if (authUser) {
                    writeSetupDone(authUser.id);
                  }
                  setIsSetupDismissed(true);
                  setIsSetupEngaged(false);
                  setView("assistant");
                }}
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ App shell */

  const rail = (
    <nav className="piq-rail" aria-label="Primary">
      <Link className="piq-brand-mark piq-rail-mark" href="/" aria-label="Policy to Action home">
        <Image src="/logo-icon.png" alt="" width={32} height={27} className="piq-brand-logo" />
      </Link>
      <div className="piq-rail-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`piq-rail-button${view === item.key ? " is-active" : ""}`}
            data-tip={item.label}
            data-tip-side="right"
            aria-current={view === item.key ? "page" : undefined}
            onClick={() => handleNavigate(item.key)}
          >
            <RailIcon paths={item.paths} />
            <span className="piq-rail-label">{item.shortLabel}</span>
          </button>
        ))}
      </div>
      <span className="piq-spacer" />
      <button
        type="button"
        className={`piq-rail-button piq-rail-hc${highContrast ? " is-active" : ""}`}
        data-tip="High contrast"
        data-tip-side="right"
        aria-pressed={highContrast}
        onClick={toggleHighContrast}
      >
        <span aria-hidden="true">◐</span>
        <span className="piq-sr-only">High contrast</span>
      </button>
      <button
        type="button"
        className="piq-avatar"
        data-tip="Account"
        data-tip-side="right"
        aria-label="Account menu"
        aria-expanded={isAccountMenuOpen}
        onClick={() => setIsAccountMenuOpen((previous) => !previous)}
      >
        {initials}
      </button>
    </nav>
  );

  const accountMenu = isAccountMenuOpen ? (
    <>
      <button
        type="button"
        className="piq-scrim"
        aria-label="Close account menu"
        onClick={() => setIsAccountMenuOpen(false)}
      />
      <div className="piq-account-menu" role="dialog" aria-label="Account">
        {authUser.firstName ? (
          <p className="piq-account-name">
            {[authUser.firstName, authUser.lastName].filter(Boolean).join(" ")}
          </p>
        ) : null}
        <p className="piq-account-email">{authUser.email}</p>
        <p className="piq-account-district">{districtName}</p>
        <button
          type="button"
          className="piq-button piq-button-ghost piq-button-block"
          onClick={openProfileView}
        >
          Profile and settings
        </button>
        <button
          type="button"
          className="piq-button piq-button-ghost piq-button-block"
          onClick={() => {
            setIsAccountMenuOpen(false);
            void handleLogout();
          }}
        >
          Sign out
        </button>
      </div>
    </>
  ) : null;

  const sourcesPill = (
    <span className="piq-sources-pill">
      <span className={`piq-dot${activeSourceCount === 0 ? " is-warn" : ""}`} aria-hidden="true" />
      {activeSourceCount} {activeSourceCount === 1 ? "source" : "sources"} · {districtName}
    </span>
  );

  const mobileHeader = (
    <header className="piq-mobile-header">
      <Link className="piq-head-brand" href="/" aria-label="Policy to Action home">
        <span className="piq-brand-mark is-small" aria-hidden="true">
          <Image src="/logo-icon.png" alt="" width={32} height={27} className="piq-brand-logo" />
        </span>
        <span className="piq-mobile-word">Policy to Action</span>
      </Link>
      <span className="piq-spacer" />
      {sourcesPill}
      <button
        type="button"
        className={`piq-icon-button${highContrast ? " is-active" : ""}`}
        data-tip="High contrast"
        aria-pressed={highContrast}
        onClick={toggleHighContrast}
      >
        <span aria-hidden="true">◐</span>
        <span className="piq-sr-only">High contrast</span>
      </button>
      <button
        type="button"
        className="piq-avatar is-light"
        data-tip="Account"
        aria-label="Account menu"
        aria-expanded={isAccountMenuOpen}
        onClick={() => setIsAccountMenuOpen((previous) => !previous)}
      >
        {initials}
      </button>
    </header>
  );

  /* ------------------------------------------------------- Assistant view */

  const emptyThread = conversationGroups.length === 0 && !isConversationLoading;

  const assistantView = (
    <div className="piq-assistant">
      <div className="piq-chat">
        {isOffline ? (
          <div className="piq-offline" role="status">
            ⚠ You&rsquo;re offline — you can read saved conversations, but new questions need a
            connection.
          </div>
        ) : null}

        <header className="piq-chat-head">
          <Link className="piq-head-brand" href="/" aria-label="Policy to Action home">
            <span className="piq-brand-mark is-head" aria-hidden="true">
              <Image src="/logo-icon.png" alt="" width={32} height={27} className="piq-brand-logo" />
            </span>
            <span className="piq-head-brand-word">Policy to Action</span>
          </Link>
          <span className="piq-head-divider" aria-hidden="true" />
          <h1 className="piq-thread-title">
            {selectedConversation ? selectedConversation.title : "New question"}
          </h1>
          <span className="piq-spacer" />
          {activeEvidence ? (
            <button
              type="button"
              className={`piq-pill piq-evidence-toggle${evidenceOpen ? " is-active" : ""}`}
              aria-pressed={evidenceOpen}
              data-tip={evidenceOpen ? "Close the evidence panel" : "Reopen the evidence panel"}
              onClick={() => setEvidenceOpen((previous) => !previous)}
            >
              Evidence
            </button>
          ) : null}
          {sourcesPill}
        </header>

        <div className="piq-messages" ref={messageListRef} role="log" aria-label="Conversation">
          {isConversationLoading ? (
            <div className="piq-skeletons" aria-hidden="true">
              <div className="piq-skeleton is-user" />
              <div className="piq-skeleton is-assistant" />
              <div className="piq-skeleton is-assistant is-short" />
            </div>
          ) : null}

          {emptyThread ? (
            <div className="piq-empty">
              <h2>How can I help, {firstName}?</h2>
              <p>
                Answers grounded in {districtName}&rsquo;s {totalPolicyCount(activeDatasets)}{" "}
                policies and {activeStudentHandbookDocuments.length +
                  activeStaffHandbookDocuments.length}{" "}
                handbooks — with the exact source text behind every claim.
              </p>
              <p className="piq-empty-hint">
                Strong scenarios describe what happened, who was involved by role, and the
                decisions you need to make. Use placeholders such as Student A instead of real
                names.
              </p>
              <div className="piq-starters">
                {STARTER_PROMPTS.map((prompt, index) => (
                  <button
                    key={prompt}
                    type="button"
                    className="piq-starter"
                    onClick={() => void sendScenario(EXAMPLE_SCENARIOS[index] ?? prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!isConversationLoading
            ? conversationGroups.map(({ message, items }, groupIndex) => {
                if (message.role === "user") {
                  return (
                    <div className="piq-bubble-user" key={message.id}>
                      {message.content.trim()}
                    </div>
                  );
                }

                const question = findPrecedingQuestion(conversationGroups, groupIndex);
                const prose = items
                  .filter((item) => item.kind === "general")
                  .map((item) => item.content)
                  .join("\n\n");
                // The guidance model returns most of its answer inside structured
                // policy/handbook blocks. Their summaries ARE the guidance, so they
                // must render as readable prose — not be consumed into chips alone.
                const sourceSummaries = items
                  .filter(
                    (item) =>
                      (item.kind === "policy" || item.kind === "handbook") && item.referenceCard,
                  )
                  .map((item) => ({
                    id: item.id,
                    label: item.referenceCard ? buildChipLabel(item.referenceCard) : "",
                    summary: item.referenceCard?.summary ?? "",
                  }))
                  .filter(
                    (entry) =>
                      entry.summary &&
                      entry.summary !== "No summary provided." &&
                      entry.summary !== "No guidance summary provided.",
                  );
                const chips = buildEvidenceChips(message, items);
                const actionItems = items.filter((item) => item.kind === "action");
                const implicationItems = items.filter((item) => item.kind === "implications");
                const disclaimerItems = items.filter((item) => item.kind === "disclaimer");
                const isPinned = Boolean(
                  message.storedId &&
                    pinnedAnswers.some((pin) => pin.messageId === message.storedId),
                );
                const pinSummary =
                  prose || sourceSummaries.map((entry) => entry.summary).join(" ");
                const capturedAt = message.answerEvidence?.capturedAt;

                return (
                  <article className="piq-answer" key={message.id}>
                    {prose ? (
                      <div className="piq-prose">
                        {prose.split(/\n{2,}/).map((paragraph, index) => (
                          <p key={`${message.id}-p-${index}`}>{renderRichText(paragraph)}</p>
                        ))}
                      </div>
                    ) : null}

                    {sourceSummaries.length > 0 ? (
                      <div className="piq-prose piq-source-summaries">
                        {sourceSummaries.map((entry) => (
                          <p key={`${entry.id}-summary`}>
                            {entry.label ? <b>{entry.label}.</b> : null} {entry.summary}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {chips.length > 0 ? (
                      <div className="piq-chips">
                        {chips.map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            className="piq-chip"
                            data-tip="View source"
                            onClick={() => void openEvidence(chip)}
                          >
                            {chip.label} ↗
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {actionItems.map((item) => {
                      const steps = parseNumberedSteps(item.content);
                      return (
                        <div className="piq-recommended" key={item.id}>
                          <span className="piq-microlabel">Recommended actions</span>
                          {steps.map((step, index) => (
                            <p key={`${item.id}-step-${index}`}>
                              <b>{index + 1}.</b> {renderRichText(step)}
                            </p>
                          ))}
                        </div>
                      );
                    })}

                    {implicationItems.map((item) => (
                      <div className="piq-implications" key={item.id}>
                        <span className="piq-microlabel">Implications</span>
                        {parseNumberedSteps(item.content).map((line, index) => (
                          <p key={`${item.id}-line-${index}`}>{renderRichText(line)}</p>
                        ))}
                      </div>
                    ))}

                    {disclaimerItems.map((item) => (
                      <p className="piq-disclaimer" key={item.id}>
                        {item.content}
                      </p>
                    ))}

                    <p className="piq-answer-meta">
                      Guidance, not legal advice
                      {capturedAt ? ` · Sources captured ${formatLongDate(capturedAt)}` : ""} ·{" "}
                      <button
                        type="button"
                        className="piq-link"
                        data-tip={isPinned ? "Unpin answer" : "Pin answer"}
                        onClick={() => void handleTogglePin(message, question, pinSummary, chips)}
                      >
                        {isPinned ? "★ Pinned" : "☆ Pin"}
                      </button>{" "}
                      ·{" "}
                      <button
                        type="button"
                        className="piq-link"
                        data-tip="Copy answer"
                        onClick={() => void handleCopyAnswer(message)}
                      >
                        {copiedMessageId === message.id ? "Copied" : "Copy"}
                      </button>
                    </p>
                  </article>
                );
              })
            : null}

          {isSending ? (
            <div className="piq-answer piq-answer-pending" aria-live="polite">
              <span className="piq-typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Reading your policies and handbooks&hellip;
            </div>
          ) : null}
        </div>

        {showScrollToLatest ? (
          <button
            type="button"
            className="piq-jump"
            data-tip="Jump to latest"
            onClick={() => scrollToLatestMessage("smooth")}
          >
            ↓ Latest
          </button>
        ) : null}

        <div className="piq-composer-wrap">
          <div className="piq-feedback" aria-live="polite">
            {conversationError ? <p className="piq-error">{conversationError}</p> : null}
            {chatError ? <p className="piq-error">{chatError}</p> : null}
          </div>

          <form className="piq-composer" onSubmit={handleScenarioSubmit}>
            <textarea
              id="scenario"
              ref={composerRef}
              rows={1}
              value={scenario}
              maxLength={8000}
              aria-label="Ask a follow-up, or describe a new scenario"
              aria-describedby="composer-note"
              placeholder="Ask a follow-up, or describe a new scenario…"
              onChange={(event) => setScenario(event.target.value)}
              onKeyDown={handleComposerKeyDown}
            />
            <button
              type="submit"
              className="piq-button piq-button-primary"
              data-tip="Ask"
              disabled={isSending || isOffline}
            >
              {isSending ? "Asking..." : "Ask"}
            </button>
          </form>
          <p className="piq-composer-note" id="composer-note">
            Policy to Action can make mistakes — verify critical decisions against the cited source.
            Use placeholders such as Student A instead of real names. Shift+Enter starts a new
            line.
          </p>

          {retrievalDebug && SHOW_RETRIEVAL_DEBUG ? (
            <details className="piq-debug">
              <summary>Retrieval debug</summary>
              <p>
                Mode: <strong>{retrievalDebug.retrievalMode || "lexical (legacy response)"}</strong>{" "}
                · Policy matches: {retrievalDebug.policyCount} · Handbook matches:{" "}
                {retrievalDebug.handbookCount}
              </p>
              {retrievalDebug.subIssues && retrievalDebug.subIssues.length > 0 ? (
                <p>Sub-issues: {retrievalDebug.subIssues.join(" | ")}</p>
              ) : null}
              <p>
                Matched terms:{" "}
                {retrievalDebug.matchedTerms.length > 0
                  ? retrievalDebug.matchedTerms.join(", ")
                  : "None"}
              </p>
              {retrievalDebug.policyMatches && retrievalDebug.policyMatches.length > 0 ? (
                <ul>
                  {retrievalDebug.policyMatches.map((match) => (
                    <li key={`policy-match-${match.id}`}>
                      [{match.relevanceScore}] {match.policyCode || "—"} —{" "}
                      {match.policyTitle || "Untitled"}
                    </li>
                  ))}
                </ul>
              ) : null}
              {retrievalDebug.handbookMatches && retrievalDebug.handbookMatches.length > 0 ? (
                <ul>
                  {retrievalDebug.handbookMatches.map((match) => (
                    <li key={`handbook-match-${match.id}`}>
                      [{match.relevanceScore}] {formatHandbookTypeLabel(match.handbookType)}:{" "}
                      {match.sectionTitle || "General guidance"}
                    </li>
                  ))}
                </ul>
              ) : null}
              {retrievalDebug.semanticComparison ? (
                <p>
                  Semantic candidates: {retrievalDebug.semanticComparison.policyCandidateCount}{" "}
                  policy · {retrievalDebug.semanticComparison.handbookCandidateCount} handbook
                </p>
              ) : null}
              {retrievalDebug.postgresComparison ? (
                <p>
                  Postgres candidates: {retrievalDebug.postgresComparison.policyCandidateCount}{" "}
                  policy · {retrievalDebug.postgresComparison.handbookCandidateCount} handbook
                </p>
              ) : null}
            </details>
          ) : null}
        </div>
      </div>

      {evidenceOpen && activeEvidence ? (
        <aside className="piq-drawer" aria-label="Evidence">
          <div className="piq-drawer-head">
            <span className="piq-microlabel">Evidence</span>
            <span className="piq-spacer" />
            <button
              type="button"
              className="piq-drawer-close"
              data-tip="Close"
              aria-label="Close evidence panel"
              ref={drawerCloseRef}
              onClick={() => setEvidenceOpen(false)}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <div className="piq-evidence-card">
            <span className="piq-evidence-title">{activeEvidence.title}</span>
            <span className="piq-evidence-quote">
              {isEvidenceLoading && !activeEvidence.quote
                ? "Loading the source text…"
                : activeEvidence.quote
                  ? `“${activeEvidence.quote}”`
                  : "No excerpt was captured for this source."}
            </span>
            {activeEvidence.meta ? (
              <span className="piq-evidence-meta">{activeEvidence.meta}</span>
            ) : null}
          </div>

          {activeEvidence.lookup ? (
            <button
              type="button"
              className="piq-button piq-button-ghost piq-button-block"
              data-tip="Open full policy"
              onClick={() => {
                if (activeEvidence.lookup) {
                  void openReferenceDetail(activeEvidence.lookup);
                }
              }}
            >
              Open full source
            </button>
          ) : null}

          <button
            type="button"
            className="piq-button piq-button-ghost piq-button-block"
            data-tip={
              isClientMessagePinned(activeEvidence.messageId)
                ? "Remove this answer from Pinned"
                : "Keep this answer in Pinned"
            }
            onClick={() => togglePinForClientMessage(activeEvidence.messageId)}
          >
            {isClientMessagePinned(activeEvidence.messageId)
              ? "★ Unpin this answer"
              : "☆ Pin this answer"}
          </button>

          <p className="piq-evidence-explainer">
            This excerpt is the exact text the answer was grounded in, from your uploaded sources.
          </p>
        </aside>
      ) : null}
    </div>
  );

  /* --------------------------------------------------------- History view */

  const profileView = (
    <div className="piq-page">
      <div className="piq-page-inner is-narrow">
        <h1 className="piq-page-title">Profile and settings</h1>
        <p className="piq-lead">
          Tell the assistant who is asking. Your role and context tailor the guidance, for
          example separating steps you can take directly from steps that need escalation, while
          answers stay grounded in your district&rsquo;s cited policies.
        </p>

        <div className="piq-feedback" aria-live="polite">
          {profileStatus ? <p className="piq-status">{profileStatus}</p> : null}
          {profileError ? <p className="piq-error">{profileError}</p> : null}
        </div>

        <div className="piq-form piq-profile-form">
          <div className="piq-field-row">
            <div className="piq-field">
              <label htmlFor="profile-first-name">First name</label>
              <input
                id="profile-first-name"
                type="text"
                autoComplete="given-name"
                value={profileDraftFirst}
                onChange={(event) => setProfileDraftFirst(event.target.value)}
                required
              />
            </div>
            <div className="piq-field">
              <label htmlFor="profile-last-name">Last name</label>
              <input
                id="profile-last-name"
                type="text"
                autoComplete="family-name"
                value={profileDraftLast}
                onChange={(event) => setProfileDraftLast(event.target.value)}
              />
            </div>
          </div>

          <div className="piq-field">
            <label htmlFor="profile-district">District name</label>
            <input
              id="profile-district"
              type="text"
              autoComplete="organization"
              value={profileDraftDistrict}
              onChange={(event) => setProfileDraftDistrict(event.target.value)}
              required
            />
          </div>

          <div className="piq-field">
            <label htmlFor="profile-role">Your role</label>
            <input
              id="profile-role"
              type="text"
              value={profileDraftRole}
              onChange={(event) => setProfileDraftRole(event.target.value)}
              placeholder="Example: Assistant Principal, Middle School"
              maxLength={120}
            />
          </div>

          <div className="piq-field">
            <label htmlFor="profile-context">About your school or district</label>
            <textarea
              id="profile-context"
              rows={5}
              value={profileDraftContext}
              onChange={(event) => setProfileDraftContext(event.target.value)}
              placeholder="Anything the assistant should know: building level, student population size, programs you oversee, priorities. Do not include student names or records."
              maxLength={1500}
            />
            <span className="piq-field-hint">
              {profileDraftContext.length}/1500 &middot; Used as background for your answers only.
              Never include student names or personal information.
            </span>
          </div>

          <div className="piq-actions-right">
            <button
              type="button"
              className="piq-button piq-button-primary"
              disabled={isSavingProfile}
              onClick={() => void handleProfileSave()}
            >
              {isSavingProfile ? "Saving\u2026" : "Save profile"}
            </button>
          </div>
        </div>

        <h2 className="piq-settings-heading">Appearance and accessibility</h2>
        <div className="piq-settings-card">
          <div className="piq-settings-row">
            <div className="piq-settings-copy">
              <b>High contrast</b>
              <span>Solid surfaces and stronger outlines for maximum legibility.</span>
            </div>
            <button
              type="button"
              className={`piq-pill${highContrast ? " is-active" : ""}`}
              aria-pressed={highContrast}
              onClick={toggleHighContrast}
            >
              {highContrast ? "On" : "Off"}
            </button>
          </div>
          <div className="piq-settings-row">
            <div className="piq-settings-copy">
              <b>Text size</b>
              <span>Scales the whole interface.</span>
            </div>
            <div className="piq-pills piq-settings-pills">
              {TEXT_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`piq-pill${textSize === option.key ? " is-active" : ""}`}
                  aria-pressed={textSize === option.key}
                  onClick={() => setTextSize(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="piq-settings-row">
            <div className="piq-settings-copy">
              <b>Reduce motion</b>
              <span>Turns off animations and transitions.</span>
            </div>
            <button
              type="button"
              className={`piq-pill${reducedMotion ? " is-active" : ""}`}
              aria-pressed={reducedMotion}
              onClick={() => setReducedMotion((previous) => !previous)}
            >
              {reducedMotion ? "On" : "Off"}
            </button>
          </div>
        </div>

        <h2 className="piq-settings-heading">Password and sessions</h2>
        <div className="piq-settings-card">
          <div className="piq-feedback" aria-live="polite">
            {passwordStatus ? <p className="piq-status">{passwordStatus}</p> : null}
            {passwordError ? <p className="piq-error">{passwordError}</p> : null}
          </div>
          <div className="piq-field">
            <label htmlFor="password-current">Current password</label>
            <input
              id="password-current"
              type="password"
              autoComplete="current-password"
              value={passwordCurrent}
              onChange={(event) => setPasswordCurrent(event.target.value)}
            />
          </div>
          <div className="piq-field-row">
            <div className="piq-field">
              <label htmlFor="password-new">New password</label>
              <input
                id="password-new"
                type="password"
                autoComplete="new-password"
                value={passwordNew}
                onChange={(event) => setPasswordNew(event.target.value)}
              />
            </div>
            <div className="piq-field">
              <label htmlFor="password-confirm">Confirm new password</label>
              <input
                id="password-confirm"
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
            </div>
          </div>
          <div className="piq-actions-right">
            <button
              type="button"
              className="piq-button piq-button-ghost"
              disabled={isChangingPassword}
              onClick={() => void handleChangePassword()}
            >
              {isChangingPassword ? "Updating\u2026" : "Change password"}
            </button>
          </div>
          <div className="piq-settings-row">
            <div className="piq-settings-copy">
              <b>Other devices</b>
              <span>
                {sessionsStatus ||
                  "Signs out every session except this one, for example a shared office computer."}
              </span>
            </div>
            <button
              type="button"
              className="piq-button piq-button-ghost"
              onClick={() => void handleSignOutOthers()}
            >
              Sign out everywhere else
            </button>
          </div>
        </div>

        <h2 className="piq-settings-heading">Your data</h2>
        <div className="piq-settings-card">
          <div className="piq-settings-row">
            <div className="piq-settings-copy">
              <b>Export my data</b>
              <span>Downloads your conversations, pinned answers, and profile as a file.</span>
            </div>
            <button type="button" className="piq-button piq-button-ghost" onClick={handleExportData}>
              Download export
            </button>
          </div>
        </div>

        <h2 className="piq-settings-heading piq-danger-heading">Delete account</h2>
        <div className="piq-settings-card piq-danger-card">
          <p className="piq-settings-note">
            Permanently deletes your account, your uploaded sources, and every conversation and
            pinned answer. This cannot be undone. Export your data first if you want a copy.
          </p>
          <div className="piq-feedback" aria-live="polite">
            {deleteError ? <p className="piq-error">{deleteError}</p> : null}
          </div>
          <div className="piq-field-row">
            <div className="piq-field">
              <label htmlFor="delete-password">Your password</label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </div>
            <div className="piq-field">
              <label htmlFor="delete-confirm">Type DELETE to confirm</label>
              <input
                id="delete-confirm"
                type="text"
                autoComplete="off"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
              />
            </div>
          </div>
          <div className="piq-actions-right">
            <button
              type="button"
              className="piq-button piq-button-danger"
              disabled={isDeletingAccount}
              onClick={() => void handleDeleteAccount()}
            >
              {isDeletingAccount ? "Deleting\u2026" : "Delete my account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const helpView = (
    <div className="piq-page">
      <div className="piq-page-inner">
        <h1 className="piq-page-title">Help</h1>
        <div className="piq-pills">
          {HELP_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`piq-pill${helpTab === tab.key ? " is-active" : ""}`}
              aria-pressed={helpTab === tab.key}
              onClick={() => setHelpTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {helpTab === "start" ? (
          <div className="piq-help-body">
            <p className="piq-lead">
              Policy to Action answers real administrative scenarios using only your
              district&rsquo;s own board policies and handbooks, with every claim cited back to the
              exact source text.
            </p>
            <ol className="piq-help-steps">
              <li>
                <b>Describe a real situation</b> in the question box: what happened, who was
                involved by role, and the decisions you need to make. Use placeholders such as
                Student A instead of real names. Enter submits; Shift+Enter starts a new line.
              </li>
              <li>
                <b>Read the structured answer:</b> the policies that apply, numbered recommended
                actions, and the implications of following or not following them.
              </li>
              <li>
                <b>Verify the evidence.</b> Select any citation chip to see the exact policy text
                behind the claim, and Open full source to read the complete policy.
              </li>
              <li>
                <b>Keep what matters.</b> Pin answers worth returning to; every conversation is
                saved automatically to History.
              </li>
            </ol>
            <h2 className="piq-help-heading">Guides for download</h2>
            <ul className="piq-help-downloads">
              {HELP_DOWNLOADS.map((doc) => (
                <li key={doc.file}>
                  <a href={doc.file} target="_blank" rel="noreferrer">
                    {doc.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {helpTab === "faq" ? (
          <div className="piq-help-body">
            {FAQ_ITEMS.map((item) => (
              <details className="piq-faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        ) : null}

        {helpTab === "trust" ? (
          <div className="piq-help-body">
            <p className="piq-lead">
              How your district&rsquo;s data is handled, in plain language.
            </p>
            <h2 className="piq-help-heading">Your data, your workspace</h2>
            <p>
              The policies, handbooks, conversations, and pinned answers in your workspace are
              private to your account. They are never shared across districts, never sold, and
              never used to train artificial intelligence models. You can archive or permanently
              delete any source or conversation at any time.
            </p>
            <h2 className="piq-help-heading">Student privacy</h2>
            <p>
              Policy to Action is designed to be used without student personal information. The
              interface reminds you on every screen to use placeholders such as Student A rather
              than real names, and answers are generated from policy text, not student records.
            </p>
            <h2 className="piq-help-heading">Security measures</h2>
            <p>
              Accounts require verified email. Passwords are protected with modern one-way
              hashing and are never stored in readable form. Connections are encrypted in
              transit, sessions are managed server side, and request rate limiting protects
              against abuse.
            </p>
            <h2 className="piq-help-heading">Service providers</h2>
            <p>
              Policy to Action runs on a small set of infrastructure providers, each bound by
              its own data protection commitments:
            </p>
            <div className="piq-table piq-trust-table" role="table" aria-label="Service providers">
              <div className="piq-table-head" role="row">
                <span role="columnheader">Provider</span>
                <span role="columnheader">Purpose</span>
                <span role="columnheader">Data involved</span>
              </div>
              <div className="piq-table-row" role="row">
                <span role="cell">OpenAI</span>
                <span role="cell">Answer generation and retrieval</span>
                <span role="cell">
                  Scenario text and policy excerpts, processed under a Data Processing Addendum.
                  API data is not used to train OpenAI models.
                </span>
              </div>
              <div className="piq-table-row" role="row">
                <span role="cell">Neon</span>
                <span role="cell">Database hosting</span>
                <span role="cell">Your workspace content, encrypted at rest</span>
              </div>
              <div className="piq-table-row" role="row">
                <span role="cell">Vercel</span>
                <span role="cell">Application hosting</span>
                <span role="cell">Application traffic</span>
              </div>
              <div className="piq-table-row" role="row">
                <span role="cell">Resend</span>
                <span role="cell">Verification and reset email</span>
                <span role="cell">Your email address only</span>
              </div>
            </div>
            <h2 className="piq-help-heading">Guidance, not legal advice</h2>
            <p>
              Answers are decision support generated from your uploaded sources. They are not
              legal advice, and every answer links its citations so you can verify against the
              source text before acting. Questions about this page can be directed to your
              Policy to Action contact.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );

  const historyView = (
    <div className="piq-page">
      <div className="piq-page-inner">
        <h1 className="piq-page-title">Conversation history</h1>
        <div className="piq-feedback" aria-live="polite">
          {conversationError ? <p className="piq-error">{conversationError}</p> : null}
        </div>
        {conversations.length === 0 ? (
          <p className="piq-empty-note">
            No saved conversations yet. Ask a scenario question and it will be saved here.
          </p>
        ) : (
          <div className="piq-rows">
            {conversations.map((conversation) => (
              <div className="piq-row" key={conversation.id}>
                <button
                  type="button"
                  className="piq-row-main"
                  onClick={() => handleConversationOpen(conversation.id)}
                >
                  <span className="piq-row-copy">
                    <b>{conversation.title || "Untitled conversation"}</b>
                    <span>
                      {conversation.messageCount}{" "}
                      {conversation.messageCount === 1 ? "message" : "messages"}
                      {selectedDataset ? ` · ${selectedDataset.title}` : ""}
                    </span>
                  </span>
                  <span className="piq-row-when">
                    {formatRelativeDate(conversation.lastMessageAt || conversation.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="piq-icon-button is-danger"
                  data-tip="Delete"
                  onClick={() => void handleConversationDelete(conversation)}
                >
                  <span aria-hidden="true">🗑</span>
                  <span className="piq-sr-only">
                    Delete conversation {conversation.title || "Untitled conversation"}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------------- Pinned view */

  const pinnedView = (
    <div className="piq-page">
      <div className="piq-page-inner">
        <h1 className="piq-page-title">Pinned answers</h1>
        <p className="piq-lead">
          Your district&rsquo;s living FAQ — answers you&rsquo;ve saved, with their evidence frozen
          at pin time.
        </p>
        {pinnedAnswers.length === 0 && isPinsLoading ? (
          <p className="piq-empty-note">Loading your pinned answers…</p>
        ) : pinnedAnswers.length === 0 ? (
          <p className="piq-empty-note">
            Nothing pinned yet. Use ☆ Pin under any answer to keep it here.
          </p>
        ) : (
          <div className="piq-pin-grid">
            {pinnedAnswers.map((pin) => (
              <article className="piq-pin-card" key={pin.messageId}>
                <button
                  type="button"
                  className="piq-pin-main"
                  onClick={() => {
                    if (pin.conversationId) {
                      handleConversationOpen(pin.conversationId);
                    }
                  }}
                >
                  <span className="piq-pin-title">{pin.title}</span>
                  <span className="piq-pin-body">{pin.body}</span>
                </button>
                <span className="piq-pin-foot">
                  <span className="piq-pin-meta">{pin.meta}</span>
                  <button
                    type="button"
                    className="piq-link"
                    data-tip="Unpin"
                    onClick={() => void handleUnpin(pin.messageId)}
                  >
                    Unpin
                  </button>
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /* --------------------------------------------------------- Library view */

  const visibleSources = librarySources.filter((source) => {
    if (source.archived !== showArchived) {
      return false;
    }
    if (libraryFilter === "all") {
      return true;
    }
    if (libraryFilter === "policies") {
      return source.kind === "dataset";
    }
    return source.kind === "handbook" && source.handbookType === libraryFilter;
  });

  const isSearching = librarySearchQuery.trim().length > 0;
  const missingHandbooks = [
    activeStudentHandbookDocuments.length === 0 ? "student handbook" : "",
    activeStaffHandbookDocuments.length === 0 ? "staff handbook" : "",
  ].filter(Boolean);

  const libraryView = (
    <div className="piq-page">
      <div className="piq-page-inner is-wide">
        <div className="piq-library-head">
          <h1 className="piq-page-title">Library</h1>
          <span className="piq-spacer" />
          <span className="piq-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={librarySearchQuery}
              onChange={(event) => setLibrarySearchQuery(event.target.value)}
              placeholder={`Search all ${totalPolicyCount(activeDatasets)} policies…`}
              aria-label="Search policies"
            />
          </span>
          <button
            type="button"
            className="piq-button piq-button-primary"
            data-tip="Add source"
            onClick={() => setView("source")}
          >
            ＋ Add source
          </button>
        </div>

        <div className="piq-feedback" aria-live="polite">
          {datasetStatus ? <p className="piq-status">{datasetStatus}</p> : null}
          {datasetError ? <p className="piq-error">{datasetError}</p> : null}
          {handbookManagementStatus ? <p className="piq-status">{handbookManagementStatus}</p> : null}
          {handbookManagementError ? <p className="piq-error">{handbookManagementError}</p> : null}
          {policyIndexError ? <p className="piq-error">{policyIndexError}</p> : null}
        </div>

        {isSearching ? (
          <div className="piq-rows">
            <p className="piq-lead piq-lead-tight">
              {isPolicyIndexLoading
                ? "Searching your policies…"
                : `${librarySearchResults.length} ${
                    librarySearchResults.length === 1 ? "policy matches" : "policies match"
                  } “${librarySearchQuery.trim()}”`}
            </p>
            {librarySearchResults.map((policy) => (
              <button
                type="button"
                className="piq-result"
                key={policy.id}
                onClick={() => openLibraryPolicy(policy)}
              >
                <span>
                  <b className="piq-result-code">{policy.policyCode || "—"}</b> ·{" "}
                  <b>{policy.policyTitle || "Untitled policy"}</b>
                </span>
                <span className="piq-result-excerpt">
                  {buildSearchExcerpt(policy.policyWording, librarySearchQuery)}
                </span>
                <span className="piq-result-meta">
                  {[policy.policySection, policy.revisedDate ? `Revised ${policy.revisedDate}` : "", selectedDataset?.title]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="piq-pills">
              {(
                [
                  { key: "all", label: `All sources (${librarySources.filter((s) => !s.archived).length})` },
                  { key: "policies", label: `Policies (${activeDatasets.length})` },
                  { key: "student", label: `Student handbook (${activeStudentHandbookDocuments.length})` },
                  { key: "staff", label: `Staff handbook (${activeStaffHandbookDocuments.length})` },
                ] as Array<{ key: LibraryFilter; label: string }>
              ).map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  className={`piq-pill${
                    libraryFilter === pill.key && !showArchived ? " is-active" : ""
                  }`}
                  aria-pressed={libraryFilter === pill.key && !showArchived}
                  onClick={() => {
                    setLibraryFilter(pill.key);
                    setShowArchived(false);
                  }}
                >
                  {pill.label}
                </button>
              ))}
              <button
                type="button"
                className={`piq-pill${showArchived ? " is-active" : ""}`}
                aria-pressed={showArchived}
                data-tip="Archived sources"
                onClick={() => setShowArchived((previous) => !previous)}
              >
                Archived ({archivedDatasets.length + archivedHandbookDocuments.length})
              </button>
            </div>

            <div className="piq-table" role="table" aria-label="Library sources">
              <div className="piq-table-head" role="row">
                <span role="columnheader">Title</span>
                <span role="columnheader">Rows</span>
                <span role="columnheader">Health</span>
                <span role="columnheader">Updated</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">
                  <span className="piq-sr-only">Actions</span>
                </span>
              </div>

              {visibleSources.map((source) => (
                <div className="piq-table-row" role="row" key={`${source.kind}-${source.id}`}>
                  <span className="piq-table-title" role="cell">
                    {source.title}
                    {source.kind === "dataset" && source.id === selectedDatasetId ? (
                      <em className="piq-active-tag">active</em>
                    ) : null}
                  </span>
                  <span role="cell" data-label="Rows">{source.rows}</span>
                  <span className="piq-health" role="cell" data-label="Health">
                    <HealthMark good={source.healthy} />
                    {source.healthLabel}
                  </span>
                  <span className="piq-table-muted" role="cell" data-label="Updated">
                    {formatShortDate(source.updatedAt)}
                  </span>
                  <span className="piq-table-muted" role="cell" data-label="Source">
                    {source.sourceLabel}
                  </span>
                  <span className="piq-table-actions" role="cell">
                    {!source.archived ? (
                      <a
                        className="piq-icon-button"
                        data-tip="Open full reader"
                        href={
                          source.kind === "dataset"
                            ? `/policy-assistant/library/policies/${encodeURIComponent(source.id)}`
                            : `/policy-assistant/library/handbooks/${encodeURIComponent(source.id)}`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span aria-hidden="true">⧉</span>
                        <span className="piq-sr-only">
                          Open {source.title} in the full document reader
                        </span>
                      </a>
                    ) : null}
                    {source.kind === "dataset" &&
                    !source.archived &&
                    source.id !== selectedDatasetId ? (
                      <button
                        type="button"
                        className="piq-icon-button"
                        data-tip="Make this the active policy source"
                        disabled={source.busy}
                        onClick={() => handleDatasetActivate(source.id)}
                      >
                        <span aria-hidden="true">✓</span>
                        <span className="piq-sr-only">Set {source.title} as active source</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="piq-icon-button"
                      data-tip="Rename"
                      disabled={source.busy}
                      onClick={() => {
                        if (source.dataset) {
                          void handleDatasetRename(source.dataset);
                        } else if (source.document) {
                          void handleHandbookRename(source.document);
                        }
                      }}
                    >
                      <span aria-hidden="true">✎</span>
                      <span className="piq-sr-only">Rename {source.title}</span>
                    </button>
                    <button
                      type="button"
                      className="piq-icon-button"
                      data-tip={source.archived ? "Restore" : "Archive"}
                      disabled={source.busy}
                      onClick={() => {
                        if (source.dataset) {
                          void handleDatasetArchive(source.dataset, !source.archived);
                        } else if (source.document) {
                          void handleHandbookArchive(source.document, !source.archived);
                        }
                      }}
                    >
                      <span aria-hidden="true">{source.archived ? "⤴" : "⤵"}</span>
                      <span className="piq-sr-only">
                        {source.archived ? "Restore" : "Archive"} {source.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="piq-icon-button is-danger"
                      data-tip="Delete"
                      disabled={source.busy}
                      onClick={() => {
                        if (source.dataset) {
                          void handleDatasetDelete(source.dataset);
                        } else if (source.document) {
                          void handleHandbookDelete(source.document);
                        }
                      }}
                    >
                      <span aria-hidden="true">🗑</span>
                      <span className="piq-sr-only">Delete {source.title}</span>
                    </button>
                  </span>
                </div>
              ))}

              {visibleSources.length === 0 ? (
                <p className="piq-table-empty">
                  {isWorkspaceLoading
                    ? "Loading your sources…"
                    : showArchived
                      ? "Nothing archived — archived sources are excluded from answers but kept for your records."
                      : "No sources here yet. Use ＋ Add source to import policies or upload a handbook."}
                </p>
              ) : null}
            </div>

            {showArchived ? (
              <p className="piq-note">
                Archived sources are excluded from the assistant&rsquo;s answers. Restore (⤴) to
                include them again, or delete permanently.
              </p>
            ) : null}

            {!showArchived && missingHandbooks.length > 0 && activeDatasets.length > 0 ? (
              <div className="piq-callout">
                <HealthMark good={false} />
                <span className="piq-callout-text">
                  Your {missingHandbooks.join(" and ")} hasn&rsquo;t been added — related questions
                  will answer from policies only.
                </span>
                <button
                  type="button"
                  className="piq-button piq-button-ghost"
                  data-tip="Add handbook"
                  onClick={() => {
                    setSourceTab("handbook");
                    setView("source");
                  }}
                >
                  Add it now
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------- Policy detail view */

  const policyDetailView = (
    <div className="piq-page">
      <div className="piq-page-inner is-narrow">
        <button type="button" className="piq-back" onClick={() => setView("library")}>
          ← Library
        </button>
        {policyIndexError ? (
          <div className="piq-feedback" aria-live="polite">
            <p className="piq-error">{policyIndexError}</p>
          </div>
        ) : null}
        {detailView ? (
          <>
            <div className="piq-detail-head">
              {detailView.code ? <span className="piq-detail-code">{detailView.code}</span> : null}
              <h1 className="piq-detail-title">{detailView.title}</h1>
            </div>
            <div className="piq-detail-meta">
              {detailView.metadata.map((field) => (
                <span key={`${field.label}-${field.value}`}>
                  {field.label}: {field.value}
                </span>
              ))}
              <span className="piq-spacer" />
              <button
                type="button"
                className="piq-link"
                data-tip="Copy"
                onClick={() => {
                  void window.navigator.clipboard.writeText(detailView.bodyText).catch(() => {
                    setPolicyIndexError("Your browser blocked clipboard access.");
                  });
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="piq-link"
                data-tip="Ask about this policy"
                onClick={() => {
                  setScenario(
                    `About policy ${[detailView.code, detailView.title].filter(Boolean).join(" — ")}: `,
                  );
                  setView("assistant");
                  window.setTimeout(focusComposer, 0);
                }}
              >
                Ask about this policy
              </button>
            </div>
            <div className="piq-detail-body">
              {detailView.bodyText.split(/\n{2,}/).map((paragraph, index) => (
                <p key={`detail-p-${index}`}>{renderRichText(paragraph)}</p>
              ))}
            </div>
            {relatedPolicies.length > 0 ? (
              <div className="piq-related">
                <span className="piq-microlabel">Related policies</span>
                <span className="piq-related-chips">
                  {relatedPolicies.map((policy) => (
                    <button
                      key={policy.id}
                      type="button"
                      className="piq-chip"
                      onClick={() => openLibraryPolicy(policy)}
                    >
                      {[policy.policyCode, policy.policyTitle || "Untitled policy"]
                        .filter(Boolean)
                        .join(" · ")}
                    </button>
                  ))}
                </span>
              </div>
            ) : detailView.relatedText ? (
              <div className="piq-related">
                <span className="piq-microlabel">Related</span>
                <span>{detailView.relatedText}</span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="piq-empty-note">
            Choose a policy from the Library or an evidence chip to read its full text.
          </p>
        )}
      </div>
    </div>
  );

  /* ------------------------------------------------------ Add source view */

  const sourceView = (
    <div className="piq-page">
      <div className="piq-page-inner">
        <h1 className="piq-page-title">Add a source</h1>
        <div className="piq-tabs">
          {SOURCE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`piq-tab${sourceTab === tab.key ? " is-active" : ""}`}
              aria-pressed={sourceTab === tab.key}
              onClick={() => setSourceTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {sourceTab === "import" ? importPanel : null}
        {sourceTab === "csv" ? csvPanel : null}
        {sourceTab === "handbook" ? handbookPanel : null}

        {sourceFeedback}
      </div>
    </div>
  );

  return (
    <div className="piq-app">
      {mobileHeader}
      {rail}
      <main className="piq-main">
        {view === "assistant" ? assistantView : null}
        {view === "history" ? historyView : null}
        {view === "pinned" ? pinnedView : null}
        {view === "library" ? libraryView : null}
        {view === "policy" ? policyDetailView : null}
        {view === "source" ? sourceView : null}
        {view === "help" ? helpView : null}
        {view === "profile" ? profileView : null}
      </main>
      {accountMenu}
    </div>
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
        clearSessionState();
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

      // Engage the guided setup only for users who have no active sources and
      // have never finished or skipped it before.
      const hasActiveDatasets = payload.datasets.some((dataset) => !dataset.archivedAt);
      if (!hasActiveDatasets && authUser && !readSetupDone(authUser.id)) {
        setIsSetupEngaged(true);
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
        const message =
          payload.error ?? "Please verify your email before loading handbook documents.";
        setStudentHandbookError(message);
        setStaffHandbookError(message);
        return;
      }

      if (!response.ok || !Array.isArray(payload.documents)) {
        throw new Error(payload.error ?? "Could not load handbook documents.");
      }

      setHandbookDocuments(payload.documents);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load handbook documents.";
      setStudentHandbookError(message);
      setStaffHandbookError(message);
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
      setConversationError(
        error instanceof Error ? error.message : "Could not load conversation history.",
      );
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
          storedId: message.id,
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
    setPinnedAnswers([]);
    setIsSetupEngaged(false);
    setIsSetupDismissed(false);
    setSetupStep(1);
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
    setStudentHandbookStatus("");
    setStudentHandbookError("");
    setStaffHandbookStatus("");
    setStaffHandbookError("");
    setHandbookManagementStatus("");
    setHandbookManagementError("");
    setChatError("");
    setConversationError("");
    setAuthInfo("");
    setAuthMode("login");
    setAuthEmail("");
    setAuthPassword("");
    setAuthDistrictName("");
    setAuthFirstName("");
    setAuthLastName("");
    setProfileDraftFirst("");
    setProfileDraftLast("");
    setProfileDraftDistrict("");
    setProfileDraftRole("");
    setProfileDraftContext("");
    setProfileError("");
    setProfileStatus("");
    setResetToken("");
    setDatasetPolicies({});
    setDetailView(null);
    setView("assistant");
    setIsAccountMenuOpen(false);
  }

  function buildEvidenceChips(
    message: ChatMessage,
    items: RenderedChatBubble[],
  ): EvidenceItem[] {
    const chips: EvidenceItem[] = [];

    for (const item of items) {
      const card = item.referenceCard;
      if (!card) {
        continue;
      }

      chips.push({
        id: `${item.id}-evidence`,
        messageId: message.id,
        label: buildChipLabel(card),
        title: card.title,
        quote: card.summary,
        meta: [
          ...card.metadata
            .filter(
              (field) =>
                !/^(not listed|no policy revisions|none|n\/a|unknown)$/i.test(field.value.trim()),
            )
            .map((field) => `${field.label} ${field.value}`),
          message.answerEvidence?.policyDataset.title ?? selectedDataset?.title ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
        lookup: card.lookup,
      });
    }

    if (chips.length > 0) {
      return chips;
    }

    const evidence = message.answerEvidence;
    if (!evidence) {
      return chips;
    }

    for (const match of evidence.policyMatches) {
      chips.push({
        id: `${message.id}-policy-${match.id}`,
        messageId: message.id,
        label: [match.policyCode, match.policyTitle].filter(Boolean).join(" · ") || "Policy",
        title: [match.policyCode, match.policyTitle].filter(Boolean).join(" — ") || "Policy",
        quote: "",
        meta: [
          match.policySection,
          match.revisedDate ? `Revised ${match.revisedDate}` : "",
          evidence.policyDataset.title,
        ]
          .filter(Boolean)
          .join(" · "),
        lookup: {
          kind: "policy",
          datasetId: evidence.policyDataset.id,
          policyCode: match.policyCode,
          policyTitle: match.policyTitle,
        },
      });
    }

    for (const version of evidence.handbookVersions) {
      for (const excerpt of version.matchedExcerpts) {
        chips.push({
          id: `${message.id}-handbook-${version.id}-${excerpt.id}`,
          messageId: message.id,
          label: `${formatHandbookTypeLabel(version.handbookType)} · ${
            excerpt.sectionTitle || "Guidance"
          }`,
          title: excerpt.sectionTitle || formatHandbookTypeLabel(version.handbookType),
          quote: "",
          meta: `${version.title} · uploaded ${formatShortDate(version.uploadedAt)}`,
          lookup: {
            kind: "handbook",
            handbookType: version.handbookType,
            sectionTitle: excerpt.sectionTitle,
          },
        });
      }
    }

    return chips;
  }

}

function buildLibrarySources(
  allDatasets: PolicyDataset[],
  allHandbooks: HandbookDocument[],
  busyDatasetId: string,
  busyHandbookDocumentId: string,
): LibrarySource[] {
  const datasetSources: LibrarySource[] = allDatasets.map((dataset) => ({
    id: dataset.id,
    kind: "dataset",
    title: dataset.title,
    rows: String(dataset.policyCount),
    healthy: dataset.policyCount > 0,
    healthLabel: dataset.policyCount > 0 ? "Good" : "No rows",
    updatedAt: dataset.uploadedAt,
    sourceLabel: formatDatasetSource(dataset),
    archived: Boolean(dataset.archivedAt),
    busy: busyDatasetId === dataset.id,
    dataset,
  }));

  const handbookSources: LibrarySource[] = allHandbooks.map((document) => ({
    id: document.id,
    kind: "handbook",
    handbookType: document.handbookType,
    title: document.title,
    rows: `${document.chunkCount} sections`,
    healthy: document.chunkCount > 0,
    healthLabel: document.chunkCount > 0 ? "Good" : "No excerpts",
    updatedAt: document.uploadedAt,
    sourceLabel: `${formatHandbookTypeLabel(document.handbookType)} upload`,
    archived: Boolean(document.archivedAt),
    busy: busyHandbookDocumentId === document.id,
    document,
  }));

  return [...datasetSources, ...handbookSources];
}

interface LibrarySource {
  id: string;
  kind: "dataset" | "handbook";
  handbookType?: "student" | "staff";
  title: string;
  rows: string;
  healthy: boolean;
  healthLabel: string;
  updatedAt: string;
  sourceLabel: string;
  archived: boolean;
  busy: boolean;
  dataset?: PolicyDataset;
  document?: HandbookDocument;
}

function renderRichText(text: string): ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
      return <strong key={index}>{segment.slice(2, -2)}</strong>;
    }
    return <span key={index}>{segment}</span>;
  });
}

function parseNumberedSteps(content: string): string[] {
  const steps: string[] = [];
  for (const raw of stripLeadingSectionLabel(content).split("\n")) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const isNewStep = /^(?:[-*•]\s+|\*\*?\d+[.)]\s*|\d+[.)]\s+)/.test(line);
    const text = line.replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, "").replace(/^\*\*(\d+[.)])\s*/, "");
    if (isNewStep || steps.length === 0) {
      steps.push(text);
    } else {
      steps[steps.length - 1] = `${steps[steps.length - 1]} ${line}`;
    }
  }
  return steps;
}

function findPrecedingQuestion(
  groups: Array<{ message: ChatMessage }>,
  index: number,
): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (groups[cursor].message.role === "user") {
      return groups[cursor].message.content.trim();
    }
  }
  return "";
}

function buildChipLabel(card: ReferenceCard): string {
  const title = card.title.replace(/\s+-\s+/, " · ");
  return truncateReferenceSummary(title, 46);
}

function buildSearchExcerpt(wording: string, query: string): string {
  const normalized = wording.replace(/\s+/g, " ").trim();
  const term = query.trim().toLowerCase();
  const index = normalized.toLowerCase().indexOf(term);
  if (index < 0 || !term) {
    return truncateReferenceSummary(normalized, 180);
  }

  // Snap the excerpt window to word boundaries so it never opens mid-word.
  let start = Math.max(0, index - 80);
  if (start > 0) {
    const nextSpace = normalized.indexOf(" ", start);
    if (nextSpace >= 0 && nextSpace < index) {
      start = nextSpace + 1;
    }
  }
  let end = Math.min(normalized.length, start + 200);
  if (end < normalized.length) {
    const lastSpace = normalized.lastIndexOf(" ", end);
    if (lastSpace > start + 100) {
      end = lastSpace;
    }
  }
  const slice = normalized.slice(start, end);
  return `${start > 0 ? "…" : ""}${slice}${end < normalized.length ? "…" : ""}`;
}

function totalPolicyCount(datasets: PolicyDataset[]): number {
  return datasets.reduce((total, dataset) => total + dataset.policyCount, 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRelatedPolicies(
  detail: { code: string; title: string; section: string; bodyText: string },
  policies: LibraryPolicyRecord[],
): LibraryPolicyRecord[] {
  const others = policies.filter(
    (policy) =>
      !(policy.policyCode === detail.code && (policy.policyTitle || "Untitled policy") === detail.title),
  );

  const referenced: LibraryPolicyRecord[] = [];
  for (const policy of others) {
    const code = policy.policyCode.trim();
    if (!code || code.length < 2) {
      continue;
    }
    const pattern = new RegExp(
      `\\b(?:policy|policies|rule|bylaw)\\s*(?:no\\.?|number|#)?\\s*${escapeRegExp(code)}\\b`,
      "i",
    );
    if (pattern.test(detail.bodyText)) {
      referenced.push(policy);
    }
  }

  const sameSection = detail.section
    ? others
        .filter(
          (policy) =>
            policy.policySection.trim() === detail.section.trim() &&
            !referenced.includes(policy),
        )
        .sort((a, b) => {
          const currentCode = Number.parseInt(detail.code, 10);
          const codeA = Number.parseInt(a.policyCode, 10);
          const codeB = Number.parseInt(b.policyCode, 10);
          if (Number.isFinite(currentCode) && Number.isFinite(codeA) && Number.isFinite(codeB)) {
            return Math.abs(codeA - currentCode) - Math.abs(codeB - currentCode);
          }
          return a.policyCode.localeCompare(b.policyCode);
        })
    : [];

  return [...referenced, ...sameSection].slice(0, 4);
}

function deriveFirstName(email: string): string {
  const local = email.split("@")[0] ?? "";
  const first = local.split(/[._-]/)[0] ?? "";
  if (!first) {
    return "there";
  }
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function deriveInitials(email: string, districtName: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  if (local.length >= 2) {
    return local.slice(0, 2).toUpperCase();
  }
  return (districtName.slice(0, 2) || "PA").toUpperCase();
}


function findMetadataValue(metadata: ReferenceField[], label: string): string {
  return metadata.find((field) => field.label === label)?.value ?? "";
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLongDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDelta = Math.round((startOfToday - startOfDate) / 86400000);

  if (dayDelta <= 0) {
    return "Today";
  }
  if (dayDelta === 1) {
    return "Yesterday";
  }
  if (dayDelta < 7) {
    return `${dayDelta} days ago`;
  }
  return formatShortDate(value);
}

function readSetupDone(userId: string): boolean {
  try {
    return window.localStorage.getItem(`piq-setup-done:${userId}`) === "1";
  } catch {
    return false;
  }
}

function writeSetupDone(userId: string): void {
  try {
    window.localStorage.setItem(`piq-setup-done:${userId}`, "1");
  } catch {
    // Ignore persistence failures.
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

function buildPolicyReferenceCard(
  content: string,
  selectedDatasetId: string,
): ReferenceCard | undefined {
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

  const isNoMatch =
    /^no matching .*handbook guidance$/i.test(sectionTitle.trim()) ||
    /no matching .*handbook guidance found/i.test(handbookGuidance);

  // A "no matching guidance" placeholder is an honest absence, not a source.
  // Rendering it as a citation chip would fabricate evidence.
  if (isNoMatch) {
    return undefined;
  }

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
  const safeBoundary = Math.max(
    truncated.lastIndexOf(" "),
    truncated.lastIndexOf("."),
    truncated.lastIndexOf(","),
  );
  const summary = safeBoundary > maxLength / 2 ? truncated.slice(0, safeBoundary) : truncated;
  return `${summary.trim()}...`;
}

function buildReferenceField(
  label: string,
  value: string | null | undefined,
): ReferenceField | null {
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
  return handbookType === "staff" ? "Staff handbook" : "Student handbook";
}

function formatDatasetSource(dataset: PolicyDataset): string {
  if (dataset.sourceType === "scraper_import") {
    const platform = formatDatasetSourcePlatform(dataset.sourcePlatform);
    return platform ? `Scraper · ${platform}` : "Scraper";
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
    return "Create your workspace";
  }

  if (mode === "forgot") {
    return "Reset your password";
  }

  if (mode === "reset") {
    return "Set a new password";
  }

  return "Sign in";
}

function authButtonLabel(mode: AuthMode): string {
  if (mode === "signup") {
    return "Create workspace";
  }

  if (mode === "forgot") {
    return "Email reset link";
  }

  if (mode === "reset") {
    return "Update password";
  }

  return "Sign in";
}

function clearAuthQueryParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("verifyToken");
  url.searchParams.delete("resetToken");
  // Preserve any existing history state (the navigation integration tags
  // entries with the active page) while stripping auth tokens from the URL.
  window.history.replaceState(window.history.state, "", url.toString());
}
