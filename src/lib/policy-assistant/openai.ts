import OpenAI from "openai";

import type { RetrievalResult } from "@/lib/policy-assistant/types";

export const REQUIRED_DISCLAIMER =
  "**Please remember, that this is guidance and not legal advice and the user should consult their district attorney with any legal questions or concerns.**";

interface GeneratePolicyGuidanceInput {
  districtName: string;
  scenario: string;
  policies: RetrievalResult[];
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

let openaiClient: OpenAI | null = null;

export async function generatePolicyGuidance(input: GeneratePolicyGuidanceInput): Promise<string> {
  const client = getOpenAiClient();
  const historyContext = buildConversationHistoryContext(input.conversationHistory ?? []);

  const policyContext = input.policies.map((policy, index) => {
    const revisedDate = policy.revisedDate || "No Policy Revisions";
    const wording = truncate(policy.policyWording, 4000);

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

  const response = await client.responses.create({
    model: process.env.POLICY_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini",
    temperature: 0.2,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: buildSystemPrompt(),
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
              "",
              "Relevant policies from the uploaded district CSV:",
              policyContext.join("\n\n"),
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

  return ensureDisclaimer(normalizeAssistantOutput(rawText));
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

function buildSystemPrompt(): string {
  return [
    "You are an assistant to a school district board of trustees.",
    "",
    "Response requirements for each scenario:",
    "1) Use only the provided policy context and do not invent policy details.",
    "2) Start with a section titled exactly: Relevant Policies",
    "3) List each relevant policy in that section in its own standalone block.",
    "4) Start each policy block on a new line with this exact label: Policy Section:",
    "5) Include these labels exactly for each policy:",
    "Policy Section:",
    "Policy Code:",
    "Date of Policy Adoption Date:",
    "Date of Policy Revision Date:",
    "Policy Status:",
    "Policy Title:",
    "Policy Wording:",
    "6) If Date of Policy Revision Date is blank, write: No Policy Revisions",
    "7) If Policy Wording is summarized, include this sentence within that section:",
    "This is a summary of the policy",
    "8) Do not include action plans inside individual policy blocks.",
    "9) After all relevant policy blocks, include exactly one section titled: Action Steps:",
    "10) Action Steps must be one unified numbered plan that integrates all listed policies.",
    "11) Include a section titled: Legal, Ethical, and Academic Implications:",
    `12) End every response with this exact bold disclaimer: ${REQUIRED_DISCLAIMER}`,
    "13) Never include opening greeting text in the response.",
    "14) Never present legal advice. Always present guidance only.",
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

function ensureDisclaimer(text: string): string {
  if (text.includes(REQUIRED_DISCLAIMER)) {
    return text;
  }

  return `${text}\n\n${REQUIRED_DISCLAIMER}`;
}

function normalizeAssistantOutput(text: string): string {
  let normalized = text.trim();

  normalized = normalized.replace(
    /^hello,\s*please tell me about a specific situation[\s\S]*?based on [^\n?]*district policies\??\s*/i,
    "",
  );

  normalized = normalized.replace(/^(?:[-]{3,}\s*)+/g, "");

  return normalized.trim();
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
  if (messages.length === 0) {
    return "";
  }

  const lastMessages = messages.slice(-8);
  const lines = lastMessages.map((message, index) => {
    const role = message.role === "assistant" ? "Assistant" : "User";
    return `${index + 1}. ${role}: ${truncate(message.content, 1200)}`;
  });

  return ["Prior conversation context (oldest to newest):", ...lines].join("\n");
}
