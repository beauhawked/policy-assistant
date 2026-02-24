import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  appendPolicyConversationMessage,
  createPolicyConversation,
  getPolicyConversation,
  getPolicyDataset,
  listPolicyConversationMessages,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { generatePolicyGuidance } from "@/lib/policy-assistant/openai";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";
import { retrieveRelevantPolicies } from "@/lib/policy-assistant/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PolicyAssistantChatPayload {
  datasetId?: string;
  scenario?: string;
  conversationId?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before using the assistant." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "policy_chat",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 30,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Rate limit reached. Please wait a moment before sending another request.",
      );
    }

    const payload = (await request.json().catch(() => ({}))) as PolicyAssistantChatPayload;
    const datasetId = payload.datasetId?.trim() ?? "";
    const scenario = payload.scenario?.trim() ?? "";
    const conversationId = payload.conversationId?.trim() ?? "";

    if (!datasetId) {
      return NextResponse.json({ error: "datasetId is required." }, { status: 400 });
    }

    if (!scenario) {
      return NextResponse.json({ error: "Please describe the scenario to evaluate." }, { status: 400 });
    }

    const dataset = await getPolicyDataset(user.id, datasetId);
    if (!dataset) {
      return NextResponse.json({ error: "The selected dataset was not found." }, { status: 404 });
    }

    let activeConversation = null;
    let historyForModel: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (conversationId) {
      activeConversation = await getPolicyConversation(user.id, conversationId);
      if (!activeConversation) {
        return NextResponse.json({ error: "The selected conversation was not found." }, { status: 404 });
      }

      if (activeConversation.datasetId !== dataset.id) {
        return NextResponse.json(
          { error: "The selected conversation does not belong to this dataset." },
          { status: 400 },
        );
      }

      const previousMessages = await listPolicyConversationMessages(user.id, activeConversation.id, {
        limit: 40,
      });
      historyForModel = previousMessages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
    }

    const retrieval = await retrieveRelevantPolicies(user.id, dataset.id, scenario, { limit: 6 });
    if (retrieval.policies.length === 0) {
      return NextResponse.json(
        { error: "No policies were found for this dataset. Upload a CSV with policy rows first." },
        { status: 400 },
      );
    }

    const answer = await generatePolicyGuidance({
      districtName: dataset.districtName,
      scenario,
      policies: retrieval.policies,
      conversationHistory: historyForModel,
    });

    if (!activeConversation) {
      activeConversation = await createPolicyConversation(
        user.id,
        dataset.id,
        createConversationTitle(scenario),
      );
    }

    await appendPolicyConversationMessage(activeConversation.id, "user", scenario);
    await appendPolicyConversationMessage(activeConversation.id, "assistant", answer);

    const refreshedConversation = await getPolicyConversation(user.id, activeConversation.id);

    return NextResponse.json(
      {
        answer,
        conversation: refreshedConversation ?? activeConversation,
        retrieval: {
          policyCount: retrieval.policies.length,
          matchedTerms: retrieval.terms,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return serverErrorResponse(error, "Policy assistant request failed.", "policy_chat");
  }
}

function createConversationTitle(scenario: string): string {
  const normalized = scenario.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled conversation";
  }

  if (normalized.length <= 88) {
    return normalized;
  }

  return `${normalized.slice(0, 85)}...`;
}
