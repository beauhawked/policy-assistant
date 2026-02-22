export type ChamberName = "House" | "Senate" | "Unknown";

export interface ApiLinkName {
  link?: string;
  name?: string;
}

export interface ApiPerson {
  fullName?: string;
  firstName?: string;
  firstname?: string;
  lastName?: string;
  lastname?: string;
  party?: string;
  position_title?: string;
  link?: string;
}

export interface ApiSubject {
  entry?: string;
  link?: string;
}

export interface ApiBillListItem {
  billName: string;
  displayName?: string;
  number?: string;
  originChamber?: ApiLinkName;
  type?: string;
  description?: string;
  link?: string;
  filed?: string;
}

export interface ApiBillListResponse {
  itemCount?: number;
  items?: ApiBillListItem[];
}

export interface ApiBillVersionSummary {
  billName: string;
  printVersion?: string;
  printVersionName?: string;
  stage?: string;
  stageVerbose?: string;
  year?: string;
  title?: string;
  shortDescription?: string;
  longDescription?: string;
  digest?: string;
  created?: string;
  updated?: string;
  filed?: string;
  printed?: string;
  link?: string;
}

export interface ApiBillVersionDetail extends ApiBillVersionSummary {
  subjects?: ApiSubject[];
  amendments?: ApiAmendment[];
  floor_amendments?: ApiAmendment[];
  cmte_amendments?: ApiAmendment[];
  drafts?: ApiDraft[];
  "fiscal-notes"?: Array<{ name?: string; link?: string }>;
  "committee-reports"?: Array<{ name?: string; link?: string }>;
  "committee-votesheet"?: Array<{ name?: string; link?: string }>;
  rollcalls?: ApiRollCall[];
  pdfDownloadLink?: string;
  pdfDownloadlink?: string;
}

export interface ApiRollCall {
  target?: string;
  chamber?: ApiLinkName;
  rollcall_number?: string;
  results?: { yea?: number | string; nay?: number | string };
  link?: string;
  type?: string;
}

export interface ApiDraft {
  name?: string;
  description?: string;
  datePublic?: string;
  author?: ApiPerson;
  authors?: ApiPerson;
  target_id?: string;
  base_name?: string;
  link?: string;
  pdfDownloadLink?: string;
  pdfDownloadlink?: string;
}

export interface ApiAmendment {
  name?: string;
  description?: string;
  state?: string;
  type?: string;
  author?: ApiPerson;
  publishtime?: string;
  link?: string;
  pdfDownloadLink?: string;
}

export interface ApiBillActionItem {
  date?: string;
  sequence?: string;
  day?: string;
  billName?: { billName?: string; link?: string };
  chamber?: ApiLinkName;
  committee?: { link?: string } | null;
  link?: string;
  description?: string;
}

export interface ApiBillActionsResponse {
  itemCount?: number;
  items?: ApiBillActionItem[];
}

export interface ApiBillDetailResponse {
  title?: string;
  billName: string;
  number?: string;
  description?: string;
  status?: string;
  stage?: string;
  year?: string;
  originChamber?: string | ApiLinkName;
  currentChamber?: string | ApiLinkName;
  type?: string;
  authors?: ApiPerson[];
  coauthors?: ApiPerson[];
  sponsors?: ApiPerson[];
  cosponsors?: ApiPerson[];
  advisors?: ApiPerson[];
  link?: string;
  committeeStatus?: string;
  latestVersion?: ApiBillVersionDetail;
  versions?: ApiBillVersionSummary[];
  actions?: { link?: string };
  all_rollcalls?: ApiRollCall[];
}

export interface BillIndexItem {
  billName: string;
  displayName: string;
  description: string;
  type: string;
  originChamber: ChamberName;
  currentChamber: ChamberName;
  categories: string[];
  status: string;
  stage: string;
  filedDate?: string;
  updatedAt?: string;
  latestVersionName?: string;
  authorNames: string[];
}

export interface BillIndex {
  year: string;
  generatedAt: string;
  count: number;
  items: BillIndexItem[];
}

export interface BillRecord {
  year: string;
  billName: string;
  fetchedAt: string;
  detail: ApiBillDetailResponse;
  actions: ApiBillActionItem[];
}

export interface BillComparison {
  year: string;
  billName: string;
  fromVersion: string;
  toVersion: string;
  generatedAt: string;
  originalText: string;
  updatedText: string;
  summary: string[];
  highlights: Array<{ before: string; after: string }>;
  stats: {
    addedLines: number;
    removedLines: number;
    unchangedLines: number;
    changeRatio: number;
  };
}

export interface SyncOptions {
  year: string;
  limit?: number;
  billNames?: string[];
  concurrency?: number;
}

export interface SyncResult {
  year: string;
  startedAt: string;
  finishedAt: string;
  pulled: number;
  failed: number;
  indexCount: number;
  failures: Array<{ billName: string; reason: string }>;
}
