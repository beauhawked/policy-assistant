import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import { listPolicyConversations } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before accessing conversation history." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "policy_conversations_list",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 60,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many conversation history requests. Please wait and try again.",
      );
    }

    const url = new URL(request.url);
    const datasetId = url.searchParams.get("datasetId")?.trim() ?? "";
    const limitValue = Number.parseInt(url.searchParams.get("limit") ?? "30", 10);
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 30;

    const conversations = await listPolicyConversations(user.id, {
      datasetId: datasetId || undefined,
      limit,
    });

    return NextResponse.json({ conversations }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not load conversations.", "policy_conversations_list");
  }
}
