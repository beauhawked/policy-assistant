import {
  accordionPdfPolicyRowsToCsv,
  isAccordionPdfPolicyListingHtml,
  scrapeAccordionPdfPolicies,
  type AccordionPdfPolicyCsvRow,
} from "@/lib/accordion-pdf-policy-scraper";
import {
  policyRowsToCsv,
  scrapeBoardDocsPolicies,
  type PolicyCsvRow,
} from "@/lib/boarddocs-policy-scraper";
import type { NormalizedPolicyRow } from "@/lib/policy-assistant/types";
import {
  isTableLinkedPolicyListingHtml,
  scrapeTableLinkedPolicies,
  tableLinkedPolicyRowsToCsv,
  type TableLinkedPolicyCsvRow,
} from "@/lib/table-link-policy-scraper";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type RequestedPolicyPlatform = "auto" | "boarddocs" | "table-link" | "accordion-pdf";
export type ResolvedPolicyPlatform = Exclude<RequestedPolicyPlatform, "auto">;

export interface ScrapePoliciesInput {
  sourceUrl: string;
  includeAllBooks?: boolean;
  platform?: RequestedPolicyPlatform;
}

export interface ScrapedPolicyExport {
  csv: string;
  platform: ResolvedPolicyPlatform;
  baseUrl: string;
  filename: string;
  policyCount: number;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
  legacyBookCount: number;
}

export interface ScrapedPolicyImport {
  rows: NormalizedPolicyRow[];
  headers: string[];
  platform: ResolvedPolicyPlatform;
  baseUrl: string;
  filename: string;
  policyCount: number;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
}

type RawScrapeResult =
  | {
      platform: "boarddocs";
      baseUrl: string;
      rows: PolicyCsvRow[];
      sourceCount: number;
      sourceLabel: string;
      failedCount: number;
      legacyBookCount: number;
    }
  | {
      platform: "table-link";
      baseUrl: string;
      rows: TableLinkedPolicyCsvRow[];
      sourceCount: number;
      sourceLabel: string;
      failedCount: number;
      legacyBookCount: number;
    }
  | {
      platform: "accordion-pdf";
      baseUrl: string;
      rows: AccordionPdfPolicyCsvRow[];
      sourceCount: number;
      sourceLabel: string;
      failedCount: number;
      legacyBookCount: number;
    };

export async function scrapePoliciesForExport(
  input: ScrapePoliciesInput,
): Promise<ScrapedPolicyExport> {
  const result = await scrapePolicies(input);
  const filename = buildCsvFilename(result.baseUrl, result.platform);
  let csv = "";

  if (result.platform === "boarddocs") {
    csv = policyRowsToCsv(result.rows);
  } else if (result.platform === "table-link") {
    csv = tableLinkedPolicyRowsToCsv(result.rows);
  } else {
    csv = accordionPdfPolicyRowsToCsv(result.rows);
  }

  return {
    csv,
    platform: result.platform,
    baseUrl: result.baseUrl,
    filename,
    policyCount: result.rows.length,
    sourceCount: result.sourceCount,
    sourceLabel: result.sourceLabel,
    failedCount: result.failedCount,
    legacyBookCount: result.legacyBookCount,
  };
}

export async function scrapePoliciesForImport(
  input: ScrapePoliciesInput,
): Promise<ScrapedPolicyImport> {
  const result = await scrapePolicies(input);
  const filename = buildCsvFilename(result.baseUrl, result.platform);
  const rows = normalizeRowsForImport(result);

  return {
    rows,
    headers: headersForPlatform(result.platform),
    platform: result.platform,
    baseUrl: result.baseUrl,
    filename,
    policyCount: rows.length,
    sourceCount: result.sourceCount,
    sourceLabel: result.sourceLabel,
    failedCount: result.failedCount,
  };
}

export function normalizeRequestedPolicyPlatform(
  value: string | undefined,
): RequestedPolicyPlatform {
  if (value === "boarddocs" || value === "table-link" || value === "accordion-pdf") {
    return value;
  }
  return "auto";
}

export function formatPolicyPlatform(platform: ResolvedPolicyPlatform): string {
  if (platform === "table-link") {
    return "Table-based";
  }

  if (platform === "accordion-pdf") {
    return "Accordion + PDF";
  }

  return "BoardDocs";
}

async function scrapePolicies(input: ScrapePoliciesInput): Promise<RawScrapeResult> {
  const normalizedSourceUrl = ensureUrlProtocol(input.sourceUrl);
  const requestedPlatform = normalizeRequestedPolicyPlatform(input.platform);
  const resolvedPlatform = await resolvePolicyPlatform(normalizedSourceUrl, requestedPlatform);

  if (resolvedPlatform === "boarddocs") {
    const result = await scrapeBoardDocsPolicies({
      sourceUrl: normalizedSourceUrl,
      includeAllBooks: Boolean(input.includeAllBooks),
      concurrency: 6,
    });

    return {
      platform: "boarddocs",
      baseUrl: result.baseUrl,
      rows: result.rows,
      sourceCount: result.selectedBooks.length,
      sourceLabel: "book(s)",
      failedCount: result.failedItems.length,
      legacyBookCount: result.selectedBooks.length,
    };
  }

  if (resolvedPlatform === "table-link") {
    const result = await scrapeTableLinkedPolicies({
      sourceUrl: normalizedSourceUrl,
      concurrency: 6,
    });

    return {
      platform: "table-link",
      baseUrl: result.listingUrl,
      rows: result.rows,
      sourceCount: result.discoveredPolicyLinks,
      sourceLabel: "policy link(s)",
      failedCount: result.failedItems.length,
      legacyBookCount: 0,
    };
  }

  const result = await scrapeAccordionPdfPolicies({
    sourceUrl: normalizedSourceUrl,
    concurrency: 4,
  });

  return {
    platform: "accordion-pdf",
    baseUrl: result.listingUrl,
    rows: result.rows,
    sourceCount: result.discoveredPolicyLinks,
    sourceLabel: "policy PDF(s)",
    failedCount: result.failedItems.length,
    legacyBookCount: 0,
  };
}

function normalizeRowsForImport(result: RawScrapeResult): NormalizedPolicyRow[] {
  if (result.platform === "boarddocs") {
    return result.rows
      .map((row, index) => ({
        policySection: normalizeText(row.section),
        policyCode: normalizeText(row.code),
        adoptedDate: normalizeText(row.adoptedDate),
        revisedDate: normalizeText(row.revisedDate),
        policyStatus: normalizeText(row.status),
        policyTitle: normalizeText(row.policyTitle),
        policyWording: normalizeLongText(row.policyWording),
        sourceRowIndex: index + 2,
      }))
      .filter(isImportablePolicyRow);
  }

  if (result.platform === "table-link") {
    return result.rows
      .map((row, index) => ({
        policySection: normalizeText(row.policyChapter),
        policyCode: normalizeText(row.policyNumber),
        adoptedDate: "",
        revisedDate: "",
        policyStatus: "",
        policyTitle: normalizeText(row.policyTitle),
        policyWording: joinPolicySections([
          ["Policy Wording", row.policyWording],
          ["Statutory Authority", row.statutoryAuthority],
          ["Law(s) Implemented", row.lawsImplemented],
          ["History", row.history],
          ["Notes", row.notes],
        ]),
        sourceRowIndex: index + 2,
      }))
      .filter(isImportablePolicyRow);
  }

  return result.rows
    .map((row, index) => ({
      policySection: normalizeText(row.series),
      policyCode: normalizeText(row.boardPolicyNumber),
      adoptedDate: normalizeText(row.adoptedDate),
      revisedDate: normalizeText(row.revisionHistory),
      policyStatus: "",
      policyTitle: normalizeText(row.title),
      policyWording: joinPolicySections([
        ["Policy Wording", row.policyWording],
        ["Legal References", row.legalReferences],
        ["Cross References", row.crossReferences],
      ]),
      sourceRowIndex: index + 2,
    }))
    .filter(isImportablePolicyRow);
}

function headersForPlatform(platform: ResolvedPolicyPlatform): string[] {
  if (platform === "boarddocs") {
    return [
      "Section",
      "Code",
      "Adopted Date",
      "Revised Date",
      "Status",
      "Policy Title",
      "Policy Wording",
    ];
  }

  if (platform === "table-link") {
    return [
      "Policy Chapter",
      "Policy Number",
      "Policy Title",
      "Policy Wording",
      "Statutory Authority",
      "Law(s) Implemented",
      "History",
      "Notes",
    ];
  }

  return [
    "Board Policy Number",
    "Title",
    "Series",
    "Adopted Date",
    "Revision History",
    "Policy Wording",
    "Legal References",
    "Cross References",
  ];
}

async function resolvePolicyPlatform(
  sourceUrl: string,
  requestedPlatform: RequestedPolicyPlatform,
): Promise<ResolvedPolicyPlatform> {
  if (requestedPlatform !== "auto") {
    return requestedPlatform;
  }

  const normalizedSource = sourceUrl.toLowerCase();
  if (normalizedSource.includes("boarddocs.com") || /\/board\.nsf/i.test(normalizedSource)) {
    return "boarddocs";
  }

  const listingHtml = await fetchListingHtmlForDetection(sourceUrl).catch(() => "");
  if (listingHtml) {
    if (isAccordionPdfPolicyListingHtml(listingHtml)) {
      return "accordion-pdf";
    }

    if (isTableLinkedPolicyListingHtml(listingHtml)) {
      return "table-link";
    }
  }

  return "table-link";
}

async function fetchListingHtmlForDetection(url: string): Promise<string> {
  const firstAttempt = await fetchListingHtml(url, false);
  if (firstAttempt.status === 403) {
    const secondAttempt = await fetchListingHtml(url, true);
    if (!secondAttempt.ok) {
      throw new Error(`Platform detection request failed with status ${secondAttempt.status}.`);
    }
    return secondAttempt.text;
  }

  if (!firstAttempt.ok) {
    throw new Error(`Platform detection request failed with status ${firstAttempt.status}.`);
  }

  return firstAttempt.text;
}

async function fetchListingHtml(
  url: string,
  useBrowserUserAgent: boolean,
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 25_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(useBrowserUserAgent ? { "user-agent": BROWSER_USER_AGENT } : {}),
      },
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function ensureUrlProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function buildCsvFilename(baseUrl: string, platform: ResolvedPolicyPlatform): string {
  const parsed = new URL(baseUrl);
  const pathSlug = parsed.pathname
    .split("/")
    .filter(Boolean)
    .slice(0, 2)
    .join("-");

  const sourceSlug = sanitizeSlug(pathSlug || parsed.hostname);
  const dateSlug = new Date().toISOString().slice(0, 10);
  return `${sourceSlug}-${platform}-policies-${dateSlug}.csv`;
}

function sanitizeSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "policies"
  );
}

function joinPolicySections(sections: Array<[string, string]>): string {
  return sections
    .map(([label, value]) => [label, normalizeLongText(value)] as const)
    .filter(([, value]) => value.length > 0)
    .map(([label, value]) => (label === "Policy Wording" ? value : `${label}: ${value}`))
    .join("\n\n");
}

function isImportablePolicyRow(row: NormalizedPolicyRow): boolean {
  return Boolean(
    row.policySection ||
      row.policyCode ||
      row.adoptedDate ||
      row.revisedDate ||
      row.policyStatus ||
      row.policyTitle ||
      row.policyWording,
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLongText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
