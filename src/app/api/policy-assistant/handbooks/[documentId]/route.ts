import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  deleteHandbookDocument,
  setHandbookDocumentArchived,
  updateHandbookDocumentTitle,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";
import type { HandbookDocument } from "@/lib/policy-assistant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    documentId: string;
  }>;
}

interface PatchHandbookPayload {
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

    const rateLimit = await checkHandbookManagementRateLimit(request, user.id, user.email);
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many handbook update attempts. Please wait and try again.",
      );
    }

    const params = await context.params;
    const documentId = params.documentId?.trim() ?? "";
    if (!documentId) {
      return NextResponse.json({ error: "documentId is required." }, { status: 400 });
    }

    const payload = (await request.json().catch(() => ({}))) as PatchHandbookPayload;
    let document: HandbookDocument | null = null;
    let hasUpdate = false;

    if (typeof payload.title === "string") {
      const title = payload.title.trim();
      if (!title) {
        return NextResponse.json({ error: "Handbook title is required." }, { status: 400 });
      }

      document = await updateHandbookDocumentTitle(user.id, documentId, title);
      hasUpdate = true;
    }

    if (typeof payload.archived === "boolean") {
      document = await setHandbookDocumentArchived(user.id, documentId, payload.archived);
      hasUpdate = true;
    }

    if (!hasUpdate) {
      return NextResponse.json(
        { error: "Provide a handbook title or archive state to update." },
        { status: 400 },
      );
    }

    if (!document) {
      return NextResponse.json({ error: "Handbook document not found." }, { status: 404 });
    }

    return NextResponse.json({ document }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not update handbook.", "handbook_document_update");
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

    const rateLimit = await checkHandbookManagementRateLimit(request, user.id, user.email);
    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many handbook delete attempts. Please wait and try again.",
      );
    }

    const params = await context.params;
    const documentId = params.documentId?.trim() ?? "";
    if (!documentId) {
      return NextResponse.json({ error: "documentId is required." }, { status: 400 });
    }

    const deleted = await deleteHandbookDocument(user.id, documentId);
    if (!deleted) {
      return NextResponse.json({ error: "Handbook document not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (error) {
    return serverErrorResponse(error, "Could not delete handbook.", "handbook_document_delete");
  }
}

async function getVerifiedUser(request: NextRequest) {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  if (!isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: "Please verify your email before managing handbooks." },
      { status: 403 },
    );
  }

  return user;
}

function checkHandbookManagementRateLimit(request: NextRequest, userId: string, email: string) {
  return checkRateLimit({
    scope: "handbook_document_management",
    identifier: buildRateLimitIdentifier(request, { userId, email }),
    maxRequests: 80,
    windowSeconds: 60,
  });
}
