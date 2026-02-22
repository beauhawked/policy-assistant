import { NextRequest, NextResponse } from "next/server";

import {
  getRequestOrigin,
  normalizeEmail,
  setSessionCookie,
  verifyPassword,
} from "@/lib/policy-assistant/auth";
import { issueEmailVerificationForUser } from "@/lib/policy-assistant/auth-flow";
import { createAuthSession, findUserByEmail } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginPayload {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as LoginPayload;
    const email = normalizeEmail(payload.email);
    const password = payload.password?.trim() ?? "";

    const rateLimit = await checkRateLimit({
      scope: "auth_login",
      identifier: buildRateLimitIdentifier(request, { email }),
      maxRequests: 12,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many login attempts. Please wait and try again.",
      );
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (!existing) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const isValidPassword = await verifyPassword(password, existing.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (!existing.user.emailVerifiedAt) {
      await issueEmailVerificationForUser(existing.user, getRequestOrigin(request));
      return NextResponse.json(
        {
          error: "Your email is not verified yet. We sent a new verification link.",
          requiresEmailVerification: true,
        },
        { status: 403 },
      );
    }

    const session = await createAuthSession(existing.user.id);
    const response = NextResponse.json({ user: existing.user }, { status: 200 });
    setSessionCookie(response, session.id, session.expiresAt);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 500 },
    );
  }
}
