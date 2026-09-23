import http from "node:http";
import https from "node:https";

import { load } from "cheerio";

/**
 * Scraper for district policy sites built on ParentSquare Smart Sites
 * (for example https://wwayne.k12.in.us/board-policies).
 *
 * Site shape this platform produces:
 * - A listing page whose main content stack (`.ss-editor-content`) holds a
 *   single table with a "Policy Number" column and a "Policy" column. Each
 *   data row links to a detail page at a numeric path such as `/68134_4`.
 *   A few rows are unlinked placeholders (reserved policy numbers).
 * - Detail pages render the full policy text server-side inside
 *   `main .ss-editor-content`. The first block repeats the policy code either
 *   alone ("A100") followed by a title block, or combined
 *   ("C350 - STUDENT DISCIPLINE"). Trailing blocks carry adoption and
 *   revision lines in several formats: "Adopted: [08/14/24]",
 *   "Adopted: 2.14.24", "Revised 8/14/19".
 */

export interface ParentSquarePolicyListingItem {
  url: string;
  listingCode: string;
  fallbackTitle: string;
}

export interface ParentSquarePolicyCsvRow {
  series: string;
  policyNumber: string;
  policyTitle: string;
  adoptedDate: string;
  revisionHistory: string;
  policyWording: string;
  sourceUrl: string;
}

export interface ScrapeParentSquarePoliciesOptions {
  sourceUrl: string;
  concurrency?: number;
}

export interface ScrapeParentSquarePoliciesResult {
  baseUrl: string;
  listingUrl: string;
  rows: ParentSquarePolicyCsvRow[];
  discoveredPolicyLinks: number;
  skippedPlaceholderRows: number;
  failedItems: Array<{ url: string; reason: string }>;
}

export interface ParentSquareListingParseResult {
  items: ParentSquarePolicyListingItem[];
  skippedPlaceholderRows: number;
}

const POLICY_CODE_RE = /^[A-Z]{1,2}\s?\d{2,4}[A-Za-z]?$/;
const COMBINED_HEADING_RE = /^([A-Z]{1,2}\s?\d{2,4}[A-Za-z]?)\s*[-–—:]\s*(.+)$/;
const METADATA_LINE_RE = /^(re-?adopted|adopted|revised|reviewed|approved)\b[\s:]/i;
const ADOPTED_LINE_RE = /^(re-?adopted|adopted)\b/i;
const REVISED_LINE_RE = /^revised\b/i;
const DETAIL_PATH_RE = /^\/\d+_\d+\/?$/;
const BLOCK_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,td,th";
const MAX_TITLE_BLOCK_LENGTH = 120;
const MIN_BODY_TEXT_LENGTH = 40;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function isParentSquarePolicyListingHtml(html: string): boolean {
  if (!html.includes("ss-editor-content") && !html.includes("ss-component")) {
    return false;
  }

  try {
    const $ = load(html);
    return findParentSquareListingTableHtml($) !== null;
  } catch {
    return false;
  }
}

export async function scrapeParentSquarePolicies(
  options: ScrapeParentSquarePoliciesOptions,
): Promise<ScrapeParentSquarePoliciesResult> {
  const listingUrl = normalizePolicyListingUrl(options.sourceUrl);
  const baseUrl = new URL(listingUrl).origin;
  const concurrency = clamp(options.concurrency ?? 6, 1, 12);

  const listingHtml = await fetchHtml(listingUrl);
  const listing = parseParentSquarePolicyListing(listingHtml, listingUrl);

  if (listing.items.length === 0) {
    throw new Error("No linked policies were found in the policy table.");
  }

  const failedItems: Array<{ url: string; reason: string }> = [];

  const rows = (
    await mapWithConcurrency(listing.items, concurrency, async (item) => {
      try {
        const detailHtml = await fetchHtml(item.url);
        return parseParentSquarePolicyDetail(detailHtml, item);
      } catch (error) {
        failedItems.push({
          url: item.url,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    })
  ).filter((row): row is ParentSquarePolicyCsvRow => row !== null);

  if (rows.length === 0) {
    throw new Error("Scrape completed, but no policy pages could be parsed.");
  }

  return {
    baseUrl,
    listingUrl,
    rows,
    discoveredPolicyLinks: listing.items.length,
    skippedPlaceholderRows: listing.skippedPlaceholderRows,
    failedItems,
  };
}

export function parentSquarePolicyRowsToCsv(rows: ParentSquarePolicyCsvRow[]): string {
  const headers = [
    "Series",
    "Policy Number",
    "Policy Title",
    "Adopted Date",
    "Revision History",
    "Policy Wording",
    "Source URL",
  ];

  const csvRows = [
    headers,
    ...rows.map((row) => [
      row.series,
      row.policyNumber,
      row.policyTitle,
      row.adoptedDate,
      row.revisionHistory,
      row.policyWording,
      row.sourceUrl,
    ]),
  ];

  const content = csvRows
    .map((columns) => columns.map((value) => escapeCsvField(value)).join(","))
    .join("\n");

  return `\uFEFF${content}`;
}

export function parseParentSquarePolicyListing(
  html: string,
  listingUrl: string,
): ParentSquareListingParseResult {
  const $ = load(html);
  const listingTableHtml = findParentSquareListingTableHtml($);

  if (!listingTableHtml) {
    throw new Error(
      "Could not find a policy table with policy-number rows on this page.",
    );
  }

  const $table = load(listingTableHtml);
  const items: ParentSquarePolicyListingItem[] = [];
  const seenUrls = new Set<string>();
  let skippedPlaceholderRows = 0;

  $table("tr").each((_index, row) => {
    const cells = $table(row).children("th,td");
    if (cells.length === 0) {
      return;
    }

    const firstColumn = normalizeInlineText(cells.eq(0).text());
    const isHeaderRow = /^policy\s*(number|#|no\.?)?$/i.test(firstColumn) && items.length === 0;
    if (isHeaderRow) {
      return;
    }

    const anchor = $table(row).find("a[href]").first();
    if (!anchor.length) {
      if (POLICY_CODE_RE.test(firstColumn)) {
        skippedPlaceholderRows += 1;
      }
      return;
    }

    const href = normalizeInlineText(anchor.attr("href") ?? "");
    if (!href) {
      return;
    }

    let resolvedUrl = "";
    try {
      resolvedUrl = new URL(href, listingUrl).toString();
    } catch {
      return;
    }

    if (!isLikelyParentSquareDetailUrl(resolvedUrl, listingUrl)) {
      return;
    }

    if (seenUrls.has(resolvedUrl)) {
      return;
    }
    seenUrls.add(resolvedUrl);

    items.push({
      url: resolvedUrl,
      listingCode: POLICY_CODE_RE.test(firstColumn) ? firstColumn : "",
      fallbackTitle: deslugTitle(normalizeInlineText(anchor.text())),
    });
  });

  return { items, skippedPlaceholderRows };
}

export function parseParentSquarePolicyDetail(
  html: string,
  item: ParentSquarePolicyListingItem,
): ParentSquarePolicyCsvRow {
  const $ = load(html);

  const editors = $("main .ss-editor-content").toArray();
  const editorPool = editors.length > 0 ? editors : $(".ss-editor-content").toArray();

  if (editorPool.length === 0) {
    throw new Error("No ParentSquare content block was found on the policy page.");
  }

  let body = editorPool[0];
  let bodyTextLength = normalizeInlineText($(body).text()).length;
  for (const editor of editorPool.slice(1)) {
    const textLength = normalizeInlineText($(editor).text()).length;
    if (textLength > bodyTextLength) {
      body = editor;
      bodyTextLength = textLength;
    }
  }

  if (bodyTextLength < MIN_BODY_TEXT_LENGTH) {
    throw new Error("The policy page content block is empty.");
  }

  const blocks = $(body)
    .find(BLOCK_SELECTOR)
    .toArray()
    .filter((element) => $(element).find(BLOCK_SELECTOR).length === 0)
    .map((element) => normalizeInlineText($(element).text()))
    .filter((text) => text.length > 0);

  if (blocks.length === 0) {
    throw new Error("No readable policy text blocks were found on the policy page.");
  }

  let policyNumber = "";
  let policyTitle = "";
  let wordingStart = 0;

  const combinedMatch = blocks[0].match(COMBINED_HEADING_RE);
  if (combinedMatch) {
    policyNumber = normalizeInlineText(combinedMatch[1]);
    policyTitle = normalizeInlineText(combinedMatch[2]);
    wordingStart = 1;
  } else if (POLICY_CODE_RE.test(blocks[0])) {
    policyNumber = blocks[0];
    wordingStart = 1;

    if (
      blocks.length > 1 &&
      blocks[1].length <= MAX_TITLE_BLOCK_LENGTH &&
      !METADATA_LINE_RE.test(blocks[1])
    ) {
      policyTitle = blocks[1];
      wordingStart = 2;
    }
  }

  let wordingEnd = blocks.length;
  const metadataLines: string[] = [];
  while (wordingEnd > wordingStart && METADATA_LINE_RE.test(blocks[wordingEnd - 1])) {
    metadataLines.unshift(blocks[wordingEnd - 1]);
    wordingEnd -= 1;
  }

  const { adoptedDate, revisionHistory } = parseMetadataLines(metadataLines);

  if (!policyNumber) {
    policyNumber = item.listingCode;
  }
  if (!policyTitle) {
    policyTitle = item.fallbackTitle;
  }

  const policyWording = normalizeWordingText(
    blocks.slice(wordingStart, wordingEnd).join("\n\n"),
  );

  return {
    series: seriesFromPolicyNumber(policyNumber),
    policyNumber,
    policyTitle,
    adoptedDate,
    revisionHistory,
    policyWording,
    sourceUrl: item.url,
  };
}

function findParentSquareListingTableHtml($: ReturnType<typeof load>): string | null {
  const tables = $("table").toArray();
  let bestTableHtml: string | null = null;
  let bestScore = 0;

  for (const table of tables) {
    let score = 0;

    $(table)
      .find("tr")
      .each((_index, row) => {
        const firstColumn = normalizeInlineText($(row).children("th,td").eq(0).text());
        if (!POLICY_CODE_RE.test(firstColumn)) {
          return;
        }

        const href = normalizeInlineText($(row).find("a[href]").first().attr("href") ?? "");
        if (!href) {
          return;
        }

        try {
          const parsed = new URL(href, "https://placeholder.invalid/");
          if (DETAIL_PATH_RE.test(parsed.pathname)) {
            score += 1;
          }
        } catch {
          // Ignore malformed hrefs.
        }
      });

    if (score > bestScore) {
      bestScore = score;
      bestTableHtml = $.html(table);
    }
  }

  return bestScore >= 5 ? bestTableHtml : null;
}

function isLikelyParentSquareDetailUrl(url: string, listingUrl: string): boolean {
  let parsedUrl: URL;
  let parsedListingUrl: URL;

  try {
    parsedUrl = new URL(url);
    parsedListingUrl = new URL(listingUrl);
  } catch {
    return false;
  }

  if (stripWwwPrefix(parsedUrl.hostname) !== stripWwwPrefix(parsedListingUrl.hostname)) {
    return false;
  }

  return DETAIL_PATH_RE.test(parsedUrl.pathname);
}

function parseMetadataLines(metadataLines: string[]): {
  adoptedDate: string;
  revisionHistory: string;
} {
  let adoptedDate = "";
  const revisionEntries: string[] = [];

  for (const line of metadataLines) {
    if (ADOPTED_LINE_RE.test(line)) {
      const value = extractMetadataValue(line);
      if (!adoptedDate && value) {
        adoptedDate = value;
      } else if (value) {
        revisionEntries.push(line);
      }
      continue;
    }

    if (REVISED_LINE_RE.test(line)) {
      const value = extractMetadataValue(line);
      revisionEntries.push(value || line);
      continue;
    }

    revisionEntries.push(line);
  }

  return {
    adoptedDate,
    revisionHistory: revisionEntries.join("; "),
  };
}

function extractMetadataValue(line: string): string {
  const withoutLabel = line.replace(/^[A-Za-z-]+\s*:?\s*/, "");
  const withoutBrackets = withoutLabel.replace(/^\[/, "").replace(/\]$/, "");
  return normalizeInlineText(withoutBrackets);
}

function seriesFromPolicyNumber(policyNumber: string): string {
  const match = policyNumber.trim().match(/^([A-Za-z]{1,2})\s?\d/);
  if (!match) {
    return "";
  }

  return `${match[1].toUpperCase()} Policies`;
}

function deslugTitle(value: string): string {
  const normalized = normalizeInlineText(value);
  if (!normalized || normalized.includes(" ")) {
    return normalized;
  }

  return normalizeInlineText(normalized.replace(/-+/g, " "));
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

function stripWwwPrefix(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

async function fetchHtml(url: string, retries = 2): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestHtml(url);
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

async function requestHtml(url: string, redirectDepth = 0): Promise<string> {
  if (redirectDepth > 8) {
    throw new Error("Too many redirects while fetching policy page.");
  }

  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === "https:" ? https : http;

  return await new Promise<string>((resolve, reject) => {
    const request = client.request(
      parsedUrl,
      {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "user-agent": BROWSER_USER_AGENT,
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (statusCode >= 300 && statusCode < 400 && location) {
          response.resume();
          const nextUrl = new URL(location, parsedUrl).toString();
          requestHtml(nextUrl, redirectDepth + 1).then(resolve).catch(reject);
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Request failed with status ${statusCode}`));
          return;
        }

        response.setEncoding("utf8");

        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          resolve(data);
        });
      },
    );

    request.on("error", (error) => {
      reject(error);
    });

    request.setTimeout(45_000, () => {
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

function normalizeWordingText(value: string): string {
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
