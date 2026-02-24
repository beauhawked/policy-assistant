import { NextRequest, NextResponse } from "next/server";

import {
  getAuthenticatedUserFromRequest,
  getRequestOrigin,
  isValidEmail,
  normalizeEmail,
} from "@/lib/policy-assistant/auth";
import { issueEmailVerificationForUser } from "@/lib/policy-assistant/auth-flow";
import { findUserByEmail } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResendPayload {
  email?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const signedInUser = await getAuthenticatedUserFromRequest(request);
    const payload = (await request.json().catch(() => ({}))) as ResendPayload;
    const providedEmail = normalizeEmail(payload.email);

    const rateLimit = await checkRateLimit({
      scope: "auth_resend_verification",
      identifier: buildRateLimitIdentifier(request, {
        email: providedEmail || signedInUser?.email,
        userId: signedInUser?.id,
      }),
      maxRequests: 6,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many verification email requests. Please wait and try again.",
      );
    }

    if (signedInUser && !signedInUser.emailVerifiedAt) {
      await issueEmailVerificationForUser(signedInUser, getRequestOrigin(request));
      return NextResponse.json(
        { message: "Verification email sent. Please check your inbox." },
        { status: 200 },
      );
    }

    if (!providedEmail || !isValidEmail(providedEmail)) {
      return NextResponse.json(
        {
          message:
            "If an unverified account exists for that email, a verification message has been sent.",
        },
        { status: 200 },
      );
    }

    const existing = await findUserByEmail(providedEmail);
    if (existing && !existing.user.emailVerifiedAt) {
      await issueEmailVerificationForUser(existing.user, getRequestOrigin(request));
    }

    return NextResponse.json(
      {
        message:
          "If an unverified account exists for that email, a verification message has been sent.",
      },
      { status: 200 },
    );
  } catch (error) {
    return serverErrorResponse(
      error,
      "Could not resend verification email.",
      "auth_resend_verification",
    );
  }
}
