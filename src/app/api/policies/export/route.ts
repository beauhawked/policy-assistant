import { NextRequest, NextResponse } from "next/server";

import { policyRowsToCsv, scrapeBoardDocsPolicies } from "@/lib/boarddocs-policy-scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportPoliciesPayload {
  url?: string;
  includeAllBooks?: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as ExportPoliciesPayload;
    const sourceUrl = payload.url?.trim() ?? "";

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "Please provide a district BoardDocs URL." },
        { status: 400 },
      );
    }

    const result = await scrapeBoardDocsPolicies({
      sourceUrl,
      includeAllBooks: Boolean(payload.includeAllBooks),
      concurrency: 6,
    });

    const csv = policyRowsToCsv(result.rows);
    const filename = buildCsvFilename(result.baseUrl);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-policy-count": String(result.rows.length),
        "x-book-count": String(result.selectedBooks.length),
        "x-failed-count": String(result.failedItems.length),
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

function buildCsvFilename(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  const pathSlug = parsed.pathname
    .split("/")
    .filter(Boolean)
    .slice(0, 2)
    .join("-");

  const sourceSlug = sanitizeSlug(pathSlug || parsed.hostname);
  const dateSlug = new Date().toISOString().slice(0, 10);
  return `${sourceSlug}-policies-${dateSlug}.csv`;
}

function sanitizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "boarddocs";
}
