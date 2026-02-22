import { NextRequest, NextResponse } from "next/server";

import { getPolicyDataset } from "@/lib/policy-assistant/db";
import { generatePolicyGuidance } from "@/lib/policy-assistant/openai";
import { retrieveRelevantPolicies } from "@/lib/policy-assistant/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PolicyAssistantChatPayload {
  datasetId?: string;
  scenario?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await request.json().catch(() => ({}))) as PolicyAssistantChatPayload;
    const datasetId = payload.datasetId?.trim() ?? "";
    const scenario = payload.scenario?.trim() ?? "";

    if (!datasetId) {
      return NextResponse.json({ error: "datasetId is required." }, { status: 400 });
    }

    if (!scenario) {
      return NextResponse.json({ error: "Please describe the scenario to evaluate." }, { status: 400 });
    }

    const dataset = getPolicyDataset(datasetId);
    if (!dataset) {
      return NextResponse.json({ error: "The selected dataset was not found." }, { status: 404 });
    }

    const retrieval = retrieveRelevantPolicies(dataset.id, scenario, { limit: 6 });
    if (retrieval.policies.length === 0) {
      return NextResponse.json(
        { error: "No policies were found for this dataset. Upload a CSV with policy rows first." },
        { status: 400 },
      );
    }

    const answer = await generatePolicyGuidance({
      districtName: dataset.districtName,
      scenario,
      policies: retrieval.policies,
    });

    return NextResponse.json(
      {
        answer,
        retrieval: {
          policyCount: retrieval.policies.length,
          matchedTerms: retrieval.terms,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Policy assistant request failed.",
      },
      { status: 500 },
    );
  }
}
