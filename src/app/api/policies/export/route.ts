import { NextRequest, NextResponse } from "next/server";

import { policyRowsToCsv, scrapeBoardDocsPolicies } from "@/lib/boarddocs-policy-scraper";
import { scrapeTableLinkedPolicies, tableLinkedPolicyRowsToCsv } from "@/lib/table-link-policy-scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestedPolicyPlatform = "auto" | "boarddocs" | "table-link";
type ResolvedPolicyPlatform = Exclude<RequestedPolicyPlatform, "auto">;

interface ExportPoliciesPayload {
  url?: string;
  includeAllBooks?: boolean;
  platform?: RequestedPolicyPlatform;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as ExportPoliciesPayload;
    const sourceUrl = payload.url?.trim() ?? "";
    const requestedPlatform = normalizeRequestedPlatform(payload.platform);

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "Please provide a district policy URL." },
        { status: 400 },
      );
    }

    const normalizedSourceUrl = ensureUrlProtocol(sourceUrl);
    const resolvedPlatform = await resolvePolicyPlatform(normalizedSourceUrl, requestedPlatform);

    let csv = "";
    let baseUrl = normalizedSourceUrl;
    let policyCount = 0;
    let sourceCount = 0;
    let sourceLabel = "";
    let failedCount = 0;
    let legacyBookCount = 0;

    if (resolvedPlatform === "boarddocs") {
      const result = await scrapeBoardDocsPolicies({
        sourceUrl: normalizedSourceUrl,
        includeAllBooks: Boolean(payload.includeAllBooks),
        concurrency: 6,
      });

      csv = policyRowsToCsv(result.rows);
      baseUrl = result.baseUrl;
      policyCount = result.rows.length;
      sourceCount = result.selectedBooks.length;
      sourceLabel = "book(s)";
      failedCount = result.failedItems.length;
      legacyBookCount = result.selectedBooks.length;
    } else {
      const result = await scrapeTableLinkedPolicies({
        sourceUrl: normalizedSourceUrl,
        concurrency: 6,
      });

      csv = tableLinkedPolicyRowsToCsv(result.rows);
      baseUrl = result.listingUrl;
      policyCount = result.rows.length;
      sourceCount = result.discoveredPolicyLinks;
      sourceLabel = "policy link(s)";
      failedCount = result.failedItems.length;
      legacyBookCount = 0;
    }

    const filename = buildCsvFilename(baseUrl, resolvedPlatform);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-policy-count": String(policyCount),
        "x-failed-count": String(failedCount),
        "x-source-count": String(sourceCount),
        "x-source-label": sourceLabel,
        "x-platform": resolvedPlatform,
        "x-book-count": String(legacyBookCount),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Policy export failed.",
      },
      { status: 500 },
    );
  }
}

function normalizeRequestedPlatform(value: string | undefined): RequestedPolicyPlatform {
  if (value === "boarddocs" || value === "table-link") {
    return value;
  }
  return "auto";
}

function ensureUrlProtocol(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
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

  return "table-link";
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
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "policies";
}
