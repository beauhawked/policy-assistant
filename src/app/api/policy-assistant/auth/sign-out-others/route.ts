import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, getAuthenticatedUserFromRequest } from "@/lib/policy-assistant/auth";
import { deleteOtherAuthSessions } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const rateLimit = await checkRateLimit({
      scope: "auth_sign_out_others",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 10,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many requests. Please wait and try again.",
      );
    }

    const currentSessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim() ?? "";
    if (!currentSessionId) {
      return NextResponse.json({ error: "No active session found." }, { status: 400 });
    }

    const removed = await deleteOtherAuthSessions(user.id, currentSessionId);
    return NextResponse.json(
      {
        signedOut: removed,
        message:
          removed > 0
            ? `Signed out of ${removed} other ${removed === 1 ? "session" : "sessions"}.`
            : "No other active sessions were found.",
      },
      { status: 200 },
    );
  } catch (error) {
    return serverErrorResponse(error, "Could not sign out other sessions.", "auth_sign_out_others");
  }
}
