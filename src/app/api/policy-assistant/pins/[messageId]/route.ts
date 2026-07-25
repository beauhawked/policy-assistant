import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import { deletePinnedAnswer } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    messageId: string;
  }>;
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before using pinned answers." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "pinned_answers_delete",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many unpin requests. Please wait and try again.",
      );
    }

    const params = await context.params;
    const messageId = Number(params.messageId);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return NextResponse.json({ error: "A valid messageId is required." }, { status: 400 });
    }

    const deleted = await deletePinnedAnswer(user.id, messageId);
    if (!deleted) {
      return NextResponse.json({ error: "Pinned answer not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not remove the pin.", "pinned_answers_delete");
  }
}
