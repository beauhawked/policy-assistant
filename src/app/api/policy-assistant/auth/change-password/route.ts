import { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  getAuthenticatedUserFromRequest,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/policy-assistant/auth";
import {
  deleteOtherAuthSessions,
  getUserPasswordHash,
  updateUserPasswordHash,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChangePasswordPayload {
  currentPassword?: unknown;
  newPassword?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }

    const rateLimit = await checkRateLimit({
      scope: "auth_change_password",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 5,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many password change attempts. Please wait and try again.",
      );
    }

    const payload = (await request.json().catch(() => ({}))) as ChangePasswordPayload;
    const currentPassword =
      typeof payload.currentPassword === "string" ? payload.currentPassword : "";
    const newPassword = typeof payload.newPassword === "string" ? payload.newPassword.trim() : "";

    if (!currentPassword) {
      return NextResponse.json({ error: "Your current password is required." }, { status: 400 });
    }

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }

    const storedHash = await getUserPasswordHash(user.id);
    if (!storedHash || !(await verifyPassword(currentPassword, storedHash))) {
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 403 });
    }

    await updateUserPasswordHash(user.id, await hashPassword(newPassword));

    const currentSessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim() ?? "";
    if (currentSessionId) {
      await deleteOtherAuthSessions(user.id, currentSessionId);
    }

    return NextResponse.json(
      { changed: true, message: "Password updated. Other devices have been signed out." },
      { status: 200 },
    );
  } catch (error) {
    return serverErrorResponse(error, "Could not change your password.", "auth_change_password");
  }
}
