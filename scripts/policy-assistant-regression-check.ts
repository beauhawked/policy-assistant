import assert from "node:assert/strict";

import {
  buildRetrievalScenario,
  isAdditionalActionFollowUp,
  shouldGroundInPreviousUserPrompt,
} from "../src/lib/policy-assistant/conversation-context";
import {
  buildConversationHistoryContext,
  buildSystemPrompt,
  detectResponseStyle,
  hasRequiredDirectAnswerSection,
  hasRequiredEvidenceBlocks,
} from "../src/lib/policy-assistant/openai";
import {
  parseNumberedSteps,
  stripMarkdownHeadingPrefix,
} from "../src/lib/policy-assistant/presentation";
import { getDeterministicScenarioSubQueries } from "../src/lib/policy-assistant/scenario-decomposition";

const scotScenario =
  "A second grade teacher called a parent and asked the parent to pick up a student with an IEP without informing the principal. What is wrong with this and how should the principal address it?";
const scotFollowUp = "You didn't give practical steps or discuss the removal of the student.";
const backgroundCheck =
  "Do I have to pay for this employee's background check? They've been employed here for 5 years?";
const genericFollowUp = "What are your recommend actions?";
const additionalStepsFollowUp = "Are there any additional steps you would recommend?";

assert.equal(detectResponseStyle(scotScenario), "action_guidance");
assert.equal(detectResponseStyle(scotFollowUp), "action_guidance");
assert.equal(detectResponseStyle(genericFollowUp), "action_guidance");
assert.equal(detectResponseStyle(additionalStepsFollowUp), "action_guidance");
assert.equal(detectResponseStyle(backgroundCheck), "direct_answer");

assert.equal(shouldGroundInPreviousUserPrompt(genericFollowUp), true);
assert.equal(shouldGroundInPreviousUserPrompt(scotFollowUp), true);
assert.equal(shouldGroundInPreviousUserPrompt(additionalStepsFollowUp), true);
assert.equal(shouldGroundInPreviousUserPrompt(backgroundCheck), false);
assert.equal(isAdditionalActionFollowUp(additionalStepsFollowUp), true);

const groundedBackgroundFollowUp = buildRetrievalScenario(genericFollowUp, [
  { role: "user", content: backgroundCheck },
  { role: "assistant", content: "Prior answer" },
]);
assert.match(groundedBackgroundFollowUp, /background check/i);
assert.match(groundedBackgroundFollowUp, /current follow-up/i);

const groundedAdditionalSteps = buildRetrievalScenario(additionalStepsFollowUp, [
  { role: "user", content: scotScenario },
  { role: "assistant", content: "1. Review the incident. 2. Apply due process." },
]);
assert.match(groundedAdditionalSteps, /second grade teacher/i);
assert.match(groundedAdditionalSteps, /additional steps/i);

const additionalStepsHistory = buildConversationHistoryContext(
  [
    { role: "user", content: scotScenario },
    { role: "assistant", content: "1. Review the incident. 2. Apply due process." },
  ],
  additionalStepsFollowUp,
);
assert.match(additionalStepsHistory, /assistant response for continuity only/i);
assert.match(additionalStepsHistory, /avoid unnecessary repetition/i);

const directPrompt = buildSystemPrompt("direct_answer");
assert.match(directPrompt, /Start with a section titled exactly: Direct Answer:/);
assert.match(directPrompt, /what remains unanswered/i);
assert.equal(hasRequiredDirectAnswerSection("## Direct Answer:\nThe policy is silent."), true);
assert.equal(
  hasRequiredEvidenceBlocks(
    "Policy Section: 5000 Students\nHandbook Section: Attendance Policy",
    1,
    1,
  ),
  true,
);
assert.equal(
  hasRequiredEvidenceBlocks(
    "Policy Section: 5000 Students\nNo matching handbook guidance found.",
    1,
    1,
  ),
  false,
);

const actionPrompt = buildSystemPrompt("action_guidance");
assert.match(actionPrompt, /one continuous numbered list/i);
assert.match(actionPrompt, /Do not add internal subsection headings/i);
assert.match(actionPrompt, /only genuinely additional policy-grounded steps/i);
assert.doesNotMatch(actionPrompt, /takedown request|social-media intervention/i);

assert.equal(stripMarkdownHeadingPrefix("## Direct Answer:"), "Direct Answer:");

const removalQueries = getDeterministicScenarioSubQueries(scotScenario);
assert.ok(removalQueries.length >= 3);
assert.ok(removalQueries.some((query) => /removal from instruction/i.test(query)));
assert.ok(removalQueries.some((query) => /IEP or disability/i.test(query)));
assert.ok(removalQueries.some((query) => /administrative approval/i.test(query)));

const parsedSteps = parseNumberedSteps(`
## Action Steps:
**Evidence-backed steps**
1. Review the available records.
2. Apply the cited policy.
Uncertainty
The uploaded materials do not establish who pays.
`);
assert.deepEqual(parsedSteps, [
  "Review the available records.",
  "Apply the cited policy.",
  "Uncertainty: The uploaded materials do not establish who pays.",
]);

console.log("Policy assistant regression checks passed.");
