import {
  isVectorSearchAvailable,
  searchDatasetPoliciesByEmbedding,
  searchHandbookChunksByEmbedding,
} from "@/lib/policy-assistant/db";
import {
  embedQuerySafe,
  getRetrievalMode,
  toPgVectorLiteral,
  type RetrievalMode,
} from "@/lib/policy-assistant/embeddings";
import {
  retrieveRelevantPolicies,
  retrieveRelevantHandbookGuidance,
  type RetrievalBundle,
  type HandbookRetrievalBundle,
} from "@/lib/policy-assistant/retrieval";
import type {
  HandbookRetrievalResult,
  HandbookSemanticCandidate,
  HandbookType,
  PolicySemanticCandidate,
  RetrievalResult,
} from "@/lib/policy-assistant/types";

/**
 * Mode-aware retrieval dispatcher.
 *
 * lexical  — the original hand-tuned keyword pipeline, unchanged.
 * semantic — pure vector similarity (meaning-based) ranking.
 * hybrid   — both pipelines run, results fused with Reciprocal Rank Fusion
 *            (RRF, Cormack et al. 2009). RRF rewards items that rank well in
 *            either list and strongly rewards items that rank well in both,
 *            without needing the two score scales to be comparable.
 */

const RRF_K = 60;
const SEMANTIC_CANDIDATE_LIMIT = 20;
/** Below this cosine similarity a semantic match is treated as noise. */
const SEMANTIC_POLICY_FLOOR = 0.25;
const SEMANTIC_HANDBOOK_FLOOR = 0.25;

export interface ModedRetrievalBundle extends RetrievalBundle {
  mode: RetrievalMode;
  semanticCandidates: PolicySemanticCandidate[];
}

export interface ModedHandbookRetrievalBundle extends HandbookRetrievalBundle {
  mode: RetrievalMode;
  semanticCandidates: HandbookSemanticCandidate[];
}

interface RetrievalContext {
  mode: RetrievalMode;
  queryVectorLiteral: string | null;
}

/**
 * Resolve the retrieval mode and (when needed) embed the scenario once so the
 * policy and handbook searches can share a single embedding call.
 */
export async function prepareRetrievalContext(scenario: string): Promise<RetrievalContext> {
  let mode = getRetrievalMode();

  if (mode === "lexical") {
    return { mode, queryVectorLiteral: null };
  }

  const vectorReady = await isVectorSearchAvailable().catch(() => false);
  if (!vectorReady) {
    return { mode: "lexical", queryVectorLiteral: null };
  }

  const vector = await embedQuerySafe(scenario);
  if (!vector) {
    return { mode: "lexical", queryVectorLiteral: null };
  }

  return { mode, queryVectorLiteral: toPgVectorLiteral(vector) };
}

export async function retrievePoliciesWithMode(
  userId: string,
  datasetId: string,
  scenario: string,
  context: RetrievalContext,
  options?: { limit?: number },
): Promise<ModedRetrievalBundle> {
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 12) : 6;

  if (context.mode === "lexical" || !context.queryVectorLiteral) {
    const lexical = await retrieveRelevantPolicies(userId, datasetId, scenario, { limit });
    return { ...lexical, mode: "lexical", semanticCandidates: [] };
  }

  if (context.mode === "semantic") {
    const semantic = await searchDatasetPoliciesByEmbedding(
      userId,
      datasetId,
      context.queryVectorLiteral,
      { limit: SEMANTIC_CANDIDATE_LIMIT },
    );
    const filtered = semantic.filter((item) => item.semanticScore >= SEMANTIC_POLICY_FLOOR);
    return {
      terms: [],
      policies: filtered.slice(0, limit).map(semanticPolicyToResult),
      mode: "semantic",
      semanticCandidates: filtered,
    };
  }

  const [lexical, semantic] = await Promise.all([
    retrieveRelevantPolicies(userId, datasetId, scenario, { limit }),
    searchDatasetPoliciesByEmbedding(userId, datasetId, context.queryVectorLiteral, {
      limit: SEMANTIC_CANDIDATE_LIMIT,
    }),
  ]);

  const semanticFiltered = semantic.filter(
    (item) => item.semanticScore >= SEMANTIC_POLICY_FLOOR,
  );

  const fused = fuseByReciprocalRank(
    lexical.policies,
    semanticFiltered.map(semanticPolicyToResult),
    (item) => item.id,
  );

  return {
    terms: lexical.terms,
    policies: fused.slice(0, limit),
    mode: "hybrid",
    semanticCandidates: semanticFiltered,
  };
}

export async function retrieveHandbookGuidanceWithMode(
  userId: string,
  scenario: string,
  context: RetrievalContext,
  options?: { limit?: number; handbookTypes?: HandbookType[] },
): Promise<ModedHandbookRetrievalBundle> {
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 10) : 4;

  if (context.mode === "lexical" || !context.queryVectorLiteral) {
    const lexical = await retrieveRelevantHandbookGuidance(userId, scenario, { limit });
    return { ...lexical, mode: "lexical", semanticCandidates: [] };
  }

  if (context.mode === "semantic") {
    const semantic = await searchHandbookChunksByEmbedding(userId, context.queryVectorLiteral, {
      limit: SEMANTIC_CANDIDATE_LIMIT,
      handbookTypes: options?.handbookTypes,
    });
    const filtered = semantic.filter((item) => item.semanticScore >= SEMANTIC_HANDBOOK_FLOOR);
    return {
      terms: [],
      guidance: filtered.slice(0, limit).map(semanticChunkToResult),
      mode: "semantic",
      semanticCandidates: filtered,
    };
  }

  const [lexical, semantic] = await Promise.all([
    retrieveRelevantHandbookGuidance(userId, scenario, { limit }),
    searchHandbookChunksByEmbedding(userId, context.queryVectorLiteral, {
      limit: SEMANTIC_CANDIDATE_LIMIT,
      handbookTypes: options?.handbookTypes,
    }),
  ]);

  const semanticFiltered = semantic.filter(
    (item) => item.semanticScore >= SEMANTIC_HANDBOOK_FLOOR,
  );

  const fused = fuseByReciprocalRank(
    lexical.guidance,
    semanticFiltered.map(semanticChunkToResult),
    (item) => item.id,
  );

  return {
    terms: lexical.terms,
    guidance: fused.slice(0, limit),
    mode: "hybrid",
    semanticCandidates: semanticFiltered,
  };
}

function semanticPolicyToResult(candidate: PolicySemanticCandidate): RetrievalResult {
  return {
    id: candidate.id,
    datasetId: candidate.datasetId,
    policySection: candidate.policySection,
    policyCode: candidate.policyCode,
    adoptedDate: candidate.adoptedDate,
    revisedDate: candidate.revisedDate,
    policyStatus: candidate.policyStatus,
    policyTitle: candidate.policyTitle,
    policyWording: candidate.policyWording,
    sourceRowIndex: candidate.sourceRowIndex,
    relevanceScore: toDisplayScore(candidate.semanticScore),
  };
}

function semanticChunkToResult(candidate: HandbookSemanticCandidate): HandbookRetrievalResult {
  return {
    id: candidate.id,
    documentId: candidate.documentId,
    handbookType: candidate.handbookType,
    sectionTitle: candidate.sectionTitle,
    content: candidate.content,
    sourceIndex: candidate.sourceIndex,
    relevanceScore: toDisplayScore(candidate.semanticScore),
  };
}

/** Map cosine similarity (0..1) onto the integer scale the prompt already uses. */
function toDisplayScore(similarity: number): number {
  return Math.round(Math.max(0, Math.min(1, similarity)) * 30);
}

/**
 * Reciprocal Rank Fusion. Items appearing in both lists receive the sum of
 * both reciprocal-rank contributions and therefore rise to the top. The
 * relevanceScore carried forward is the maximum of the two sources so the
 * model prompt continues to see a familiar scale.
 */
function fuseByReciprocalRank<T extends { relevanceScore: number }>(
  primary: T[],
  secondary: T[],
  keyOf: (item: T) => number,
): T[] {
  const fusedScores = new Map<number, { item: T; score: number }>();

  const addList = (list: T[]) => {
    list.forEach((item, index) => {
      const key = keyOf(item);
      const contribution = 1 / (RRF_K + index + 1);
      const existing = fusedScores.get(key);
      if (existing) {
        existing.score += contribution;
        if (item.relevanceScore > existing.item.relevanceScore) {
          existing.item = { ...item, relevanceScore: item.relevanceScore };
        }
      } else {
        fusedScores.set(key, { item, score: contribution });
      }
    });
  };

  addList(primary);
  addList(secondary);

  return Array.from(fusedScores.values())
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
