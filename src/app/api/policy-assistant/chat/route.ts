import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUserFromRequest, isUserEmailVerified } from "@/lib/policy-assistant/auth";
import {
  appendPolicyConversationMessage,
  createPolicyConversation,
  getPolicyConversation,
  getPolicyDataset,
  listPolicyConversationMessages,
} from "@/lib/policy-assistant/db";
import { rateLimitExceededResponse, serverErrorResponse } from "@/lib/policy-assistant/http";
import {
  getConfiguredStateCode,
  liveStateLawEnabled,
  searchLiveStateLawSources,
} from "@/lib/policy-assistant/live-law";
import { generatePolicyGuidance } from "@/lib/policy-assistant/openai";
import { buildRateLimitIdentifier, checkRateLimit } from "@/lib/policy-assistant/rate-limit";
import {
  retrieveRelevantHandbookGuidance,
  retrieveRelevantPolicies,
  retrieveRelevantStateLawGuidance,
} from "@/lib/policy-assistant/retrieval";
import type {
  HandbookRetrievalResult,
  LiveStateLawSource,
  RetrievalResult,
  StateLawRetrievalResult,
} from "@/lib/policy-assistant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PolicyAssistantChatPayload {
  datasetId?: string;
  scenario?: string;
  conversationId?: string;
  useLiveStateLaw?: boolean;
}

type ScenarioFocus = "policy" | "handbook" | "mixed";

interface QueryScope {
  stateLawRequested: boolean;
  localGuidanceRequested: boolean;
  stateLawOnly: boolean;
}

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
    const useLiveStateLaw = payload.useLiveStateLaw !== false;

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
    const queryScope = detectQueryScope(scenario);
    const useDistrictSources = !queryScope.stateLawOnly;
    const policyLimit = useDistrictSources ? (scenarioFocus === "handbook" ? 2 : 4) : 0;
    const handbookLimit = useDistrictSources ? (scenarioFocus === "policy" ? 2 : 4) : 0;
    const stateLawLimit = scenarioFocus === "policy" ? 2 : 3;
    const stateCode = getConfiguredStateCode();
    const useStateLawCorpus = stateLawCorpusEnabled();
    const useLiveExternal = useLiveStateLaw && liveStateLawEnabled();

    const [retrieval, handbookRetrieval, stateLawRetrieval, liveStateLawSources] = await Promise.all([
      useDistrictSources
        ? retrieveRelevantPolicies(user.id, dataset.id, scenario, { limit: policyLimit })
        : Promise.resolve({ terms: [] as string[], policies: [] as RetrievalResult[] }),
      useDistrictSources
        ? retrieveRelevantHandbookGuidance(user.id, scenario, { limit: handbookLimit })
        : Promise.resolve({ terms: [] as string[], guidance: [] as HandbookRetrievalResult[] }),
      useStateLawCorpus
        ? retrieveRelevantStateLawGuidance(stateCode, scenario, { limit: stateLawLimit })
        : Promise.resolve({ terms: [] as string[], guidance: [] as StateLawRetrievalResult[] }),
      useLiveExternal
        ? searchLiveStateLawSources({ scenario, stateCode, maxSources: 3 })
        : Promise.resolve([] as LiveStateLawSource[]),
    ]);

    const refinedPolicyMatches = refinePolicyMatchesForScenario(
      retrieval.policies,
      scenario,
      scenarioFocus,
    );
    const refinedHandbookMatches = refineHandbookMatchesForScenario(
      handbookRetrieval.guidance,
      scenario,
      scenarioFocus,
    );
    const refinedStateLawMatches = refineStateLawMatchesForScenario(
      stateLawRetrieval.guidance,
      scenario,
    );

    if (
      refinedPolicyMatches.length === 0 &&
      refinedHandbookMatches.length === 0 &&
      refinedStateLawMatches.length === 0 &&
      liveStateLawSources.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No relevant guidance was found in your uploaded policies, student handbooks, or configured state-law sources for this question.",
        },
        { status: 400 },
      );
    }

    const answer = await generatePolicyGuidance({
      districtName: dataset.districtName,
      scenario,
      focus: scenarioFocus,
      policies: refinedPolicyMatches,
      handbookGuidance: refinedHandbookMatches,
      stateLawGuidance: refinedStateLawMatches,
      liveStateLawSources,
      stateLawOnly: queryScope.stateLawOnly,
      conversationHistory: historyForModel,
    });

    if (!activeConversation) {
      activeConversation = await createPolicyConversation(
        user.id,
        dataset.id,
        createConversationTitle(scenario),
      );
    }

    await appendPolicyConversationMessage(activeConversation.id, "user", scenario);
    await appendPolicyConversationMessage(activeConversation.id, "assistant", answer);

    const refreshedConversation = await getPolicyConversation(user.id, activeConversation.id);

    return NextResponse.json(
      {
        answer,
        conversation: refreshedConversation ?? activeConversation,
        retrieval: {
          policyCount: refinedPolicyMatches.length,
          handbookCount: refinedHandbookMatches.length,
          stateLawCount: refinedStateLawMatches.length,
          liveStateLawCount: liveStateLawSources.length,
          matchedTerms: Array.from(
            new Set([...retrieval.terms, ...handbookRetrieval.terms, ...stateLawRetrieval.terms]),
          ),
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
            sectionTitle: chunk.sectionTitle,
            relevanceScore: chunk.relevanceScore,
            excerpt: buildExcerpt(chunk.content, 240),
          })),
          stateLawMatches: refinedStateLawMatches.map((chunk) => ({
            id: chunk.id,
            stateCode: chunk.stateCode,
            sourceName: chunk.sourceName,
            citationTitle: chunk.citationTitle,
            sectionId: chunk.sectionId,
            sourceUrl: chunk.sourceUrl,
            relevanceScore: chunk.relevanceScore,
            excerpt: buildExcerpt(chunk.content, 240),
          })),
          liveStateLawSources,
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

function detectQueryScope(scenario: string): QueryScope {
  const normalized = scenario.toLowerCase();

  const stateLawRequested =
    /\b(state law|state laws|indiana law|indiana laws|indiana code|state statute|state statutes|statute|statutes|regulation|regulations|administrative code|title\s+\d+|article\s+\d+|chapter\s+\d+)\b/.test(
      normalized,
    ) || /\bic\s*\d{1,2}[-.]/.test(normalized);

  const localGuidanceRequested =
    /\b(our district|district policy|district policies|local policy|local policies|board policy|board policies|school policy|school policies|handbook|student handbook|code of conduct|our policy|our policies)\b/.test(
      normalized,
    );

  return {
    stateLawRequested,
    localGuidanceRequested,
    stateLawOnly: stateLawRequested && !localGuidanceRequested,
  };
}

function buildExcerpt(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function refinePolicyMatchesForScenario(
  policies: RetrievalResult[],
  scenario: string,
  focus: ScenarioFocus,
): RetrievalResult[] {
  if (policies.length === 0) {
    return [];
  }

  const intent = detectDetailedIntent(scenario);
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
    filtered = filtered.filter((policy) => isLikelyStudentAttendancePolicy(policy));
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
): HandbookRetrievalResult[] {
  if (guidance.length === 0) {
    return [];
  }

  const intent = detectDetailedIntent(scenario);
  let filtered = guidance;

  if (intent.dress) {
    filtered = filtered.filter((chunk) =>
      hasDressSignal(`${chunk.sectionTitle} ${chunk.content}`.toLowerCase()),
    );
  }

  if (intent.attendance) {
    const titleStrict = filtered.filter((chunk) =>
      /\battendance\b|\babsence\b|\btruancy\b|\btardy\b/i.test(chunk.sectionTitle),
    );
    if (titleStrict.length > 0) {
      filtered = titleStrict;
    } else {
      filtered = filtered.filter((chunk) =>
        /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/i.test(
          `${chunk.sectionTitle} ${chunk.content}`,
        ),
      );
    }
  }

  if (intent.records) {
    filtered = filtered.filter((chunk) =>
      /\brecord\b|\brecords\b|\bretention\b|\bferpa\b|\bprivacy\b|\bconfidential\b/i.test(
        `${chunk.sectionTitle} ${chunk.content}`,
      ),
    );
  }

  const focused = filtered.map((chunk) => focusHandbookChunkContent(chunk, intent));

  if (focus === "policy" && focused.length > 2) {
    return focused.slice(0, 2);
  }

  return focused;
}

function refineStateLawMatchesForScenario(
  guidance: StateLawRetrievalResult[],
  scenario: string,
): StateLawRetrievalResult[] {
  if (guidance.length === 0) {
    return [];
  }

  const intent = detectDetailedIntent(scenario);
  let filtered = guidance;

  if (intent.dress) {
    filtered = filtered.filter((chunk) =>
      hasDressSignal(`${chunk.citationTitle} ${chunk.content}`.toLowerCase()),
    );
  }

  if (intent.attendance) {
    filtered = filtered.filter((chunk) =>
      /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/i.test(
        `${chunk.citationTitle} ${chunk.content}`,
      ),
    );
  }

  if (intent.records) {
    filtered = filtered.filter((chunk) =>
      /\brecord\b|\brecords\b|\bretention\b|\bferpa\b|\bprivacy\b|\bconfidential\b/i.test(
        `${chunk.citationTitle} ${chunk.content}`,
      ),
    );
  }

  return filtered.slice(0, 3);
}

function detectDetailedIntent(scenario: string): {
  dress: boolean;
  attendance: boolean;
  records: boolean;
  staffRequested: boolean;
} {
  const normalized = scenario.toLowerCase();

  return {
    dress: /\bdress\b|\bdress code\b|\buniform\b|\battire\b|\bgroom(?:ing)?\b|\bappearance\b|\bapparel\b|\bclothing\b/i.test(
      normalized,
    ),
    attendance: /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/i.test(
      normalized,
    ),
    records: /\brecord\b|\brecords\b|\bretention\b|\bferpa\b|\bprivacy\b|\bconfidential\b/i.test(
      normalized,
    ),
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

function stateLawCorpusEnabled(): boolean {
  return process.env.POLICY_ASSISTANT_STATE_LAW_CORPUS_ENABLED?.trim() !== "0";
}

function isLikelyStudentAttendancePolicy(policy: RetrievalResult): boolean {
  const section = policy.policySection.toLowerCase();
  const title = policy.policyTitle.toLowerCase();
  const wording = policy.policyWording.toLowerCase();
  const combined = `${section} ${title} ${wording}`;

  const hasAttendanceSignal =
    /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/.test(combined);
  if (!hasAttendanceSignal) {
    return false;
  }

  const hasStudentContext =
    /\bstudent\b|\bstudents\b|\bpupil\b|\bpupils\b/.test(combined) || /\b5000\b/.test(section);
  const hasStudentAttendanceSemantics =
    /\bcompulsory\b|\btruancy\b|\bhabitual truant\b|\bunexcused\b|\battendance officer\b|\bschool attendance\b/.test(
      combined,
    );

  const isClearlyNonStudent =
    /\bboard member\b|\bpublic attendance at school events\b|\baudience\b|\bspectator\b/.test(
      combined,
    );

  if (isClearlyNonStudent) {
    return false;
  }

  return hasStudentContext || hasStudentAttendanceSemantics;
}

function focusHandbookChunkContent(
  chunk: HandbookRetrievalResult,
  intent: {
    dress: boolean;
    attendance: boolean;
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
