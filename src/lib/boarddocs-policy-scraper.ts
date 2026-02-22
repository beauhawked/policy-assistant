import { load } from "cheerio";

const BOARD_DOCS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const STATUS_REQUEST_ORDER = ["active", "other", "retired"] as const;

type StatusRequestKey = (typeof STATUS_REQUEST_ORDER)[number];

const STATUS_LABELS: Record<StatusRequestKey, string> = {
  active: "Active",
  other: "Under Consideration",
  retired: "Retired",
};

export interface PolicyCsvRow {
  section: string;
  code: string;
  adoptedDate: string;
  revisedDate: string;
  status: string;
  policyTitle: string;
  policyWording: string;
}

interface PolicyNavItem {
  uniqueId: string;
  statusKey: StatusRequestKey;
  section: string;
  code: string;
  policyTitle: string;
}

export interface ScrapeBoardDocsPoliciesOptions {
  sourceUrl: string;
  includeAllBooks?: boolean;
  concurrency?: number;
}

export interface ScrapeBoardDocsPoliciesResult {
  baseUrl: string;
  selectedBooks: string[];
  rows: PolicyCsvRow[];
  failedItems: Array<{ uniqueId: string; reason: string }>;
}

export function normalizeBoardDocsBaseUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    throw new Error("Please provide a BoardDocs URL.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("Invalid URL. Please enter a full BoardDocs URL.");
  }

  const lowerPath = parsed.pathname.toLowerCase();
  const marker = "/board.nsf";
  const markerIndex = lowerPath.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("URL does not appear to be a BoardDocs district page (missing /Board.nsf).");
  }

  const boardPath = parsed.pathname.slice(0, markerIndex + marker.length).replace(/\/+$/, "");
  if (!boardPath) {
    throw new Error("Unable to determine BoardDocs district path from URL.");
  }

  return `${parsed.origin}${boardPath}`;
}

export async function scrapeBoardDocsPolicies(
  options: ScrapeBoardDocsPoliciesOptions,
): Promise<ScrapeBoardDocsPoliciesResult> {
  const baseUrl = normalizeBoardDocsBaseUrl(options.sourceUrl);
  const includeAllBooks = Boolean(options.includeAllBooks);
  const concurrency = clamp(options.concurrency ?? 6, 1, 12);

  const allBooks = await getPolicyBooks(baseUrl);
  if (allBooks.length === 0) {
    throw new Error("No policy books were found for this district URL.");
  }

  const selectedBooks = selectBooks(allBooks, includeAllBooks);
  if (selectedBooks.length === 0) {
    throw new Error("Could not determine which policy books to scrape.");
  }

  const navItemsByBook = await Promise.all(
    selectedBooks.map(async (book) => {
      const itemsByStatus = await Promise.all(
        STATUS_REQUEST_ORDER.map(async (statusKey) => {
          const html = await postBoardDocsHtml(baseUrl, "BD-GetPolicies", {
            status: statusKey,
            book,
          });
          return parsePolicyNavigation(html, statusKey);
        }),
      );
      return itemsByStatus.flat();
    }),
  );

  const navItems = dedupeByUniqueId(navItemsByBook.flat());
  if (navItems.length === 0) {
    throw new Error("No policies were found in the selected policy book(s).");
  }

  const failedItems: Array<{ uniqueId: string; reason: string }> = [];

  const rows = (
    await mapWithConcurrency(navItems, concurrency, async (navItem) => {
      try {
        const itemHtml = await postBoardDocsHtml(baseUrl, "BD-GetPolicyItem", { id: navItem.uniqueId });
        return parsePolicyItem(itemHtml, navItem);
      } catch (error) {
        failedItems.push({
          uniqueId: navItem.uniqueId,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
        return null;
      }
    })
  ).filter((row): row is PolicyCsvRow => row !== null);

  if (rows.length === 0) {
    throw new Error("Scrape completed, but no policy items could be parsed.");
  }

  return {
    baseUrl,
    selectedBooks,
    rows,
    failedItems,
  };
}

export function policyRowsToCsv(rows: PolicyCsvRow[]): string {
  const headers = [
    "Section",
    "Code",
    "Adopted Date",
    "Revised Date",
    "Status",
    "Policy Title",
    "Policy Wording",
  ];

  const csvRows = [
    headers,
    ...rows.map((row) => [
      row.section,
      row.code,
      row.adoptedDate,
      row.revisedDate,
      row.status,
      row.policyTitle,
      row.policyWording,
    ]),
  ];

  const content = csvRows
    .map((columns) => columns.map((value) => escapeCsvField(value)).join(","))
    .join("\n");

  // BOM helps Excel open UTF-8 text cleanly.
  return `\uFEFF${content}`;
}

function selectBooks(allBooks: string[], includeAllBooks: boolean): string[] {
  if (includeAllBooks) {
    return allBooks;
  }

  const policyManual = allBooks.find((book) => normalizeInlineText(book).toLowerCase() === "policy manual");
  if (policyManual) {
    return [policyManual];
  }

  const likelyPolicyBooks = allBooks.filter((book) => /policy|bylaw/i.test(book));
  if (likelyPolicyBooks.length > 0) {
    return likelyPolicyBooks;
  }

  return allBooks;
}

async function getPolicyBooks(baseUrl: string): Promise<string[]> {
  const html = await postBoardDocsHtml(baseUrl, "BD-GetPolicyBooks");
  const $ = load(html);

  const books = new Set<string>();

  $("#policy-book-select a").each((_index, element) => {
    const value = normalizeInlineText($(element).text());
    if (value) {
      books.add(value);
    }
  });

  const fallbackBook = normalizeInlineText($("#book-menu").text());
  if (fallbackBook) {
    books.add(fallbackBook);
  }

  return Array.from(books);
}

function parsePolicyNavigation(html: string, statusKey: StatusRequestKey): PolicyNavItem[] {
  const $ = load(html);
  const items: PolicyNavItem[] = [];
  const accordionChildren = $("#policy-accordion").children().toArray();

  let currentSection = "";

  for (const child of accordionChildren) {
    const node = $(child);
    const tag = child.tagName?.toLowerCase();

    if (tag === "section") {
      currentSection = normalizeInlineText(node.find("a.lefMenu").first().text());
      continue;
    }

    if (tag !== "div") {
      continue;
    }

    node.find("a.policy").each((_index, policyLink) => {
      const link = $(policyLink);
      const uniqueId = normalizeInlineText(link.attr("unique") ?? "");
      if (!uniqueId) {
        return;
      }

      const code = normalizeInlineText(link.find("b").first().text());

      const titleContainer = link.children("div").eq(1).clone();
      titleContainer.find(".icons").remove();
      const policyTitle = normalizeInlineText(titleContainer.text());

      items.push({
        uniqueId,
        statusKey,
        section: currentSection,
        code,
        policyTitle,
      });
    });
  }

  return items;
}

function parsePolicyItem(html: string, navItem: PolicyNavItem): PolicyCsvRow {
  const $ = load(html);
  const details = new Map<string, string>();

  $("#view-policy-item .container .row").each((_index, row) => {
    const key = normalizeDetailKey($(row).find(".leftcol").first().text());
    const value = normalizeInlineText($(row).find(".rightcol").first().text());
    if (key && value) {
      details.set(key, value);
    }
  });

  const section = details.get("section") ?? navItem.section;
  const code = details.get("code") ?? navItem.code;
  const title = details.get("title") ?? navItem.policyTitle;
  const status = details.get("status") ?? STATUS_LABELS[navItem.statusKey];
  const adoptedDate = details.get("adopted") ?? details.get("adopted date") ?? "";
  const revisedDate =
    details.get("last revised") ??
    details.get("revised") ??
    details.get("revised date") ??
    details.get("last updated") ??
    "";

  const policyWording = extractPolicyWording($);

  return {
    section,
    code,
    adoptedDate,
    revisedDate,
    status,
    policyTitle: title,
    policyWording,
  };
}

function extractPolicyWording($: ReturnType<typeof load>): string {
  const source = $("#forcopy").first();
  if (!source.length) {
    return "";
  }

  const blockSelector = "p,li,h1,h2,h3,h4,h5,h6,blockquote";
  const blocks = source.find(blockSelector);
  const segments: string[] = [];

  blocks.each((_index, element) => {
    const elementNode = $(element);
    if (elementNode.find(blockSelector).length > 0) {
      return;
    }

    const text = normalizeInlineText(elementNode.text());
    if (text) {
      segments.push(text);
    }
  });

  if (segments.length > 0) {
    return segments.join("\n\n");
  }

  return normalizeWordingText(source.text());
}

function normalizeDetailKey(value: string): string {
  return normalizeInlineText(value).replace(/:$/, "").toLowerCase();
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

function dedupeByUniqueId(items: PolicyNavItem[]): PolicyNavItem[] {
  const seen = new Set<string>();
  const deduped: PolicyNavItem[] = [];

  for (const item of items) {
    if (seen.has(item.uniqueId)) {
      continue;
    }
    seen.add(item.uniqueId);
    deduped.push(item);
  }

  return deduped;
}

async function postBoardDocsHtml(
  baseUrl: string,
  endpoint: string,
  payload?: Record<string, string>,
  retries = 2,
): Promise<string> {
  const targetUrl = `${baseUrl}/${endpoint}?open&${Math.random()}`;
  const formBody = new URLSearchParams(payload ?? {}).toString();
  const origin = new URL(baseUrl).origin;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          accept: "text/html, */*; q=0.01",
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          origin,
          referer: `${baseUrl}/Public`,
          "user-agent": BOARD_DOCS_USER_AGENT,
          "x-requested-with": "XMLHttpRequest",
        },
        body: formBody,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed calling ${endpoint}`);
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
