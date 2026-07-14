import OpenAI from "openai";

import type { HandbookRetrievalResult, RetrievalResult } from "@/lib/policy-assistant/types";

export type PolicyGuidanceResponseStyle = "direct_answer" | "action_guidance";

interface GeneratePolicyGuidanceInput {
  districtName: string;
  scenario: string;
  focus?: "policy" | "handbook" | "mixed";
  responseStyle?: PolicyGuidanceResponseStyle;
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
  const responseStyle = input.responseStyle ?? detectResponseStyle(input.scenario);
  const model = process.env.POLICY_ASSISTANT_MODEL?.trim() || "gpt-4.1-mini";

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
      `- Handbook Type: ${chunk.handbookType === "staff" ? "Staff" : "Student"}`,
      `- Handbook Section: ${chunk.sectionTitle || "Not listed"}`,
      `- Handbook Guidance: ${truncate(chunk.content, 1400) || "Not listed"}`,
      `- Relevance Score: ${chunk.relevanceScore}`,
    ].join("\n");
  });

  const userPrompt = [
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
    "Relevant handbook guidance from account uploads:",
    handbookContext.length > 0
      ? handbookContext.join("\n\n")
      : "No matching handbook guidance found.",
  ].join("\n");

  const response = await requestPolicyGuidance(client, model, responseStyle, userPrompt);

  const rawText = extractResponseText(response).trim();
  if (!rawText) {
    throw new Error("OpenAI returned an empty response.");
  }

  const normalized = normalizeAssistantOutput(rawText, responseStyle, input.focus ?? "mixed");
  if (responseStyle !== "action_guidance" || hasRequiredActionGuidanceSections(normalized)) {
    return normalized;
  }

  const correctedResponse = await requestPolicyGuidance(
    client,
    model,
    responseStyle,
    [
      userPrompt,
      "",
      "Required correction:",
      "This is an operational, multi-issue scenario. The response must include both an Action Steps: section and a Legal, Ethical, and Academic Implications: section after the policy and handbook summaries.",
    ].join("\n"),
  );
  const correctedText = extractResponseText(correctedResponse).trim();
  const corrected = normalizeAssistantOutput(
    correctedText,
    responseStyle,
    input.focus ?? "mixed",
  );

  if (!correctedText || !hasRequiredActionGuidanceSections(corrected)) {
    throw new Error("OpenAI omitted the required action guidance sections.");
  }

  return corrected;
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

async function requestPolicyGuidance(
  client: OpenAI,
  model: string,
  responseStyle: PolicyGuidanceResponseStyle,
  userPrompt: string,
): Promise<OpenAI.Responses.Response> {
  return client.responses.create({
    model,
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
            text: userPrompt,
          },
        ],
      },
    ],
  });
}

function buildSystemPrompt(responseStyle: PolicyGuidanceResponseStyle): string {
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
    "4a) If Query focus is handbook and no relevant policy context exists, you may omit the no-match policy line entirely.",
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
    "12) After relevant policies, include a section titled exactly: Relevant Handbook Guidance",
    "13) If handbook context exists, list each handbook item in its own block using these exact labels:",
    "Handbook Type:",
    "Handbook Section:",
    "Handbook Guidance:",
    "14) If no handbook context is provided, write exactly: No matching handbook guidance found.",
    "15) Never output 'No matching handbook guidance found.' if one or more handbook blocks are provided.",
    "16) For Handbook Guidance, provide concise relevant summaries only (maximum 3 sentences each).",
    "16a) When summarizing handbook content, use this exact sentence stem: This is a summary of the handbook guidance:",
    "16b) Never use the phrase 'This is a summary of the policy' inside handbook blocks.",
    "17) Do not include action plans inside individual policy or handbook blocks.",
    "18) Never include opening greeting text in the response.",
    "19) Never present legal advice. Always present guidance only.",
    "20) Do not reuse prior conversation content as factual evidence unless the user explicitly asks to reference it.",
    "21) If Query focus is handbook, prioritize handbook guidance and include only policy items that are clearly necessary.",
    "22) If Query focus is policy, prioritize policy items and include only handbook items that are clearly necessary.",
    "23) If a sub-issue in the scenario is not covered by the provided policy or handbook evidence, explicitly say the uploaded guidance does not address that sub-issue. Do not invent enforcement steps or procedural requirements for uncovered sub-issues.",
    "24) Do not mention IDEA, Section 504, FERPA, privacy laws, state law, federal law, manifestation determination, or other legal doctrines unless those exact concepts are supported by the provided policy or handbook evidence.",
    "25) In Action Steps, separate evidence-backed steps from uncertainty. If the uploaded materials do not clearly authorize a takedown request, social-media intervention, district-leadership notification, or legal escalation, say the uploaded guidance does not specifically address that step.",
    "26) Do not convert general school-administration best practices into mandatory requirements unless the provided evidence clearly states them.",
    "27) If the evidence only generally addresses discipline of students with disabilities, do not state that a manifestation determination is required unless the retrieved policy or handbook text explicitly supports that step. Instead say the uploaded guidance indicates additional disability-related procedures may apply and should be verified against the district's special education process.",
    "28) When a policy supplies a definition such as bullying, harassment, or substantial disobedience, do not say the facts definitively or likely satisfy the definition unless the retrieved evidence explicitly establishes each required element. Instead compare the facts to the policy elements and say further factual review is needed where necessary.",
    "29) Do not tell the user to notify district leadership, legal counsel, law enforcement, or outside agencies unless the retrieved policy or handbook evidence explicitly supports that escalation. If the uploaded guidance is silent, say so plainly.",
    "30) Do not name specific special education procedural steps, actors, meetings, or reviews unless the retrieved policy or handbook evidence explicitly supports them. If the evidence is general, say only that additional disability-related procedures may apply and should be verified through the district's special education process.",
    "31) Do not include any action step that starts with or implies 'notify district leadership', 'consult legal counsel', 'report to law enforcement', 'contact outside agencies', or similar escalation language unless the retrieved evidence explicitly supports that action.",
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
  responseStyle: PolicyGuidanceResponseStyle,
  focus: "policy" | "handbook" | "mixed",
): string {
  let normalized = text.trim();

  normalized = normalized.replace(
    /^hello,\s*please tell me about a specific situation[\s\S]*?based on [^\n?]*district policies\??\s*/i,
    "",
  );

  normalized = normalized.replace(/^(?:[-]{3,}\s*)+/g, "");
  normalized = stripContradictoryPolicyFallback(normalized, focus);
  normalized = stripContradictoryHandbookFallback(normalized);
  normalized = normalizeHandbookSummaryLanguage(normalized, focus);
  normalized = stripTrailingActionAndImplications(normalized, responseStyle);

  return normalized.trim();
}

function stripContradictoryPolicyFallback(
  text: string,
  focus: "policy" | "handbook" | "mixed",
): string {
  if (focus !== "handbook") {
    return text;
  }

  const hasHandbookBlocks = /(?:^|\n)\s*(?:[-*]\s*)?Handbook Section\s*:/i.test(text);
  if (!hasHandbookBlocks) {
    return text;
  }

  return text.replace(/^\s*No matching district policy guidance found\.\s*$/gim, "").trim();
}

function stripContradictoryHandbookFallback(text: string): string {
  const hasHandbookBlocks = /(?:^|\n)\s*(?:[-*]\s*)?Handbook Section\s*:/i.test(text);
  if (!hasHandbookBlocks) {
    return text;
  }

  return text.replace(/^\s*No matching handbook guidance found\.\s*$/gim, "").trim();
}

function normalizeHandbookSummaryLanguage(
  text: string,
  focus: "policy" | "handbook" | "mixed",
): string {
  if (focus !== "handbook") {
    return text;
  }

  return text.replace(
    /This is a summary of the policy/gi,
    "This is a summary of the handbook guidance",
  );
}

function stripTrailingActionAndImplications(
  text: string,
  responseStyle: PolicyGuidanceResponseStyle,
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

function hasRequiredActionGuidanceSections(text: string): boolean {
  return (
    /(?:^|\n)\s*(?:\*\*)?Action Steps\s*:?\s*(?:\*\*)?\s*(?:\n|$)/i.test(text) &&
    /(?:^|\n)\s*(?:\*\*)?Legal,\s*Ethical,\s*and\s*Academic Implications\s*:?\s*(?:\*\*)?\s*(?:\n|$)/i.test(
      text,
    )
  );
}

export function detectResponseStyle(scenario: string): PolicyGuidanceResponseStyle {
  const normalized = scenario.toLowerCase();
  const questionCount = scenario.match(/\?/g)?.length ?? 0;
  const asksForAction =
    /\bwhat should (?:i|we|the school|the district|the administrator) do\b|\bhow should (?:i|we|the school|the district|the administrator) (?:respond|handle|proceed|address)\b|\baction plan\b|\bnext steps\b|\bappropriate next steps\b|\bcourse of action\b|\brecommend(?:ed|ation|ations)?\b|\bimplement\b|\bprotocol\b|\bmust determine\b|\bwhat disciplinary consequences\b|\bwhat communication should occur\b|\bas the (?:building )?administrator\b/.test(
      normalized,
    ) ||
    (questionCount >= 2 &&
      /\bdisciplin|respond|procedure|compliance|communication|intervention|administrator|next step|action\b/.test(
        normalized,
      ));

  return asksForAction ? "action_guidance" : "direct_answer";
}
