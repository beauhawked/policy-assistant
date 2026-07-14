import OpenAI from "openai";

import type { NormalizedPolicyRow } from "@/lib/policy-assistant/types";

/**
 * Semantic embedding support for the policy assistant.
 *
 * Embeddings are numeric fingerprints of text meaning. Two passages about the
 * same concept (for example "students recording fights on phones" and a policy
 * titled "Personal Communication Devices") end up with similar fingerprints
 * even when they share few exact words. We store one fingerprint per policy
 * and per handbook chunk in Postgres (pgvector) and compare the scenario's
 * fingerprint against them at question time.
 */

export const EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

const EMBEDDING_BATCH_SIZE = 96;
const MAX_EMBEDDING_INPUT_CHARS = 6000;

export type RetrievalMode = "lexical" | "semantic" | "hybrid";

let embeddingClient: OpenAI | null = null;

export function isEmbeddingsEnabled(): boolean {
  return process.env.POLICY_ASSISTANT_EMBEDDINGS_DISABLED?.trim() !== "1";
}

export function getRetrievalMode(): RetrievalMode {
  if (!isEmbeddingsEnabled()) {
    return "lexical";
  }

  const raw = process.env.POLICY_ASSISTANT_RETRIEVAL_MODE?.trim().toLowerCase();
  if (raw === "lexical" || raw === "semantic" || raw === "hybrid") {
    return raw;
  }

  return "hybrid";
}

export function getEmbeddingModel(): string {
  return process.env.POLICY_ASSISTANT_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

function getEmbeddingClient(): OpenAI {
  if (embeddingClient) {
    return embeddingClient;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  embeddingClient = new OpenAI({ apiKey });
  return embeddingClient;
}

function prepareEmbeddingInput(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return " ";
  }
  if (collapsed.length <= MAX_EMBEDDING_INPUT_CHARS) {
    return collapsed;
  }
  return collapsed.slice(0, MAX_EMBEDDING_INPUT_CHARS);
}

/** Text used to fingerprint one policy row. */
export function buildPolicyEmbeddingText(
  row: Pick<NormalizedPolicyRow, "policySection" | "policyCode" | "policyTitle" | "policyWording">,
): string {
  return [
    row.policyTitle ? `Policy title: ${row.policyTitle}` : "",
    row.policySection ? `Policy section: ${row.policySection}` : "",
    row.policyCode ? `Policy code: ${row.policyCode}` : "",
    row.policyWording ? `Policy text: ${row.policyWording}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Text used to fingerprint one handbook chunk. */
export function buildHandbookChunkEmbeddingText(
  handbookType: string,
  sectionTitle: string,
  content: string,
): string {
  return [
    `Handbook type: ${handbookType === "staff" ? "Staff handbook" : "Student handbook"}`,
    sectionTitle ? `Section: ${sectionTitle}` : "",
    content ? `Content: ${content}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Embed many texts in batches. Returns one vector per input, same order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const client = getEmbeddingClient();
  const model = getEmbeddingModel();
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE).map(prepareEmbeddingInput);
    const response = await client.embeddings.create({
      model,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      vectors.push(item.embedding);
    }
  }

  if (vectors.length !== texts.length) {
    throw new Error(
      `Embedding count mismatch: expected ${texts.length}, received ${vectors.length}.`,
    );
  }

  return vectors;
}

/** Embed a single scenario/query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  return vector;
}

/**
 * Embed a single scenario/query string, returning null instead of throwing.
 * Used by the retrieval dispatcher so a temporary OpenAI outage degrades
 * gracefully to lexical retrieval instead of failing the whole request.
 */
export async function embedQuerySafe(text: string): Promise<number[] | null> {
  if (!isEmbeddingsEnabled()) {
    return null;
  }

  try {
    return await embedQuery(text);
  } catch (error) {
    console.error("[policy_assistant_embeddings] query embedding failed", error);
    return null;
  }
}

/** Serialize a vector for pgvector's text input format. */
export function toPgVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
