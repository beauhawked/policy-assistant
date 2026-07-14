import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

/**
 * Retrieval benchmark harness.
 *
 * Runs a fixed set of realistic administrator scenarios through the retrieval
 * pipeline in each mode (lexical, semantic, hybrid) and writes a side-by-side
 * markdown report plus a raw JSON snapshot. Run it once before the embedding
 * backfill (semantic columns will be empty — that is the baseline) and again
 * after, using the same scenarios, to document the improvement.
 *
 * Usage:
 *   npm run retrieval-eval               (uses the most recently uploaded dataset)
 *   npm run retrieval-eval -- --email you@example.com
 */

const SCENARIOS: Array<{ id: string; title: string; scenario: string }> = [
  {
    id: "fight-video",
    title: "Hallway fight recorded and shared",
    scenario:
      "Two eighth grade students got into a physical fight in the hallway during passing period. Several students recorded the fight on their phones and one clip is circulating on social media. One student has a bloody nose and the school nurse is treating him. What should I do as the building administrator?",
  },
  {
    id: "dress-code",
    title: "Repeated dress code violation",
    scenario:
      "A high school student has come to school three days in a row wearing a shirt with profanity on it. The teacher sent the student to my office. The parent says we are violating the student's free speech rights. What do our policies say and what steps should I take?",
  },
  {
    id: "truancy",
    title: "Chronic absence and truancy",
    scenario:
      "A seventh grader has missed 14 days of school this semester and many are unexcused. Mom says the absences are because of a custody dispute. At what point are we required to act on truancy and what does the attendance policy require?",
  },
  {
    id: "iep-discipline",
    title: "Discipline of a student with an IEP",
    scenario:
      "A student with an IEP for emotional disability threw a chair at a teacher and we are considering suspension. He has already been suspended 8 days this year. What do our policies require before we can suspend him again?",
  },
  {
    id: "records-request",
    title: "Non-custodial parent records request",
    scenario:
      "A non-custodial parent is demanding copies of his daughter's report cards, discipline records, and counseling notes. The custodial parent told the front office not to release anything to him. Who is entitled to student records in this situation?",
  },
  {
    id: "staff-leave",
    title: "Staff member subpoenaed during school day",
    scenario:
      "One of my teachers received a subpoena to appear in court next Tuesday as a witness. She wants to know if this counts against her personal days and whether the district pays for court appearances. What leave applies?",
  },
  {
    id: "phone-search",
    title: "Searching a confiscated phone",
    scenario:
      "A teacher confiscated a phone because a student was texting during a test. Another student claims there are photos on that phone taken in the locker room. Am I allowed to search the phone, and what is the process?",
  },
  {
    id: "social-media-threat",
    title: "Off-campus social media threat",
    scenario:
      "Over the weekend a student posted a photo of an airsoft gun with a caption naming our school and saying 'Monday is going to be interesting.' Parents are calling. The post was made off campus and outside school hours. What authority do we have and what steps should we take?",
  },
  {
    id: "medication-field-trip",
    title: "Medication on a field trip",
    scenario:
      "A fourth grade class is going on an overnight field trip and one student needs insulin injections and another carries an EpiPen. The parent volunteer chaperone is a nurse but not employed by the district. Who can administer medication on the trip and what does policy require?",
  },
  {
    id: "bus-bullying",
    title: "Bullying on the school bus",
    scenario:
      "A parent reports her sixth grade son is being called slurs and shoved every day on the bus by the same group of students. The bus driver says he hasn't seen anything. The boy is now refusing to ride the bus. What are we required to do under our bullying policy?",
  },
];

const MODES = ["lexical", "semantic", "hybrid"] as const;
type Mode = (typeof MODES)[number];

interface ModeResult {
  mode: Mode;
  effectiveMode: string;
  policies: Array<{ id: number; code: string; title: string; score: number }>;
  handbook: Array<{ id: number; type: string; section: string; score: number }>;
  durationMs: number;
}

interface ScenarioReport {
  id: string;
  title: string;
  scenario: string;
  results: ModeResult[];
}

function parseArgs(argv: string[]): { email?: string } {
  const args: { email?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--email") {
      args.email = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const { Pool } = await import("pg");
  const { prepareRetrievalContext, retrievePoliciesWithMode, retrieveHandbookGuidanceWithMode } =
    await import("../src/lib/policy-assistant/hybrid-retrieval");
  const { getEmbeddingCoverage } = await import("../src/lib/policy-assistant/db");

  const connectionString =
    process.env.POLICY_ASSISTANT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("No database URL configured in .env.local.");
  }

  const schema = process.env.POLICY_ASSISTANT_DB_SCHEMA?.trim();
  const discoveryPool = new Pool({ connectionString });

  const schemaPrefix = schema && /^[A-Za-z_][A-Za-z0-9_]*$/.test(schema) ? `"${schema}".` : "";
  const datasetQuery = args.email
    ? `
      SELECT u.id AS user_id, u.email, d.id AS dataset_id, d.title, d.policy_count
      FROM ${schemaPrefix}users u
      JOIN ${schemaPrefix}policy_datasets d ON d.user_id = u.id
      WHERE u.email = $1 AND d.archived_at IS NULL
      ORDER BY d.uploaded_at DESC
      LIMIT 1
      `
    : `
      SELECT u.id AS user_id, u.email, d.id AS dataset_id, d.title, d.policy_count
      FROM ${schemaPrefix}users u
      JOIN ${schemaPrefix}policy_datasets d ON d.user_id = u.id
      WHERE d.archived_at IS NULL
      ORDER BY d.uploaded_at DESC
      LIMIT 1
      `;

  const discovery = await discoveryPool.query(
    datasetQuery,
    args.email ? [args.email] : [],
  );
  await discoveryPool.end();

  if (discovery.rows.length === 0) {
    throw new Error(
      args.email
        ? `No active policy dataset found for ${args.email}.`
        : "No active policy dataset found. Upload a policy CSV first.",
    );
  }

  const { user_id: userId, email, dataset_id: datasetId, title, policy_count: policyCount } =
    discovery.rows[0];

  const coverage = await getEmbeddingCoverage();

  console.log("Policy to Action — retrieval benchmark");
  console.log("=======================================");
  console.log(`Account: ${email}`);
  console.log(`Dataset: ${title} (${policyCount} policies)`);
  console.log(
    `Embedding coverage: policies ${coverage.policiesEmbedded}/${coverage.policiesTotal}, ` +
      `handbook chunks ${coverage.handbookChunksEmbedded}/${coverage.handbookChunksTotal}`,
  );
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log("");

  const reports: ScenarioReport[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`Running: ${scenario.title}`);
    const results: ModeResult[] = [];

    for (const mode of MODES) {
      process.env.POLICY_ASSISTANT_RETRIEVAL_MODE = mode;
      const startedAt = performance.now();
      const context = await prepareRetrievalContext(scenario.scenario);
      const [policyBundle, handbookBundle] = await Promise.all([
        retrievePoliciesWithMode(userId, datasetId, scenario.scenario, context, { limit: 5 }),
        retrieveHandbookGuidanceWithMode(userId, scenario.scenario, context, { limit: 4 }),
      ]);
      const durationMs = Math.round(performance.now() - startedAt);

      results.push({
        mode,
        effectiveMode: context.mode,
        policies: policyBundle.policies.map((policy) => ({
          id: policy.id,
          code: policy.policyCode,
          title: policy.policyTitle,
          score: policy.relevanceScore,
        })),
        handbook: handbookBundle.guidance.map((chunk) => ({
          id: chunk.id,
          type: chunk.handbookType,
          section: chunk.sectionTitle,
          score: chunk.relevanceScore,
        })),
        durationMs,
      });
    }

    reports.push({ id: scenario.id, title: scenario.title, scenario: scenario.scenario, results });
  }

  const stamp = new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\..*$/, "");
  const outDir = resolve(process.cwd(), "eval-results");
  mkdirSync(outDir, { recursive: true });

  const jsonPath = resolve(outDir, `retrieval-eval-${stamp}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: stamp, coverage, account: email, dataset: title, reports }, null, 2),
  );

  const markdown = buildMarkdownReport(String(email), String(title), coverage, reports, stamp);
  const mdPath = resolve(outDir, `retrieval-eval-${stamp}.md`);
  writeFileSync(mdPath, markdown);

  console.log("");
  console.log(`Markdown report: ${mdPath}`);
  console.log(`Raw JSON:        ${jsonPath}`);
  process.exit(0);
}

function buildMarkdownReport(
  email: string,
  dataset: string,
  coverage: {
    policiesTotal: number;
    policiesEmbedded: number;
    handbookChunksTotal: number;
    handbookChunksEmbedded: number;
  },
  reports: ScenarioReport[],
  stamp: string,
): string {
  const lines: string[] = [];
  lines.push(`# Retrieval Benchmark Report`);
  lines.push("");
  lines.push(`Generated: ${stamp}`);
  lines.push(`Account: ${email}`);
  lines.push(`Dataset: ${dataset}`);
  lines.push(
    `Embedding coverage: policies ${coverage.policiesEmbedded}/${coverage.policiesTotal}, ` +
      `handbook chunks ${coverage.handbookChunksEmbedded}/${coverage.handbookChunksTotal}`,
  );
  lines.push("");

  for (const report of reports) {
    lines.push(`## ${report.title}`);
    lines.push("");
    lines.push(`Scenario: ${report.scenario}`);
    lines.push("");

    for (const result of report.results) {
      const modeLabel =
        result.mode === result.effectiveMode
          ? result.mode
          : `${result.mode} (fell back to ${result.effectiveMode})`;
      lines.push(`### Mode: ${modeLabel} (${result.durationMs} ms)`);
      lines.push("");
      lines.push(`Policies:`);
      lines.push("");
      if (result.policies.length === 0) {
        lines.push(`(none returned)`);
      } else {
        lines.push(`| Rank | Code | Title | Score |`);
        lines.push(`| --- | --- | --- | --- |`);
        result.policies.forEach((policy, index) => {
          lines.push(
            `| ${index + 1} | ${policy.code || "-"} | ${policy.title || "-"} | ${policy.score} |`,
          );
        });
      }
      lines.push("");
      lines.push(`Handbook guidance:`);
      lines.push("");
      if (result.handbook.length === 0) {
        lines.push(`(none returned)`);
      } else {
        lines.push(`| Rank | Handbook | Section | Score |`);
        lines.push(`| --- | --- | --- | --- |`);
        result.handbook.forEach((chunk, index) => {
          lines.push(
            `| ${index + 1} | ${chunk.type} | ${chunk.section || "-"} | ${chunk.score} |`,
          );
        });
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

main().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
