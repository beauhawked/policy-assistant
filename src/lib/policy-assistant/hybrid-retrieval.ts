import {
  isVectorSearchAvailable,
  searchDatasetPoliciesByEmbedding,
  searchHandbookChunksByEmbedding,
} from "@/lib/policy-assistant/db";
import {
  embedTexts,
  getRetrievalMode,
  isEmbeddingsEnabled,
  toPgVectorLiteral,
  type RetrievalMode,
} from "@/lib/policy-assistant/embeddings";
import { getScenarioSubQueries } from "@/lib/policy-assistant/scenario-decomposition";
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
 *
 * Multi-issue scenarios are additionally decomposed into sub-queries
 * (scenario-decomposition.ts). Each sub-query runs its own semantic search,
 * the results are pooled, and after fusion each sub-issue is guaranteed
 * representation in the final list so no issue is crowded out by louder ones.
 */

const RRF_K = 60;
const MAIN_SEMANTIC_LIMIT = 20;
const SUB_QUERY_SEMANTIC_LIMIT = 8;
/** Below this cosine similarity a semantic match is treated as noise. */
const SEMANTIC_POLICY_FLOOR = 0.25;
const SEMANTIC_HANDBOOK_FLOOR = 0.25;
/** Top fused items that sub-issue guarantees may never evict. */
const PROTECTED_HEAD_COUNT = 2;

export interface PooledPolicySemanticCandidate extends PolicySemanticCandidate {
  subIssues: string[];
}

export interface PooledHandbookSemanticCandidate extends HandbookSemanticCandidate {
  subIssues: string[];
}

export interface ModedRetrievalBundle extends RetrievalBundle {
  mode: RetrievalMode;
  semanticCandidates: PooledPolicySemanticCandidate[];
}

export interface ModedHandbookRetrievalBundle extends HandbookRetrievalBundle {
  mode: RetrievalMode;
  semanticCandidates: PooledHandbookSemanticCandidate[];
}

export interface RetrievalContext {
  mode: RetrievalMode;
  queryVectorLiteral: string | null;
  subQueries: Array<{ query: string; vectorLiteral: string }>;
}

/**
 * Resolve the retrieval mode, decompose the scenario into sub-issues when
 * warranted, and embed the scenario plus all sub-queries in one batched call.
 */
export async function prepareRetrievalContext(scenario: string): Promise<RetrievalContext> {
  const mode = getRetrievalMode();

  if (mode === "lexical" || !isEmbeddingsEnabled()) {
    return { mode: "lexical", queryVectorLiteral: null, subQueries: [] };
  }

  const vectorReady = await isVectorSearchAvailable().catch(() => false);
  if (!vectorReady) {
    return { mode: "lexical", queryVectorLiteral: null, subQueries: [] };
  }

  const subQueryTexts = await getScenarioSubQueries(scenario);

  try {
    const vectors = await embedTexts([scenario, ...subQueryTexts]);
    return {
      mode,
      queryVectorLiteral: toPgVectorLiteral(vectors[0]),
      subQueries: subQueryTexts.map((query, index) => ({
        query,
        vectorLiteral: toPgVectorLiteral(vectors[index + 1]),
      })),
    };
  } catch (error) {
    console.error("[policy_assistant_retrieval] query embedding failed", error);
    return { mode: "lexical", queryVectorLiteral: null, subQueries: [] };
  }
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
    const pool = await collectPolicySemanticPool(userId, datasetId, context);
    const ranked = pool.map(semanticPolicyToResult);
    const final = ensureSubIssueRepresentation(
      ranked.slice(0, limit),
      ranked,
      pool,
      context.subQueries,
      limit,
      (item) => item.id,
    );
    return { terms: [], policies: final, mode: "semantic", semanticCandidates: pool };
  }

  const [lexical, pool] = await Promise.all([
    retrieveRelevantPolicies(userId, datasetId, scenario, { limit }),
    collectPolicySemanticPool(userId, datasetId, context),
  ]);

  const semanticRanked = pool.map(semanticPolicyToResult);
  const fused = fuseByReciprocalRank(lexical.policies, semanticRanked, (item) => item.id);
  const final = ensureSubIssueRepresentation(
    fused.slice(0, limit),
    fused,
    pool,
    context.subQueries,
    limit,
    (item) => item.id,
  );

  return {
    terms: lexical.terms,
    policies: final,
    mode: "hybrid",
    semanticCandidates: pool,
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
    const pool = await collectHandbookSemanticPool(userId, context, options?.handbookTypes);
    const ranked = pool.map(semanticChunkToResult);
    const final = ensureSubIssueRepresentation(
      ranked.slice(0, limit),
      ranked,
      pool,
      context.subQueries,
      limit,
      (item) => item.id,
    );
    return { terms: [], guidance: final, mode: "semantic", semanticCandidates: pool };
  }

  const [lexical, pool] = await Promise.all([
    retrieveRelevantHandbookGuidance(userId, scenario, { limit }),
    collectHandbookSemanticPool(userId, context, options?.handbookTypes),
  ]);

  const semanticRanked = pool.map(semanticChunkToResult);
  const fused = fuseByReciprocalRank(lexical.guidance, semanticRanked, (item) => item.id);
  const final = ensureSubIssueRepresentation(
    fused.slice(0, limit),
    fused,
    pool,
    context.subQueries,
    limit,
    (item) => item.id,
  );

  return {
    terms: lexical.terms,
    guidance: final,
    mode: "hybrid",
    semanticCandidates: pool,
  };
}

/**
 * Run the main scenario search plus one search per sub-issue, then merge into
 * a single pool keyed by policy id. Each pooled item keeps its best similarity
 * and remembers which sub-issues surfaced it.
 */
async function collectPolicySemanticPool(
  userId: string,
  datasetId: string,
  context: RetrievalContext,
): Promise<PooledPolicySemanticCandidate[]> {
  if (!context.queryVectorLiteral) {
    return [];
  }

  const searches = await Promise.all([
    searchDatasetPoliciesByEmbedding(userId, datasetId, context.queryVectorLiteral, {
      limit: MAIN_SEMANTIC_LIMIT,
    }),
    ...context.subQueries.map((subQuery) =>
      searchDatasetPoliciesByEmbedding(userId, datasetId, subQuery.vectorLiteral, {
        limit: SUB_QUERY_SEMANTIC_LIMIT,
      }),
    ),
  ]);

  const pool = new Map<number, PooledPolicySemanticCandidate>();

  searches.forEach((results, searchIndex) => {
    const subIssue = searchIndex === 0 ? null : context.subQueries[searchIndex - 1].query;
    for (const candidate of results) {
      if (candidate.semanticScore < SEMANTIC_POLICY_FLOOR) {
        continue;
      }
      const existing = pool.get(candidate.id);
      if (existing) {
        existing.semanticScore = Math.max(existing.semanticScore, candidate.semanticScore);
        if (subIssue && !existing.subIssues.includes(subIssue)) {
          existing.subIssues.push(subIssue);
        }
      } else {
        pool.set(candidate.id, {
          ...candidate,
          subIssues: subIssue ? [subIssue] : [],
        });
      }
    }
  });

  return Array.from(pool.values()).sort((a, b) => b.semanticScore - a.semanticScore);
}

async function collectHandbookSemanticPool(
  userId: string,
  context: RetrievalContext,
  handbookTypes?: HandbookType[],
): Promise<PooledHandbookSemanticCandidate[]> {
  if (!context.queryVectorLiteral) {
    return [];
  }

  const searches = await Promise.all([
    searchHandbookChunksByEmbedding(userId, context.queryVectorLiteral, {
      limit: MAIN_SEMANTIC_LIMIT,
      handbookTypes,
    }),
    ...context.subQueries.map((subQuery) =>
      searchHandbookChunksByEmbedding(userId, subQuery.vectorLiteral, {
        limit: SUB_QUERY_SEMANTIC_LIMIT,
        handbookTypes,
      }),
    ),
  ]);

  const pool = new Map<number, PooledHandbookSemanticCandidate>();

  searches.forEach((results, searchIndex) => {
    const subIssue = searchIndex === 0 ? null : context.subQueries[searchIndex - 1].query;
    for (const candidate of results) {
      if (candidate.semanticScore < SEMANTIC_HANDBOOK_FLOOR) {
        continue;
      }
      const existing = pool.get(candidate.id);
      if (existing) {
        existing.semanticScore = Math.max(existing.semanticScore, candidate.semanticScore);
        if (subIssue && !existing.subIssues.includes(subIssue)) {
          existing.subIssues.push(subIssue);
        }
      } else {
        pool.set(candidate.id, {
          ...candidate,
          subIssues: subIssue ? [subIssue] : [],
        });
      }
    }
  });

  return Array.from(pool.values()).sort((a, b) => b.semanticScore - a.semanticScore);
}

/**
 * Guarantee each sub-issue at least one representative in the final list.
 *
 * For every sub-query, if none of its two strongest pooled matches made the
 * final list, its strongest match is swapped in from the bottom up. The top
 * fused items are protected so guarantees never displace the strongest
 * overall evidence.
 */
function ensureSubIssueRepresentation<T extends { relevanceScore: number }>(
  initial: T[],
  fullRanking: T[],
  pool: Array<{ id: number; subIssues: string[]; semanticScore: number }>,
  subQueries: Array<{ query: string }>,
  limit: number,
  keyOf: (item: T) => number,
): T[] {
  if (subQueries.length === 0 || pool.length === 0) {
    return initial;
  }

  const final = [...initial];
  const rankingById = new Map<number, T>();
  for (const item of fullRanking) {
    if (!rankingById.has(keyOf(item))) {
      rankingById.set(keyOf(item), item);
    }
  }

  const guaranteedIds = new Set<number>();

  for (const subQuery of subQueries) {
    const candidates = pool
      .filter((candidate) => candidate.subIssues.includes(subQuery.query))
      .sort((a, b) => b.semanticScore - a.semanticScore);

    if (candidates.length === 0) {
      continue;
    }

    const finalIds = new Set(final.map((item) => keyOf(item)));
    const topTwoIds = candidates.slice(0, 2).map((candidate) => Number(candidate.id));
    if (topTwoIds.some((id) => finalIds.has(id))) {
      // This sub-issue is already represented.
      const represented = topTwoIds.find((id) => finalIds.has(id));
      if (represented !== undefined) {
        guaranteedIds.add(represented);
      }
      continue;
    }

    const bestId = Number(candidates[0].id);
    const replacement = rankingById.get(bestId);
    if (!replacement) {
      continue;
    }

    if (final.length < limit) {
      final.push(replacement);
      guaranteedIds.add(bestId);
      continue;
    }

    // Evict from the bottom, skipping protected head items and prior guarantees.
    for (let index = final.length - 1; index >= PROTECTED_HEAD_COUNT; index -= 1) {
      const candidateId = keyOf(final[index]);
      if (!guaranteedIds.has(candidateId)) {
        final[index] = replacement;
        guaranteedIds.add(bestId);
        break;
      }
    }
  }

  return final;
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
