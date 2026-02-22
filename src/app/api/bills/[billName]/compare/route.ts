import { NextRequest, NextResponse } from "next/server";

import { compareBillVersions, DEFAULT_YEAR } from "@/lib/bill-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ billName: string }> },
): Promise<NextResponse> {
  try {
    const params = await context.params;
    const year = request.nextUrl.searchParams.get("year") ?? DEFAULT_YEAR;
    const fromVersion = request.nextUrl.searchParams.get("from");
    const toVersion = request.nextUrl.searchParams.get("to");

    if (!fromVersion || !toVersion) {
      return NextResponse.json(
        {
          error: "Both query params are required: from and to",
        },
        { status: 400 },
      );
    }

    const comparison = await compareBillVersions(year, params.billName, fromVersion, toVersion);

    return NextResponse.json(comparison);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to compare versions",
      },
      { status: 500 },
    );
  }
}
