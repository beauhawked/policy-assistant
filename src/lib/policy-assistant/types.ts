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
}

export interface StoredPolicy extends NormalizedPolicyRow {
  id: number;
  datasetId: string;
}

export interface RetrievalResult extends StoredPolicy {
  relevanceScore: number;
}
