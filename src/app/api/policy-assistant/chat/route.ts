import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  appendPolicyConversationMessage,
  createPolicyConversation,
  getHandbookDocumentsByIds,
  getPolicyConversation,
  getPolicyDataset,
  listPolicyConversationMessages,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import { generatePolicyGuidance } from "@/lib/policy-assistant/openai";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";
import {
  retrievePostgresCandidateComparison,
  retrieveRelevantHandbookGuidance,
  retrieveRelevantPolicies,
} from "@/lib/policy-assistant/retrieval";
import type {
  HandbookRetrievalResult,
  PolicyAnswerEvidenceSnapshot,
  PolicyDataset,
  RetrievalResult,
} from "@/lib/policy-assistant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PolicyAssistantChatPayload {
  datasetId?: string;
  scenario?: string;
  conversationId?: string;
}

type ScenarioFocus = "policy" | "handbook" | "mixed";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
    }
    if (!isUserEmailVerified(user)) {
      return NextResponse.json(
        { error: "Please verify your email before using the assistant." },
        { status: 403 },
      );
    }

    const rateLimit = await checkRateLimit({
      scope: "policy_chat",
      identifier: buildRateLimitIdentifier(request, { userId: user.id, email: user.email }),
      maxRequests: 30,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return rateLimitExceededResponse(
        rateLimit.retryAfterSeconds,
        "Rate limit reached. Please wait a moment before sending another request.",
      );
    }

    const payload = (await request.json().catch(() => ({}))) as PolicyAssistantChatPayload;
    const datasetId = payload.datasetId?.trim() ?? "";
    const scenario = payload.scenario?.trim() ?? "";
    const conversationId = payload.conversationId?.trim() ?? "";

    if (!datasetId) {
      return NextResponse.json({ error: "datasetId is required." }, { status: 400 });
    }

    if (!scenario) {
      return NextResponse.json({ error: "Please describe the scenario to evaluate." }, { status: 400 });
    }

    const dataset = await getPolicyDataset(user.id, datasetId);
    if (!dataset) {
      return NextResponse.json({ error: "The selected dataset was not found." }, { status: 404 });
    }

    let activeConversation = null;
    let historyForModel: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (conversationId) {
      activeConversation = await getPolicyConversation(user.id, conversationId);
      if (!activeConversation) {
        return NextResponse.json({ error: "The selected conversation was not found." }, { status: 404 });
      }

      if (activeConversation.datasetId !== dataset.id) {
        return NextResponse.json(
          { error: "The selected conversation does not belong to this dataset." },
          { status: 400 },
        );
      }

      const previousMessages = await listPolicyConversationMessages(user.id, activeConversation.id, {
        limit: 40,
      });
      historyForModel = previousMessages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
    }

    const scenarioFocus = detectScenarioFocus(scenario);
    const detailedIntent = detectDetailedIntent(scenario);
    const policyLimit = scenarioFocus === "handbook" ? 0 : detailedIntent.multiIssueScenario ? 8 : 4;
    const handbookLimit = scenarioFocus === "policy" ? (detailedIntent.multiIssueScenario ? 4 : 2) : detailedIntent.multiIssueScenario ? 8 : 4;

    const [retrieval, handbookRetrieval, postgresComparison] = await Promise.all([
      policyLimit > 0
        ? retrieveRelevantPolicies(user.id, dataset.id, scenario, { limit: policyLimit })
        : Promise.resolve({ terms: [] as string[], policies: [] as RetrievalResult[] }),
      retrieveRelevantHandbookGuidance(user.id, scenario, { limit: handbookLimit }),
      retrievePostgresCandidateComparison(user.id, dataset.id, scenario, {
        policyLimit: 8,
        handbookLimit: 8,
      }),
    ]);

    const refinedPolicyMatches = refinePolicyMatchesForScenario(
      retrieval.policies,
      scenario,
      scenarioFocus,
      detailedIntent,
    );
    const refinedHandbookMatches = refineHandbookMatchesForScenario(
      handbookRetrieval.guidance,
      scenario,
      scenarioFocus,
      detailedIntent,
    );
    const requestedHandbookTypes = detectExplicitRequestedHandbookTypes(scenario);
    const selectedPolicyIds = new Set(refinedPolicyMatches.map((policy) => policy.id));
    const selectedHandbookIds = new Set(refinedHandbookMatches.map((chunk) => chunk.id));

    if (refinedPolicyMatches.length === 0 && refinedHandbookMatches.length === 0) {
      return NextResponse.json(
        {
          error:
            "No relevant guidance was found in your uploaded policies or handbook documents for this question.",
        },
        { status: 400 },
      );
    }

    const rawAnswer = await generatePolicyGuidance({
      districtName: dataset.districtName,
      scenario,
      focus: scenarioFocus,
      responseStyle: detailedIntent.multiIssueScenario ? "action_guidance" : undefined,
      policies: refinedPolicyMatches,
      handbookGuidance: refinedHandbookMatches,
      conversationHistory: historyForModel,
    });
    const answer = appendMissingHandbookCoverageBlocks(
      alignHandbookTypesToRetrievedMatches(rawAnswer, refinedHandbookMatches),
      requestedHandbookTypes,
      refinedHandbookMatches,
    );
    const answerEvidence = await buildAnswerEvidenceSnapshot(
      user.id,
      dataset,
      refinedPolicyMatches,
      refinedHandbookMatches,
    );

    if (!activeConversation) {
      activeConversation = await createPolicyConversation(
        user.id,
        dataset.id,
        createConversationTitle(scenario),
      );
    }

    await appendPolicyConversationMessage(activeConversation.id, "user", scenario);
    await appendPolicyConversationMessage(activeConversation.id, "assistant", answer, answerEvidence);

    const refreshedConversation = await getPolicyConversation(user.id, activeConversation.id);

    return NextResponse.json(
      {
        answer,
        answerEvidence,
        conversation: refreshedConversation ?? activeConversation,
        retrieval: {
          policyCount: refinedPolicyMatches.length,
          handbookCount: refinedHandbookMatches.length,
          matchedTerms: Array.from(new Set([...retrieval.terms, ...handbookRetrieval.terms])),
          policyMatches: refinedPolicyMatches.map((policy) => ({
            id: policy.id,
            policySection: policy.policySection,
            policyCode: policy.policyCode,
            policyTitle: policy.policyTitle,
            relevanceScore: policy.relevanceScore,
            excerpt: buildExcerpt(policy.policyWording, 240),
          })),
          handbookMatches: refinedHandbookMatches.map((chunk) => ({
            id: chunk.id,
            handbookType: chunk.handbookType,
            sectionTitle: chunk.sectionTitle,
            relevanceScore: chunk.relevanceScore,
            excerpt: buildExcerpt(chunk.content, 240),
          })),
          postgresComparison: {
            query: postgresComparison.query,
            policyCandidateCount: postgresComparison.policies.length,
            handbookCandidateCount: postgresComparison.handbookGuidance.length,
            policyCandidates: postgresComparison.policies.map((policy) => ({
              id: policy.id,
              policySection: policy.policySection,
              policyCode: policy.policyCode,
              policyTitle: policy.policyTitle,
              fullTextRank: roundDebugScore(policy.fullTextRank),
              trigramScore: roundDebugScore(policy.trigramScore),
              combinedRank: roundDebugScore(policy.combinedRank),
              selectedByCurrentRetrieval: selectedPolicyIds.has(policy.id),
              excerpt: buildExcerpt(policy.policyWording, 180),
            })),
            handbookCandidates: postgresComparison.handbookGuidance.map((chunk) => ({
              id: chunk.id,
              handbookType: chunk.handbookType,
              sectionTitle: chunk.sectionTitle,
              fullTextRank: roundDebugScore(chunk.fullTextRank),
              trigramScore: roundDebugScore(chunk.trigramScore),
              combinedRank: roundDebugScore(chunk.combinedRank),
              selectedByCurrentRetrieval: selectedHandbookIds.has(chunk.id),
              excerpt: buildExcerpt(chunk.content, 180),
            })),
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return serverErrorResponse(error, "Policy assistant request failed.", "policy_chat");
  }
}

function createConversationTitle(scenario: string): string {
  const normalized = scenario.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled conversation";
  }

  if (normalized.length <= 88) {
    return normalized;
  }

  return `${normalized.slice(0, 85)}...`;
}

async function buildAnswerEvidenceSnapshot(
  userId: string,
  dataset: PolicyDataset,
  policyMatches: RetrievalResult[],
  handbookMatches: HandbookRetrievalResult[],
): Promise<PolicyAnswerEvidenceSnapshot> {
  const handbookDocumentIds = Array.from(
    new Set(handbookMatches.map((chunk) => chunk.documentId).filter(Boolean)),
  );
  const handbookDocuments = await getHandbookDocumentsByIds(userId, handbookDocumentIds);
  const handbookDocumentsById = new Map(handbookDocuments.map((document) => [document.id, document]));
  const excerptsByDocumentId = new Map<
    string,
    Array<{ id: number; sectionTitle: string; sourceIndex: number }>
  >();

  for (const chunk of handbookMatches) {
    if (!handbookDocumentsById.has(chunk.documentId)) {
      continue;
    }

    const excerpts = excerptsByDocumentId.get(chunk.documentId) ?? [];
    if (!excerpts.some((excerpt) => excerpt.id === chunk.id)) {
      excerpts.push({
        id: chunk.id,
        sectionTitle: chunk.sectionTitle,
        sourceIndex: chunk.sourceIndex,
      });
    }
    excerptsByDocumentId.set(chunk.documentId, excerpts);
  }

  return {
    capturedAt: new Date().toISOString(),
    policyDataset: {
      id: dataset.id,
      title: dataset.title,
      districtName: dataset.districtName,
      filename: dataset.filename,
      uploadedAt: dataset.uploadedAt,
      policyCount: dataset.policyCount,
      sourceType: dataset.sourceType,
      sourceUrl: dataset.sourceUrl,
      sourcePlatform: dataset.sourcePlatform,
    },
    policyMatches: policyMatches.map((policy) => ({
      id: policy.id,
      policySection: policy.policySection,
      policyCode: policy.policyCode,
      policyTitle: policy.policyTitle,
      revisedDate: policy.revisedDate,
    })),
    handbookVersions: handbookDocumentIds
      .map((documentId) => {
        const document = handbookDocumentsById.get(documentId);
        if (!document) {
          return null;
        }

        return {
          id: document.id,
          title: document.title,
          handbookType: document.handbookType,
          filename: document.filename,
          uploadedAt: document.uploadedAt,
          chunkCount: document.chunkCount,
          matchedExcerpts: excerptsByDocumentId.get(document.id) ?? [],
        };
      })
      .filter((version): version is NonNullable<typeof version> => Boolean(version)),
  };
}

function detectScenarioFocus(scenario: string): ScenarioFocus {
  const normalized = scenario.toLowerCase();
  const asksHandbook = /\bhandbook|handbooks|student\s+handbook\b/.test(normalized);
  const asksPolicy = /\bpolicy|policies|board\s+policy|board\s+policies\b/.test(normalized);

  if (asksHandbook && !asksPolicy) {
    return "handbook";
  }

  if (asksPolicy && !asksHandbook) {
    return "policy";
  }

  return "mixed";
}

function detectExplicitRequestedHandbookTypes(
  scenario: string,
): Array<"student" | "staff"> {
  const normalized = scenario.toLowerCase();
  const requested: Array<"student" | "staff"> = [];

  if (/\bstudent\s+handbook\b/.test(normalized)) {
    requested.push("student");
  }

  if (/\bstaff\s+handbook\b|\bemployee\s+handbook\b|\bpersonnel\s+handbook\b/.test(normalized)) {
    requested.push("staff");
  }

  return requested;
}

function appendMissingHandbookCoverageBlocks(
  answer: string,
  requestedHandbookTypes: Array<"student" | "staff">,
  handbookMatches: HandbookRetrievalResult[],
): string {
  if (requestedHandbookTypes.length === 0) {
    return answer;
  }

  const matchedTypes = new Set(handbookMatches.map((chunk) => chunk.handbookType));
  const missingTypes = requestedHandbookTypes.filter((type) => !matchedTypes.has(type));
  if (missingTypes.length === 0) {
    return answer;
  }

  let updated = answer.trim();
  if (!/(?:^|\n)\s*Relevant Handbook Guidance\s*:?/i.test(updated)) {
    updated = `${updated}\n\nRelevant Handbook Guidance`;
  }

  for (const handbookType of missingTypes) {
    const title = handbookType === "staff" ? "Staff" : "Student";
    const noMatchLine = `No matching ${handbookType} handbook guidance found for this question.`;

    if (new RegExp(noMatchLine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(updated)) {
      continue;
    }

    const block = [
      `Handbook Section: No Matching ${title} Handbook Guidance`,
      `Handbook Type: ${title}`,
      `Handbook Guidance: ${noMatchLine}`,
    ].join("\n");

    updated = insertBlockBeforeTrailingSections(updated, block);
  }

  return stripRedundantHandbookNoMatchNarration(updated).trim();
}

function alignHandbookTypesToRetrievedMatches(
  answer: string,
  handbookMatches: HandbookRetrievalResult[],
): string {
  if (handbookMatches.length === 0) {
    return answer;
  }

  const expectedTypeBySection = new Map<string, "Staff" | "Student">();
  for (const match of handbookMatches) {
    const normalizedTitle = normalizeHandbookSectionTitleForAlignment(match.sectionTitle);
    if (!normalizedTitle) {
      continue;
    }

    expectedTypeBySection.set(
      normalizedTitle,
      match.handbookType === "staff" ? "Staff" : "Student",
    );
  }

  const lines = answer.split("\n");
  let currentSectionLineIndex: number | null = null;
  let currentTypeLineIndex: number | null = null;
  let currentSectionTitle = "";

  const flushCurrentBlock = (endIndex: number): void => {
    if (currentSectionLineIndex === null) {
      return;
    }

    const expectedType = expectedTypeBySection.get(
      normalizeHandbookSectionTitleForAlignment(currentSectionTitle),
    );

    if (expectedType) {
      if (currentTypeLineIndex !== null && currentTypeLineIndex < endIndex) {
        lines[currentTypeLineIndex] = `Handbook Type: ${expectedType}`;
      } else {
        lines.splice(currentSectionLineIndex + 1, 0, `Handbook Type: ${expectedType}`);
      }
    }

    currentSectionLineIndex = null;
    currentTypeLineIndex = null;
    currentSectionTitle = "";
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^Handbook Section\s*:/i.test(line)) {
      flushCurrentBlock(index);
      currentSectionLineIndex = index;
      currentTypeLineIndex = null;
      currentSectionTitle = line.replace(/^Handbook Section\s*:/i, "").trim();
      continue;
    }

    if (currentSectionLineIndex !== null && /^Handbook Type\s*:/i.test(line)) {
      currentTypeLineIndex = index;
      continue;
    }

    if (
      currentSectionLineIndex !== null &&
      /^(?:Policy Section\s*:|Action Steps\s*:|Legal, Ethical, and Academic Implications\s*:|Disclaimer\b|Relevant Policies\b|Relevant Handbook Guidance\b)/i.test(
        line,
      )
    ) {
      flushCurrentBlock(index);
    }
  }

  flushCurrentBlock(lines.length);
  return lines.join("\n");
}

function insertBlockBeforeTrailingSections(answer: string, block: string): string {
  const match = answer.match(
    /\n(?=(?:Action Steps:|Legal, Ethical, and Academic Implications:|Disclaimer\b))/i,
  );

  if (!match || match.index === undefined) {
    return `${answer}\n\n${block}`;
  }

  return `${answer.slice(0, match.index).trimEnd()}\n\n${block}\n\n${answer
    .slice(match.index + 1)
    .trimStart()}`;
}

function stripRedundantHandbookNoMatchNarration(answer: string): string {
  return answer
    .replace(
      /^\s*No specific (?:student|staff) handbook guidance was provided[^\n.]*\.?\s*$/gim,
      "",
    )
    .replace(
      /^\s*No relevant (?:student|staff) handbook guidance was found[^\n.]*\.?\s*$/gim,
      "",
    )
    .replace(/\n{3,}/g, "\n\n");
}

function buildExcerpt(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function roundDebugScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 1000) / 1000;
}

function normalizeHandbookSectionTitleForAlignment(sectionTitle: string): string {
  return sectionTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function refinePolicyMatchesForScenario(
  policies: RetrievalResult[],
  scenario: string,
  focus: ScenarioFocus,
  precomputedIntent?: ReturnType<typeof detectDetailedIntent>,
): RetrievalResult[] {
  if (policies.length === 0) {
    return [];
  }

  const intent = precomputedIntent ?? detectDetailedIntent(scenario);
  if (intent.multiIssueScenario) {
    return prioritizeComplexPolicyMatches(policies, intent, focus);
  }

  let filtered = policies;

  if (intent.dress) {
    filtered = filtered.filter((policy) => {
      const combined = `${policy.policySection} ${policy.policyTitle} ${policy.policyWording}`.toLowerCase();
      if (!hasDressSignal(combined)) {
        return false;
      }

      const isStaffPolicy =
        /\b(1000|3000|4000)\b/.test(policy.policySection.toLowerCase()) ||
        /\bstaff\b|\badministration\b|\bprofessional staff\b|\bsupport staff\b/.test(
          policy.policyTitle.toLowerCase(),
        );

      if (!intent.staffRequested && isStaffPolicy) {
        return false;
      }

      return true;
    });
  }

  if (intent.attendance) {
    filtered = filtered.filter((policy) =>
      /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/i.test(
        `${policy.policyTitle} ${policy.policyWording}`,
      ),
    );
  }

  if (intent.leave) {
    filtered = filtered.filter((policy) =>
      /\bleave\b|\bvacation\b|\bsick\b|\bpersonal leave\b|\bmedical\b|\bbereavement\b|\bsubpoena\b|\bjury duty\b/i.test(
        `${policy.policyTitle} ${policy.policyWording}`,
      ),
    );
  }

  if (intent.records) {
    filtered = filtered.filter((policy) =>
      /\brecord\b|\brecords\b|\bretention\b|\bferpa\b|\bprivacy\b|\bconfidential\b/i.test(
        `${policy.policyTitle} ${policy.policyWording}`,
      ),
    );
  }

  if (focus === "handbook" && filtered.length > 2) {
    return filtered.slice(0, 2);
  }

  return filtered;
}

function refineHandbookMatchesForScenario(
  guidance: HandbookRetrievalResult[],
  scenario: string,
  focus: ScenarioFocus,
  precomputedIntent?: ReturnType<typeof detectDetailedIntent>,
): HandbookRetrievalResult[] {
  if (guidance.length === 0) {
    return [];
  }

  const intent = precomputedIntent ?? detectDetailedIntent(scenario);
  if (intent.multiIssueScenario) {
    return prioritizeComplexHandbookMatches(guidance, intent, focus, scenario);
  }

  let filtered = guidance;

  if (intent.dress) {
    filtered = filtered.filter((chunk) =>
      hasDressSignal(`${chunk.sectionTitle} ${chunk.content}`.toLowerCase()),
    );
  }

  if (intent.attendance) {
    filtered = filtered.filter((chunk) =>
      /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/i.test(
        `${chunk.sectionTitle} ${chunk.content}`,
      ),
    );
  }

  if (intent.leave) {
    filtered = filtered.filter((chunk) =>
      /\bleave\b|\bvacation\b|\bsick\b|\bpersonal leave\b|\bmedical\b|\bbereavement\b|\bsubpoena\b|\bjury duty\b/i.test(
        `${chunk.sectionTitle} ${chunk.content}`,
      ),
    );
  }

  if (intent.records) {
    filtered = filtered.filter((chunk) =>
      /\brecord\b|\brecords\b|\bretention\b|\bferpa\b|\bprivacy\b|\bconfidential\b/i.test(
        `${chunk.sectionTitle} ${chunk.content}`,
      ),
    );
  }

  const focused = filtered
    .map((chunk) => focusHandbookChunkContent(chunk, intent))
    .filter((chunk) => isSubstantiveHandbookSection(chunk, intent));
  const deduped = dedupeRefinedHandbookMatches(focused);
  const prioritized = prioritizeHandbookMatchesForIntent(deduped, intent);

  if (focus === "policy" && prioritized.length > 2) {
    return prioritized.slice(0, 2);
  }

  return prioritized;
}

function detectDetailedIntent(scenario: string): {
  dress: boolean;
  attendance: boolean;
  leave: boolean;
  records: boolean;
  bullying: boolean;
  specialEducation: boolean;
  devicePrivacy: boolean;
  safety: boolean;
  studentRequested: boolean;
  disciplineRequested: boolean;
  multiIssueScenario: boolean;
  staffRequested: boolean;
} {
  const normalized = scenario.toLowerCase();
  const bullying = /\bbully|bullying|harass|harassment|taunt|ridicule|mocking|intimidat\w*\b/i.test(normalized);
  const specialEducation =
    /\biep|bip|manifestation|disability|special education|504|behavior intervention plan\b/i.test(
      normalized,
    );
  const devicePrivacy =
    /\belectronic device|phone|phones|video|videos|recorded|recording|social media|privacy|confidential\b/i.test(
      normalized,
    );
  const safety = /\bsafe school|safe environment|school safety|student supervision|welfare\b/i.test(normalized);
  const studentRequested = /\bstudent|students|pupil|pupils\b/i.test(normalized);
  const disciplineRequested =
    /\bdiscipline|suspend|suspension|expel|expulsion|consequence|consequences|fight|fighting|altercation\b/i.test(
      normalized,
    );
  const focusedIntentCount = [
    bullying,
    specialEducation,
    devicePrivacy,
    safety,
    disciplineRequested,
  ].filter(Boolean).length;

  return {
    dress: /\bdress\b|\bdress code\b|\buniform\b|\battire\b|\bgroom(?:ing)?\b|\bappearance\b/i.test(
      normalized,
    ),
    attendance: /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/i.test(
      normalized,
    ),
    leave:
      /\bleave\b|\bvacation\b|\bsick\b|\bpersonal leave\b|\bmedical\b|\bbereavement\b|\bsubpoena\b|\bjury duty\b/i.test(
        normalized,
      ),
    records: /\brecord\b|\brecords\b|\bretention\b|\bferpa\b|\bprivacy\b|\bconfidential\b/i.test(
      normalized,
    ),
    bullying,
    specialEducation,
    devicePrivacy,
    safety,
    studentRequested,
    disciplineRequested,
    multiIssueScenario: focusedIntentCount >= 2,
    staffRequested: /\bstaff\b|\badministration\b|\badministrator\b|\bprofessional staff\b|\bsupport staff\b/i.test(
      normalized,
    ),
  };
}

function hasDressSignal(content: string): boolean {
  if (
    /\bdress(?:\s+code)?\b/.test(content) ||
    /\bdress and (?:appearance|grooming)\b/.test(content) ||
    /\bgroom(?:ing)?\b/.test(content) ||
    /\battire\b/.test(content) ||
    /\bapparel\b/.test(content) ||
    /\bclothing\b/.test(content)
  ) {
    return true;
  }

  if (!/\buniforms?\b/.test(content)) {
    return false;
  }

  return hasUniformDressContext(content);
}

function hasUniformDressContext(content: string): boolean {
  return (
    /\bstudent(?:s)?\b[^.]{0,40}\buniforms?\b/.test(content) ||
    /\buniforms?\b[^.]{0,40}\b(dress|attire|appearance|code|guideline|guidelines|violation|violations|policy|policies)\b/.test(
      content,
    ) ||
    /\bschool\s+uniforms?\b/.test(content)
  );
}

function focusHandbookChunkContent(
  chunk: HandbookRetrievalResult,
  intent: {
    dress: boolean;
    attendance: boolean;
    leave: boolean;
    records: boolean;
    staffRequested: boolean;
  },
): HandbookRetrievalResult {
  if (intent.dress) {
    const dressFocusedContent = extractDressFocusedSegment(chunk.content);
    if (dressFocusedContent) {
      return {
        ...chunk,
        sectionTitle: "DRESS CODE",
        content: dressFocusedContent,
      };
    }

    const focusedContent = sliceAroundBestMatch(chunk.content, [
      /\bdress\s+code\b/i,
      /\bdress and (?:appearance|grooming)\b/i,
      /\bdress\b/i,
    ]);
    if (focusedContent) {
      return {
        ...chunk,
        sectionTitle: /\bdress\s+code\b/i.test(focusedContent) ? "DRESS CODE" : chunk.sectionTitle,
        content: focusedContent,
      };
    }
  }

  return chunk;
}

function dedupeRefinedHandbookMatches(
  guidance: HandbookRetrievalResult[],
): HandbookRetrievalResult[] {
  const seenSectionTitles = new Set<string>();
  const deduped: HandbookRetrievalResult[] = [];

  for (const chunk of guidance) {
    const sectionKey = normalizeHandbookSectionTitle(chunk.sectionTitle);
    if (!sectionKey) {
      continue;
    }

    if (seenSectionTitles.has(sectionKey)) {
      continue;
    }

    seenSectionTitles.add(sectionKey);
    deduped.push(chunk);
  }

  return deduped;
}

function prioritizeHandbookMatchesForIntent(
  guidance: HandbookRetrievalResult[],
  intent: {
    dress: boolean;
    attendance: boolean;
    leave: boolean;
    records: boolean;
    bullying: boolean;
    specialEducation: boolean;
    devicePrivacy: boolean;
    safety: boolean;
    studentRequested: boolean;
    disciplineRequested: boolean;
    multiIssueScenario: boolean;
    staffRequested: boolean;
  },
): HandbookRetrievalResult[] {
  if (!intent.leave) {
    return guidance;
  }

  const titleAligned = guidance.filter((chunk) => hasLeaveTitleSignal(chunk.sectionTitle));
  if (titleAligned.length >= 2) {
    return titleAligned;
  }

  return guidance;
}

function isSubstantiveHandbookSection(
  chunk: HandbookRetrievalResult,
  intent: {
    dress: boolean;
    attendance: boolean;
    leave: boolean;
    records: boolean;
    bullying: boolean;
    specialEducation: boolean;
    devicePrivacy: boolean;
    safety: boolean;
    studentRequested: boolean;
    disciplineRequested: boolean;
    multiIssueScenario: boolean;
    staffRequested: boolean;
  },
): boolean {
  const normalizedTitle = normalizeHandbookSectionTitle(chunk.sectionTitle);
  const normalizedContent = chunk.content.toLowerCase().replace(/\s+/g, " ").trim();

  if (!normalizedTitle) {
    return false;
  }

  if (
    /\btable of contents\b/.test(normalizedContent) ||
    /\bcontents\b/.test(normalizedTitle) ||
    /\bemployee handbook\b/.test(normalizedTitle) ||
    /\bhandbook\b/.test(normalizedTitle) ||
    /\btable of contents\b/.test(normalizedTitle)
  ) {
    return false;
  }

  const combined = `${normalizedTitle} ${normalizedContent}`;
  if (intent.leave) {
    return /\bleave\b|\bvacation\b|\bsick\b|\bmedical\b|\bbereavement\b|\bsubpoena\b|\bjury duty\b|\bfmla\b/i.test(
      combined,
    );
  }

  if (intent.attendance) {
    return /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/i.test(
      combined,
    );
  }

  if (intent.records) {
    return /\brecord\b|\brecords\b|\bretention\b|\bferpa\b|\bprivacy\b|\bconfidential\b/i.test(
      combined,
    );
  }

  return true;
}

function prioritizeComplexPolicyMatches(
  policies: RetrievalResult[],
  intent: {
    dress: boolean;
    attendance: boolean;
    leave: boolean;
    records: boolean;
    bullying: boolean;
    specialEducation: boolean;
    devicePrivacy: boolean;
    safety: boolean;
    studentRequested: boolean;
    disciplineRequested: boolean;
    multiIssueScenario: boolean;
    staffRequested: boolean;
  },
  focus: ScenarioFocus,
): RetrievalResult[] {
  const byCategory = [
    (policy: RetrievalResult) =>
      /\b(suspension and expulsion of students|student discipline)\b/i.test(policy.policyTitle),
    (policy: RetrievalResult) =>
      /\b(students with disabilities|child find and special education|recording of iep team meetings|section 504)\b/i.test(
        policy.policyTitle,
      ),
    (policy: RetrievalResult) =>
      /\bbullying\b/i.test(policy.policyTitle),
    (policy: RetrievalResult) =>
      /\b(anti harassment|anti-harassment)\b/i.test(policy.policyTitle),
    (policy: RetrievalResult) =>
      /\b(personal communication devices|technology resources|student privacy)\b/i.test(
        policy.policyTitle,
      ),
    ...(intent.staffRequested
      ? [
          (policy: RetrievalResult) =>
            /\b(staff discipline|anti harassment|anti-harassment|staff student relations)\b/i.test(
              policy.policyTitle,
            ),
        ]
      : []),
  ];

  const selected: RetrievalResult[] = [];
  const seen = new Set<number>();

  for (const predicate of byCategory) {
    const match = policies.find((policy) => !seen.has(policy.id) && predicate(policy));
    if (!match) {
      continue;
    }
    seen.add(match.id);
    selected.push(match);
  }

  const result = selected.length > 0 ? selected : policies;
  if (focus === "handbook" && result.length > 2) {
    return result.slice(0, 2);
  }
  return result;
}

function prioritizeComplexHandbookMatches(
  guidance: HandbookRetrievalResult[],
  intent: {
    dress: boolean;
    attendance: boolean;
    leave: boolean;
    records: boolean;
    bullying: boolean;
    specialEducation: boolean;
    devicePrivacy: boolean;
    safety: boolean;
    studentRequested: boolean;
    disciplineRequested: boolean;
    multiIssueScenario: boolean;
    staffRequested: boolean;
  },
  focus: ScenarioFocus,
  scenario: string,
): HandbookRetrievalResult[] {
  const studentGuidance = guidance.filter((chunk) => chunk.handbookType === "student");
  const buckets = [
    {
      titlePattern: /\b(student misconduct|discipline|code of conduct|removal from class|rules and discipline)\b/i,
      contentPatterns: [
        /\bfight(?:ing)?\b/i,
        /\bphysical aggression\b/i,
        /\bstudent discipline\b/i,
        /\bmisconduct\b/i,
        /\bsubstantial disobedience\b/i,
        /\bsuspension\b/i,
        /\bexpulsion\b/i,
        /\bconsequences? for misbehavior\b/i,
      ],
    },
    {
      titlePattern: /\b(bully|bullying|harassment|rules and discipline)\b/i,
      contentPatterns: [
        /\bbully(?:ing)?\b/i,
        /\bharassment\b/i,
        /\btaunt(?:ing)?\b/i,
        /\bridicule\b/i,
        /\bintimidat(?:e|ion|ing)\b/i,
      ],
    },
    {
      titlePattern: /\b(suspension|expulsion)\b/i,
      contentPatterns: [
        /\bsuspension\b/i,
        /\bexpulsion\b/i,
        /\bdue process\b/i,
        /\bnotice\b/i,
        /\bhearing\b/i,
      ],
    },
    {
      titlePattern: /\b(cell phones?|electronic (?:communication )?devices?|privacy)\b/i,
      contentPatterns: [
        /\bcell phones?\b/i,
        /\belectronic communication devices?\b/i,
        /\brecord(?:ed|ing)?\b/i,
        /\bvideos?\b/i,
        /\bsocial media\b/i,
        /\bconfiscat(?:e|ed|ion)\b/i,
      ],
    },
  ];

  const selected: HandbookRetrievalResult[] = [];
  const seen = new Set<string>();

  for (const bucket of buckets) {
    const match = studentGuidance
      .filter((chunk) => {
        const key = normalizeHandbookSectionTitle(chunk.sectionTitle);
        return (
          !seen.has(key) &&
          bucket.titlePattern.test(chunk.sectionTitle) &&
          !hasHandbookContextMismatch(chunk, scenario) &&
          scoreHandbookBodyAlignment(chunk.content, bucket.contentPatterns) > 0
        );
      })
      .sort((left, right) => {
        const alignmentDifference =
          scoreHandbookBodyAlignment(right.content, bucket.contentPatterns) -
          scoreHandbookBodyAlignment(left.content, bucket.contentPatterns);
        if (alignmentDifference !== 0) {
          return alignmentDifference;
        }
        return right.relevanceScore - left.relevanceScore;
      })[0];
    if (!match) {
      continue;
    }
    const key = normalizeHandbookSectionTitle(match.sectionTitle);
    seen.add(key);
    selected.push(match);
  }

  const deduped = dedupeRefinedHandbookMatches(selected.length > 0 ? selected : guidance);
  if (focus === "policy" && deduped.length > 2) {
    return deduped.slice(0, 2);
  }
  return deduped;
}

function hasHandbookContextMismatch(
  chunk: HandbookRetrievalResult,
  scenario: string,
): boolean {
  const normalizedScenario = scenario.toLowerCase();
  const opening = chunk.content.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 900);
  const busSpecific =
    /\bschool bus\b|\bbus stop\b|\bbus driver\b|\bwhile riding (?:a|the) bus\b/.test(opening);

  return busSpecific && !/\bbus\b|\btransportation\b/.test(normalizedScenario);
}

function scoreHandbookBodyAlignment(content: string, patterns: RegExp[]): number {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }

  const opening = normalized.slice(0, 900);
  return patterns.reduce((score, pattern) => {
    if (pattern.test(opening)) {
      return score + 3;
    }
    if (pattern.test(normalized)) {
      return score + 1;
    }
    return score;
  }, 0);
}

function normalizeHandbookSectionTitle(sectionTitle: string): string {
  return sectionTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:chapter|section|article|part|appendix|page|pages|continued)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasLeaveTitleSignal(sectionTitle: string): boolean {
  return /\bleave\b|\bvacation\b|\bsick\b|\bmedical\b|\bbereavement\b|\bsubpoena\b|\bjury duty\b|\bfmla\b/i.test(
    sectionTitle,
  );
}

function extractDressFocusedSegment(content: string): string | null {
  const normalized = content.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const headingMatch = /\bDRESS\s+CODE\b/i.exec(normalized);
  const dressMatch = /\bdress\b/i.exec(normalized);
  const anchor = headingMatch?.index ?? dressMatch?.index ?? -1;
  if (anchor < 0) {
    return null;
  }

  const start = anchor;
  let end = Math.min(normalized.length, start + 900);
  const afterAnchor = normalized.slice(start + 1);
  const nextHeading = afterAnchor.match(
    /\n{2,}[A-Z0-9][A-Z0-9/& -]{2,}(?=\s+[A-Z][a-z])|(?:^|[.!?]\s+)(?:[A-Z0-9][A-Z0-9/& -]{2,})(?=\s+[A-Z][a-z])/,
  );
  if (nextHeading?.index !== undefined) {
    const nextStart = start + 1 + nextHeading.index;
    if (nextStart > start + 140) {
      end = Math.min(end, nextStart);
    }
  }

  return normalized.slice(start, end).trim();
}

function sliceAroundBestMatch(content: string, patterns: RegExp[]): string | null {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return null;
  }

  let matchIndex = -1;
  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (match?.index !== undefined) {
      matchIndex = match.index;
      break;
    }
  }

  if (matchIndex < 0) {
    return null;
  }

  const paragraphBoundary = normalized.lastIndexOf("\n\n", matchIndex);
  const sentenceBoundary = normalized.lastIndexOf(". ", matchIndex);
  const start = Math.max(
    0,
    paragraphBoundary >= 0 ? paragraphBoundary + 2 : sentenceBoundary >= 0 ? sentenceBoundary + 2 : matchIndex - 80,
  );

  let end = Math.min(normalized.length, start + 900);
  const remainder = normalized.slice(matchIndex + 1);
  const nextHeadingMatch = remainder.match(
    /\n{2,}[A-Z0-9][A-Z0-9/& -]{2,}(?=\s+[A-Z][a-z])/,
  );
  if (nextHeadingMatch?.index !== undefined) {
    const candidateEnd = matchIndex + 1 + nextHeadingMatch.index;
    if (candidateEnd > start + 120) {
      end = Math.min(end, candidateEnd);
    }
  }

  return normalized.slice(start, end).trim();
}
