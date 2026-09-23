import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/policy-assistant/admin";
import {
  createOneTimeToken,
  getRequestIpAddress,
  getRequestOrigin,
  hashOneTimeToken,
} from "@/lib/policy-assistant/auth";
import {
  createPasswordResetTokenRecord,
  findUserById,
  recordAuditEvent,
} from "@/lib/policy-assistant/db";
import {
  buildUrlWithPath,
  rateLimitExceededResponse,
  serverErrorResponse,
} from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_LINK_TTL_MINUTES = 60;

interface RouteContext {
  params: Promise<{
    userId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const guard = await requireAdminUser(request);
    if (!guard.ok) {
      return guard.response;
    }
    const admin = guard.user;

    const rateLimit = await checkRateLimit({
      scope: "admin_reset_link",
      identifier: buildRateLimitIdentifier(request, { userId: admin.id, email: admin.email }),
      maxRequests: 15,
      windowSeconds: 10 * 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(rateLimit.retryAfterSeconds);
    }

    const { userId } = await context.params;
    const target = await findUserById(userId);
    if (!target) {
      return NextResponse.json({ error: "That user no longer exists." }, { status: 404 });
    }

    if (target.deactivatedAt) {
      return NextResponse.json(
        { error: "Reactivate this account before issuing a password reset link." },
        { status: 400 },
      );
    }

    if (target.accountRole === "admin" && target.id !== admin.id) {
      return NextResponse.json(
        { error: "Reset links for other admin accounts cannot be issued from the panel." },
        { status: 400 },
      );
    }

    const token = createOneTimeToken();
    const tokenHash = hashOneTimeToken(token);
    const { expiresAt } = await createPasswordResetTokenRecord(
      target.id,
      tokenHash,
      RESET_LINK_TTL_MINUTES,
    );

    const resetLink = buildUrlWithPath(getRequestOrigin(request), "/policy-assistant", {
      resetToken: token,
    });

    await recordAuditEvent({
      actorUserId: admin.id,
      actorEmail: admin.email,
      action: "admin.user.reset-link",
      targetUserId: target.id,
      targetEmail: target.email,
      details: { expiresAt },
      ipAddress: getRequestIpAddress(request),
    });

    return NextResponse.json({ resetLink, expiresAt }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Could not create a password reset link.",
      "admin_reset_link",
    );
  }
}
