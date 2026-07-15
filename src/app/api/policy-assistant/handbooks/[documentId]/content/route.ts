import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import { getHandbookDocumentsByIds, listHandbookDocumentChunks } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    documentId: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before viewing handbooks." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "handbook_library_view",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many handbook library requests. Please wait and try again.",
      );
    }

    const params = await context.params;
    const documentId = params.documentId?.trim() ?? "";
    if (!documentId) {
      return NextResponse.json({ error: "documentId is required." }, { status: 400 });
    }

    const [document] = await getHandbookDocumentsByIds(user.id, [documentId]);
    if (!document) {
      return NextResponse.json(
        { error: "The requested handbook was not found." },
        { status: 404 },
      );
    }

    const chunks = await listHandbookDocumentChunks(user.id, documentId);

    return NextResponse.json({ document, chunks }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Could not load the handbook content.",
      "handbook_library_view",
    );
  }
}
