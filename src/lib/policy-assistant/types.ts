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

export interface AuthUser {
  id: string;
  email: string;
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
}

export interface RetrievalResult extends StoredPolicy {
  relevanceScore: number;
}
