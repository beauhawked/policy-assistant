import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  deletePolicyDataset,
  setPolicyDatasetArchived,
  updatePolicyDatasetTitle,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";
import type { PolicyDataset } from "@/lib/policy-assistant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    datasetId: string;
  }>;
}

interface PatchDatasetPayload {
  title?: unknown;
  archived?: unknown;
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await getVerifiedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const rateLimit = await checkDatasetManagementRateLimit(request, user.id, user.email);
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many dataset update attempts. Please wait and try again.",
      );
    }

    const params = await context.params;
    const datasetId = params.datasetId?.trim() ?? "";
    if (!datasetId) {
      return NextResponse.json({ error: "datasetId is required." }, { status: 400 });
    }

    const payload = (await request.json().catch(() => ({}))) as PatchDatasetPayload;
    let dataset: PolicyDataset | null = null;
    let hasUpdate = false;

    if (typeof payload.title === "string") {
      const title = payload.title.trim();
      if (!title) {
        return NextResponse.json({ error: "Dataset title is required." }, { status: 400 });
      }

      dataset = await updatePolicyDatasetTitle(user.id, datasetId, title);
      hasUpdate = true;
    }

    if (typeof payload.archived === "boolean") {
      dataset = await setPolicyDatasetArchived(user.id, datasetId, payload.archived);
      hasUpdate = true;
    }

    if (!hasUpdate) {
      return NextResponse.json(
        { error: "Provide a dataset title or archive state to update." },
        { status: 400 },
      );
    }

    if (!dataset) {
      return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
    }

    return NextResponse.json({ dataset }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not update dataset.", "policy_dataset_update");
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await getVerifiedUser(request);
    if (user instanceof NextResponse) {
      return user;
    }

    const rateLimit = await checkDatasetManagementRateLimit(request, user.id, user.email);
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many dataset delete attempts. Please wait and try again.",
      );
    }

    const params = await context.params;
    const datasetId = params.datasetId?.trim() ?? "";
    if (!datasetId) {
      return NextResponse.json({ error: "datasetId is required." }, { status: 400 });
    }

    const deleted = await deletePolicyDataset(user.id, datasetId);
    if (!deleted) {
      return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not delete dataset.", "policy_dataset_delete");
  }
}

async function getVerifiedUser(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  if (!isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: "Please verify your email before managing datasets." },
      { status: 403 },
    );
  }

  return user;
}

function checkDatasetManagementRateLimit(request: NextRequest, userId: string, email: string) {
  return checkRateLimit({
    scope: "policy_dataset_management",
    identifier: buildRateLimitIdentifier(request, { userId, email }),
    maxRequests: 80,
    windowSeconds: 60,
  });
}
