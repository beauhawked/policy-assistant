import { searchDatasetPolicies } from "@/lib/policy-assistant/db";
import type { RetrievalResult, StoredPolicy } from "@/lib/policy-assistant/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "will",
  "with",
]);

export interface RetrievalBundle {
  terms: string[];
  policies: RetrievalResult[];
}

export function retrieveRelevantPolicies(
  userId: string,
  datasetId: string,
  scenario: string,
  options?: { limit?: number },
): Promise<RetrievalBundle> {
  const terms = extractSearchTerms(scenario);
  return buildRetrievalBundle(userId, datasetId, scenario, terms, options);
}

async function buildRetrievalBundle(
  userId: string,
  datasetId: string,
  scenario: string,
  terms: string[],
  options?: { limit?: number },
): Promise<RetrievalBundle> {
  const candidates = await searchDatasetPolicies(userId, datasetId, terms, { limit: 350 });
  const scored = scorePolicies(candidates, scenario, terms);
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 12) : 6;

  return {
    terms,
    policies: scored.slice(0, limit),
  };
}

function scorePolicies(policies: StoredPolicy[], scenario: string, terms: string[]): RetrievalResult[] {
  const scenarioLower = scenario.toLowerCase();
  const policyCodeMatches = extractLikelyPolicyCodes(scenarioLower);

  const scored = policies.map((policy) => {
    const section = policy.policySection.toLowerCase();
    const code = policy.policyCode.toLowerCase();
    const title = policy.policyTitle.toLowerCase();
    const wording = policy.policyWording.toLowerCase();
    let score = 0;

    for (const codeMatch of policyCodeMatches) {
      if (code.includes(codeMatch)) {
        score += 12;
      }
    }

    for (const term of terms) {
      if (title.includes(term)) {
        score += 6;
      }
      if (section.includes(term) || code.includes(term)) {
        score += 4;
      }
      if (wording.includes(term)) {
        score += 2;
      }
    }

    if (scenarioLower.includes("legal") && wording.includes("law")) {
      score += 3;
    }

    if (scenarioLower.includes("iep") && wording.includes("fape")) {
      score += 4;
    }

    if (policy.policyStatus.toLowerCase() === "active") {
      score += 1;
    }

    return {
      ...policy,
      relevanceScore: score,
    };
  });

  return scored.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    if (a.policyTitle.length !== b.policyTitle.length) {
      return a.policyTitle.length - b.policyTitle.length;
    }
    return a.id - b.id;
  });
}

function extractSearchTerms(input: string): string[] {
  const normalized = input.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  const uniqueTerms = new Set(tokens);
  return Array.from(uniqueTerms).slice(0, 16);
}

function extractLikelyPolicyCodes(input: string): string[] {
  const matches = input.match(/(?:po\s*)?\d{3,5}(?:\.\d+)?/gi) ?? [];
  return Array.from(new Set(matches.map((match) => match.replace(/\s+/g, ""))));
}
