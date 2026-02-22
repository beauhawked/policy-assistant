import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_YEAR, getBillRecord, orderedVersions } from "@/lib/bill-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ billName: string }> },
): Promise<NextResponse> {
  const params = await context.params;
  const year = request.nextUrl.searchParams.get("year") ?? DEFAULT_YEAR;
  const record = await getBillRecord(params.billName, year, true);

  if (!record) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  return NextResponse.json({
    year,
    billName: record.billName,
    fetchedAt: record.fetchedAt,
    detail: record.detail,
    actions: record.actions,
    versions: orderedVersions(record),
  });
}
