import assert from "node:assert/strict";

import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();
const withModel = process.argv.includes("--with-model");
if (!withModel) {
  process.env.POLICY_ASSISTANT_RETRIEVAL_MODE = "lexical";
}

interface PilotCase {
  id: string;
  districtName: string;
  scenario: string;
  expectedStyle: "direct_answer" | "action_guidance";
}

const PILOT_CASES: PilotCase[] = [
  {
    id: "shakamak-background-check",
    districtName: "MSD of Shakamak",
    scenario:
      "Do I have to pay for this employee's background check? They've been employed here for 5 years?",
    expectedStyle: "direct_answer",
  },
  {
    id: "bloomfield-iep-pickup",
    districtName: "Bloomfield School District",
    scenario:
      "A second grade teacher called a parent and asked the parent to pick up a student who was struggling. The student has an IEP, and the teacher did not inform the principal. What issues does this cause and how should the principal address it?",
    expectedStyle: "action_guidance",
  },
];
const requestedCaseId = process.argv
  .find((argument) => argument.startsWith("--case="))
  ?.slice("--case=".length);
const selectedPilotCases = requestedCaseId
  ? PILOT_CASES.filter((pilotCase) => pilotCase.id === requestedCaseId)
  : PILOT_CASES;

if (requestedCaseId && selectedPilotCases.length === 0) {
  throw new Error(`Unknown pilot case: ${requestedCaseId}`);
}

async function main(): Promise<void> {
  const { Pool } = await import("pg");
  const { prepareRetrievalContext, retrieveHandbookGuidanceWithMode, retrievePoliciesWithMode } =
    await import("../src/lib/policy-assistant/hybrid-retrieval");
  const {
    detectResponseStyle,
    generatePolicyGuidance,
    hasRequiredDirectAnswerSection,
  } = await import("../src/lib/policy-assistant/openai");
  const {
    detectDetailedIntent,
    filterPortableHandbookMismatches,
    filterPortablePolicyMismatches,
  } = await import("../src/lib/policy-assistant/scenario-intent");

  const connectionString =
    process.env.POLICY_ASSISTANT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("No database URL configured in .env.local.");
  }

  const schema = process.env.POLICY_ASSISTANT_DB_SCHEMA?.trim();
  if (!schema || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error("POLICY_ASSISTANT_DB_SCHEMA is missing or invalid.");
  }

  const pool = new Pool({ connectionString });
  const schemaPrefix = `"${schema}".`;

  try {
    for (const pilotCase of selectedPilotCases) {
      const datasetResult = await pool.query(
        `
          SELECT u.id AS user_id, d.id AS dataset_id, d.district_name
          FROM ${schemaPrefix}users u
          JOIN ${schemaPrefix}policy_datasets d ON d.user_id = u.id
          WHERE lower(d.district_name) = lower($1)
            AND d.archived_at IS NULL
          ORDER BY d.uploaded_at DESC
          LIMIT 1
        `,
        [pilotCase.districtName],
      );
      assert.equal(datasetResult.rows.length, 1, `Active dataset missing for ${pilotCase.districtName}`);

      const { user_id: userId, dataset_id: datasetId } = datasetResult.rows[0];
      const retrievalContext = await prepareRetrievalContext(pilotCase.scenario);
      const [policyBundle, handbookBundle] = await Promise.all([
        retrievePoliciesWithMode(userId, datasetId, pilotCase.scenario, retrievalContext, {
          limit: 8,
        }),
        retrieveHandbookGuidanceWithMode(userId, pilotCase.scenario, retrievalContext, {
          limit: 8,
        }),
      ]);

      const detailedIntent = detectDetailedIntent(pilotCase.scenario);
      const policies = filterPortablePolicyMismatches(
        policyBundle.policies,
        pilotCase.scenario,
        detailedIntent,
      );
      const handbookGuidance = filterPortableHandbookMismatches(
        handbookBundle.guidance,
        pilotCase.scenario,
        detailedIntent,
      );

      assert.ok(
        policies.length + handbookGuidance.length > 0,
        `No evidence retrieved for ${pilotCase.id}`,
      );
      assert.equal(detectResponseStyle(pilotCase.scenario), pilotCase.expectedStyle);

      const retrievedTitles = policies.map((policy) => policy.policyTitle).join(" | ");
      if (pilotCase.id === "shakamak-background-check") {
        assert.match(retrievedTitles, /background|criminal|employment/i);
      }
      if (pilotCase.id === "bloomfield-iep-pickup") {
        assert.match(retrievedTitles, /suspension|discipline|student conduct/i);
        assert.match(retrievedTitles, /disabilit|special education|section 504/i);
      }

      console.log(`\nPASS ${pilotCase.id}`);
      console.log(`Policies: ${policies.map((policy) => policy.policyTitle).join(" | ")}`);
      console.log(`Handbooks: ${handbookGuidance.map((chunk) => chunk.sectionTitle).join(" | ")}`);

      if (withModel) {
        const answer = await generatePolicyGuidance({
          districtName: pilotCase.districtName,
          scenario: pilotCase.scenario,
          focus: "mixed",
          responseStyle: pilotCase.expectedStyle,
          policies,
          handbookGuidance,
        });

        if (pilotCase.expectedStyle === "direct_answer") {
          assert.equal(hasRequiredDirectAnswerSection(answer), true);
          assert.doesNotMatch(answer, /(?:^|\n)\s*(?:#{1,6}\s*)?Action Steps\s*:/i);
        } else {
          assert.match(answer, /(?:^|\n)\s*(?:#{1,6}\s*)?Action Steps\s*:/i);
          assert.match(
            answer,
            /(?:^|\n)\s*(?:#{1,6}\s*)?Legal,\s*Ethical,\s*and\s*Academic Implications\s*:/i,
          );
          assert.doesNotMatch(answer, /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?Evidence-backed steps(?:\*\*)?\s*:?[ \t]*(?:\n|$)/i);
          if (!/\bsocial media\b/i.test(pilotCase.scenario)) {
            assert.doesNotMatch(answer, /\bsocial media\b/i);
          }
        }

        console.log("Generated answer:");
        console.log(answer);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
