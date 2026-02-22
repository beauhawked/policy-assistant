import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_YEAR, getBillIndex } from "@/lib/bill-service";
import { syncBills } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const year = request.nextUrl.searchParams.get("year") ?? DEFAULT_YEAR;
  const index = await getBillIndex(year);

  return NextResponse.json({
    year,
    indexGeneratedAt: index?.generatedAt ?? null,
    count: index?.count ?? 0,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      year?: string;
      limit?: number;
      billNames?: string[];
      concurrency?: number;
    };

    const result = await syncBills({
      year: payload.year ?? DEFAULT_YEAR,
      limit: payload.limit,
      billNames: payload.billNames,
      concurrency: payload.concurrency ?? 4,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Sync failed",
      },
      { status: 500 },
    );
  }
}
