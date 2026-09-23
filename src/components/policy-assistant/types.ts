import { ReactNode } from "react";

export type HandbookType = "student" | "staff";

export interface NormalizedPolicyRow {
  policySection: string;
  policyCode: string;
  adoptedDate: string;
  revisedDate: string;
  policyStatus: string;
  policyTitle: string;
  policyWording: string;
  sourceRowIndex: number;
}

export interface PolicyDataset {
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

export interface HandbookDocument {
  id: string;
  title: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  chunkCount: number;
  handbookType: HandbookType;
  archivedAt: string | null;
}

export type PolicyPlatform = "auto" | "boarddocs" | "table-link" | "accordion-pdf" | "parentsquare";

export interface PolicyImportSummary {
  platform: Exclude<PolicyPlatform, "auto">;
  platformLabel: string;
  sourceUrl: string;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
  policyCount: number;
  filename: string;
}

export interface PolicyImportQuality {
  missingTitleCount: number;
  missingWordingCount: number;
  missingCodeCount: number;
  duplicateCodeCount: number;
}

export interface PolicyImportPreviewRow {
  policySection: string;
  policyCode: string;
  policyTitle: string;
  policyWordingPreview: string;
}

export interface PolicyImportPreview extends PolicyImportSummary {
  id: string;
  expiresAt: string;
  quality: PolicyImportQuality;
  sampleRows: PolicyImportPreviewRow[];
}

export interface PolicyAnswerEvidenceDataset {
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

export interface PolicyAnswerEvidencePolicyMatch {
  id: number;
  policySection: string;
  policyCode: string;
  policyTitle: string;
  revisedDate: string;
}

export interface PolicyAnswerEvidenceHandbookExcerpt {
  id: number;
  sectionTitle: string;
  sourceIndex: number;
}

export interface PolicyAnswerEvidenceHandbookVersion {
  id: string;
  title: string;
  handbookType: "student" | "staff";
  filename: string;
  uploadedAt: string;
  chunkCount: number;
  matchedExcerpts: PolicyAnswerEvidenceHandbookExcerpt[];
}

export interface PolicyAnswerEvidenceSnapshot {
  capturedAt: string;
  policyDataset: PolicyAnswerEvidenceDataset;
  policyMatches: PolicyAnswerEvidencePolicyMatch[];
  handbookVersions: PolicyAnswerEvidenceHandbookVersion[];
}

export interface ChatMessage {
  id: string;
  storedId?: number;
  role: "user" | "assistant";
  content: string;
  answerEvidence?: PolicyAnswerEvidenceSnapshot | null;
}

export interface AuthUser {
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

export interface ConversationSummary {
  id: string;
  datasetId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface ConversationMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  answerEvidence: PolicyAnswerEvidenceSnapshot | null;
}

export interface RetrievalPolicyMatch {
  id: number;
  policySection: string;
  policyCode: string;
  policyTitle: string;
  relevanceScore: number;
  excerpt: string;
}

export interface RetrievalHandbookMatch {
  id: number;
  handbookType: "student" | "staff";
  sectionTitle: string;
  relevanceScore: number;
  excerpt: string;
}

export interface RetrievalPostgresPolicyCandidate {
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

export interface RetrievalPostgresHandbookCandidate {
  id: number;
  handbookType: "student" | "staff";
  sectionTitle: string;
  fullTextRank: number;
  trigramScore: number;
  combinedRank: number;
  selectedByCurrentRetrieval: boolean;
  excerpt: string;
}

export interface RetrievalPostgresComparison {
  query: string;
  policyCandidateCount: number;
  handbookCandidateCount: number;
  policyCandidates?: RetrievalPostgresPolicyCandidate[];
  handbookCandidates?: RetrievalPostgresHandbookCandidate[];
}

export interface RetrievalSemanticPolicyCandidate {
  id: number;
  policySection: string;
  policyCode: string;
  policyTitle: string;
  semanticScore: number;
  subIssues: string[];
  selectedByCurrentRetrieval: boolean;
  excerpt: string;
}

export interface RetrievalSemanticHandbookCandidate {
  id: number;
  handbookType: "student" | "staff";
  sectionTitle: string;
  semanticScore: number;
  subIssues: string[];
  selectedByCurrentRetrieval: boolean;
  excerpt: string;
}

export interface RetrievalSemanticComparison {
  policyCandidateCount: number;
  handbookCandidateCount: number;
  policyCandidates?: RetrievalSemanticPolicyCandidate[];
  handbookCandidates?: RetrievalSemanticHandbookCandidate[];
}

export interface RetrievalDebugData {
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

export type AssistantSectionKind =
  | "general"
  | "policy"
  | "handbook"
  | "action"
  | "implications"
  | "disclaimer";

export interface AssistantMessageSection {
  kind: AssistantSectionKind;
  content: string;
}

export interface RenderedChatBubble {
  id: string;
  role: "user" | "assistant";
  kind: AssistantSectionKind;
  label?: string;
  content: string;
  answerEvidence?: PolicyAnswerEvidenceSnapshot | null;
  referenceCard?: ReferenceCard;
}

export interface ReferenceField {
  label: string;
  value: string;
}

export type ReferenceLookup =
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

export interface ReferenceCard {
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

export interface LoadedReferenceDetail {
  metadata: ReferenceField[];
  bodyLabel: string;
  bodyText: string;
}

export interface LibraryPolicyRecord {
  id: number;
  policySection: string;
  policyCode: string;
  adoptedDate: string;
  revisedDate: string;
  policyStatus: string;
  policyTitle: string;
  policyWording: string;
}

export interface EvidenceItem {
  id: string;
  messageId: string;
  label: string;
  title: string;
  quote: string;
  meta: string;
  lookup?: ReferenceLookup;
}

export interface PinnedAnswer {
  messageId: number;
  title: string;
  body: string;
  meta: string;
  pinnedAt: string;
  conversationId: string;
}

export interface StoredPinnedAnswerPayload {
  messageId: number;
  conversationId: string;
  datasetId: string;
  title: string;
  body: string;
  meta: string;
  createdAt: string;
}

export interface DetailView {
  kind: "policy" | "handbook";
  code: string;
  title: string;
  section: string;
  metadata: ReferenceField[];
  bodyText: string;
  relatedText: string;
}

export type AuthMode = "login" | "signup" | "forgot" | "reset";
export type AppView = "assistant" | "history" | "pinned" | "library" | "policy" | "source" | "help" | "profile";
export type SourceTab = "import" | "csv" | "handbook";
export type LibraryFilter = "all" | "policies" | "student" | "staff";
export type TextSize = "standard" | "large" | "larger";

export const MESSAGE_LIST_NEAR_BOTTOM_PX = 120;
export const HIGH_CONTRAST_STORAGE_KEY = "piq-hc";
export const TEXT_SIZE_STORAGE_KEY = "piq-textsize";
export const REDUCED_MOTION_STORAGE_KEY = "piq-reduced-motion";

export const TEXT_SIZE_OPTIONS: Array<{ key: TextSize; label: string }> = [
  { key: "standard", label: "Standard" },
  { key: "large", label: "Large" },
  { key: "larger", label: "Larger" },
];

export const SHOW_RETRIEVAL_DEBUG =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_RETRIEVAL_DEBUG === "1";

export const EXAMPLE_SCENARIOS = [
  "A student is being bullied online by classmates. What does our policy require us to do?",
  "A parent requested their child's education records. What are we required to provide, and how quickly?",
  "A teacher needs extended medical leave mid-semester. What does our staff handbook allow?",
];

export const STARTER_PROMPTS = [
  "A student is being bullied online — what must we do?",
  "A parent requested education records — what's the deadline?",
  "A teacher needs extended medical leave mid-semester.",
];

export const NAV_ITEMS: Array<{
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

export type HelpTab = "start" | "faq" | "trust";

export const HELP_TABS: Array<{ key: HelpTab; label: string }> = [
  { key: "start", label: "Getting started" },
  { key: "faq", label: "FAQ" },
  { key: "trust", label: "Trust and privacy" },
];

export const HELP_DOWNLOADS: Array<{ label: string; file: string }> = [
  { label: "Quick-Start Guide (PDF)", file: "/help/Policy-to-Action-Quick-Start-Participants.pdf" },
  { label: "District Setup Guide (PDF)", file: "/help/Policy-to-Action-District-Setup-Guide.pdf" },
  { label: "User Manual (PDF)", file: "/help/Policy-to-Action-User-Manual.pdf" },
  {
    label: "Technical Blueprint for District IT (PDF)",
    file: "/help/Policy-to-Action-Technical-Blueprint.pdf",
  },
];

export const FAQ_ITEMS: Array<{ q: string; a: string }> = [
  {
    q: "My verification email has not arrived.",
    a: "Check your spam or quarantine folder; the sender is Policy Aligned. You can request a fresh link with Resend verification on the sign-in screen. Some district mail filters take several minutes to release messages.",
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
    a: "Select any citation chip beneath an answer to open the evidence panel, which quotes the exact policy text the answer was grounded in. Open full source shows the complete policy. Policy Aligned is decision support, not legal advice; verify consequential decisions against the cited source.",
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

export const SOURCE_TABS: Array<{ key: SourceTab; label: string }> = [
  { key: "import", label: "Import from district website" },
  { key: "csv", label: "Upload CSV" },
  { key: "handbook", label: "Upload handbook PDF" },
];
