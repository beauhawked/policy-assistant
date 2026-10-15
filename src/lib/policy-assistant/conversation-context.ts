export interface PolicyConversationContextMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Short follow-up prompts need the immediately preceding user request to
 * retrieve the right policies. The prior request is context only. It is never
 * policy evidence and is not saved as part of the new user message.
 */
export function buildRetrievalScenario(
  scenario: string,
  history: PolicyConversationContextMessage[],
): string {
  const current = scenario.trim();
  if (!current || !shouldGroundInPreviousUserPrompt(current)) {
    return current;
  }

  const previousUserPrompt = [...history]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim())
    ?.content.trim();

  if (!previousUserPrompt) {
    return current;
  }

  return [
    `Immediately preceding user request: ${truncateContext(previousUserPrompt, 1200)}`,
    `Current follow-up: ${current}`,
  ].join("\n");
}

export function shouldGroundInPreviousUserPrompt(scenario: string): boolean {
  const normalized = scenario.toLowerCase().replace(/\s+/g, " ").trim();
  const wordCount = normalized.split(" ").filter(Boolean).length;

  const genericActionFollowUp =
    /^(?:what|which) (?:are|is) (?:your |the )?(?:recommend(?:ed)? |suggested )?(?:action|actions|step|steps|next steps)(?: should .+)?[?.!]*$/i.test(
      normalized,
    ) ||
    /^(?:what should (?:i|we|they) do(?: next)?|how should (?:i|we|they) (?:respond|proceed|handle|address)(?: this| that| it)?)[?.!]*$/i.test(
      normalized,
    );

  const correctionOrExpansion =
    /^(?:you (?:didn't|did not|haven't|have not)|that (?:didn't|did not|doesn't|does not)|please (?:clarify|expand|explain|answer)|can you (?:clarify|expand|explain)|what about|how about)\b/i.test(
      normalized,
    );

  const additionalActionFollowUp = isAdditionalActionFollowUp(normalized);

  const shortAnaphoricFollowUp =
    wordCount <= 14 &&
    /\b(?:this|that|it|they|them|those|these|same|former|latter)\b/i.test(normalized) &&
    !/\b(?:background check|iep|student|employee|teacher|principal|superintendent|suspension|expulsion|policy|handbook|records?|bully|harass|attendance|leave|privacy)\b/i.test(
      normalized,
    );

  return (
    genericActionFollowUp ||
    additionalActionFollowUp ||
    correctionOrExpansion ||
    shortAnaphoricFollowUp
  );
}

export function isAdditionalActionFollowUp(scenario: string): boolean {
  const normalized = scenario.toLowerCase().replace(/\s+/g, " ").trim();

  return (
    /\b(?:additional|other|more|further)\s+(?:(?:recommended|suggested)\s+)?(?:actions?|steps?|next steps?)\b/i.test(
      normalized,
    ) ||
    /\b(?:actions?|steps?)\b[^?.!]{0,80}\b(?:recommend|suggest)(?:ed|s|ing|ation|ations)?\b/i.test(
      normalized,
    )
  );
}

function truncateContext(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}
