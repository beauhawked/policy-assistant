import type {
  ApiBillActionItem,
  ApiBillActionsResponse,
  ApiBillDetailResponse,
  ApiBillListItem,
  ApiBillListResponse,
  ApiBillVersionDetail,
  ApiBillVersionSummary,
  ApiPerson,
  ApiRollCall,
  ApiSubject,
} from "@/lib/types";

const API_BASE = process.env.IGA_API_BASE ?? "https://iga.in.gov/api";
const STATIC_BASE = process.env.IGA_STATIC_BASE ?? "https://iga.in.gov";
const USER_AGENT =
  process.env.IGA_USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type LegacySessionYear = {
  lpid: string;
  year: string;
  assembly_id: string;
  active: boolean;
};

type LegacySessionYearsResponse = {
  years?: LegacySessionYear[];
};

type LegacyBillListItem = {
  id: string;
  apn: string;
  prefix: string;
  number: string;
  name: string;
  base_name: string;
  type: string;
  description: string | null;
  chamber: string;
  dead: boolean;
  url: string;
  label: string;
};

type LegacyBillListResponse = {
  bills?: LegacyBillListItem[];
};

type LegacyBillVersion = {
  id: string;
  apn: string;
  prefix: string;
  type: string;
  number: string;
  stage: string;
  status: string;
  base_name: string;
  name: string;
  title: string;
  origin_chamber: string;
  current_chamber: string;
  dead: boolean;
  print_version: number;
  printed: string | null;
  updated: string | null;
  short_description: string | null;
  long_description: string | null;
  digest: string | null;
  stage_verbose: string;
  canonical_name: string;
};

type LegacyAction = {
  id: string;
  sequence: string;
  bill_name: string;
  bill_version: string;
  date: string;
  chamber: string;
  text: string;
  lpid: string;
};

type LegacyAmendment = {
  id: string;
  bill_id: string;
  name: string;
  state: string;
  description: string | null;
  date_filed: string | null;
  number: number;
  chamber: string;
};

type LegacyUser = {
  honorific?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  party?: string;
  lpid?: string;
};

type LegacyBillDetailResponse = {
  bill: LegacyBillVersion;
  bill_versions?: LegacyBillVersion[];
  bill_actions?: LegacyAction[];
  amendments?: LegacyAmendment[];
  users?: Record<string, LegacyUser[]>;
  roll_calls?:
    | Array<{
        target_id?: string;
        chamber?: string;
        vote_rc_number?: string;
        yea?: number;
        nay?: number;
      }>
    | undefined;
};

const browserHeaders = {
  "User-Agent": USER_AGENT,
  Origin: "https://iga.in.gov",
  Referer: "https://iga.in.gov/legislative/2026/bills",
  "X-Requested-With": "XMLHttpRequest",
  "sec-fetch-site": "same-origin",
  "sec-fetch-mode": "cors",
} as const;

function jsonHeaders(extra?: HeadersInit): HeadersInit {
  return {
    ...browserHeaders,
    Accept: "application/json, text/plain, */*",
    "sec-fetch-dest": "empty",
    ...extra,
  };
}

function pdfHeaders(extra?: HeadersInit): HeadersInit {
  return {
    ...browserHeaders,
    Accept: "application/pdf,application/octet-stream,*/*;q=0.8",
    "sec-fetch-dest": "document",
    ...extra,
  };
}

function buildApiUrl(pathname: string): string {
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
    return pathname;
  }

  if (pathname.startsWith("/")) {
    return `${API_BASE}${pathname}`;
  }

  return `${API_BASE}/${pathname}`;
}

function looksLikeSpaShell(value: string): boolean {
  const normalized = value.trimStart().toLowerCase();
  return normalized.startsWith("<!doctype html") && normalized.includes("<div id=\"root\"></div>");
}

function chamberLabel(value: string | undefined): string {
  if (!value) {
    return "Unknown";
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("house")) {
    return "House";
  }

  if (normalized.includes("senate")) {
    return "Senate";
  }

  return "Unknown";
}

function legacyDateToIso(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = /^(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!parsed) {
    return undefined;
  }

  const [, month, day, year, hour, minute, second] = parsed;

  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  ).toISOString();
}

function personFromLegacy(user: LegacyUser): ApiPerson {
  const honorific = user.honorific?.trim();
  const first = (user.first_name ?? user.firstName ?? "").trim();
  const last = (user.last_name ?? user.lastName ?? "").trim();

  return {
    firstName: first || undefined,
    lastName: last || undefined,
    fullName: [honorific, first, last].filter(Boolean).join(" ") || undefined,
    party: user.party,
    link: user.lpid ? `/legislative/2026/legislators/${user.lpid}` : undefined,
  };
}

function mapSubjects(detail: LegacyBillDetailResponse): ApiSubject[] {
  const digest = detail.bill.digest ?? "";

  if (!digest.trim()) {
    return [];
  }

  const phrases = digest
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  return phrases.map((entry) => ({ entry }));
}

function mapRollCalls(detail: LegacyBillDetailResponse, year: string, billName: string): ApiRollCall[] {
  return (detail.roll_calls ?? []).map((rollCall) => ({
    target: rollCall.target_id,
    chamber: {
      name: chamberLabel(rollCall.chamber),
    },
    rollcall_number: rollCall.vote_rc_number,
    results: {
      yea: rollCall.yea,
      nay: rollCall.nay,
    },
    link: `/legislative/${year}/bills/${billName}/rollcalls/${rollCall.vote_rc_number ?? "unknown"}`,
    type: "BILL",
  }));
}

function mapVersion(version: LegacyBillVersion, year: string, subjects: ApiSubject[]): ApiBillVersionDetail {
  const pdfDownloadLink = buildVersionPdfUrl(version);

  return {
    billName: version.base_name,
    printVersion: String(version.print_version),
    printVersionName: version.name,
    stage: version.stage,
    stageVerbose: version.stage_verbose,
    year,
    title: version.title,
    shortDescription: version.short_description ?? undefined,
    longDescription: version.long_description ?? undefined,
    digest: version.digest ?? undefined,
    updated: legacyDateToIso(version.updated),
    printed: legacyDateToIso(version.printed),
    subjects,
    amendments: [],
    floor_amendments: [],
    cmte_amendments: [],
    drafts: [],
    rollcalls: [],
    pdfDownloadLink,
  };
}

function mapListItem(item: LegacyBillListItem): ApiBillListItem {
  return {
    billName: item.base_name,
    displayName: item.label,
    number: item.number,
    originChamber: {
      name: chamberLabel(item.chamber),
    },
    type: item.type,
    description: item.description ?? undefined,
    link: item.url,
  };
}

function resolveLatestVersion(
  detail: LegacyBillDetailResponse,
  year: string,
  subjects: ApiSubject[],
): ApiBillVersionDetail {
  const versions = detail.bill_versions ?? [detail.bill];
  const latest = [...versions].sort((left, right) => right.print_version - left.print_version)[0] ?? detail.bill;

  const latestMapped = mapVersion(latest, year, subjects);

  const matchingAmendments = (detail.amendments ?? [])
    .filter((amendment) => amendment.bill_id === latest.id)
    .map((amendment) => ({
      name: amendment.name,
      description: amendment.description ?? undefined,
      state: amendment.state,
      type: amendment.chamber,
      publishtime: legacyDateToIso(amendment.date_filed),
      link: `/legislative/${year}/bills/${detail.bill.base_name}/amendments/${amendment.name}`,
      pdfDownloadLink: buildAmendmentPdfUrl(detail.bill, amendment),
    }));

  latestMapped.amendments = matchingAmendments;
  latestMapped.rollcalls = mapRollCalls(detail, year, detail.bill.base_name);

  return latestMapped;
}

const sessionLpidCache = new Map<string, string>();
const detailCache = new Map<string, LegacyBillDetailResponse>();

function detailCacheKey(year: string, billName: string): string {
  return `${year}:${billName.toUpperCase()}`;
}

async function requestJson<T>(pathname: string): Promise<T> {
  const response = await fetch(buildApiUrl(pathname), {
    headers: jsonHeaders(),
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `IGA API request failed (${response.status}) at ${pathname}: ${text.slice(0, 280)}`,
    );
  }

  if (looksLikeSpaShell(text)) {
    throw new Error(
      `IGA API returned the website shell instead of JSON for ${pathname}. Check headers or endpoint.`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`IGA API returned invalid JSON for ${pathname}`);
  }
}

async function resolveSessionLpid(year: string): Promise<string> {
  const cached = sessionLpidCache.get(year);
  if (cached) {
    return cached;
  }

  const payload = await requestJson<LegacySessionYearsResponse>("/getSessionYears");
  const found = payload.years?.find((session) => session.year === year);

  if (!found?.lpid) {
    throw new Error(`Unable to resolve session LPID for year ${year}.`);
  }

  sessionLpidCache.set(year, found.lpid);
  return found.lpid;
}

async function fetchLegacyBillDetail(year: string, billName: string): Promise<LegacyBillDetailResponse> {
  const key = detailCacheKey(year, billName);
  const cached = detailCache.get(key);

  if (cached) {
    return cached;
  }

  const sessionLpid = await resolveSessionLpid(year);
  const detail = await requestJson<LegacyBillDetailResponse>(
    `/getBillDetails?session_lpid=${encodeURIComponent(sessionLpid)}&bill_basename=${encodeURIComponent(
      billName.toUpperCase(),
    )}`,
  );

  detailCache.set(key, detail);
  return detail;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchBillList(year: string): Promise<ApiBillListResponse> {
  const sessionLpid = await resolveSessionLpid(year);
  const payload = await requestJson<LegacyBillListResponse>(
    `/getBills?session_lpid=${encodeURIComponent(sessionLpid)}`,
  );

  const items = (payload.bills ?? []).map(mapListItem);

  return {
    itemCount: items.length,
    items,
  };
}

export async function fetchBillDetail(year: string, billName: string): Promise<ApiBillDetailResponse> {
  const detail = await fetchLegacyBillDetail(year, billName);
  const subjects = mapSubjects(detail);
  const latestVersion = resolveLatestVersion(detail, year, subjects);

  const versions = (detail.bill_versions ?? [detail.bill]).map((version) =>
    mapVersion(version, year, subjects),
  );

  const users = detail.users ?? {};

  return {
    title: detail.bill.title,
    billName: detail.bill.base_name,
    number: detail.bill.number,
    description: detail.bill.short_description ?? undefined,
    status: detail.bill.status,
    stage: detail.bill.stage_verbose,
    year,
    originChamber: {
      name: chamberLabel(detail.bill.origin_chamber),
    },
    currentChamber: {
      name: chamberLabel(detail.bill.current_chamber),
    },
    type: detail.bill.type,
    authors: (users.author ?? []).map(personFromLegacy),
    coauthors: (users["co-author"] ?? []).map(personFromLegacy),
    sponsors: (users.sponsor ?? []).map(personFromLegacy),
    cosponsors: (users["co-sponsor"] ?? []).map(personFromLegacy),
    latestVersion,
    versions,
    actions: {
      link: `/api/bills/${detail.bill.base_name}?year=${year}`,
    },
  };
}

export async function fetchBillActions(
  year: string,
  billName: string,
): Promise<ApiBillActionsResponse> {
  const detail = await fetchLegacyBillDetail(year, billName);

  const items: ApiBillActionItem[] = (detail.bill_actions ?? []).map((action) => ({
    date: legacyDateToIso(action.date),
    sequence: action.sequence,
    billName: {
      billName: action.bill_name,
    },
    chamber: {
      name: chamberLabel(action.chamber),
    },
    description: action.text,
    link: `/legislative/${year}/bill-actions/${action.lpid}`,
  }));

  return {
    itemCount: items.length,
    items,
  };
}

export async function fetchBillVersion(
  year: string,
  billName: string,
  versionName: string,
): Promise<ApiBillVersionDetail> {
  const detail = await fetchLegacyBillDetail(year, billName);
  const subjects = mapSubjects(detail);

  const found = (detail.bill_versions ?? [detail.bill]).find(
    (version) => version.name.toUpperCase() === versionName.toUpperCase(),
  );

  if (!found) {
    throw new Error(`Version ${versionName} not found for bill ${billName}.`);
  }

  return mapVersion(found, year, subjects);
}

function buildVersionPdfUrl(version: LegacyBillVersion): string {
  const [assemblyId, yearFromApn, , , chamberFromApn] = (version.apn ?? "").split("/");

  const assembly = assemblyId || "124";
  const year = yearFromApn || "2026";
  const chamber = (version.origin_chamber || chamberFromApn || "house").toLowerCase();
  const family = version.type === "BILL" ? "bills" : "resolutions";

  return `${STATIC_BASE}/pdf-documents/${assembly}/${year}/${chamber}/${family}/${version.base_name}/${version.name}.pdf`;
}

function buildAmendmentPdfUrl(bill: LegacyBillVersion, amendment: LegacyAmendment): string {
  const [assemblyId, yearFromApn] = (bill.apn ?? "").split("/");

  const assembly = assemblyId || "124";
  const year = yearFromApn || "2026";
  const chamber = (bill.origin_chamber || "house").toLowerCase();
  const family = bill.type === "BILL" ? "bills" : "resolutions";

  return `${STATIC_BASE}/pdf-documents/${assembly}/${year}/${chamber}/${family}/${bill.base_name}/amendments/${amendment.name}.pdf`;
}

async function pdfToText(buffer: Buffer): Promise<string> {
  const pdfParseModule = (await import("pdf-parse/lib/pdf-parse.js")) as unknown as {
    default?: (data: Buffer) => Promise<{ text: string }>;
  };

  const parser = pdfParseModule.default;

  if (typeof parser !== "function") {
    throw new Error("Unable to initialize pdf-parse parser");
  }

  const parsed = await parser(buffer);
  return normalizeText(parsed.text);
}

export async function fetchVersionTextFromApi(
  year: string,
  billName: string,
  versionName: string,
  versionDetail?: ApiBillVersionDetail,
): Promise<string> {
  const detail = versionDetail ?? (await fetchBillVersion(year, billName, versionName));

  const pdfUrl = detail.pdfDownloadLink ?? detail.pdfDownloadlink;
  if (!pdfUrl) {
    throw new Error(`No PDF link available for ${billName} ${versionName}`);
  }

  const response = await fetch(buildApiUrl(pdfUrl), {
    headers: pdfHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Unable to download PDF for ${billName} ${versionName} (${response.status}): ${body.slice(0, 280)}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const text = await pdfToText(bytes);

  if (!text || text.length < 50) {
    throw new Error(`PDF text extraction returned insufficient content for ${billName} ${versionName}`);
  }

  return text;
}
