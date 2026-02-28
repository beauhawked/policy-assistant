import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import { createHandbookDocument, listHandbookDocuments } from "@/lib/policy-assistant/db";
import {
  buildHandbookEmbeddingText,
  embedTexts,
  embeddingsEnabled,
} from "@/lib/policy-assistant/embeddings";
import { extractHandbookText, chunkHandbookText } from "@/lib/policy-assistant/handbook";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".txt", ".md", ".markdown"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: "Please verify your email before accessing handbook documents." },
      { status: 403 },
    );
  }

  const documents = await listHandbookDocuments(user.id, 30);
  return NextResponse.json({ documents }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before uploading handbooks." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "handbook_upload",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 10,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many handbook upload attempts. Please wait and try again.",
      );
    }

    const form = await request.formData();
    const fileField = form.get("file");
    if (!isMultipartFile(fileField)) {
      return NextResponse.json({ error: "Please upload a handbook file." }, { status: 400 });
    }

    const filename = fileField.name || "student-handbook.pdf";
    const extension = getExtension(filename);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        { error: "Supported handbook formats are PDF, TXT, and MD." },
        { status: 400 },
      );
    }

    const arrayBuffer = await fileField.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "The uploaded handbook file is empty." }, { status: 400 });
    }

    if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "The uploaded handbook file is too large. Limit is 15MB." },
        { status: 400 },
      );
    }

    const text = await extractHandbookText(filename, Buffer.from(arrayBuffer));
    const chunks = chunkHandbookText(text);
    if (chunks.length === 0) {
      return NextResponse.json(
        {
          error:
            "No handbook content could be extracted. Verify this file contains selectable text.",
        },
        { status: 400 },
      );
    }

    let chunkEmbeddings: Array<number[] | null> = chunks.map(() => null);
    let embeddingsWarning = "";

    if (embeddingsEnabled()) {
      try {
        chunkEmbeddings = await embedTexts(
          chunks.map((chunk) => buildHandbookEmbeddingText(chunk.sectionTitle, chunk.content)),
        );
      } catch {
        embeddingsWarning =
          "Embeddings could not be generated for this handbook. Lexical retrieval is still available.";
      }
    }

    const accountDistrictName = user.districtName?.trim() || "Unnamed District";
    const document = await createHandbookDocument({
      userId: user.id,
      districtName: accountDistrictName,
      filename,
      chunks,
      chunkEmbeddings,
    });

    return NextResponse.json(
      {
        document,
        ingest: {
          chunkCount: chunks.length,
          embeddingsEnabled: embeddingsEnabled(),
          embeddedChunks: chunkEmbeddings.filter((embedding) => Array.isArray(embedding)).length,
          warning: embeddingsWarning || undefined,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return serverErrorResponse(error, "Handbook upload failed.", "handbook_upload");
  }
}

function isMultipartFile(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value === "string") {
    return false;
  }

  return typeof value.arrayBuffer === "function" && typeof value.name === "string";
}

function getExtension(filename: string): string {
  const index = filename.lastIndexOf(".");
  if (index < 0) {
    return "";
  }
  return filename.slice(index).toLowerCase();
}
