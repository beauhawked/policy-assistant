import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  getHandbookSectionDetail,
  getPolicyDetail,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import type { HandbookType } from "@/lib/policy-assistant/types";
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
        { error: "Please verify your email before accessing policy references." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "policy_reference_detail",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 180,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many detail requests. Please wait and try again.",
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const kind = searchParams.get("kind")?.trim().toLowerCase();

    if (kind === "policy") {
      const datasetId = searchParams.get("datasetId")?.trim() ?? "";
      const policyCode = searchParams.get("policyCode")?.trim() ?? "";
      const policyTitle = searchParams.get("policyTitle")?.trim() ?? "";

      if (!datasetId || (!policyCode && !policyTitle)) {
        return NextResponse.json(
          { error: "datasetId and a policy identifier are required." },
          { status: 400 },
        );
      }

      const policy = await getPolicyDetail(user.id, datasetId, policyCode, policyTitle);
      if (!policy) {
        return NextResponse.json({ error: "Policy details not found." }, { status: 404 });
      }

      return NextResponse.json(
        {
          detail: {
            kind: "policy",
            metadata: [
              buildMetadataItem("Policy Section", policy.policySection),
              buildMetadataItem("Policy Code", policy.policyCode),
              buildMetadataItem("Policy Title", policy.policyTitle),
              buildMetadataItem("Adopted", policy.adoptedDate),
              buildMetadataItem("Revised", policy.revisedDate),
              buildMetadataItem("Status", policy.policyStatus),
            ].filter(Boolean),
            bodyLabel: "Full Policy Wording",
            bodyText: policy.policyWording,
          },
        },
        { status: 200 },
      );
    }

    if (kind === "handbook") {
      const handbookType = parseHandbookType(searchParams.get("handbookType"));
      const sectionTitle = searchParams.get("sectionTitle")?.trim() ?? "";
      if (!handbookType || !sectionTitle) {
        return NextResponse.json(
          { error: "handbookType and sectionTitle are required." },
          { status: 400 },
        );
      }

      const handbook = await getHandbookSectionDetail(user.id, handbookType, sectionTitle);
      if (!handbook) {
        return NextResponse.json({ error: "Handbook details not found." }, { status: 404 });
      }

      return NextResponse.json(
        {
          detail: {
            kind: "handbook",
            metadata: [
              buildMetadataItem(
                "Handbook Type",
                handbook.handbookType === "staff" ? "Staff Handbook" : "Student Handbook",
              ),
              buildMetadataItem("Section", handbook.sectionTitle),
              buildMetadataItem("Handbook Version", handbook.title),
              buildMetadataItem("Source Document", handbook.filename),
              buildMetadataItem(
                "Supporting Excerpts",
                handbook.chunkCount > 1 ? `${handbook.chunkCount} related excerpts` : "1 excerpt",
              ),
            ].filter(Boolean),
            bodyLabel: "Full Handbook Guidance",
            bodyText: handbook.content,
          },
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ error: "Unsupported detail kind." }, { status: 400 });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Could not load reference details.",
      "policy_reference_detail",
    );
  }
}

function parseHandbookType(value: string | null): HandbookType | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "student" || normalized === "staff") {
    return normalized;
  }

  return null;
}

function buildMetadataItem(label: string, value: string | null | undefined): {
  label: string;
  value: string;
} | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return { label, value: normalized };
}
