import OpenAI from "openai";

import type { NormalizedPolicyRow } from "@/lib/policy-assistant/types";

const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_BATCH_SIZE = 48;
const MAX_EMBEDDING_INPUT_CHARS = 6_000;

let openaiClient: OpenAI | null = null;
const scenarioEmbeddingCache = new Map<string, Promise<number[] | null>>();

export function embeddingsEnabled(): boolean {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const disabled = process.env.POLICY_ASSISTANT_EMBEDDINGS_DISABLED?.trim() === "1";
  return Boolean(apiKey) && !disabled;
}

export function buildPolicyEmbeddingText(row: NormalizedPolicyRow): string {
  return trimEmbeddingInput(
    [
      `Policy Section: ${row.policySection}`,
      `Policy Code: ${row.policyCode}`,
      `Policy Title: ${row.policyTitle}`,
      `Policy Status: ${row.policyStatus}`,
      `Policy Wording: ${row.policyWording}`,
    ].join("\n"),
  );
}

export function buildHandbookEmbeddingText(sectionTitle: string, content: string): string {
  return trimEmbeddingInput(
    [`Handbook Section: ${sectionTitle}`, `Handbook Guidance: ${content}`].join("\n"),
  );
}

export function buildStateLawEmbeddingText(
  stateCode: string,
  sourceName: string,
  citationTitle: string,
  sectionId: string,
  content: string,
): string {
  return trimEmbeddingInput(
    [
      `State: ${stateCode}`,
      `Source: ${sourceName}`,
      `Citation Title: ${citationTitle}`,
      `Section: ${sectionId}`,
      `Text: ${content}`,
    ].join("\n"),
  );
}

export async function embedTexts(
  inputs: string[],
  options?: { batchSize?: number },
): Promise<Array<number[] | null>> {
  if (inputs.length === 0) {
    return [];
  }

  if (!embeddingsEnabled()) {
    return inputs.map(() => null);
  }

  const batchSize = options?.batchSize && options.batchSize > 0 ? options.batchSize : DEFAULT_BATCH_SIZE;
  const normalizedInputs = inputs.map(trimEmbeddingInput);
  const embeddings: Array<number[] | null> = new Array(normalizedInputs.length).fill(null);
  const client = getOpenAiClient();
  const model = process.env.POLICY_ASSISTANT_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;

  for (let start = 0; start < normalizedInputs.length; start += batchSize) {
    const slice = normalizedInputs.slice(start, start + batchSize);
    const response = await client.embeddings.create({
      model,
      input: slice,
    });

    for (let index = 0; index < response.data.length; index += 1) {
      embeddings[start + index] = response.data[index]?.embedding ?? null;
    }
  }

  return embeddings;
}

export async function getScenarioEmbedding(scenario: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) {
    return null;
  }

  const normalizedScenario = scenario.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedScenario) {
    return null;
  }

  const existing = scenarioEmbeddingCache.get(normalizedScenario);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    try {
      const [embedding] = await embedTexts([normalizedScenario], { batchSize: 1 });
      return embedding ?? null;
    } catch {
      return null;
    } finally {
      setTimeout(() => {
        scenarioEmbeddingCache.delete(normalizedScenario);
      }, 15_000).unref?.();
    }
  })();

  scenarioEmbeddingCache.set(normalizedScenario, pending);
  return pending;
}

function getOpenAiClient(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function trimEmbeddingInput(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_EMBEDDING_INPUT_CHARS) {
    return normalized;
  }
  return normalized.slice(0, MAX_EMBEDDING_INPUT_CHARS);
}
