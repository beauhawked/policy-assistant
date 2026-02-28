import OpenAI from "openai";

import type { LiveStateLawSource } from "@/lib/policy-assistant/types";

let openaiClient: OpenAI | null = null;

export function liveStateLawEnabled(): boolean {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const enabled = process.env.POLICY_ASSISTANT_LIVE_STATE_LAW_ENABLED?.trim() === "1";
  return Boolean(apiKey) && enabled;
}

export function getConfiguredStateCode(): string {
  return (process.env.POLICY_ASSISTANT_STATE_CODE?.trim() || "IN").toUpperCase();
}

export function getApprovedStateLawDomains(): string[] {
  const raw = process.env.POLICY_ASSISTANT_APPROVED_STATE_LAW_DOMAINS?.trim() || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

export async function searchLiveStateLawSources(input: {
  scenario: string;
  stateCode: string;
  maxSources?: number;
}): Promise<LiveStateLawSource[]> {
  if (!liveStateLawEnabled()) {
    return [];
  }

  const approvedDomains = getApprovedStateLawDomains();
  if (approvedDomains.length === 0) {
    return [];
  }

  const maxSources = input.maxSources && input.maxSources > 0 ? Math.min(input.maxSources, 6) : 3;
  const client = getOpenAiClient();
  const model =
    process.env.POLICY_ASSISTANT_LIVE_LAW_MODEL?.trim() ||
    process.env.POLICY_ASSISTANT_MODEL?.trim() ||
    "gpt-4.1-mini";
  const stateCode = input.stateCode.trim().toUpperCase() || "IN";
  const domainFilters = approvedDomains.map((domain) => `site:${domain}`).join(" OR ");

  try {
    const response = await client.responses.create({
      model,
      temperature: 0,
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You find official U.S. state statutes and regulations.",
                "Return strict JSON only with shape:",
                '{"sources":[{"title":"...","url":"https://...","excerpt":"...","relevanceNote":"..."}]}',
                "Do not include markdown. Do not include commentary outside JSON.",
                "Only include sources from allowed domains.",
              ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                `State code: ${stateCode}`,
                `Question: ${input.scenario}`,
                `Allowed domains: ${approvedDomains.join(", ")}`,
                `Search filter query: ${domainFilters}`,
                `Return at most ${maxSources} sources.`,
              ].join("\n"),
            },
          ],
        },
      ],
    });

    const outputText = extractResponseText(response).trim();
    const parsed = parseSourcesPayload(outputText);
    const filtered = parsed.filter((source) => isApprovedDomain(source.url, approvedDomains));
    const sourcesFromTool = extractWebSearchSources(response, approvedDomains);
    const merged = mergeLiveSources(filtered, sourcesFromTool);
    return merged.slice(0, maxSources);
  } catch {
    return [];
  }
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

function parseSourcesPayload(value: string): LiveStateLawSource[] {
  if (!value) {
    return [];
  }

  const parsed = tryParseJson(value) ?? tryParseJson(extractFirstJsonObject(value));
  if (!parsed || typeof parsed !== "object" || !("sources" in parsed)) {
    return [];
  }

  const rawSources = (parsed as { sources?: unknown }).sources;
  if (!Array.isArray(rawSources)) {
    return [];
  }

  const normalized: LiveStateLawSource[] = [];
  for (const rawSource of rawSources) {
    if (!rawSource || typeof rawSource !== "object") {
      continue;
    }

    const source = rawSource as Record<string, unknown>;
    const title = String(source.title ?? "").trim();
    const url = sanitizeSourceUrl(String(source.url ?? "").trim());
    const excerpt = String(source.excerpt ?? "").trim();
    const relevanceNote = String(source.relevanceNote ?? "").trim();

    if (!title || !url || !excerpt) {
      continue;
    }

    normalized.push({
      title,
      url,
      excerpt,
      relevanceNote: relevanceNote || "Official state source relevant to the question.",
    });
  }

  return normalized;
}

function extractWebSearchSources(
  response: OpenAI.Responses.Response,
  approvedDomains: string[],
): LiveStateLawSource[] {
  const extracted: LiveStateLawSource[] = [];

  for (const outputItem of response.output ?? []) {
    if (!("type" in outputItem) || outputItem.type !== "web_search_call") {
      continue;
    }

    if (!("action" in outputItem) || !outputItem.action) {
      continue;
    }

    const action = outputItem.action as { sources?: Array<{ url?: string }> };
    for (const source of action.sources ?? []) {
      const url = sanitizeSourceUrl(String(source.url ?? "").trim());
      if (!url || !isApprovedDomain(url, approvedDomains)) {
        continue;
      }
      if (!isLikelyLegalReferenceUrl(url)) {
        continue;
      }
      extracted.push({
        title: new URL(url).hostname,
        url,
        excerpt: "Live state-law source retrieved from approved domain.",
        relevanceNote: "Use for citation and verification.",
      });
    }
  }

  return extracted;
}

function mergeLiveSources(
  fromModel: LiveStateLawSource[],
  fromTool: LiveStateLawSource[],
): LiveStateLawSource[] {
  if (fromModel.length > 0) {
    return dedupeSources(fromModel);
  }

  return dedupeSources(fromTool);
}

function dedupeSources(sources: LiveStateLawSource[]): LiveStateLawSource[] {
  const merged = new Map<string, LiveStateLawSource>();
  for (const source of sources) {
    merged.set(normalizeUrlKey(source.url), source);
  }
  return Array.from(merged.values());
}

function normalizeUrlKey(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname}${url.search}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

function isApprovedDomain(urlValue: string, approvedDomains: string[]): boolean {
  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    return approvedDomains.some((domainPattern) => {
      if (domainPattern.startsWith("*.")) {
        const baseDomain = domainPattern.slice(2);
        return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
      }
      return hostname === domainPattern;
    });
  } catch {
    return false;
  }
}

function isLikelyLegalReferenceUrl(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    const pathname = url.pathname.toLowerCase();
    return (
      /\b(code|codes|law|laws|statute|statutes|rule|rules|regulation|regulations|chapter|article)\b/.test(
        pathname,
      ) || /\.(pdf|html?)$/.test(pathname)
    );
  } catch {
    return false;
  }
}

function sanitizeSourceUrl(value: string): string {
  if (!value) {
    return value;
  }

  try {
    const url = new URL(value);
    const keysToDelete: string[] = [];
    url.searchParams.forEach((_val, key) => {
      if (/^utm_/i.test(key) || key.toLowerCase() === "fbclid" || key.toLowerCase() === "gclid") {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function extractResponseText(response: OpenAI.Responses.Response): string {
  if (response.output_text && response.output_text.trim()) {
    return response.output_text;
  }

  const chunks: string[] = [];
  for (const outputItem of response.output ?? []) {
    if (!("content" in outputItem) || !Array.isArray(outputItem.content)) {
      continue;
    }
    for (const contentItem of outputItem.content) {
      if ("text" in contentItem && typeof contentItem.text === "string") {
        chunks.push(contentItem.text);
      }
    }
  }
  return chunks.join("\n");
}

function extractFirstJsonObject(value: string): string {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return "";
  }
  return value.slice(start, end + 1);
}

function tryParseJson(value: string): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
