import { NextRequest, NextResponse } from "next/server";

import { setSessionCookie } from "@/lib/policy-assistant/auth";
import { createSessionForVerifiedUser, verifyEmailToken } from "@/lib/policy-assistant/auth-flow";
import { rateLimitExceededResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VerifyEmailPayload {
  token?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as VerifyEmailPayload;
    const token = payload.token?.trim() ?? "";

    const rateLimit = await checkRateLimit({
      scope: "auth_verify_email",
      identifier: buildRateLimitIdentifier(request),
      maxRequests: 24,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many verification attempts. Please wait and try again.",
      );
    }

    if (!token) {
      return NextResponse.json({ error: "Verification token is required." }, { status: 400 });
    }

    const verifiedUser = await verifyEmailToken(token);
    if (!verifiedUser) {
      return NextResponse.json(
        { error: "This verification link is invalid or expired." },
        { status: 400 },
      );
    }

    const session = await createSessionForVerifiedUser(verifiedUser);
    const response = NextResponse.json(
      {
        user: verifiedUser,
        message: "Email verified. You can now use the assistant.",
      },
      { status: 200 },
    );
    setSessionCookie(response, session.sessionId, session.expiresAt);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email verification failed." },
      { status: 500 },
    );
  }
}
