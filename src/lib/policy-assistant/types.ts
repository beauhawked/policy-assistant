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
  districtName: string;
  filename: string;
  uploadedAt: string;
  policyCount: number;
}

export interface HandbookDocument {
  id: string;
  districtName: string;
  filename: string;
  uploadedAt: string;
  chunkCount: number;
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

export interface PolicyConversationMessage {
  id: number;
  conversationId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

export interface StoredPolicy extends NormalizedPolicyRow {
  id: number;
  datasetId: string;
  embedding: number[] | null;
}

export interface RetrievalResult extends StoredPolicy {
  relevanceScore: number;
}

export interface StoredHandbookChunk {
  id: number;
  documentId: string;
  sectionTitle: string;
  content: string;
  sourceIndex: number;
  embedding: number[] | null;
}

export interface HandbookRetrievalResult extends StoredHandbookChunk {
  relevanceScore: number;
}

export interface StoredStateLawChunk {
  id: number;
  stateCode: string;
  sourceName: string;
  citationTitle: string;
  sectionId: string;
  sourceUrl: string;
  content: string;
  sourceUpdatedAt: string | null;
  embedding: number[] | null;
}

export interface StateLawRetrievalResult extends StoredStateLawChunk {
  relevanceScore: number;
}

export interface LiveStateLawSource {
  title: string;
  url: string;
  excerpt: string;
  relevanceNote: string;
}
