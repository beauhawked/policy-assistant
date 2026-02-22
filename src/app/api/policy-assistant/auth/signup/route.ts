import { NextRequest, NextResponse } from "next/server";

import {
  getRequestOrigin,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  setSessionCookie,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/policy-assistant/auth";
import { issueEmailVerificationForUser } from "@/lib/policy-assistant/auth-flow";
import { createAuthSession, createUserAccount, findUserByEmail } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SignupPayload {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as SignupPayload;
    const email = normalizeEmail(payload.email);
    const password = payload.password?.trim() ?? "";

    const rateLimit = await checkRateLimit({
      scope: "auth_signup",
      identifier: buildRateLimitIdentifier(request, { email }),
      maxRequests: 6,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many signup attempts. Please wait and try again.",
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const passwordError = validatePasswordPolicy(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      const matchesPassword = await verifyPassword(password, existing.passwordHash);
      if (!matchesPassword) {
        return NextResponse.json(
          { error: "An account with this email already exists. Sign in or reset your password." },
          { status: 409 },
        );
      }

      if (existing.user.emailVerifiedAt) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please sign in." },
          { status: 409 },
        );
      }

      await issueEmailVerificationForUser(existing.user, getRequestOrigin(request));
      const existingSession = await createAuthSession(existing.user.id);
      const existingResponse = NextResponse.json(
        {
          user: existing.user,
          requiresEmailVerification: true,
          message: "Check your inbox. We sent a fresh verification link.",
        },
        { status: 200 },
      );
      setSessionCookie(existingResponse, existingSession.id, existingSession.expiresAt);
      return existingResponse;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUserAccount(email, passwordHash);
    await issueEmailVerificationForUser(user, getRequestOrigin(request));

    const session = await createAuthSession(user.id);
    const response = NextResponse.json(
      {
        user,
        requiresEmailVerification: true,
        message: "Account created. Please verify your email before using the assistant.",
      },
      { status: 201 },
    );
    setSessionCookie(response, session.id, session.expiresAt);
    return response;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signup failed." },
      { status: 500 },
    );
  }
}
