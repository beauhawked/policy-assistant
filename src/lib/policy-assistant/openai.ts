import OpenAI from "openai";

import type { HandbookRetrievalResult, RetrievalResult } from "@/lib/policy-assistant/types";

interface GeneratePolicyGuidanceInput {
  districtName: string;
  scenario: string;
  focus?: "policy" | "handbook" | "mixed";
  policies: RetrievalResult[];
  handbookGuidance?: HandbookRetrievalResult[];
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

  const response = await client.responses.create({
    model: process.env.POLICY_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini",
    temperature: 0.2,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildSystemPrompt(responseStyle),
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
              `Requested response style: ${responseStyle}`,
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

  return normalizeAssistantOutput(rawText, responseStyle);
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

function buildSystemPrompt(responseStyle: "direct_answer" | "action_guidance"): string {
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

  return [
    "You are an assistant to a school district board of trustees.",
    "",
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
    "10) Include this sentence in the policy wording summary: This is a summary of the policy",
    "11) If Date of Policy Revision Date is blank, write: No Policy Revisions",
    "12) After relevant policies, include a section titled exactly: Relevant Student Handbook Guidance",
    "13) If handbook context exists, list each handbook item in its own block using these exact labels:",
    "Handbook Section:",
    "Handbook Guidance:",
    "14) If no handbook context is provided, write exactly: No matching handbook guidance found.",
    "15) Never output 'No matching handbook guidance found.' if one or more handbook blocks are provided.",
    "16) For Handbook Guidance, provide concise relevant summaries only (maximum 3 sentences each).",
    "17) Do not include action plans inside individual policy or handbook blocks.",
    "18) Never include opening greeting text in the response.",
    "19) Never present legal advice. Always present guidance only.",
    "20) Do not reuse prior conversation content as factual evidence unless the user explicitly asks to reference it.",
    "21) If Query focus is handbook, prioritize handbook guidance and include only policy items that are clearly necessary.",
    "22) If Query focus is policy, prioritize policy items and include only handbook items that are clearly necessary.",
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
): string {
  let normalized = text.trim();

  normalized = normalized.replace(
    /^hello,\s*please tell me about a specific situation[\s\S]*?based on [^\n?]*district policies\??\s*/i,
    "",
  );

  normalized = normalized.replace(/^(?:[-]{3,}\s*)+/g, "");
  normalized = stripContradictoryHandbookFallback(normalized);
  normalized = stripTrailingActionAndImplications(normalized, responseStyle);

  return normalized.trim();
}

function stripContradictoryHandbookFallback(text: string): string {
  const hasHandbookBlocks = /(?:^|\n)\s*(?:[-*]\s*)?Handbook Section\s*:/i.test(text);
  if (!hasHandbookBlocks) {
    return text;
  }

  return text.replace(/^\s*No matching handbook guidance found\.\s*$/gim, "").trim();
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
