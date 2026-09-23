import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/policy-assistant/admin";
import { listAuditEvents } from "@/lib/policy-assistant/db";
import { serverErrorResponse } from "@/lib/policy-assistant/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const guard = await requireAdminUser(request);
    if (!guard.ok) {
      return guard.response;
    }

    const limitParam = Number.parseInt(
      request.nextUrl.searchParams.get("limit") ?? "50",
      10,
    );
    const limit = Number.isFinite(limitParam) ? limitParam : 50;

    const events = await listAuditEvents(limit);
    return NextResponse.json({ events }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not load audit events.", "admin_audit_events");
  }
}
