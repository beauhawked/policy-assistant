import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  getPolicyConversation,
  listPolicyConversationMessages,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    conversationId: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
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
      scope: "policy_conversation_detail",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 120,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many conversation requests. Please wait and try again.",
      );
    }

    const params = await context.params;
    const conversationId = params.conversationId?.trim() ?? "";

    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
    }

    const conversation = await getPolicyConversation(user.id, conversationId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const messages = await listPolicyConversationMessages(user.id, conversation.id, { limit: 400 });

    return NextResponse.json({ conversation, messages }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not load conversation.", "policy_conversation_detail");
  }
}
