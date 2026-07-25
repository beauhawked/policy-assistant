import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import { createPinnedAnswer, listPinnedAnswers } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreatePinPayload {
  messageId?: unknown;
  title?: unknown;
  body?: unknown;
  meta?: unknown;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
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
      scope: "pinned_answers_list",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 60,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many pinned answer requests. Please wait and try again.",
      );
    }

    const url = new URL(request.url);
    const datasetId = url.searchParams.get("datasetId")?.trim() || undefined;

    const pins = await listPinnedAnswers(user.id, { datasetId });
    return NextResponse.json({ pins }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not load pinned answers.", "pinned_answers_list");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
      scope: "pinned_answers_create",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many pin requests. Please wait and try again.",
      );
    }

    const payload = (await request.json().catch(() => ({}))) as CreatePinPayload;
    const messageId = Number(payload.messageId);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return NextResponse.json({ error: "A valid messageId is required." }, { status: 400 });
    }

    const pin = await createPinnedAnswer(user.id, {
      messageId,
      title: typeof payload.title === "string" ? payload.title : "",
      body: typeof payload.body === "string" ? payload.body : "",
      meta: typeof payload.meta === "string" ? payload.meta : "",
    });

    if (!pin) {
      return NextResponse.json(
        { error: "That answer could not be pinned. It may not belong to your account." },
        { status: 404 },
      );
    }

    return NextResponse.json({ pin }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(error, "Could not pin the answer.", "pinned_answers_create");
  }
}
