import { NextRequest, NextResponse } from "next/server";

import {
  normalizeRequestedPolicyPlatform,
  scrapePoliciesForExport,
  type RequestedPolicyPlatform,
} from "@/lib/policy-scraper-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportPoliciesPayload {
  url?: string;
  includeAllBooks?: boolean;
  platform?: RequestedPolicyPlatform;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as ExportPoliciesPayload;
    const sourceUrl = payload.url?.trim() ?? "";

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "Please provide a district policy URL." },
        { status: 400 },
      );
    }

    const exportResult = await scrapePoliciesForExport({
      sourceUrl,
      platform: normalizeRequestedPolicyPlatform(payload.platform),
      includeAllBooks: Boolean(payload.includeAllBooks),
    });

    return new NextResponse(exportResult.csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${exportResult.filename}"`,
        "cache-control": "no-store",
        "x-policy-count": String(exportResult.policyCount),
        "x-failed-count": String(exportResult.failedCount),
        "x-source-count": String(exportResult.sourceCount),
        "x-source-label": exportResult.sourceLabel,
        "x-platform": exportResult.platform,
        "x-book-count": String(exportResult.legacyBookCount),
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
