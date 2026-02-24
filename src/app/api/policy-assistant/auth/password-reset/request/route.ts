import { NextRequest, NextResponse } from "next/server";

import { getRequestOrigin, isValidEmail, normalizeEmail } from "@/lib/policy-assistant/auth";
import { issuePasswordResetForUser } from "@/lib/policy-assistant/auth-flow";
import { findUserByEmail } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PasswordResetRequestPayload {
  email?: string;
}

const GENERIC_MESSAGE =
  "If an account exists for this email, a password reset link has been sent.";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as PasswordResetRequestPayload;
    const email = normalizeEmail(payload.email);

    const rateLimit = await checkRateLimit({
      scope: "auth_password_reset_request",
      identifier: buildRateLimitIdentifier(request, { email }),
      maxRequests: 8,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many password reset requests. Please wait and try again.",
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
    }

    const existing = await findUserByEmail(email);
    if (existing?.user.emailVerifiedAt) {
      await issuePasswordResetForUser(existing.user, getRequestOrigin(request));
    }

    return NextResponse.json({ message: GENERIC_MESSAGE }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Password reset request failed.",
      "auth_password_reset_request",
    );
  }
}
