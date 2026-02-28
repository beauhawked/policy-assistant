import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  type StateLawCorpusChunkInput,
  upsertStateLawCorpus,
} from "@/lib/policy-assistant/db";
import {
  buildStateLawEmbeddingText,
  embedTexts,
  embeddingsEnabled,
} from "@/lib/policy-assistant/embeddings";
import {
  getApprovedStateLawDomains,
  getConfiguredStateCode,
} from "@/lib/policy-assistant/live-law";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StateLawIngestRecord {
  stateCode?: string;
  sourceName?: string;
  citationTitle?: string;
  sectionId?: string;
  sourceUrl?: string;
  content?: string;
  sourceUpdatedAt?: string;
}

interface StateLawIngestPayload {
  stateCode?: string;
  replaceStateCode?: boolean;
  records?: StateLawIngestRecord[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before ingesting state law content." },
        { status: 403 },
      );
    }

    const ingestKey = process.env.POLICY_ASSISTANT_STATE_LAW_INGEST_KEY?.trim();
    if (!ingestKey) {
      return NextResponse.json(
        { error: "State-law ingestion is not configured." },
        { status: 503 },
      );
    }

    const providedKey = request.headers.get("x-policy-assistant-admin-key")?.trim() || "";
    if (!providedKey || providedKey !== ingestKey) {
      return NextResponse.json({ error: "Invalid ingestion key." }, { status: 403 });
    }

    const rateLimit = await checkRateLimit({
      scope: "state_law_ingest",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 20,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many state-law ingestion requests. Please wait and try again.",
      );
    }

    const payload = (await request.json().catch(() => ({}))) as StateLawIngestPayload;
    const defaultStateCode = (payload.stateCode?.trim() || getConfiguredStateCode()).toUpperCase();
    const approvedDomains = getApprovedStateLawDomains();

    const rawRecords = Array.isArray(payload.records) ? payload.records : [];
    if (rawRecords.length === 0) {
      return NextResponse.json({ error: "records[] is required." }, { status: 400 });
    }

    const chunks: StateLawCorpusChunkInput[] = [];
    let rejected = 0;

    for (const record of rawRecords) {
      const stateCode = (record.stateCode?.trim() || defaultStateCode).toUpperCase();
      const sourceName = (record.sourceName?.trim() || "Official State Source").slice(0, 180);
      const citationTitle = (record.citationTitle?.trim() || "").slice(0, 300);
      const sectionId = (record.sectionId?.trim() || "").slice(0, 120);
      const sourceUrl = record.sourceUrl?.trim() || "";
      const content = record.content?.trim() || "";
      const sourceUpdatedAt = record.sourceUpdatedAt?.trim() || null;

      if (!stateCode || !citationTitle || !sectionId || !sourceUrl || !content) {
        rejected += 1;
        continue;
      }

      if (approvedDomains.length > 0 && !isApprovedSourceUrl(sourceUrl, approvedDomains)) {
        rejected += 1;
        continue;
      }

      chunks.push({
        stateCode,
        sourceName,
        citationTitle,
        sectionId,
        sourceUrl,
        content,
        sourceUpdatedAt,
      });
    }

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No valid records were provided for ingestion." },
        { status: 400 },
      );
    }

    let embeddings: Array<number[] | null> = chunks.map(() => null);
    let embeddingsWarning = "";
    if (embeddingsEnabled()) {
      try {
        embeddings = await embedTexts(
          chunks.map((chunk) =>
            buildStateLawEmbeddingText(
              chunk.stateCode,
              chunk.sourceName,
              chunk.citationTitle,
              chunk.sectionId,
              chunk.content,
            ),
          ),
        );
      } catch {
        embeddingsWarning =
          "Embeddings could not be generated for this ingestion batch. Lexical retrieval is still available.";
      }
    }

    const replaceStateCode = payload.replaceStateCode ? defaultStateCode : undefined;
    const result = await upsertStateLawCorpus(chunks, {
      replaceStateCode,
      embeddings,
    });

    return NextResponse.json(
      {
        ingest: {
          stateCode: defaultStateCode,
          upserted: result.upserted,
          rejected,
          embeddingsEnabled: embeddingsEnabled(),
          embeddedRows: embeddings.filter((embedding) => Array.isArray(embedding)).length,
          warning: embeddingsWarning || undefined,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return serverErrorResponse(error, "State-law ingestion failed.", "state_law_ingest");
  }
}

function isApprovedSourceUrl(urlValue: string, domains: string[]): boolean {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return domains.some((domainPattern) => {
      if (domainPattern.startsWith("*.")) {
        const baseDomain = domainPattern.slice(2);
        return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
      }
      return hostname === domainPattern;
    });
  } catch {
    return false;
  }
}
