import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import { getPolicyDataset, listDatasetPolicies } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    datasetId: string;
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
        { error: "Please verify your email before viewing policies." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "policy_library_view",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many policy library requests. Please wait and try again.",
      );
    }

    const params = await context.params;
    const datasetId = params.datasetId?.trim() ?? "";
    if (!datasetId) {
      return NextResponse.json({ error: "datasetId is required." }, { status: 400 });
    }

    const dataset = await getPolicyDataset(user.id, datasetId);
    if (!dataset) {
      return NextResponse.json({ error: "The requested dataset was not found." }, { status: 404 });
    }

    const policies = await listDatasetPolicies(user.id, datasetId);

    return NextResponse.json({ dataset, policies }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not load the policy library.", "policy_library_view");
  }
}
