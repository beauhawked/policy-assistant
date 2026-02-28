import OpenAI from "openai";

import type {
  HandbookRetrievalResult,
  LiveStateLawSource,
  RetrievalResult,
  StateLawRetrievalResult,
} from "@/lib/policy-assistant/types";

interface GeneratePolicyGuidanceInput {
  districtName: string;
  scenario: string;
  focus?: "policy" | "handbook" | "mixed";
  stateLawOnly?: boolean;
  policies: RetrievalResult[];
  handbookGuidance?: HandbookRetrievalResult[];
  stateLawGuidance?: StateLawRetrievalResult[];
  liveStateLawSources?: LiveStateLawSource[];
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

let openaiClient: OpenAI | null = null;

export async function generatePolicyGuidance(input: GeneratePolicyGuidanceInput): Promise<string> {
  const client = getOpenAiClient();
  const historyContext = buildConversationHistoryContext(input.conversationHistory ?? []);
  const handbookGuidance = input.handbookGuidance ?? [];
  const stateLawGuidance = input.stateLawGuidance ?? [];
  const liveStateLawSources = input.liveStateLawSources ?? [];
  const stateLawOnly = input.stateLawOnly === true;
  const responseStyle = detectResponseStyle(input.scenario);

  const policyContext = input.policies.map((policy, index) => {
    const revisedDate = policy.revisedDate || "No Policy Revisions";
    const wording = truncate(policy.policyWording, 1400);

    return [
      `Policy ${index + 1}:`,
      `- Policy Section: ${policy.policySection || "Not listed"}`,
      `- Policy Code: ${policy.policyCode || "Not listed"}`,
      `- Date of Policy Adoption Date: ${policy.adoptedDate || "Not listed"}`,
      `- Date of Policy Revision Date: ${revisedDate}`,
      `- Policy Status: ${policy.policyStatus || "Not listed"}`,
      `- Policy Title: ${policy.policyTitle || "Not listed"}`,
      `- Policy Wording: ${wording || "Not listed"}`,
      `- Relevance Score: ${policy.relevanceScore}`,
    ].join("\n");
  });

  const handbookContext = handbookGuidance.map((chunk, index) => {
    return [
      `Handbook Guidance ${index + 1}:`,
      `- Handbook Section: ${chunk.sectionTitle || "Not listed"}`,
      `- Handbook Guidance: ${truncate(chunk.content, 1400) || "Not listed"}`,
      `- Relevance Score: ${chunk.relevanceScore}`,
    ].join("\n");
  });

  const stateLawContext = stateLawGuidance.map((chunk, index) => {
    return [
      `State Law Reference ${index + 1}:`,
      `- State Code: ${chunk.stateCode || "Not listed"}`,
      `- Source Name: ${chunk.sourceName || "Not listed"}`,
      `- Citation Title: ${chunk.citationTitle || "Not listed"}`,
      `- Section ID: ${chunk.sectionId || "Not listed"}`,
      `- Source URL: ${chunk.sourceUrl || "Not listed"}`,
      `- State Law Guidance: ${truncate(chunk.content, 1200) || "Not listed"}`,
      `- Relevance Score: ${chunk.relevanceScore}`,
    ].join("\n");
  });

  const liveStateLawContext = liveStateLawSources.map((source, index) => {
    return [
      `Live State Law Source ${index + 1}:`,
      `- Source Title: ${source.title || "Not listed"}`,
      `- Source URL: ${source.url || "Not listed"}`,
      `- Source Excerpt: ${truncate(source.excerpt, 700) || "Not listed"}`,
      `- Relevance Note: ${source.relevanceNote || "Not listed"}`,
    ].join("\n");
  });

  const response = await client.responses.create({
    model: process.env.POLICY_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini",
    temperature: 0.2,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildSystemPrompt(responseStyle, { stateLawOnly }),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              `District: ${input.districtName}`,
              "",
              ...(historyContext ? [historyContext, ""] : []),
              `Scenario: ${input.scenario}`,
              `Query focus: ${input.focus ?? "mixed"}`,
              `State-law-only mode: ${stateLawOnly ? "enabled" : "disabled"}`,
              `Requested response style: ${responseStyle}`,
              ...(stateLawOnly
                ? []
                : [
                    "",
                    "Relevant policies from the uploaded district CSV:",
                    policyContext.length > 0
                      ? policyContext.join("\n\n")
                      : "No matching district policy guidance found.",
                    "",
                    "Relevant student handbook guidance from account uploads:",
                    handbookContext.length > 0
                      ? handbookContext.join("\n\n")
                      : "No matching handbook guidance found.",
                  ]),
              "",
              "Relevant state-law corpus guidance (official statutes/regulations):",
              stateLawContext.length > 0
                ? stateLawContext.join("\n\n")
                : "No matching state-law corpus guidance found.",
              "",
              "Live official state-law sources from approved domains:",
              liveStateLawContext.length > 0
                ? liveStateLawContext.join("\n\n")
                : "No live state-law sources found.",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const rawText = extractResponseText(response).trim();
  if (!rawText) {
    throw new Error("OpenAI returned an empty response.");
  }

  return normalizeAssistantOutput(rawText, responseStyle, stateLawOnly);
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

function buildSystemPrompt(
  responseStyle: "direct_answer" | "action_guidance",
  options?: { stateLawOnly?: boolean },
): string {
  const stateLawOnly = options?.stateLawOnly === true;
  const styleDirective =
    responseStyle === "direct_answer"
      ? [
          "Style mode is direct_answer.",
          "For direct_answer mode:",
          "- Keep policy and handbook summaries tightly factual and scoped to the exact user question.",
          "- Do not include Action Steps.",
          "- Do not include Legal, Ethical, and Academic Implications.",
          "- Keep the response concise and directly informational.",
        ]
      : [
          "Style mode is action_guidance.",
          "For action_guidance mode:",
          "- Provide a practical, implementation-ready action plan.",
          "- Keep action steps specific to the cited policy and handbook content.",
          "- Include a section titled exactly: Action Steps:",
          "- Include a section titled exactly: Legal, Ethical, and Academic Implications:",
        ];

  const scopeDirectives = stateLawOnly
    ? [
        "Response requirements for each scenario:",
        "1) State-law-only mode is enabled for this query.",
        "2) Use only provided state-law corpus guidance and live official state-law sources.",
        "3) Do not include district policy sections or handbook sections in the response.",
        "4) Start with a section titled exactly: Relevant State Law References",
        "5) If state-law context exists, list each source in its own block using these exact labels:",
        "State Law Source:",
        "State Law Citation:",
        "State Law URL:",
        "State Law Guidance:",
        "6) If no state-law context exists, write exactly: No matching state law references found.",
        "7) Always include the exact source URL in each state-law block.",
        "8) Keep guidance factual and concise.",
      ]
    : [
        "Response requirements for each scenario:",
        "1) Use only the provided policy context and do not invent policy details.",
        "2) Start with a section titled exactly: Relevant Policies",
        "3) If matching policy context exists, list each relevant policy in that section in its own standalone block.",
        "4) If no matching policy context exists, write exactly: No matching district policy guidance found.",
        "5) Never include unrelated policy topics.",
        "6) Limit policy list to the most relevant items only.",
        "7) Start each policy block on a new line with this exact label: Policy Section:",
        "8) Include these labels exactly for each policy:",
        "Policy Section:",
        "Policy Code:",
        "Date of Policy Adoption Date:",
        "Date of Policy Revision Date:",
        "Policy Status:",
        "Policy Title:",
        "Policy Wording:",
        "9) For Policy Wording, provide only a concise relevant summary (maximum 3 sentences).",
        "10) Never include boilerplate phrases such as 'This is a summary of the policy' or 'This is a summary of the guidance'.",
        "11) If Date of Policy Revision Date is blank, write: No Policy Revisions",
        "12) After relevant policies, include a section titled exactly: Relevant Student Handbook Guidance",
        "13) If handbook context exists, list each handbook item in its own block using these exact labels:",
        "Handbook Section:",
        "Handbook Guidance:",
        "14) If no handbook context is provided, write exactly: No matching handbook guidance found.",
        "15) Never output 'No matching handbook guidance found.' if one or more handbook blocks are provided.",
        "16) For Handbook Guidance, provide concise relevant summaries only (maximum 3 sentences each).",
        "17) Do not include action plans inside individual policy or handbook blocks.",
        "18) If state-law corpus or live state-law sources are provided, include a section titled exactly: Relevant State Law References",
        "19) In that section, list each source in its own block using these exact labels:",
        "State Law Source:",
        "State Law Citation:",
        "State Law URL:",
        "State Law Guidance:",
        "20) If no state-law context is provided, omit the state-law section.",
        "21) Always include the exact source URL in each state-law block.",
        "22) Never use outside legal claims not present in provided policy, handbook, state-law corpus, or live source context.",
        "23) Never include opening greeting text in the response.",
        "24) Never present legal advice. Always present guidance only.",
        "25) Do not reuse prior conversation content as factual evidence unless the user explicitly asks to reference it.",
        "26) If Query focus is handbook, prioritize handbook guidance and include only policy items that are clearly necessary.",
        "27) If Query focus is policy, prioritize policy items and include only handbook items that are clearly necessary.",
      ];

  return [
    "You are an assistant to a school district board of trustees.",
    "",
    ...scopeDirectives,
    ...styleDirective,
  ].join("\n");
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

function normalizeAssistantOutput(
  text: string,
  responseStyle: "direct_answer" | "action_guidance",
  stateLawOnly = false,
): string {
  let normalized = text.trim();

  normalized = normalized.replace(
    /^hello,\s*please tell me about a specific situation[\s\S]*?based on [^\n?]*district policies\??\s*/i,
    "",
  );

  normalized = normalized.replace(/^(?:[-]{3,}\s*)+/g, "");
  normalized = normalized.replace(
    /^\s*(?:Policy|Handbook(?: Guidance)?|State Law(?: Reference)?|Live State Law Source)\s+\d+\s*:?$/gim,
    "",
  );
  normalized = stripSummaryBoilerplate(normalized);
  normalized = stripContradictoryHandbookFallback(normalized);
  normalized = stripContradictoryStateLawFallback(normalized);
  normalized = stateLawOnly ? stripDistrictBlocksForStateLawOnly(normalized) : normalized;
  normalized = stripTrailingActionAndImplications(normalized, responseStyle);
  normalized = normalized.replace(/\n{3,}/g, "\n\n");

  return normalized.trim();
}

function stripSummaryBoilerplate(text: string): string {
  const cleanedLines = text.split("\n").map((line) => {
    let cleaned = line.replace(/\bThis is a summary of (?:the )?(?:policy|guidance)\.?/gi, "");
    cleaned = cleaned.replace(/\bThis is a summary\.?/gi, "");
    cleaned = cleaned.replace(/\s{2,}/g, " ");
    cleaned = cleaned.replace(/\s+([,.;:])/g, "$1");
    return cleaned.trimEnd();
  });

  return cleanedLines.join("\n").trim();
}

function stripContradictoryHandbookFallback(text: string): string {
  const hasHandbookBlocks = /(?:^|\n)\s*(?:[-*]\s*)?Handbook Section\s*:/i.test(text);
  if (!hasHandbookBlocks) {
    return text;
  }

  return text.replace(/^\s*No matching handbook guidance found\.\s*$/gim, "").trim();
}

function stripContradictoryStateLawFallback(text: string): string {
  const hasStateLawBlocks = /(?:^|\n)\s*(?:[-*]\s*)?State Law (?:Source|Citation|URL|Guidance)\s*:/i.test(
    text,
  );
  if (!hasStateLawBlocks) {
    return text;
  }

  return text
    .replace(/^\s*No matching state law references found\.\s*$/gim, "")
    .replace(/^\s*No matching state-law corpus guidance found\.\s*$/gim, "")
    .replace(/^\s*No live state-law sources found\.\s*$/gim, "")
    .trim();
}

function stripDistrictBlocksForStateLawOnly(text: string): string {
  const filteredLines = text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }

      if (
        /^(relevant policies|relevant student handbook guidance)\s*:?\s*$/i.test(trimmed) ||
        /^no matching district policy guidance found\.?$/i.test(trimmed) ||
        /^no matching handbook guidance found\.?$/i.test(trimmed)
      ) {
        return false;
      }

      if (
        /^(policy section|policy code|date of policy adoption date|date of policy revision date|policy status|policy title|policy wording)\s*:/i.test(
          trimmed,
        ) ||
        /^(handbook section|handbook guidance)\s*:/i.test(trimmed)
      ) {
        return false;
      }

      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return filteredLines;
}

function stripTrailingActionAndImplications(
  text: string,
  responseStyle: "direct_answer" | "action_guidance",
): string {
  if (responseStyle !== "direct_answer") {
    return text;
  }

  const firstActionIndex = text.search(
    /(?:^|\n)\s*(?:Action Steps:|Legal,\s*Ethical,\s*and\s*Academic Implications:)\s*/i,
  );
  if (firstActionIndex < 0) {
    return text;
  }

  return text.slice(0, firstActionIndex).trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function buildConversationHistoryContext(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const recentUserMessages = messages.filter((message) => message.role === "user").slice(-4);
  if (recentUserMessages.length === 0) {
    return "";
  }

  const lines = recentUserMessages.map(
    (message, index) => `${index + 1}. User: ${truncate(message.content, 380)}`,
  );

  return [
    "Prior user prompts (oldest to newest). Use only if directly relevant to the current scenario:",
    ...lines,
  ].join("\n");
}

function detectResponseStyle(scenario: string): "direct_answer" | "action_guidance" {
  const normalized = scenario.toLowerCase();
  const asksForAction =
    /\bwhat should (?:i|we) do\b|\bhow should (?:i|we) (?:respond|handle|proceed)\b|\baction plan\b|\bnext steps\b|\brecommend(?:ed)?\b|\bimplement\b|\bprotocol\b/.test(
      normalized,
    );

  return asksForAction ? "action_guidance" : "direct_answer";
}
