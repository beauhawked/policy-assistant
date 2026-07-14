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

export type PolicyDatasetSourceType = "csv_upload" | "scraper_import";

export interface PolicyDataset {
  id: string;
  title: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  policyCount: number;
  sourceType: PolicyDatasetSourceType;
  sourceUrl: string;
  sourcePlatform: string;
  archivedAt: string | null;
}

export type HandbookType = "student" | "staff";

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

export interface AuthUser {
  id: string;
  email: string;
  districtName: string;
  createdAt: string;
  emailVerifiedAt: string | null;
}

export type ConversationRole = "user" | "assistant";

export interface PolicyConversation {
  id: string;
  datasetId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface PolicyAnswerEvidenceDataset {
  id: string;
  title: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  policyCount: number;
  sourceType: PolicyDatasetSourceType;
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
  handbookType: HandbookType;
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

export interface PolicyConversationMessage {
  id: number;
  conversationId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
  answerEvidence: PolicyAnswerEvidenceSnapshot | null;
}

export interface StoredPolicy extends NormalizedPolicyRow {
  id: number;
  datasetId: string;
}

export interface RetrievalResult extends StoredPolicy {
  relevanceScore: number;
}

export interface PolicySearchCandidate extends StoredPolicy {
  fullTextRank: number;
  trigramScore: number;
  combinedRank: number;
}

export interface StoredHandbookChunk {
  id: number;
  documentId: string;
  handbookType: HandbookType;
  sectionTitle: string;
  content: string;
  sourceIndex: number;
}

export interface HandbookRetrievalResult extends StoredHandbookChunk {
  relevanceScore: number;
}

export interface HandbookSearchCandidate extends StoredHandbookChunk {
  fullTextRank: number;
  trigramScore: number;
  combinedRank: number;
}

export interface PolicySemanticCandidate extends StoredPolicy {
  semanticScore: number;
}

export interface HandbookSemanticCandidate extends StoredHandbookChunk {
  semanticScore: number;
}

export interface EmbeddingCoverage {
  policiesTotal: number;
  policiesEmbedded: number;
  handbookChunksTotal: number;
  handbookChunksEmbedded: number;
}
