import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  cleanupExpiredPolicyImportPreviews,
  createPolicyDataset,
  createPolicyImportPreview,
  deletePolicyImportPreview,
  getPolicyImportPreview,
} from "@/lib/policy-assistant/db";
import { indexDatasetEmbeddingsSafe } from "@/lib/policy-assistant/embedding-indexer";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";
import type { NormalizedPolicyRow } from "@/lib/policy-assistant/types";
import {
  formatPolicyPlatform,
  normalizeRequestedPolicyPlatform,
  scrapePoliciesForImport,
  type RequestedPolicyPlatform,
  type ResolvedPolicyPlatform,
} from "@/lib/policy-scraper-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ImportPoliciesPayload {
  action?: "preview" | "commit";
  previewId?: string;
  title?: string;
  url?: string;
  includeAllBooks?: boolean;
  platform?: RequestedPolicyPlatform;
}

interface PolicyImportQuality {
  missingTitleCount: number;
  missingWordingCount: number;
  missingCodeCount: number;
  duplicateCodeCount: number;
}

interface PolicyImportPreviewRow {
  policySection: string;
  policyCode: string;
  policyTitle: string;
  policyWordingPreview: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before importing policies." },
        { status: 403 },
      );
    }

    const payload = (await request.json().catch(() => ({}))) as ImportPoliciesPayload;
    const action = payload.action === "commit" ? "commit" : "preview";

    const rateLimit = await checkRateLimit({
      scope: action === "commit" ? "policy_scrape_commit" : "policy_scrape_preview",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: action === "commit" ? 18 : 6,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        action === "commit"
          ? "Too many import attempts. Please wait and try again."
          : "Too many preview attempts. Please wait and try again.",
      );
    }

    if (action === "commit") {
      return commitPreview(user.id, user.districtName?.trim() || "Unnamed District", payload);
    }

    return createPreview(user.id, user.districtName?.trim() || "Unnamed District", payload);
  } catch (error) {
    return serverErrorResponse(error, "Policy import failed.", "policy_scrape_import");
  }
}

async function createPreview(
  userId: string,
  districtName: string,
  payload: ImportPoliciesPayload,
): Promise<NextResponse> {
  const sourceUrl = payload.url?.trim() ?? "";

  if (!sourceUrl) {
    return NextResponse.json(
      { error: "Please provide a district policy URL." },
      { status: 400 },
    );
  }

  const scraped = await scrapePoliciesForImport({
    sourceUrl,
    platform: normalizeRequestedPolicyPlatform(payload.platform),
    includeAllBooks: Boolean(payload.includeAllBooks),
  });

  if (scraped.rows.length === 0) {
    return NextResponse.json(
      { error: "The scrape completed, but no importable policy rows were found." },
      { status: 400 },
    );
  }

  if (Math.random() < 0.2) {
    await cleanupExpiredPolicyImportPreviews();
  }

  const preview = await createPolicyImportPreview({
    userId,
    districtName,
    filename: scraped.filename,
    sourceUrl: scraped.baseUrl,
    platform: scraped.platform,
    sourceCount: scraped.sourceCount,
    sourceLabel: scraped.sourceLabel,
    failedCount: scraped.failedCount,
    headers: scraped.headers,
    rows: scraped.rows,
  });

  return NextResponse.json(
    {
      preview: buildPreviewResponse({
        id: preview.id,
        expiresAt: preview.expiresAt,
        platform: scraped.platform,
        sourceUrl: scraped.baseUrl,
        sourceCount: scraped.sourceCount,
        sourceLabel: scraped.sourceLabel,
        failedCount: scraped.failedCount,
        policyCount: scraped.policyCount,
        filename: scraped.filename,
        rows: scraped.rows,
      }),
    },
    { status: 200 },
  );
}

async function commitPreview(
  userId: string,
  districtName: string,
  payload: ImportPoliciesPayload,
): Promise<NextResponse> {
  const previewId = payload.previewId?.trim() ?? "";
  if (!previewId) {
    return NextResponse.json({ error: "previewId is required." }, { status: 400 });
  }

  const preview = await getPolicyImportPreview(userId, previewId);
  if (!preview) {
    return NextResponse.json(
      { error: "This import preview expired or could not be found. Create a fresh preview." },
      { status: 404 },
    );
  }

  if (preview.rows.length === 0) {
    return NextResponse.json(
      { error: "This import preview does not contain any importable policy rows." },
      { status: 400 },
    );
  }

  const dataset = await createPolicyDataset({
    userId,
    districtName,
    title: payload.title,
    filename: preview.filename,
    sourceType: "scraper_import",
    sourceUrl: preview.sourceUrl,
    sourcePlatform: preview.platform,
    headers: preview.headers,
    rows: preview.rows,
  });

  await indexDatasetEmbeddingsSafe(dataset.id);

  await deletePolicyImportPreview(userId, preview.id);

  return NextResponse.json(
    {
      dataset,
      import: {
        platform: preview.platform,
        platformLabel: formatPolicyPlatform(preview.platform as ResolvedPolicyPlatform),
        sourceUrl: preview.sourceUrl,
        sourceCount: preview.sourceCount,
        sourceLabel: preview.sourceLabel,
        failedCount: preview.failedCount,
        policyCount: dataset.policyCount,
        filename: preview.filename,
      },
    },
    { status: 201 },
  );
}

function buildPreviewResponse(input: {
  id: string;
  expiresAt: string;
  platform: ResolvedPolicyPlatform;
  sourceUrl: string;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
  policyCount: number;
  filename: string;
  rows: NormalizedPolicyRow[];
}): {
  id: string;
  expiresAt: string;
  platform: ResolvedPolicyPlatform;
  platformLabel: string;
  sourceUrl: string;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
  policyCount: number;
  filename: string;
  quality: PolicyImportQuality;
  sampleRows: PolicyImportPreviewRow[];
} {
  return {
    id: input.id,
    expiresAt: input.expiresAt,
    platform: input.platform,
    platformLabel: formatPolicyPlatform(input.platform),
    sourceUrl: input.sourceUrl,
    sourceCount: input.sourceCount,
    sourceLabel: input.sourceLabel,
    failedCount: input.failedCount,
    policyCount: input.policyCount,
    filename: input.filename,
    quality: buildQualitySummary(input.rows),
    sampleRows: input.rows.slice(0, 6).map((row) => ({
      policySection: row.policySection,
      policyCode: row.policyCode,
      policyTitle: row.policyTitle,
      policyWordingPreview: buildExcerpt(row.policyWording, 180),
    })),
  };
}

function buildQualitySummary(rows: NormalizedPolicyRow[]): PolicyImportQuality {
  const codeCounts = new Map<string, number>();
  let missingTitleCount = 0;
  let missingWordingCount = 0;
  let missingCodeCount = 0;

  for (const row of rows) {
    if (!row.policyTitle.trim()) {
      missingTitleCount += 1;
    }
    if (!row.policyWording.trim()) {
      missingWordingCount += 1;
    }
    if (!row.policyCode.trim()) {
      missingCodeCount += 1;
      continue;
    }

    const normalizedCode = row.policyCode.trim().toLowerCase();
    codeCounts.set(normalizedCode, (codeCounts.get(normalizedCode) ?? 0) + 1);
  }

  const duplicateCodeCount = Array.from(codeCounts.values()).filter((count) => count > 1).length;

  return {
    missingTitleCount,
    missingWordingCount,
    missingCodeCount,
    duplicateCodeCount,
  };
}

function buildExcerpt(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}
