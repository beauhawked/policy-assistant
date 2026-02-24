import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/policy-assistant/auth";
import { deleteAuthSession } from "@/lib/policy-assistant/db";
import { serverErrorResponse } from "@/lib/policy-assistant/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
    if (sessionId) {
      await deleteAuthSession(sessionId);
    }

    const response = NextResponse.json({ success: true }, { status: 200 });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return serverErrorResponse(error, "Logout failed.", "auth_logout");
  }
}
