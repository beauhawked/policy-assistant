import http from "node:http";
import https from "node:https";
import { runInNewContext } from "node:vm";

import { load } from "cheerio";
import type { AnyNode } from "domhandler";

interface TableLinkedPolicyListingItem {
  url: string;
  fallbackTitle: string;
  fallbackIndicator: string;
}

interface ContentNode {
  type?: string;
  name?: string;
  content?: {
    html?: string;
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface ClientWorkStatePayload {
  page?: {
    name?: string;
    content?: unknown;
  };
}

interface TablePolicyMetadata {
  statutoryAuthority: string;
  lawsImplemented: string;
  history: string;
  notes: string;
}

interface ParsedPolicyIdentity {
  policyChapter: string;
  policyNumber: string;
  titleRemainder: string;
}

export interface TableLinkedPolicyCsvRow {
  policyChapter: string;
  policyNumber: string;
  policyTitle: string;
  policyWording: string;
  statutoryAuthority: string;
  lawsImplemented: string;
  history: string;
  notes: string;
}

export interface ScrapeTableLinkedPoliciesOptions {
  sourceUrl: string;
  concurrency?: number;
}

export interface ScrapeTableLinkedPoliciesResult {
  baseUrl: string;
  listingUrl: string;
  rows: TableLinkedPolicyCsvRow[];
  discoveredPolicyLinks: number;
  failedItems: Array<{ url: string; reason: string }>;
}

export function isTableLinkedPolicyListingHtml(html: string): boolean {
  const $ = load(html);
  if (findPolicyListingTable($) !== null) {
    return true;
  }

  return findPolicyListingTableHtmlInPayload(html) !== null;
}

export async function scrapeTableLinkedPolicies(
  options: ScrapeTableLinkedPoliciesOptions,
): Promise<ScrapeTableLinkedPoliciesResult> {
  const listingUrl = normalizePolicyListingUrl(options.sourceUrl);
  const baseUrl = new URL(listingUrl).origin;
  const concurrency = clamp(options.concurrency ?? 6, 1, 12);

  const listingHtml = await fetchHtml(listingUrl);
  const policyLinks = parsePolicyLinksFromListing(listingHtml, listingUrl);

  if (policyLinks.length === 0) {
    throw new Error("No policy links were found in the listing table.");
  }

  const failedItems: Array<{ url: string; reason: string }> = [];

  const rows = (
    await mapWithConcurrency(policyLinks, concurrency, async (policyLink) => {
      try {
        return await scrapePolicyDetail(policyLink);
      } catch (error) {
        failedItems.push({
          url: policyLink.url,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    })
  ).filter((row): row is TableLinkedPolicyCsvRow => row !== null);

  if (rows.length === 0) {
    throw new Error("Scrape completed, but no policy pages could be parsed.");
  }

  return {
    baseUrl,
    listingUrl,
    rows,
    discoveredPolicyLinks: policyLinks.length,
    failedItems,
  };
}

export function tableLinkedPolicyRowsToCsv(rows: TableLinkedPolicyCsvRow[]): string {
  const headers = [
    "Policy Chapter",
    "Policy Number",
    "Policy Title",
    "Policy Wording",
    "Statutory Authority",
    "Law(s) Implemented",
    "History",
    "Notes",
  ];

  const csvRows = [
    headers,
    ...rows.map((row) => [
      row.policyChapter,
      row.policyNumber,
      row.policyTitle,
      row.policyWording,
      row.statutoryAuthority,
      row.lawsImplemented,
      row.history,
      row.notes,
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

function parsePolicyLinksFromListing(html: string, listingUrl: string): TableLinkedPolicyListingItem[] {
  const $ = load(html);
  const listingTable = findPolicyListingTable($);

  const listingTableHtml =
    (listingTable ? $.html(listingTable) : "") || findPolicyListingTableHtmlInPayload(html) || "";

  if (!listingTableHtml) {
    throw new Error("Could not find a policy table with a 'Name of Policy' column on this page.");
  }

  return parsePolicyLinksFromTableHtml(listingTableHtml, listingUrl);
}

function parsePolicyLinksFromTableHtml(tableHtml: string, listingUrl: string): TableLinkedPolicyListingItem[] {
  const $ = load(tableHtml);
  const policyLinks: TableLinkedPolicyListingItem[] = [];
  const seenUrls = new Set<string>();

  $("tr").each((_index, row) => {
    const cells = $(row).children("th,td");
    if (cells.length === 0) {
      return;
    }

    const firstColumn = cells.eq(0);
    const anchor = firstColumn.find("a[href]").first();
    if (!anchor.length) {
      return;
    }

    const fallbackTitle = normalizeInlineText(anchor.text() || firstColumn.text());
    if (!fallbackTitle) {
      return;
    }

    if (fallbackTitle.toLowerCase() === "table of contents") {
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

    if (!resolvedUrl || seenUrls.has(resolvedUrl)) {
      return;
    }

    if (!isLikelyPolicyDetailUrl(resolvedUrl, listingUrl)) {
      return;
    }

    seenUrls.add(resolvedUrl);

    const fallbackIndicator = normalizeInlineText(cells.eq(1).text());

    policyLinks.push({
      url: resolvedUrl,
      fallbackTitle,
      fallbackIndicator,
    });
  });

  return policyLinks;
}

function isLikelyPolicyDetailUrl(url: string, listingUrl: string): boolean {
  let parsedUrl: URL;
  let parsedListingUrl: URL;

  try {
    parsedUrl = new URL(url);
    parsedListingUrl = new URL(listingUrl);
  } catch {
    return false;
  }

  if (parsedUrl.hostname !== parsedListingUrl.hostname) {
    return false;
  }

  if (/\.pdf$/i.test(parsedUrl.pathname)) {
    return false;
  }

  return parsedUrl.pathname.includes("/page/");
}

function findPolicyListingTableHtmlInPayload(html: string): string | null {
  try {
    const payload = extractClientWorkStatePayload(html);
    const contentNodes = collectContentNodes(payload.page?.content);

    for (const node of contentNodes) {
      if (node.type !== "CONTENT_NODE_TABLE" || typeof node.content?.html !== "string") {
        continue;
      }

      const headers = getTableHeaders(node.content.html);
      if (headers.some((header) => header.includes("name of policy"))) {
        return node.content.html;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function findPolicyListingTable($: ReturnType<typeof load>): ReturnType<typeof $> | null {
  const tables = $("table").toArray();

  for (const table of tables) {
    const headerCells = $(table).find("tr").first().find("th,td").toArray();
    const normalizedHeaders = headerCells.map((cell) => normalizeInlineText($(cell).text()).toLowerCase());

    if (normalizedHeaders.some((header) => header === "name of policy" || header.includes("name of policy"))) {
      return $(table);
    }
  }

  return null;
}

async function scrapePolicyDetail(policyLink: TableLinkedPolicyListingItem): Promise<TableLinkedPolicyCsvRow> {
  const policyHtml = await fetchHtml(policyLink.url);
  const payload = extractClientWorkStatePayload(policyHtml);
  const pageContent = payload.page?.content;

  if (!pageContent) {
    throw new Error("Missing embedded page content in policy page payload.");
  }

  const contentNodes = collectContentNodes(pageContent);
  if (contentNodes.length === 0) {
    throw new Error("No parseable content nodes were found in policy page payload.");
  }

  const pageName = normalizeInlineText(payload.page?.name ?? "");
  const headingText = normalizeInlineText(
    extractNodeText(contentNodes.find((node) => node.type === "CONTENT_NODE_HEADING")),
  );

  const parsedIdentity =
    parsePolicyIdentity(headingText) ||
    parsePolicyIdentity(pageName) ||
    parsePolicyIdentity(policyLink.fallbackIndicator);

  const policyChapter = parsedIdentity?.policyChapter ?? "";
  const policyNumber = parsedIdentity?.policyNumber ?? "";
  const policyTitle = normalizeInlineText(
    parsedIdentity?.titleRemainder ||
      stripPolicyPrefix(headingText) ||
      stripPolicyPrefix(pageName) ||
      policyLink.fallbackTitle,
  );

  const metadataIndex = contentNodes.findIndex((node) => isMetadataTableNode(node));
  const metadata =
    metadataIndex >= 0 ? parseMetadataTableHtml(contentNodes[metadataIndex].content?.html ?? "") : emptyMetadata();

  const policyWording = extractPolicyWording(contentNodes, metadataIndex, headingText);

  return {
    policyChapter,
    policyNumber,
    policyTitle,
    policyWording,
    statutoryAuthority: metadata.statutoryAuthority,
    lawsImplemented: metadata.lawsImplemented,
    history: metadata.history,
    notes: metadata.notes,
  };
}

function extractClientWorkStatePayload(html: string): ClientWorkStatePayload {
  const $ = load(html);

  const scriptText = $("script")
    .toArray()
    .map((script) => $(script).html() ?? "")
    .find((script) => script.includes("window.clientWorkStateTemp = JSON.parse("));

  if (!scriptText) {
    throw new Error("Could not find embedded policy page payload.");
  }

  const literalMatch = scriptText.match(
    /window\.clientWorkStateTemp\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\)/,
  );

  if (!literalMatch?.[1]) {
    throw new Error("Could not parse embedded policy payload expression.");
  }

  const parsed = runInNewContext(`JSON.parse(${literalMatch[1]})`, { JSON }, { timeout: 10_000 });
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Embedded policy payload could not be decoded.");
  }

  return parsed as ClientWorkStatePayload;
}

function collectContentNodes(contentRoot: unknown): ContentNode[] {
  const nodes: ContentNode[] = [];

  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    const maybeNode = value as ContentNode;
    if (typeof maybeNode.type === "string" && maybeNode.type.startsWith("CONTENT_NODE_")) {
      nodes.push(maybeNode);
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  };

  visit(contentRoot);
  return nodes;
}

function parsePolicyIdentity(value: string): ParsedPolicyIdentity | null {
  const normalized = normalizeInlineText(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d+)\s*\.\s*([0-9A-Za-z.-]+)\s*(.*)$/);
  if (!match) {
    return null;
  }

  return {
    policyChapter: normalizeInlineText(match[1]),
    policyNumber: normalizeInlineText(match[2]),
    titleRemainder: normalizeInlineText(match[3].replace(/^[-:]+/, "")),
  };
}

function stripPolicyPrefix(value: string): string {
  const normalized = normalizeInlineText(value);
  if (!normalized) {
    return "";
  }

  const match = normalized.match(/^\d+\s*\.\s*[0-9A-Za-z.-]+\s*(.*)$/);
  if (!match?.[1]) {
    return normalized;
  }

  return normalizeInlineText(match[1].replace(/^[-:]+/, ""));
}

function extractPolicyWording(contentNodes: ContentNode[], metadataIndex: number, headingText: string): string {
  const limit = metadataIndex >= 0 ? metadataIndex : contentNodes.length;
  const normalizedHeading = normalizeInlineText(headingText);
  const segments: string[] = [];

  for (let index = 0; index < limit; index += 1) {
    const node = contentNodes[index];
    if (node.type === "CONTENT_NODE_HEADING") {
      const heading = normalizeInlineText(extractNodeText(node));
      if (!heading || heading === normalizedHeading) {
        continue;
      }
      segments.push(heading);
      continue;
    }

    const text = extractNodeText(node);
    if (!text) {
      continue;
    }

    segments.push(text);
  }

  const deduped: string[] = [];
  for (const segment of segments) {
    if (!segment) {
      continue;
    }

    if (deduped[deduped.length - 1] === segment) {
      continue;
    }

    deduped.push(segment);
  }

  return deduped.join("\n\n").trim();
}

function extractNodeText(node: ContentNode | undefined): string {
  if (!node?.content) {
    return "";
  }

  if (typeof node.content.html === "string") {
    return extractTextFromHtml(node.content.html);
  }

  if (typeof node.content.text === "string") {
    return normalizeWordingText(node.content.text);
  }

  return "";
}

function extractTextFromHtml(html: string): string {
  const $ = load(`<div id="root">${html}</div>`);
  const root = $("#root");
  const blockSelector = "p,li,h1,h2,h3,h4,h5,h6,blockquote";
  const blocks = root.find(blockSelector).toArray();

  const segments: string[] = [];

  for (const block of blocks) {
    const blockNode = $(block);
    if (blockNode.find(blockSelector).length > 0) {
      continue;
    }

    const text = normalizeInlineText(blockNode.text());
    if (text) {
      segments.push(text);
    }
  }

  if (segments.length > 0) {
    return segments.join("\n\n");
  }

  return normalizeWordingText(root.text());
}

function isMetadataTableNode(node: ContentNode): boolean {
  if (node.type !== "CONTENT_NODE_TABLE" || typeof node.content?.html !== "string") {
    return false;
  }

  const headers = getTableHeaders(node.content.html);
  const hasStatutory = headers.some((header) => header.includes("statutory authority"));
  const hasLaw = headers.some(
    (header) => header.includes("law(s) implemented") || header.includes("laws implemented"),
  );
  const hasHistory = headers.some((header) => header.includes("history"));
  const hasNotes = headers.some((header) => header.includes("notes"));

  return (hasStatutory && hasLaw && hasHistory) || (hasStatutory && hasNotes);
}

function getTableHeaders(tableHtml: string): string[] {
  const $ = load(tableHtml);
  const firstRow = $("tr").first();
  if (!firstRow.length) {
    return [];
  }

  return firstRow
    .find("th,td")
    .toArray()
    .map((cell) => normalizeInlineText($(cell).text()).toLowerCase())
    .filter(Boolean);
}

function parseMetadataTableHtml(tableHtml: string): TablePolicyMetadata {
  const $ = load(tableHtml);
  const rows = $("tr").toArray();

  if (rows.length === 0) {
    return emptyMetadata();
  }

  const firstRowCells = $(rows[0]).children("th,td").toArray();
  const headers = firstRowCells.map((cell) => normalizeInlineText($(cell).text()).toLowerCase());

  const statutoryIndex = findHeaderIndex(headers, ["statutory authority"]);
  const lawsIndex = findHeaderIndex(headers, ["law(s) implemented", "laws implemented"]);
  const historyIndex = findHeaderIndex(headers, ["history"]);
  const notesIndex = findHeaderIndex(headers, ["notes"]);

  const hasHeaderRow = [statutoryIndex, lawsIndex, historyIndex, notesIndex].some((index) => index >= 0);
  const startRow = hasHeaderRow ? 1 : 0;

  const statutoryValues: string[] = [];
  const lawsValues: string[] = [];
  const historyValues: string[] = [];
  const notesValues: string[] = [];

  for (let rowIndex = startRow; rowIndex < rows.length; rowIndex += 1) {
    if ($(rows[rowIndex]).children("th,td").length === 0) {
      continue;
    }

    appendValue(statutoryValues, readTableCellValue($, rows[rowIndex], statutoryIndex, 0));
    appendValue(lawsValues, readTableCellValue($, rows[rowIndex], lawsIndex, 1));
    appendValue(historyValues, readTableCellValue($, rows[rowIndex], historyIndex, 2));
    appendValue(notesValues, readTableCellValue($, rows[rowIndex], notesIndex, 3));
  }

  return {
    statutoryAuthority: joinUniqueValues(statutoryValues),
    lawsImplemented: joinUniqueValues(lawsValues),
    history: joinUniqueValues(historyValues),
    notes: joinUniqueValues(notesValues),
  };
}

function findHeaderIndex(headers: string[], candidates: string[]): number {
  for (const [index, header] of headers.entries()) {
    for (const candidate of candidates) {
      if (header.includes(candidate)) {
        return index;
      }
    }
  }
  return -1;
}

function readTableCellValue(
  $: ReturnType<typeof load>,
  row: AnyNode,
  preferredIndex: number,
  fallbackIndex: number,
): string {
  const cells = $(row).children("th,td");
  const index = preferredIndex >= 0 ? preferredIndex : fallbackIndex;
  const cell = cells.eq(index);
  if (!cell.length) {
    return "";
  }

  const lines: string[] = [];
  cell.find("p,li").each((_index, element) => {
    const text = normalizeInlineText($(element).text());
    if (text) {
      lines.push(text);
    }
  });

  if (lines.length > 0) {
    return lines.join("\n");
  }

  return normalizeInlineText(cell.text());
}

function appendValue(values: string[], value: string): void {
  const normalized = normalizeWordingText(value);
  if (normalized) {
    values.push(normalized);
  }
}

function joinUniqueValues(values: string[]): string {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeWordingText(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped.join("\n\n");
}

function emptyMetadata(): TablePolicyMetadata {
  return {
    statutoryAuthority: "",
    lawsImplemented: "",
    history: "",
    notes: "",
  };
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
