import http from "node:http";
import https from "node:https";

import { load } from "cheerio";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface AccordionPolicyListingItem {
  url: string;
  downloadUrl: string;
  seriesHeading: string;
  seriesName: string;
  fallbackPolicyNumber: string;
  fallbackTitle: string;
}

interface PolicyIdentity {
  policyNumber: string;
  title: string;
}

interface ExtractedTextBlock {
  value: string;
  consumedIndexes: number[];
}

interface RequestOptions {
  url: string;
  accept: string;
  useBrowserUserAgent?: boolean;
  redirectDepth?: number;
}

type PdfParseResult = { text: string };
type PdfParser = (dataBuffer: Buffer) => Promise<PdfParseResult>;

let pdfParserPromise: Promise<PdfParser> | null = null;

class HttpStatusError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "HttpStatusError";
    this.statusCode = statusCode;
  }
}

export interface AccordionPdfPolicyCsvRow {
  boardPolicyNumber: string;
  title: string;
  series: string;
  adoptedDate: string;
  revisionHistory: string;
  policyWording: string;
  legalReferences: string;
  crossReferences: string;
}

export interface ScrapeAccordionPdfPoliciesOptions {
  sourceUrl: string;
  concurrency?: number;
}

export interface ScrapeAccordionPdfPoliciesResult {
  baseUrl: string;
  listingUrl: string;
  rows: AccordionPdfPolicyCsvRow[];
  discoveredPolicyLinks: number;
  failedItems: Array<{ url: string; reason: string }>;
}

export function isAccordionPdfPolicyListingHtml(html: string): boolean {
  const $ = load(html);
  const panelSections = getAccordionPanelSections($);

  if (panelSections.length === 0) {
    return false;
  }

  let seriesCount = 0;
  let likelyPolicyLinks = 0;

  for (const section of panelSections) {
    const sectionNode = $(section);
    const heading = normalizeInlineText(sectionNode.find("h2 a, h2.fsElementTitle a").first().text());
    if (/^series\s+\d+/i.test(heading)) {
      seriesCount += 1;
    }

    sectionNode.find(".fsElementContent a[href]").each((_index, link) => {
      const href = normalizeInlineText($(link).attr("href") ?? "");
      const linkText = normalizeInlineText($(link).text());

      if (!href || !linkText) {
        return;
      }

      if (isLikelyPolicyDocumentLink(href, linkText)) {
        likelyPolicyLinks += 1;
      }
    });
  }

  return seriesCount > 0 && likelyPolicyLinks > 0;
}

export async function scrapeAccordionPdfPolicies(
  options: ScrapeAccordionPdfPoliciesOptions,
): Promise<ScrapeAccordionPdfPoliciesResult> {
  const listingUrl = normalizePolicyListingUrl(options.sourceUrl);
  const baseUrl = new URL(listingUrl).origin;
  const concurrency = clamp(options.concurrency ?? 4, 1, 8);

  const listingHtml = await fetchText(listingUrl);
  const policyLinks = parsePolicyLinksFromListing(listingHtml, listingUrl);

  if (policyLinks.length === 0) {
    throw new Error("No policy PDF links were found in the accordion sections.");
  }

  const failedItems: Array<{ url: string; reason: string }> = [];

  const rows = (
    await mapWithConcurrency(policyLinks, concurrency, async (policyLink) => {
      try {
        return await scrapePolicyPdf(policyLink);
      } catch (error) {
        failedItems.push({
          url: policyLink.url,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    })
  ).filter((row): row is AccordionPdfPolicyCsvRow => row !== null);

  if (rows.length === 0) {
    throw new Error("Scrape completed, but no policy PDFs could be parsed.");
  }

  return {
    baseUrl,
    listingUrl,
    rows,
    discoveredPolicyLinks: policyLinks.length,
    failedItems,
  };
}

export function accordionPdfPolicyRowsToCsv(rows: AccordionPdfPolicyCsvRow[]): string {
  const headers = [
    "Board Policy Number",
    "Title",
    "Series",
    "Adopted Date",
    "Revision History",
    "Policy Wording",
    "Legal References",
    "Cross References",
  ];

  const csvRows = [
    headers,
    ...rows.map((row) => [
      row.boardPolicyNumber,
      row.title,
      row.series,
      row.adoptedDate,
      row.revisionHistory,
      row.policyWording,
      row.legalReferences,
      row.crossReferences,
    ]),
  ];

  const content = csvRows
    .map((columns) => columns.map((value) => escapeCsvField(value)).join(","))
    .join("\n");

  return `\uFEFF${content}`;
}

function normalizePolicyListingUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    throw new Error("Please provide a district policy URL.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("Invalid URL. Please enter a full district policy URL.");
  }

  parsed.hash = "";
  return parsed.toString();
}

function parsePolicyLinksFromListing(html: string, listingUrl: string): AccordionPolicyListingItem[] {
  const $ = load(html);
  const panelSections = getAccordionPanelSections($);

  if (panelSections.length === 0) {
    throw new Error("Could not find accordion policy sections on this page.");
  }

  const links: AccordionPolicyListingItem[] = [];
  const seenKeys = new Set<string>();

  for (const section of panelSections) {
    const sectionNode = $(section);
    const seriesHeading = normalizeInlineText(sectionNode.find("h2 a, h2.fsElementTitle a").first().text());
    const seriesName = extractSeriesName(seriesHeading);

    sectionNode.find(".fsElementContent a[href]").each((_index, link) => {
      const linkNode = $(link);
      const href = normalizeInlineText(linkNode.attr("href") ?? "");
      const linkText = normalizeInlineText(linkNode.text());

      if (!href || !linkText) {
        return;
      }

      let resolvedUrl = "";
      try {
        resolvedUrl = new URL(href, listingUrl).toString();
      } catch {
        return;
      }

      if (!isLikelyPolicyDocumentLink(resolvedUrl, linkText)) {
        return;
      }

      const dedupeKey = canonicalPolicyUrlKey(resolvedUrl);
      if (!dedupeKey || seenKeys.has(dedupeKey)) {
        return;
      }

      const identity = parsePolicyNumberAndTitle(linkText);
      if (!identity.policyNumber && !identity.title) {
        return;
      }

      seenKeys.add(dedupeKey);

      links.push({
        url: resolvedUrl,
        downloadUrl: toLikelyDirectDownloadUrl(resolvedUrl),
        seriesHeading,
        seriesName,
        fallbackPolicyNumber: identity.policyNumber,
        fallbackTitle: identity.title || linkText,
      });
    });
  }

  return links;
}

function getAccordionPanelSections($: ReturnType<typeof load>): Array<ReturnType<typeof $>[number]> {
  const preferred = $(".fsPanelGroup.fsAccordion section.fsPanel").toArray();
  if (preferred.length > 0) {
    return preferred;
  }

  return $("section.fsPanel").toArray();
}

function isLikelyPolicyDocumentLink(urlOrHref: string, linkText: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlOrHref);
  } catch {
    return false;
  }

  const path = parsed.pathname.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const hasPolicyPrefix = /^[0-9]{2,4}(?:\.[0-9a-z]+)?[a-z]?\b/i.test(normalizeInlineText(linkText));

  if (path.endsWith(".pdf")) {
    return true;
  }

  if (host.includes("drive.google.com") && (path.includes("/file/d/") || path.startsWith("/uc"))) {
    return true;
  }

  if (host.includes("drive.google.com") && hasPolicyPrefix) {
    return true;
  }

  return false;
}

function canonicalPolicyUrlKey(url: string): string {
  try {
    const fileId = extractGoogleDriveFileId(url);
    if (fileId) {
      return `drive:${fileId}`;
    }

    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function extractSeriesName(seriesHeading: string): string {
  const normalized = normalizeInlineText(seriesHeading);
  if (!normalized) {
    return "";
  }

  const match = normalized.match(/^series\s+\d+\s*(.*)$/i);
  if (match?.[1]) {
    return normalizeInlineText(match[1]);
  }

  return normalized;
}

async function scrapePolicyPdf(policyLink: AccordionPolicyListingItem): Promise<AccordionPdfPolicyCsvRow> {
  const pdfBuffer = await fetchBinary(policyLink.downloadUrl);
  const parsePdf = await getPdfParser();
  const parsedPdf = await parsePdf(pdfBuffer);

  const parsed = parsePolicyPdfText(parsedPdf.text, policyLink);
  return parsed;
}

async function getPdfParser(): Promise<PdfParser> {
  if (!pdfParserPromise) {
    pdfParserPromise = (async () => {
      const pdfParseModule = (await import("pdf-parse/lib/pdf-parse.js")) as unknown as {
        default?: PdfParser;
      };

      const parser = pdfParseModule.default;
      if (typeof parser !== "function") {
        throw new Error("Unable to initialize pdf parser.");
      }

      return parser;
    })();
  }

  return pdfParserPromise;
}

function parsePolicyPdfText(text: string, policyLink: AccordionPolicyListingItem): AccordionPdfPolicyCsvRow {
  const normalizedText = text.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedText.split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim());

  const consumedIndexes = new Set<number>();

  const boardPolicyIndex = findLineIndex(lines, /^BOARD POLICY\b/i);
  if (boardPolicyIndex >= 0) {
    consumedIndexes.add(boardPolicyIndex);
  }

  const seriesIndex = findLineIndex(lines, /^SERIES\s*:/i);
  if (seriesIndex >= 0) {
    consumedIndexes.add(seriesIndex);
  }

  const adoptedIndex = findLineIndex(lines, /^ADOPTED\s*:/i);
  if (adoptedIndex >= 0) {
    consumedIndexes.add(adoptedIndex);
  }

  const revisionIndex = findLineIndex(lines, /^REVISION HISTORY\s*:/i);
  const legalReferencesIndex = findLineIndex(lines, /^Legal References\s*:/i);
  const crossReferencesIndex = findLineIndex(lines, /^Cross References\s*:/i);

  const revisionHistory = extractRevisionHistory(lines, revisionIndex);
  const legalReferences = extractReferenceBlock(lines, legalReferencesIndex, /^Legal References\s*:/i, [
    /^Cross References\s*:/i,
    /^BOARD POLICY\b/i,
    /^SERIES\s*:/i,
    /^ADOPTED\s*:/i,
    /^REVISION HISTORY\s*:/i,
  ]);
  const crossReferences = extractReferenceBlock(lines, crossReferencesIndex, /^Cross References\s*:/i, [
    /^BOARD POLICY\b/i,
    /^SERIES\s*:/i,
    /^ADOPTED\s*:/i,
    /^REVISION HISTORY\s*:/i,
    /^Legal References\s*:/i,
  ]);

  for (const index of revisionHistory.consumedIndexes) {
    consumedIndexes.add(index);
  }
  for (const index of legalReferences.consumedIndexes) {
    consumedIndexes.add(index);
  }
  for (const index of crossReferences.consumedIndexes) {
    consumedIndexes.add(index);
  }

  const boardPolicyIdentity =
    boardPolicyIndex >= 0 ? parseBoardPolicyLine(lines[boardPolicyIndex]) : { policyNumber: "", title: "" };

  const adoptedDate =
    adoptedIndex >= 0 ? normalizeInlineText(lines[adoptedIndex].replace(/^ADOPTED\s*:\s*/i, "")) : "";
  const series =
    seriesIndex >= 0
      ? normalizeInlineText(lines[seriesIndex].replace(/^SERIES\s*:\s*/i, ""))
      : normalizeInlineText(policyLink.seriesName);

  const policyWording = buildPolicyWording(lines, consumedIndexes);

  return {
    boardPolicyNumber: boardPolicyIdentity.policyNumber || policyLink.fallbackPolicyNumber,
    title: boardPolicyIdentity.title || policyLink.fallbackTitle,
    series,
    adoptedDate,
    revisionHistory: revisionHistory.value,
    policyWording,
    legalReferences: legalReferences.value,
    crossReferences: crossReferences.value,
  };
}

function parseBoardPolicyLine(line: string): PolicyIdentity {
  const normalized = normalizeInlineText(line.replace(/^BOARD POLICY\s*:?\s*/i, "").replace(/_+/g, " "));
  if (!normalized) {
    return { policyNumber: "", title: "" };
  }

  const parsed = parsePolicyNumberAndTitle(normalized);
  if (parsed.policyNumber || parsed.title) {
    return parsed;
  }

  return { policyNumber: "", title: normalized };
}

function parsePolicyNumberAndTitle(value: string): PolicyIdentity {
  const normalized = normalizeInlineText(value);
  if (!normalized) {
    return { policyNumber: "", title: "" };
  }

  const withTitleMatch = normalized.match(/^([0-9]{2,4}(?:\.[0-9A-Za-z-]+)?[A-Za-z]?)\s*(?:[-:]\s*|\s+)(.+)$/);
  if (withTitleMatch) {
    return {
      policyNumber: normalizeInlineText(withTitleMatch[1]),
      title: normalizeInlineText(withTitleMatch[2]),
    };
  }

  const numberOnlyMatch = normalized.match(/^([0-9]{2,4}(?:\.[0-9A-Za-z-]+)?[A-Za-z]?)$/);
  if (numberOnlyMatch) {
    return {
      policyNumber: normalizeInlineText(numberOnlyMatch[1]),
      title: "",
    };
  }

  return {
    policyNumber: "",
    title: normalized,
  };
}

function extractRevisionHistory(lines: string[], startIndex: number): ExtractedTextBlock {
  if (startIndex < 0) {
    return { value: "", consumedIndexes: [] };
  }

  const consumedIndexes: number[] = [startIndex];
  const values: string[] = [];
  const firstValue = normalizeInlineText(lines[startIndex].replace(/^REVISION HISTORY\s*:\s*/i, ""));
  if (firstValue) {
    values.push(firstValue);
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    if (isMetadataHeading(line) || /^Legal References\s*:/i.test(line) || /^Cross References\s*:/i.test(line)) {
      break;
    }

    if (isPageMarkerLine(line) || isCommonDocumentHeaderLine(line)) {
      consumedIndexes.push(index);
      continue;
    }

    if (!isRevisionContinuationLine(line)) {
      break;
    }

    values.push(line);
    consumedIndexes.push(index);
  }

  return {
    value: normalizeBlockValue(values),
    consumedIndexes,
  };
}

function extractReferenceBlock(
  lines: string[],
  startIndex: number,
  labelPattern: RegExp,
  stopPatterns: RegExp[],
): ExtractedTextBlock {
  if (startIndex < 0) {
    return { value: "", consumedIndexes: [] };
  }

  const consumedIndexes: number[] = [startIndex];
  const values: string[] = [];
  const firstValue = normalizeInlineText(lines[startIndex].replace(labelPattern, ""));
  if (firstValue) {
    values.push(firstValue);
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    if (stopPatterns.some((pattern) => pattern.test(line))) {
      break;
    }

    if (isPageMarkerLine(line) || isCommonDocumentHeaderLine(line)) {
      consumedIndexes.push(index);
      continue;
    }

    values.push(line);
    consumedIndexes.push(index);
  }

  return {
    value: normalizeBlockValue(values),
    consumedIndexes,
  };
}

function buildPolicyWording(lines: string[], consumedIndexes: Set<number>): string {
  const filteredLines: string[] = [];

  for (const [index, line] of lines.entries()) {
    if (consumedIndexes.has(index)) {
      continue;
    }

    if (!line) {
      filteredLines.push("");
      continue;
    }

    if (
      /^BOARD POLICY\b/i.test(line) ||
      /^SERIES\s*:/i.test(line) ||
      /^ADOPTED\s*:/i.test(line) ||
      /^REVISION HISTORY\s*:/i.test(line) ||
      /^Legal References\s*:/i.test(line) ||
      /^Cross References\s*:/i.test(line)
    ) {
      continue;
    }

    if (isPageMarkerLine(line) || isCommonDocumentHeaderLine(line)) {
      continue;
    }

    filteredLines.push(line);
  }

  return joinLinesIntoParagraphs(filteredLines);
}

function joinLinesIntoParagraphs(lines: string[]): string {
  const paragraphs: string[] = [];
  let currentParagraphLines: string[] = [];

  const flushCurrentParagraph = (): void => {
    if (currentParagraphLines.length === 0) {
      return;
    }
    paragraphs.push(normalizeInlineText(currentParagraphLines.join(" ")));
    currentParagraphLines = [];
  };

  for (const line of lines) {
    if (!line) {
      flushCurrentParagraph();
      continue;
    }

    if (shouldForceParagraphBreak(line) && currentParagraphLines.length > 0) {
      flushCurrentParagraph();
    }

    currentParagraphLines.push(line);
  }

  flushCurrentParagraph();

  return normalizeMultilineText(paragraphs.join("\n\n"));
}

function shouldForceParagraphBreak(line: string): boolean {
  return /^([IVXLC]+\.\s+[A-Z]|[A-Z]\.\s+|[0-9]+\.\s+)/.test(line);
}

function isMetadataHeading(line: string): boolean {
  return (
    /^BOARD POLICY\b/i.test(line) ||
    /^SERIES\s*:/i.test(line) ||
    /^ADOPTED\s*:/i.test(line) ||
    /^REVISION HISTORY\s*:/i.test(line)
  );
}

function isRevisionContinuationLine(line: string): boolean {
  return (
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(line) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i.test(line) ||
    /^FORMERLY\s*:/i.test(line) ||
    /^REVISED?\s*:/i.test(line) ||
    /^\(reviewed/i.test(line)
  );
}

function isPageMarkerLine(line: string): boolean {
  return /^Page\s+\d+\s+of\s+\d+$/i.test(line) || /^Policy\s+[0-9A-Za-z.-]+$/i.test(line);
}

function isCommonDocumentHeaderLine(line: string): boolean {
  return (
    /^INDEPENDENT SCHOOL DISTRICT/i.test(line) ||
    /^[A-Z][A-Z ,.'&-]{6,}PUBLIC SCHOOLS$/i.test(line) ||
    /^PEQUOT LAKES PUBLIC SCHOOLS$/i.test(line)
  );
}

function normalizeBlockValue(values: string[]): string {
  const cleaned = values
    .map((value) => normalizeInlineText(value))
    .filter((value) => Boolean(value));

  if (cleaned.length === 0) {
    return "";
  }

  const deduped: string[] = [];
  for (const value of cleaned) {
    if (deduped[deduped.length - 1] === value) {
      continue;
    }
    deduped.push(value);
  }

  return normalizeMultilineText(deduped.join("\n"));
}

function findLineIndex(lines: string[], pattern: RegExp): number {
  for (const [index, line] of lines.entries()) {
    if (pattern.test(line)) {
      return index;
    }
  }

  return -1;
}

function toLikelyDirectDownloadUrl(url: string): string {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) {
    return url;
  }

  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

function extractGoogleDriveFileId(url: string): string {
  const directMatch = url.match(/\/file\/d\/([^/?]+)/i);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  try {
    const parsed = new URL(url);
    const idFromQuery = parsed.searchParams.get("id");
    return idFromQuery ? normalizeInlineText(idFromQuery) : "";
  } catch {
    return "";
  }
}

async function fetchText(url: string, retries = 2): Promise<string> {
  const buffer = await fetchBinaryWithHeaders(url, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", retries);
  return buffer.toString("utf8");
}

async function fetchBinary(url: string, retries = 2): Promise<Buffer> {
  return await fetchBinaryWithHeaders(url, "application/pdf,application/octet-stream,*/*;q=0.8", retries);
}

async function fetchBinaryWithHeaders(url: string, accept: string, retries: number): Promise<Buffer> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestBufferWithFallback(url, accept);
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(350 * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

async function requestBufferWithFallback(url: string, accept: string): Promise<Buffer> {
  try {
    return await requestBuffer({
      url,
      accept,
      useBrowserUserAgent: false,
      redirectDepth: 0,
    });
  } catch (error) {
    if (error instanceof HttpStatusError && error.statusCode === 403) {
      return await requestBuffer({
        url,
        accept,
        useBrowserUserAgent: true,
        redirectDepth: 0,
      });
    }

    throw error;
  }
}

async function requestBuffer(options: RequestOptions): Promise<Buffer> {
  const redirectDepth = options.redirectDepth ?? 0;
  if (redirectDepth > 10) {
    throw new Error("Too many redirects while fetching policy content.");
  }

  const parsedUrl = new URL(options.url);
  const client = parsedUrl.protocol === "https:" ? https : http;

  return await new Promise<Buffer>((resolve, reject) => {
    const request = client.request(
      parsedUrl,
      {
        method: "GET",
        headers: {
          accept: options.accept,
          "accept-encoding": "identity",
          ...(options.useBrowserUserAgent ? { "user-agent": BROWSER_USER_AGENT } : {}),
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          const nextUrl = new URL(location, parsedUrl).toString();
          requestBuffer({
            url: nextUrl,
            accept: options.accept,
            useBrowserUserAgent: options.useBrowserUserAgent,
            redirectDepth: redirectDepth + 1,
          })
            .then(resolve)
            .catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new HttpStatusError(`Request failed with status ${statusCode} for ${options.url}`, statusCode));
          return;
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer | string) => {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        });
        response.on("end", () => {
          resolve(Buffer.concat(chunks));
        });
      },
    );

    request.on("error", (error) => {
      reject(error);
    });

    request.setTimeout(60_000, () => {
      request.destroy(new Error("Request timed out."));
    });

    request.end();
  });
}

function normalizeInlineText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultilineText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeCsvField(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  if (items.length === 0) {
    return [];
  }

  const effectiveConcurrency = clamp(concurrency, 1, items.length);
  const output = new Array<U>(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      output[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: effectiveConcurrency }, async () => worker()));
  return output;
}
