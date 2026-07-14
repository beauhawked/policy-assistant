import OpenAI from "openai";

/**
 * Sub-issue decomposition for multi-issue scenarios.
 *
 * A long scenario ("hallway fight + IEP student + videos on social media")
 * contains several distinct policy questions competing for the same short
 * results list. Retrieving once for the whole narrative lets the loudest
 * signal crowd out the others. This module splits such scenarios into
 * focused sub-queries so each issue gets its own dedicated semantic search.
 *
 * Two tiers, cheapest first:
 *  1. Explicit question extraction — if the scenario already contains two or
 *     more written questions, those ARE the sub-issues. Deterministic, free.
 *  2. Model-based decomposition — for long narratives without explicit
 *     questions, one small OpenAI call proposes the sub-issues. Best-effort
 *     with a timeout; failure simply means no decomposition.
 */

const MAX_SUB_QUERIES = 6;
const MIN_QUESTION_LENGTH = 20;
const MODEL_TIER_MIN_SCENARIO_LENGTH = 600;
const MODEL_TIMEOUT_MS = 6000;

let decompositionClient: OpenAI | null = null;

export function isDecompositionEnabled(): boolean {
  return process.env.POLICY_ASSISTANT_SUBISSUE_DECOMPOSITION?.trim() !== "0";
}

/** Extract explicit written questions from the scenario text. */
export function extractExplicitQuestions(scenario: string): string[] {
  const matches = scenario.match(/[^?!.\n•]+\?/g) ?? [];
  const cleaned = matches
    .map((question) =>
      question
        .replace(/^[\s••*\-–—\d.)(]+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((question) => question.length >= MIN_QUESTION_LENGTH);

  return dedupeQueries(cleaned).slice(0, MAX_SUB_QUERIES);
}

/**
 * Produce sub-queries for a scenario, or an empty array when the scenario is
 * simple enough that whole-scenario retrieval is the right tool.
 */
export async function getScenarioSubQueries(scenario: string): Promise<string[]> {
  if (!isDecompositionEnabled()) {
    return [];
  }

  const explicit = extractExplicitQuestions(scenario);
  if (explicit.length >= 2) {
    return explicit;
  }

  if (scenario.length < MODEL_TIER_MIN_SCENARIO_LENGTH) {
    return [];
  }

  try {
    return await withTimeout(decomposeWithModel(scenario), MODEL_TIMEOUT_MS);
  } catch (error) {
    console.error("[policy_assistant_decomposition] model decomposition failed", error);
    return [];
  }
}

async function decomposeWithModel(scenario: string): Promise<string[]> {
  const client = getDecompositionClient();
  const model = process.env.POLICY_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini";

  const response = await client.responses.create({
    model,
    temperature: 0,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "You split school-administration scenarios into distinct policy sub-issues.",
              "Each sub-issue becomes a short standalone search query used to find relevant board policies and handbook sections.",
              "Rules:",
              "- Return ONLY a JSON array of strings. No prose, no markdown.",
              "- 2 to 6 sub-issues.",
              "- Each 5 to 20 words, phrased as a focused policy question or topic.",
              "- Cover every distinct issue in the scenario (discipline, special education procedure, bullying, technology or privacy, communication, safety, records, and so on) but do not invent issues that are not present.",
              '- If the scenario contains only one issue, return a JSON array with that single issue.',
            ].join("\n"),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: scenario.slice(0, 6000),
          },
        ],
      },
    ],
  });

  const rawText = response.output_text?.trim() ?? "";
  const parsed = parseJsonStringArray(rawText);
  const cleaned = parsed
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query) => query.length >= 8 && query.length <= 200);

  const deduped = dedupeQueries(cleaned).slice(0, MAX_SUB_QUERIES);
  // A single sub-issue adds nothing over whole-scenario retrieval.
  return deduped.length >= 2 ? deduped : [];
}

function parseJsonStringArray(text: string): string[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function dedupeQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const query of queries) {
    const key = query.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(query);
    }
  }
  return result;
}

function getDecompositionClient(): OpenAI {
  if (decompositionClient) {
    return decompositionClient;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  decompositionClient = new OpenAI({ apiKey });
  return decompositionClient;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
