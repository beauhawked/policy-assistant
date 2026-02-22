import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest } from "@/lib/policy-assistant/auth";
import {
  getPolicyConversation,
  listPolicyConversationMessages,
} from "@/lib/policy-assistant/db";

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load conversation.",
      },
      { status: 500 },
    );
  }
}
