import { NextRequest, NextResponse } from "next/server";

import {
  hashPassword,
  setSessionCookie,
  validatePasswordPolicy,
} from "@/lib/policy-assistant/auth";
import { consumePasswordResetToken } from "@/lib/policy-assistant/auth-flow";
import {
  createAuthSession,
  deleteAuthSessionsForUser,
  updateUserPasswordHash,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PasswordResetConfirmPayload {
  token?: string;
  password?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as PasswordResetConfirmPayload;
    const token = payload.token?.trim() ?? "";
    const password = payload.password?.trim() ?? "";

    const rateLimit = await checkRateLimit({
      scope: "auth_password_reset_confirm",
      identifier: buildRateLimitIdentifier(request),
      maxRequests: 12,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many password reset attempts. Please wait and try again.",
      );
    }

    if (!token) {
      return NextResponse.json({ error: "Reset token is required." }, { status: 400 });
    }

    const passwordError = validatePasswordPolicy(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const user = await consumePasswordResetToken(token);
    if (!user) {
      return NextResponse.json(
        { error: "This password reset link is invalid or expired." },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    await updateUserPasswordHash(user.id, passwordHash);
    await deleteAuthSessionsForUser(user.id);

    const session = await createAuthSession(user.id);
    const response = NextResponse.json(
      {
        user,
        message: "Password updated successfully.",
      },
      { status: 200 },
    );
    setSessionCookie(response, session.id, session.expiresAt);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Password reset failed." },
      { status: 500 },
    );
  }
}
