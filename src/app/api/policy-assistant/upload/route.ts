import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import { parsePolicyCsvBuffer } from "@/lib/policy-assistant/csv";
import { createPolicyDataset, listPolicyDatasets } from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse } from "@/lib/policy-assistant/http";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthenticatedUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!isUserEmailVerified(user)) {
    return NextResponse.json(
      { error: "Please verify your email before accessing datasets." },
      { status: 403 },
    );
  }

  const datasets = await listPolicyDatasets(user.id, 30);
  return NextResponse.json({ datasets }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before uploading policies." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "policy_upload",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 12,
      windowSeconds: 10 * 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Too many upload attempts. Please wait and try again.",
      );
    }

    const form = await request.formData();
    const fileField = form.get("file");
    const districtName = String(form.get("districtName") ?? "").trim();

    if (!isMultipartFile(fileField)) {
      return NextResponse.json({ error: "Please upload a CSV file." }, { status: 400 });
    }

    const filename = fileField.name || "uploaded-policies.csv";
    if (!filename.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Only .csv files are supported." }, { status: 400 });
    }

    const arrayBuffer = await fileField.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }

    if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "The uploaded CSV is too large. Limit is 12MB." },
        { status: 400 },
      );
    }

    const parsed = parsePolicyCsvBuffer(Buffer.from(arrayBuffer));
    const dataset = await createPolicyDataset({
      userId: user.id,
      districtName,
      filename,
      headers: parsed.headers,
      rows: parsed.rows,
    });

    return NextResponse.json(
      {
        dataset,
        ingest: {
          headers: parsed.headers,
          policyCount: parsed.rows.length,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed.",
      },
      { status: 500 },
    );
  }
}

function isMultipartFile(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value === "string") {
    return false;
  }

  return typeof value.arrayBuffer === "function" && typeof value.name === "string";
}
