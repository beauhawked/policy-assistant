import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_YEAR, getBillIndex } from "@/lib/bill-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const year = request.nextUrl.searchParams.get("year") ?? DEFAULT_YEAR;
  const index = await getBillIndex(year);

  return NextResponse.json({
    year,
    generatedAt: index?.generatedAt ?? null,
    count: index?.count ?? 0,
    items: index?.items ?? [],
  });
}
