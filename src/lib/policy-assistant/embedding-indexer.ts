import {
  isVectorSearchAvailable,
  listHandbookChunkEmbeddingBacklog,
  listPolicyEmbeddingBacklog,
  updateHandbookChunkEmbeddings,
  updatePolicyEmbeddings,
} from "@/lib/policy-assistant/db";
import {
  buildHandbookChunkEmbeddingText,
  buildPolicyEmbeddingText,
  embedTexts,
  isEmbeddingsEnabled,
  toPgVectorLiteral,
} from "@/lib/policy-assistant/embeddings";

/**
 * Generates and stores embeddings for rows that do not have one yet.
 * Runs in passes so arbitrarily large backlogs complete without holding
 * everything in memory. Used by the upload routes (scoped to one dataset or
 * document) and by the backfill script (unscoped).
 */

const PASS_LIMIT = 200;

export interface EmbeddingIndexReport {
  policiesEmbedded: number;
  handbookChunksEmbedded: number;
}

export async function indexPolicyEmbeddings(options?: {
  datasetId?: string;
  onProgress?: (embedded: number) => void;
}): Promise<number> {
  if (!isEmbeddingsEnabled() || !(await isVectorSearchAvailable())) {
    return 0;
  }

  let total = 0;

  for (;;) {
    const backlog = await listPolicyEmbeddingBacklog({
      limit: PASS_LIMIT,
      datasetId: options?.datasetId,
    });
    if (backlog.length === 0) {
      break;
    }

    const vectors = await embedTexts(
      backlog.map((row) =>
        buildPolicyEmbeddingText({
          policySection: row.policySection,
          policyCode: row.policyCode,
          policyTitle: row.policyTitle,
          policyWording: row.policyWording,
        }),
      ),
    );

    await updatePolicyEmbeddings(
      backlog.map((row, index) => ({
        id: row.id,
        vectorLiteral: toPgVectorLiteral(vectors[index]),
      })),
    );

    total += backlog.length;
    options?.onProgress?.(total);

    if (backlog.length < PASS_LIMIT) {
      break;
    }
  }

  return total;
}

export async function indexHandbookChunkEmbeddings(options?: {
  documentId?: string;
  onProgress?: (embedded: number) => void;
}): Promise<number> {
  if (!isEmbeddingsEnabled() || !(await isVectorSearchAvailable())) {
    return 0;
  }

  let total = 0;

  for (;;) {
    const backlog = await listHandbookChunkEmbeddingBacklog({
      limit: PASS_LIMIT,
      documentId: options?.documentId,
    });
    if (backlog.length === 0) {
      break;
    }

    const vectors = await embedTexts(
      backlog.map((row) =>
        buildHandbookChunkEmbeddingText(row.handbookType, row.sectionTitle, row.content),
      ),
    );

    await updateHandbookChunkEmbeddings(
      backlog.map((row, index) => ({
        id: row.id,
        vectorLiteral: toPgVectorLiteral(vectors[index]),
      })),
    );

    total += backlog.length;
    options?.onProgress?.(total);

    if (backlog.length < PASS_LIMIT) {
      break;
    }
  }

  return total;
}

/** Best-effort embedding pass used right after an upload completes. */
export async function indexDatasetEmbeddingsSafe(datasetId: string): Promise<number> {
  try {
    return await indexPolicyEmbeddings({ datasetId });
  } catch (error) {
    console.error(
      `[policy_assistant_embeddings] dataset ${datasetId} embedding pass failed; backfill will retry`,
      error,
    );
    return 0;
  }
}

/** Best-effort embedding pass used right after a handbook upload completes. */
export async function indexHandbookDocumentEmbeddingsSafe(documentId: string): Promise<number> {
  try {
    return await indexHandbookChunkEmbeddings({ documentId });
  } catch (error) {
    console.error(
      `[policy_assistant_embeddings] document ${documentId} embedding pass failed; backfill will retry`,
      error,
    );
    return 0;
  }
}
