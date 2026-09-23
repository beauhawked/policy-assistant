import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/policy-assistant/admin";
import { listAllUsersWithStats } from "@/lib/policy-assistant/db";
import { serverErrorResponse } from "@/lib/policy-assistant/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const guard = await requireAdminUser(request);
    if (!guard.ok) {
      return guard.response;
    }

    const users = await listAllUsersWithStats();
    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not load the user roster.", "admin_users_list");
  }
}
