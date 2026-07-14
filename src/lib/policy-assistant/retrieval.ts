import {
  searchDatasetPolicies,
  searchDatasetPolicyCandidates,
  searchHandbookChunks,
  searchHandbookChunkCandidates,
} from "@/lib/policy-assistant/db";
import type {
  HandbookSearchCandidate,
  HandbookRetrievalResult,
  HandbookType,
  PolicySearchCandidate,
  RetrievalResult,
  StoredHandbookChunk,
  StoredPolicy,
} from "@/lib/policy-assistant/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "any",
  "be",
  "been",
  "being",
  "but",
  "by",
  "because",
  "can",
  "could",
  "did",
  "do",
  "done",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "hers",
  "him",
  "his",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "might",
  "not",
  "of",
  "one",
  "on",
  "or",
  "own",
  "that",
  "the",
  "she",
  "should",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "will",
  "with",
  "would",
  "does",
  "expect",
  "expected",
  "your",
  "ours",
]);

const DOMAIN_GENERIC_TERMS = new Set([
  "school",
  "schools",
  "district",
  "student",
  "students",
  "policy",
  "policies",
  "handbook",
  "handbooks",
  "guidance",
  "procedure",
  "procedures",
  "tell",
  "what",
  "about",
  "our",
  "say",
  "says",
  "question",
  "regarding",
  "board",
  "code",
  "legal",
  "recourse",
  "violation",
  "violations",
]);

const LOW_SIGNAL_NARRATIVE_TERMS = new Set([
  "about",
  "above",
  "across",
  "after",
  "again",
  "around",
  "assistant",
  "became",
  "become",
  "began",
  "behind",
  "both",
  "building",
  "based",
  "ability",
  "anytype",
  "any type",
  "camera",
  "case",
  "cafeteria",
  "children",
  "calls",
  "challenges",
  "clip",
  "clips",
  "complicating",
  "demands",
  "documented",
  "either",
  "engaged",
  "concerned",
  "further",
  "hallway",
  "hour",
  "immediate",
  "immediately",
  "incident",
  "initial",
  "intends",
  "injury",
  "injurys",
  "intervenes",
  "involved",
  "locker",
  "main",
  "middle",
  "minor",
  "move",
  "moves",
  "moving",
  "mocking",
  "notified",
  "nurse",
  "office",
  "outside",
  "parent",
  "parents",
  "passing",
  "peers",
  "period",
  "phones",
  "physical",
  "punches",
  "push",
  "pushing",
  "received",
  "receives",
  "recorded",
  "report",
  "reported",
  "reports",
  "responded",
  "reviewing",
  "separate",
  "separates",
  "serious",
  "several",
  "sharing",
  "sustains",
  "teacher",
  "teachers",
  "throughout",
  "two",
  "video",
  "videos",
  "within",
]);

const STUDENT_CONTEXT_TERMS = ["student", "students", "pupil", "pupils"];
const ATTENDANCE_TERMS = ["attendance", "absence", "absences", "absent", "truancy", "tardy", "excused"];
const RECORDS_TERMS = ["record", "records", "retention", "ferpa", "privacy", "confidential"];
const LEAVE_TERMS = [
  "leave",
  "vacation",
  "sick",
  "personal leave",
  "medical",
  "bereavement",
  "subpoena",
  "jury duty",
  "fmla",
];

export interface RetrievalBundle {
  terms: string[];
  policies: RetrievalResult[];
}

export interface HandbookRetrievalBundle {
  terms: string[];
  guidance: HandbookRetrievalResult[];
}

export interface PostgresRetrievalComparison {
  query: string;
  terms: string[];
  policies: PolicySearchCandidate[];
  handbookGuidance: HandbookSearchCandidate[];
}

interface PolicyRankingCandidate extends StoredPolicy {
  lexicalRank: number;
}

interface HandbookRankingCandidate extends StoredHandbookChunk {
  lexicalRank: number;
}

const POLICY_LEXICAL_SCORE_CAP = 12;
const HANDBOOK_LEXICAL_SCORE_CAP = 10;

export function retrieveRelevantPolicies(
  userId: string,
  datasetId: string,
  scenario: string,
  options?: { limit?: number },
): Promise<RetrievalBundle> {
  const terms = extractSearchTerms(scenario);
  const intent = detectIntent(scenario);
  return buildRetrievalBundle(userId, datasetId, scenario, terms, intent, options);
}

export function retrieveRelevantHandbookGuidance(
  userId: string,
  scenario: string,
  options?: { limit?: number },
): Promise<HandbookRetrievalBundle> {
  const terms = extractSearchTerms(scenario);
  const intent = detectIntent(scenario);
  const handbookTypes = selectRelevantHandbookTypes(scenario);
  return buildHandbookRetrievalBundle(userId, scenario, terms, intent, handbookTypes, options);
}

export async function retrievePostgresCandidateComparison(
  userId: string,
  datasetId: string,
  scenario: string,
  options?: { policyLimit?: number; handbookLimit?: number },
): Promise<PostgresRetrievalComparison> {
  const terms = extractSearchTerms(scenario);
  const query = buildPostgresCandidateQuery(scenario, terms);
  if (!query) {
    return {
      query: "",
      terms,
      policies: [],
      handbookGuidance: [],
    };
  }

  const handbookTypes = selectRelevantHandbookTypes(scenario);
  const policyLimit =
    options?.policyLimit && options.policyLimit > 0 ? Math.min(options.policyLimit, 30) : 12;
  const handbookLimit =
    options?.handbookLimit && options.handbookLimit > 0 ? Math.min(options.handbookLimit, 30) : 12;

  const [policies, handbookGuidance] = await Promise.all([
    searchDatasetPolicyCandidates(userId, datasetId, query, { limit: policyLimit }),
    searchHandbookChunkCandidates(userId, query, {
      limit: handbookLimit,
      handbookTypes,
    }),
  ]);

  return {
    query,
    terms,
    policies,
    handbookGuidance,
  };
}

async function buildRetrievalBundle(
  userId: string,
  datasetId: string,
  scenario: string,
  terms: string[],
  intent: RetrievalIntent,
  options?: { limit?: number },
): Promise<RetrievalBundle> {
  const candidates = await loadPolicyCandidates(userId, datasetId, scenario, terms);
  const scored = scorePolicies(candidates, scenario, terms, intent);
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 12) : 6;
  const threshold = getPolicyThreshold(intent);
  const strongMatches = scored.filter((policy) => policy.relevanceScore >= threshold);
  const weakMatches = scored.filter((policy) => policy.relevanceScore > 0);
  const strictIntent =
    !intent.multiIssueScenario && (intent.dress || intent.attendance || intent.records || intent.leave);
  const filteredStrong = strongMatches.filter((policy) => isPolicyIntentMatch(policy, intent));
  const filteredWeak = weakMatches.filter((policy) => isPolicyIntentMatch(policy, intent));
  const relevant = strictIntent
    ? filteredStrong.length > 0
      ? filteredStrong
      : filteredWeak.slice(0, 1)
    : filteredStrong.length > 0
      ? filteredStrong
      : filteredWeak.slice(0, 2);
  const refined = refinePolicyResults(relevant, intent);

  return {
    terms,
    policies: refined.slice(0, limit),
  };
}

async function loadPolicyCandidates(
  userId: string,
  datasetId: string,
  scenario: string,
  terms: string[],
): Promise<PolicyRankingCandidate[]> {
  const postgresQuery = buildPostgresCandidateQuery(scenario, terms);
  const [legacyCandidates, postgresCandidates] = await Promise.all([
    searchDatasetPolicies(userId, datasetId, terms, { limit: 1200 }),
    postgresQuery
      ? searchDatasetPolicyCandidates(userId, datasetId, postgresQuery, { limit: 120 })
      : Promise.resolve([] as PolicySearchCandidate[]),
  ]);

  return mergePolicyCandidates(legacyCandidates, postgresCandidates);
}

function scorePolicies(
  policies: PolicyRankingCandidate[],
  scenario: string,
  terms: string[],
  intent: RetrievalIntent,
): RetrievalResult[] {
  const scenarioLower = scenario.toLowerCase();
  const policyCodeMatches = extractLikelyPolicyCodes(scenarioLower);
  const topLexicalRank = getTopLexicalRank(policies);

  const scored = policies.map((policy) => {
    const section = policy.policySection.toLowerCase();
    const code = policy.policyCode.toLowerCase();
    const title = policy.policyTitle.toLowerCase();
    const wording = policy.policyWording.toLowerCase();
    const combined = `${section} ${title} ${wording}`;
    const hasDressContext = hasDressSignal(combined);
    const hasDressCodePhrase = /\bdress\s+code\b/.test(combined);
    const inStudentSection = /\b5000\b/.test(section);
    const inProgramSection = /\b2000\b/.test(section);
    const studentDisciplineScenario = intent.studentRequested && intent.disciplineRequested;
    const studentSpecialEdScenario = intent.studentRequested && intent.specialEducation;
    let score = 0;

    for (const codeMatch of policyCodeMatches) {
      if (code.includes(codeMatch)) {
        score += 12;
      }
    }

    for (const term of terms) {
      if (containsSearchTerm(title, term)) {
        score += 6;
      }
      if (containsSearchTerm(section, term) || containsSearchTerm(code, term)) {
        score += 4;
      }
      if (containsSearchTerm(wording, term)) {
        score += 2;
      }
    }

    const hasStudentContext = containsAny(combined, STUDENT_CONTEXT_TERMS);
    const isStaffPolicy =
      /\b(1000|3000|4000)\b/.test(section) ||
      /\bstaff\b|\badministration\b|\bprofessional staff\b|\bsupport staff\b/.test(title);
    const isEmploymentPolicy =
      title.includes("employment") ||
      wording.includes("employment") ||
      /\bin employment\b/.test(combined);

    if (intent.dress) {
      if (hasDressContext) {
        score += 5;
      }

      if (hasDressCodePhrase) {
        score += 6;
      }

      const hasViolationContext =
        combined.includes("violation") ||
        combined.includes("discipline") ||
        combined.includes("consequence");
      if (hasViolationContext) {
        score += 3;
      }

      if (!intent.staffRequested && isStaffPolicy) {
        score -= 28;
      }

      if (!hasDressContext) {
        score -= intent.disciplineRequested ? 10 : 24;
      }

      if (
        !intent.disciplineRequested &&
        (combined.includes("suspension") ||
          combined.includes("expulsion") ||
          combined.includes("court assisted resolution"))
      ) {
        score -= 14;
      }

      if (hasStudentContext) {
        score += 4;
      }

      if (title.includes("dress and appearance") && hasStudentContext) {
        score += 4;
      }
    }

    if (intent.attendance && containsAny(combined, ATTENDANCE_TERMS)) {
      score += 5;
    }

    if (intent.records && containsAny(combined, RECORDS_TERMS)) {
      score += 5;
    }

    if (intent.leave && containsAny(combined, LEAVE_TERMS)) {
      score += 6;
    }

    if (intent.bullying && containsAny(combined, ["bullying", "harassment", "taunting", "intimidating"])) {
      score += 6;
    }

    if (
      intent.specialEducation &&
      containsAny(combined, ["iep", "bip", "manifestation", "disability", "special education", "504"])
    ) {
      score += 7;
    }

    if (
      intent.devicePrivacy &&
      containsAny(combined, ["electronic", "device", "privacy", "recording", "video", "phones", "technology"])
    ) {
      score += 5;
    }

    if (intent.safety && containsAny(combined, ["safe school", "safety", "welfare", "supervision"])) {
      score += 4;
    }

    if (studentDisciplineScenario) {
      if (inStudentSection) {
        score += 10;
      }

      if (
        containsAny(title, [
          "student conduct",
          "student discipline",
          "bullying",
          "anti harassment",
          "anti-harassment",
          "suspension",
          "expulsion",
          "students with disabilities",
          "child find and special education",
          "recording of iep team meetings",
          "personal communication devices",
          "technology resources",
          "student privacy",
        ])
      ) {
        score += 12;
      }

      if (containsAny(title, ["attendance", "dress and grooming"])) {
        score -= 6;
      }
    }

    if (studentSpecialEdScenario) {
      if (
        inProgramSection &&
        containsAny(title, ["special education", "section 504", "iep", "case conferences", "child find"])
      ) {
        score += 14;
      }

      if (containsAny(title, ["students with disabilities", "disability"])) {
        score += 16;
      }

      if (isEmploymentPolicy) {
        score -= 36;
      }
    }

    if (intent.staffRequested && containsAny(title, ["staff discipline", "anti-harassment"])) {
      score += 6;
    }

    if (intent.attendance && !hasStudentAttendanceSignal(section, title, combined)) {
      score -= 8;
    }

    if (intent.leave && !containsAny(combined, LEAVE_TERMS)) {
      score -= 10;
    }

    if ((intent.attendance || intent.records) && !intent.staffRequested && isStaffPolicy) {
      score -= 10;
    }

    if ((intent.attendance || intent.records || intent.dress) && intent.studentRequested) {
      if (!hasStudentContext && !inStudentSection) {
        score -= 12;
      }
    }

    if (
      intent.records &&
      intent.studentRecordsRequested &&
      !hasStudentRecordsSignal(combined)
    ) {
      score -= 10;
    }

    if (scenarioLower.includes("legal") && wording.includes("law")) {
      score += 3;
    }

    if (scenarioLower.includes("iep") && wording.includes("fape")) {
      score += 4;
    }

    if (score > 0 && policy.policyStatus.toLowerCase() === "active") {
      score += 1;
    }

    return {
      ...policy,
      relevanceScore: combineRankingScore(
        score,
        policy.lexicalRank,
        topLexicalRank,
        POLICY_LEXICAL_SCORE_CAP,
      ),
    };
  });

  return scored.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    if (a.policyTitle.length !== b.policyTitle.length) {
      return a.policyTitle.length - b.policyTitle.length;
    }
    return a.id - b.id;
  });
}

function isPolicyIntentMatch(policy: StoredPolicy, intent: RetrievalIntent): boolean {
  const section = policy.policySection.toLowerCase();
  const title = policy.policyTitle.toLowerCase();
  const wording = policy.policyWording.toLowerCase();
  const combined = `${section} ${title} ${wording}`;
  const titleHasDressSignal = hasDressSignal(title);
  const titleHasAttendanceSignal = containsAny(title, ["attendance", "absence", "truancy", "tardy"]);
  const titleHasRecordsSignal = containsAny(title, ["record", "records", "retention", "ferpa", "privacy"]);
  const titleHasLeaveSignal = containsAny(title, ["leave", "vacation", "medical", "bereavement", "jury"]);
  const hasStudentContext = containsAny(combined, STUDENT_CONTEXT_TERMS);
  const isStaffPolicy =
    /\b(1000|3000|4000)\b/.test(section) ||
    /\bstaff\b|\badministration\b|\bprofessional staff\b|\bsupport staff\b/.test(title);
  const inStudentSection = /\b5000\b/.test(section);

  if (intent.dress) {
    if (!hasDressSignal(combined)) {
      return false;
    }

    if (!titleHasDressSignal) {
      return false;
    }

    if (!intent.staffRequested && isStaffPolicy) {
      return false;
    }
  }

  if ((intent.attendance || intent.records || intent.dress) && intent.studentRequested) {
    if (!hasStudentContext && !inStudentSection) {
      return false;
    }
  }

  if ((intent.attendance || intent.records) && !intent.staffRequested && isStaffPolicy) {
    return false;
  }

    if (!intent.multiIssueScenario && intent.attendance && !containsAny(combined, ATTENDANCE_TERMS)) {
      return false;
    }

    if (!intent.multiIssueScenario && intent.attendance && !hasStudentAttendanceSignal(section, title, combined)) {
      return false;
    }

    if (!intent.multiIssueScenario && intent.attendance && !titleHasAttendanceSignal) {
      return false;
    }

    if (!intent.multiIssueScenario && intent.leave && !containsAny(combined, LEAVE_TERMS)) {
      return false;
    }

    if (!intent.multiIssueScenario && intent.leave && !titleHasLeaveSignal) {
      return false;
    }

    if (!intent.multiIssueScenario && intent.records && !containsAny(combined, RECORDS_TERMS)) {
      return false;
    }

    if (!intent.multiIssueScenario && intent.records && !titleHasRecordsSignal) {
      return false;
    }

    if (
      !intent.multiIssueScenario &&
      intent.records &&
      intent.studentRecordsRequested &&
      !hasStudentRecordsSignal(combined)
    ) {
      return false;
    }

    if (!intent.multiIssueScenario && intent.records && intent.studentRecordsRequested) {
      const titleHasStudentRecords = /\bstudent\s+records?\b/.test(title) || /\bferpa\b/.test(title);
      if (!titleHasStudentRecords) {
        return false;
      }
  }

  return true;
}

async function buildHandbookRetrievalBundle(
  userId: string,
  scenario: string,
  terms: string[],
  intent: RetrievalIntent,
  handbookTypes: HandbookType[],
  options?: { limit?: number },
): Promise<HandbookRetrievalBundle> {
  const candidates = await loadHandbookCandidates(
    userId,
    scenario,
    terms,
    handbookTypes,
  );
  const preferredCandidates = selectPreferredComplexHandbookCandidates(candidates, intent);
  const scored = scoreHandbookChunks(
    preferredCandidates.length > 0 ? preferredCandidates : candidates,
    scenario,
    terms,
    intent,
  );
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 10) : 4;
  const threshold = getHandbookThreshold(intent);
  const strongMatches = scored.filter((chunk) => chunk.relevanceScore >= threshold);
  const weakMatches = scored.filter((chunk) => chunk.relevanceScore > 0);
  const strictIntent =
    !intent.multiIssueScenario && (intent.dress || intent.attendance || intent.records || intent.leave);
  const filteredStrong = strongMatches.filter((chunk) => isHandbookIntentMatch(chunk, intent));
  const filteredWeak = weakMatches.filter((chunk) => isHandbookIntentMatch(chunk, intent));
  const filteredScored = scored.filter((chunk) => chunk.relevanceScore > 0).filter((chunk) => isHandbookIntentMatch(chunk, intent));
  const relevant = strictIntent
    ? filteredStrong.length > 0
      ? filteredStrong
      : filteredWeak.slice(0, 1)
    : filteredStrong.length > 0
      ? filteredStrong
      : filteredWeak.slice(0, 2);
  const substantive = relevant.filter((chunk) => isSubstantiveHandbookChunk(chunk, intent));
  const refinedPool = filteredScored.filter((chunk) => isSubstantiveHandbookChunk(chunk, intent));
  const refined = refineHandbookResults(
    refinedPool.length > 0 ? refinedPool : substantive.length > 0 ? substantive : relevant,
    intent,
  );

  return {
    terms,
    guidance: diversifyHandbookGuidance(dedupeHandbookGuidance(refined)).slice(0, limit),
  };
}

async function loadHandbookCandidates(
  userId: string,
  scenario: string,
  terms: string[],
  handbookTypes: HandbookType[],
): Promise<HandbookRankingCandidate[]> {
  const postgresQuery = buildPostgresCandidateQuery(scenario, terms);
  const [legacyCandidates, postgresCandidates] = await Promise.all([
    searchHandbookChunks(userId, terms, { limit: 1200, handbookTypes }),
    postgresQuery
      ? searchHandbookChunkCandidates(userId, postgresQuery, {
          limit: 120,
          handbookTypes,
        })
      : Promise.resolve([] as HandbookSearchCandidate[]),
  ]);

  return mergeHandbookCandidates(legacyCandidates, postgresCandidates);
}

function scoreHandbookChunks(
  chunks: HandbookRankingCandidate[],
  scenario: string,
  terms: string[],
  intent: RetrievalIntent,
): HandbookRetrievalResult[] {
  const scenarioLower = scenario.toLowerCase();
  const preferredHandbookTypes = selectRelevantHandbookTypes(scenario);
  const topLexicalRank = getTopLexicalRank(chunks);

  const scored = chunks.map((chunk) => {
    const title = chunk.sectionTitle.toLowerCase();
    const content = chunk.content.toLowerCase();
    const combined = `${title} ${content}`;
    const hasDressContext = hasDressSignal(combined);
    const hasDressCodePhrase = /\bdress\s+code\b/.test(combined);
    const studentDisciplineScenario = intent.studentRequested && intent.disciplineRequested;
    const studentSpecialEdScenario = intent.studentRequested && intent.specialEducation;
    let score = 0;

    for (const term of terms) {
      if (containsSearchTerm(title, term)) {
        score += 6;
      }
      if (containsSearchTerm(content, term)) {
        score += 3;
      }
    }

    if (scenarioLower.includes("discipline") && title.includes("discipline")) {
      score += 4;
    }

    if (preferredHandbookTypes.includes(chunk.handbookType)) {
      score += 3;
    } else {
      score -= 12;
    }

    if (intent.dress && hasDressContext) {
      score += 4;
    }

    if (intent.dress && hasDressCodePhrase) {
      score += 6;
    }

    if (scenarioLower.includes("behavior") && (title.includes("behavior") || content.includes("conduct"))) {
      score += 3;
    }

    if (intent.attendance && containsAny(combined, ATTENDANCE_TERMS)) {
      score += 4;
    }

    if (intent.records && containsAny(combined, RECORDS_TERMS)) {
      score += 4;
    }

    if (intent.leave && containsAny(combined, LEAVE_TERMS)) {
      score += 6;
    }

    if (intent.bullying && containsAny(combined, ["bullying", "harassment", "taunting", "intimidating"])) {
      score += 6;
    }

    if (
      intent.specialEducation &&
      containsAny(combined, ["iep", "bip", "manifestation", "disability", "special education", "504"])
    ) {
      score += 6;
    }

    if (
      intent.devicePrivacy &&
      containsAny(combined, ["electronic", "device", "privacy", "recording", "video", "phones", "technology"])
    ) {
      score += 5;
    }

    if (intent.safety && containsAny(combined, ["safe", "safety", "welfare", "supervision"])) {
      score += 4;
    }

    if (studentDisciplineScenario && chunk.handbookType === "student") {
      score += 6;

      if (
        containsAny(title, [
          "discipline",
          "suspension",
          "expulsion",
          "bully",
          "harassment",
          "student misconduct",
          "code of conduct",
          "cell phones",
          "electronic devices",
          "privacy",
        ])
      ) {
        score += 14;
      }

      if (
        containsAny(title, [
          "attendance",
          "general guidance",
          "school procedures",
          "informing parents and guardians generally",
        ])
      ) {
        score -= 16;
      }
    }

    if (studentSpecialEdScenario && chunk.handbookType === "student") {
      if (containsAny(combined, ["iep", "bip", "manifestation", "disability", "special education", "504"])) {
        score += 8;
      }
    }

    if (intent.dress && !hasDressContext) {
      score -= intent.disciplineRequested ? 10 : 24;
    }

    if (intent.attendance && !containsAny(combined, ATTENDANCE_TERMS)) {
      score -= 8;
    }

    if (intent.leave && !containsAny(combined, LEAVE_TERMS)) {
      score -= 10;
    }

    return {
      ...chunk,
      relevanceScore: combineRankingScore(
        score,
        chunk.lexicalRank,
        topLexicalRank,
        HANDBOOK_LEXICAL_SCORE_CAP,
      ),
    };
  });

  return scored.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    if (a.sectionTitle.length !== b.sectionTitle.length) {
      return a.sectionTitle.length - b.sectionTitle.length;
    }
    return a.id - b.id;
  });
}

function isHandbookIntentMatch(chunk: StoredHandbookChunk, intent: RetrievalIntent): boolean {
  const title = chunk.sectionTitle.toLowerCase();
  const content = chunk.content.toLowerCase();
  const combined = `${title} ${content}`;

  if (intent.dress && !hasDressSignal(combined)) {
    return false;
  }

  if (!intent.multiIssueScenario && intent.attendance && !containsAny(combined, ATTENDANCE_TERMS)) {
    return false;
  }

  if (!intent.multiIssueScenario && intent.records && !containsAny(combined, RECORDS_TERMS)) {
    return false;
  }

  if (!intent.multiIssueScenario && intent.leave && !containsAny(combined, LEAVE_TERMS)) {
    return false;
  }

  return true;
}

function refinePolicyResults(
  policies: RetrievalResult[],
  intent: RetrievalIntent,
): RetrievalResult[] {
  if (!(intent.multiIssueScenario && intent.studentRequested && intent.disciplineRequested)) {
    return policies;
  }

  const studentPreferred = policies.filter((policy) => {
    const section = policy.policySection.toLowerCase();
    const title = policy.policyTitle.toLowerCase();
    const inStudentSection = /\b5000\b/.test(section);
    const inProgramSection = /\b2000\b/.test(section);
    const titleMatches = containsAny(title, [
      "student conduct",
      "student discipline",
      "bullying",
      "anti-harassment",
      "anti harassment",
      "suspension",
      "expulsion",
      "students with disabilities",
      "child find and special education",
      "recording of iep team meetings",
      "personal communication devices",
      "technology resources",
      "student privacy",
    ]);
    const isEmploymentPolicy = title.includes("employment");
    return (inStudentSection || inProgramSection) && titleMatches && !isEmploymentPolicy;
  });

  const staffPreferred = intent.staffRequested
    ? policies.filter((policy) =>
        containsAny(policy.policyTitle.toLowerCase(), ["staff discipline", "anti-harassment", "anti harassment"]),
      )
    : [];

  const merged = [...studentPreferred, ...staffPreferred];
  if (merged.length === 0) {
    return policies;
  }

  const seen = new Set<number>();
  const deduped: RetrievalResult[] = [];
  for (const policy of merged) {
    if (seen.has(policy.id)) {
      continue;
    }
    seen.add(policy.id);
    deduped.push(policy);
  }

  return deduped;
}

function dedupeHandbookGuidance(guidance: HandbookRetrievalResult[]): HandbookRetrievalResult[] {
  const seen = new Set<string>();
  const deduped: HandbookRetrievalResult[] = [];

  for (const chunk of guidance) {
    const signature = buildHandbookSignature(chunk);
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    deduped.push(chunk);
  }

  return deduped;
}

function diversifyHandbookGuidance(
  guidance: HandbookRetrievalResult[],
): HandbookRetrievalResult[] {
  const seenSections = new Set<string>();
  const primary: HandbookRetrievalResult[] = [];
  const overflow: HandbookRetrievalResult[] = [];

  for (const chunk of guidance) {
    const sectionKey = normalizeHandbookSectionTitle(chunk.sectionTitle);
    if (!sectionKey) {
      overflow.push(chunk);
      continue;
    }

    if (seenSections.has(sectionKey)) {
      overflow.push(chunk);
      continue;
    }

    seenSections.add(sectionKey);
    primary.push(chunk);
  }

  return primary.concat(overflow);
}

function refineHandbookResults(
  guidance: HandbookRetrievalResult[],
  intent: RetrievalIntent,
): HandbookRetrievalResult[] {
  if (!(intent.multiIssueScenario && intent.studentRequested && intent.disciplineRequested)) {
    return guidance;
  }

  const preferredStudent = guidance.filter((chunk) => {
    if (chunk.handbookType !== "student") {
      return false;
    }

    const title = normalizeHandbookSectionTitle(chunk.sectionTitle);
    return (
      containsAny(title, [
        "discipline",
        "suspension",
        "expulsion",
        "bully",
        "harassment",
        "student misconduct",
        "code of conduct",
        "cell phones",
        "electronic devices",
        "privacy",
      ]) && isComplexHandbookTitleBodyAligned(chunk)
    );
  });

  return preferredStudent.length > 0 ? dedupeHandbookSections(preferredStudent) : guidance;
}

function isComplexHandbookTitleBodyAligned(chunk: StoredHandbookChunk): boolean {
  const title = normalizeHandbookSectionTitle(chunk.sectionTitle);
  const opening = chunk.content.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 1000);

  if (!opening) {
    return false;
  }

  if (containsAny(title, ["cell phones", "electronic devices", "privacy"])) {
    return containsAny(opening, [
      "cell phone",
      "electronic communication device",
      "electronic device",
      "recording",
      "video",
      "social media",
      "confiscat",
    ]);
  }

  if (containsAny(title, ["bully", "harassment"])) {
    return containsAny(opening, [
      "bully",
      "harassment",
      "taunt",
      "ridicule",
      "intimidat",
    ]);
  }

  if (containsAny(title, ["suspension", "expulsion"])) {
    return containsAny(opening, [
      "suspension",
      "expulsion",
      "due process",
      "notice",
      "hearing",
    ]);
  }

  if (
    containsAny(title, [
      "discipline",
      "student misconduct",
      "code of conduct",
      "removal from class",
    ])
  ) {
    return containsAny(opening, [
      "fight",
      "physical aggression",
      "student discipline",
      "misconduct",
      "substantial disobedience",
      "suspension",
      "expulsion",
      "consequence",
      "bully",
      "harassment",
      "behavior and discipline",
    ]);
  }

  return true;
}

function selectPreferredComplexHandbookCandidates<T extends StoredHandbookChunk>(
  chunks: T[],
  intent: RetrievalIntent,
): T[] {
  if (!(intent.multiIssueScenario && intent.studentRequested && intent.disciplineRequested)) {
    return [];
  }

  return chunks.filter((chunk) => {
    if (chunk.handbookType !== "student") {
      return false;
    }

    const title = normalizeHandbookSectionTitle(chunk.sectionTitle);
    return containsAny(title, [
      "discipline",
      "suspension",
      "expulsion",
      "bully",
      "harassment",
      "student misconduct",
      "code of conduct",
      "cell phones",
      "electronic devices",
      "privacy",
      "removal from class",
    ]) && isComplexHandbookTitleBodyAligned(chunk);
  });
}

function dedupeHandbookSections<T extends { sectionTitle: string }>(chunks: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const chunk of chunks) {
    const key = normalizeHandbookSectionTitle(chunk.sectionTitle);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(chunk);
  }

  return deduped;
}

function mergePolicyCandidates(
  legacyCandidates: StoredPolicy[],
  postgresCandidates: PolicySearchCandidate[],
): PolicyRankingCandidate[] {
  const merged = new Map<number, PolicyRankingCandidate>();

  for (const candidate of legacyCandidates) {
    merged.set(candidate.id, {
      ...candidate,
      lexicalRank: 0,
    });
  }

  for (const candidate of postgresCandidates) {
    const existing = merged.get(candidate.id);
    merged.set(candidate.id, {
      ...(existing ?? candidate),
      lexicalRank: Math.max(existing?.lexicalRank ?? 0, candidate.combinedRank),
    });
  }

  return Array.from(merged.values());
}

function mergeHandbookCandidates(
  legacyCandidates: StoredHandbookChunk[],
  postgresCandidates: HandbookSearchCandidate[],
): HandbookRankingCandidate[] {
  const merged = new Map<number, HandbookRankingCandidate>();

  for (const candidate of legacyCandidates) {
    merged.set(candidate.id, {
      ...candidate,
      lexicalRank: 0,
    });
  }

  for (const candidate of postgresCandidates) {
    const existing = merged.get(candidate.id);
    merged.set(candidate.id, {
      ...(existing ?? candidate),
      lexicalRank: Math.max(existing?.lexicalRank ?? 0, candidate.combinedRank),
    });
  }

  return Array.from(merged.values());
}

function getTopLexicalRank(candidates: Array<{ lexicalRank: number }>): number {
  return candidates.reduce((highest, candidate) => Math.max(highest, candidate.lexicalRank), 0);
}

function combineRankingScore(
  heuristicScore: number,
  lexicalRank: number,
  topLexicalRank: number,
  lexicalScoreCap: number,
): number {
  if (lexicalRank <= 0 || topLexicalRank <= 0) {
    return heuristicScore;
  }

  const normalizedLexicalRank = Math.min(lexicalRank / topLexicalRank, 1);
  const lexicalScore = normalizedLexicalRank * lexicalScoreCap;
  return Math.round(heuristicScore + lexicalScore);
}

function buildHandbookSignature(chunk: HandbookRetrievalResult): string {
  const normalized = `${chunk.sectionTitle} ${chunk.content}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:chapter|section|article|part|appendix|[a-z]|\d+)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  return `${chunk.handbookType}|${normalized}`;
}

function normalizeHandbookSectionTitle(sectionTitle: string): string {
  return sectionTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:chapter|section|article|part|appendix|page|pages|continued)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSubstantiveHandbookChunk(
  chunk: HandbookRetrievalResult,
  intent: RetrievalIntent,
): boolean {
  const normalizedTitle = normalizeHandbookSectionTitle(chunk.sectionTitle);
  const normalizedContent = chunk.content.toLowerCase().replace(/\s+/g, " ").trim();

  if (!normalizedTitle) {
    return false;
  }

  if (
    /\btable of contents\b/.test(normalizedContent) ||
    /\bcontents\b/.test(normalizedTitle) ||
    /\bemployee handbook\b/.test(normalizedTitle)
  ) {
    return false;
  }

  if (normalizedTitle.length < 4) {
    return false;
  }

  if (intent.leave) {
    return containsAny(`${normalizedTitle} ${normalizedContent}`, LEAVE_TERMS);
  }

  if (intent.records) {
    return containsAny(`${normalizedTitle} ${normalizedContent}`, RECORDS_TERMS);
  }

  if (intent.attendance) {
    return containsAny(`${normalizedTitle} ${normalizedContent}`, ATTENDANCE_TERMS);
  }

  return true;
}

function selectRelevantHandbookTypes(scenario: string): HandbookType[] {
  const normalized = normalizeScenario(scenario);
  const explicitStudentHandbook = /\bstudent\s+handbook\b/.test(normalized);
  const explicitStaffHandbook =
    /\bstaff\s+handbook\b|\bemployee\s+handbook\b|\bpersonnel\s+handbook\b/.test(normalized);
  const studentSignals =
    explicitStudentHandbook ||
    /\b(?:student|students|pupil|pupils|parent|parents|family|families|dress|attendance|truancy|tardy|iep|bully|discipline|suspension|expulsion|504|ferpa)\b/.test(
      normalized,
    );
  const workforceSignals =
    explicitStaffHandbook ||
    /\b(?:employee|employees|employment|personnel|teacher|teachers|faculty|principal|principals|superintendent|coach|coaches|evaluation|grievance|leave|benefits|workplace|harassment|professional conduct|professional expectations|adult)\b/.test(
      normalized,
    );

  if (explicitStaffHandbook && !explicitStudentHandbook) {
    return ["staff"];
  }

  if (explicitStudentHandbook && !explicitStaffHandbook) {
    return ["student"];
  }

  if (workforceSignals && !studentSignals) {
    return ["staff"];
  }

  if (studentSignals && !workforceSignals) {
    return ["student"];
  }

  return ["student", "staff"];
}

function extractSearchTerms(input: string): string[] {
  const normalized = normalizeScenario(input);
  const tokens = normalized
    .split(/\s+/)
    .map((token) => normalizeToken(token.trim()))
    .filter(
      (token) =>
        token.length >= 3 && !STOP_WORDS.has(token) && !DOMAIN_GENERIC_TERMS.has(token),
    );

  const prioritized: string[] = [
    ...extractPolicyCueTerms(normalized),
    ...expandIntentTerms(normalized),
  ];

  const fallbackTokens = tokens.filter(
    (token) => !LOW_SIGNAL_NARRATIVE_TERMS.has(token) && !/^\d+$/.test(token),
  );

  const expanded = expandIntentTerms(normalized);
  const uniqueTerms = new Set<string>();
  const orderedTerms: string[] = [];

  const narrativeTerms = fallbackTokens.length > 0 ? fallbackTokens : tokens;

  for (const term of [...prioritized, ...narrativeTerms, ...expanded]) {
    const normalizedTerm = term.trim();
    if (!normalizedTerm || uniqueTerms.has(normalizedTerm)) {
      continue;
    }

    uniqueTerms.add(normalizedTerm);
    orderedTerms.push(normalizedTerm);
  }

  return orderedTerms.slice(0, 24);
}

function buildPostgresCandidateQuery(scenario: string, terms: string[]): string {
  const normalizedScenario = normalizeScenario(scenario);
  const likelyCodes = extractLikelyPolicyCodes(normalizedScenario);
  const queryParts = new Set<string>();

  for (const code of likelyCodes) {
    queryParts.add(code);
  }

  for (const term of terms) {
    queryParts.add(term);
  }

  if (queryParts.size > 0) {
    return Array.from(queryParts).join(" OR ");
  }

  return normalizedScenario.replace(/\s+/g, " ").trim().slice(0, 800);
}

function extractPolicyCueTerms(normalizedScenario: string): string[] {
  const cues = new Set<string>();

  addCueTerms(cues, normalizedScenario, /\bbully|bullying\b/, [
    "bullying",
    "harassment",
    "peer conflict",
  ]);
  addCueTerms(cues, normalizedScenario, /\bharass|harassment|taunt|ridicule|mocking\b/, [
    "harassment",
    "bullying",
    "taunting",
  ]);
  addCueTerms(cues, normalizedScenario, /\bfight|fighting|altercation|aggression|physical aggression\b/, [
    "fight",
    "fighting",
    "altercation",
    "physical aggression",
  ]);
  addCueTerms(cues, normalizedScenario, /\bdiscipline|due process|suspension|expulsion\b/, [
    "discipline",
    "due process",
    "suspension",
    "expulsion",
  ]);
  addCueTerms(cues, normalizedScenario, /\biep|bip|manifestation|disability|special education\b/, [
    "iep",
    "bip",
    "manifestation determination",
    "disability",
    "special education",
  ]);
  addCueTerms(cues, normalizedScenario, /\belectronic device|phone|video|social media|privacy\b/, [
    "electronic device",
    "student privacy",
    "social media",
    "video",
    "privacy",
  ]);
  addCueTerms(cues, normalizedScenario, /\bsafe school|safe environment|school safety\b/, [
    "safe school",
    "school safety",
    "safe environment",
  ]);
  addCueTerms(cues, normalizedScenario, /\bparent complaint|complaint\b/, [
    "complaint",
    "parent communication",
  ]);
  addCueTerms(
    cues,
    normalizedScenario,
    /\bprincipal|principals|administrator|administrators|contract|renew|renewal|nonrenew|nonrenewal\b/,
    [
      "administrator",
      "administrators",
      "principal",
      "employment",
      "employment of administrators",
      "contract",
      "contract renewal",
      "nonrenewal",
    ],
  );
  addCueTerms(
    cues,
    normalizedScenario,
    /\bathletic|athletics|athlete|sports|extracurricular\b/,
    ["athletics", "extracurricular", "student activities"],
  );

  return Array.from(cues);
}

function addCueTerms(
  cues: Set<string>,
  normalizedScenario: string,
  pattern: RegExp,
  terms: string[],
): void {
  if (!pattern.test(normalizedScenario)) {
    return;
  }

  for (const term of terms) {
    cues.add(term);
  }
}

function expandIntentTerms(normalizedScenario: string): string[] {
  const expanded = new Set<string>();

  if (/\babsence|absent|attendance|truancy|tardy|late\b/.test(normalizedScenario)) {
    expanded.add("absence");
    expanded.add("attendance");
    expanded.add("truancy");
    expanded.add("excused");
    expanded.add("unexcused");
    expanded.add("tardy");
  }

  if (/\bdress\b/.test(normalizedScenario)) {
    expanded.add("dress");
    expanded.add("dress code");
  }

  if (/\bappearance\b/.test(normalizedScenario)) {
    expanded.add("appearance");
  }

  if (/\bgroom\w*\b/.test(normalizedScenario)) {
    expanded.add("grooming");
  }

  if (/\battire\b/.test(normalizedScenario)) {
    expanded.add("attire");
  }

  if (/\buniform\b/.test(normalizedScenario)) {
    expanded.add("uniform");
    expanded.add("dress");
  }

  if (/\bdiscipline|suspend|expel|behavior|conduct|fight\b/.test(normalizedScenario)) {
    expanded.add("discipline");
    expanded.add("behavior");
    expanded.add("conduct");
    expanded.add("suspension");
    expanded.add("expulsion");
  }

  if (/\brecord|records|retention|ferpa|privacy\b/.test(normalizedScenario)) {
    expanded.add("record");
    expanded.add("records");
    expanded.add("retention");
    expanded.add("ferpa");
    expanded.add("privacy");
  }

  if (/\bleave|vacation|sick|medical|bereavement|jury|subpoena\b/.test(normalizedScenario)) {
    expanded.add("leave");
    expanded.add("vacation");
    expanded.add("sick");
    expanded.add("medical");
    expanded.add("bereavement");
    expanded.add("jury duty");
  }

  return Array.from(expanded);
}

function extractLikelyPolicyCodes(input: string): string[] {
  const matches = input.match(/(?:po\s*)?\d{3,5}(?:\.\d+)?/gi) ?? [];
  return Array.from(new Set(matches.map((match) => match.replace(/\s+/g, ""))));
}

interface RetrievalIntent {
  dress: boolean;
  attendance: boolean;
  leave: boolean;
  records: boolean;
  bullying: boolean;
  specialEducation: boolean;
  devicePrivacy: boolean;
  safety: boolean;
  multiIssueScenario: boolean;
  staffRequested: boolean;
  studentRequested: boolean;
  studentRecordsRequested: boolean;
  disciplineRequested: boolean;
}

function detectIntent(scenario: string): RetrievalIntent {
  const normalized = normalizeScenario(scenario);
  const bullying = /\bbully|bullying|harass|harassment|taunt|ridicule|mocking|intimidat\w*\b/.test(normalized);
  const disciplineRequested = /\bdiscipline|suspend|suspension|expel|expulsion|consequence|consequences\b/.test(
    normalized,
  );
  const specialEducation =
    /\biep|bip|manifestation|disability|special education|504|behavior intervention plan\b/.test(normalized);
  const devicePrivacy =
    /\belectronic device|phone|phones|video|videos|recorded|recording|social media|privacy|confidential\b/.test(
      normalized,
    );
  const safety = /\bsafe school|safe environment|school safety|student supervision|welfare\b/.test(normalized);
  const focusedIntentCount = [bullying, disciplineRequested, specialEducation, devicePrivacy, safety].filter(Boolean)
    .length;

  return {
    dress: /\bdress|appearance|uniform|groom\w*|attire\b/.test(normalized),
    attendance: /\battendance|absence|absent|truancy|tardy|late|excused\b/.test(normalized),
    leave: /\bleave|vacation|sick|medical|bereavement|jury|subpoena|fmla\b/.test(normalized),
    records: /\brecord|records|retention|ferpa|privacy|confidential\b/.test(normalized),
    bullying,
    specialEducation,
    devicePrivacy,
    safety,
    multiIssueScenario: focusedIntentCount >= 2,
    staffRequested: /\bstaff|support staff|administrator|administration|professional staff\b/.test(normalized),
    studentRequested: /\bstudent|students|pupil|pupils\b/.test(normalized),
    studentRecordsRequested: /\bstudent\s+records?\b|\bferpa\b/.test(normalized),
    disciplineRequested,
  };
}

function getPolicyThreshold(intent: RetrievalIntent): number {
  if (intent.multiIssueScenario) {
    return 6;
  }

  if (intent.dress) {
    return 12;
  }

  if (intent.attendance || intent.records || intent.leave) {
    return 8;
  }

  return 4;
}

function getHandbookThreshold(intent: RetrievalIntent): number {
  if (intent.multiIssueScenario) {
    return 5;
  }

  if (intent.dress) {
    return 8;
  }

  if (intent.attendance || intent.records || intent.leave) {
    return 7;
  }

  return 4;
}

function normalizeScenario(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bvioloations\b/g, "violations")
    .replace(/\bvioloation\b/g, "violation")
    .replace(/\bviolaton\b/g, "violation");
}

function normalizeToken(token: string): string {
  if (token === "violoations") {
    return "violations";
  }

  if (token === "violoation" || token === "violaton") {
    return "violation";
  }

  return token;
}

function hasStudentAttendanceSignal(section: string, title: string, combined: string): boolean {
  if (containsAny(combined, ["absence", "absences", "absent", "truancy", "tardy", "excused", "unexcused"])) {
    return true;
  }

  if (containsSearchTerm(title, "attendance")) {
    return true;
  }

  const inStudentSection = /\b5000\b/.test(section);
  if (inStudentSection && containsSearchTerm(combined, "attendance")) {
    return true;
  }

  return false;
}

function hasStudentRecordsSignal(content: string): boolean {
  return (
    /\bstudent\s+records?\b/.test(content) ||
    /\beducation\s+records?\b/.test(content) ||
    /\bferpa\b/.test(content)
  );
}

function containsAny(content: string, terms: string[]): boolean {
  return terms.some((term) => containsSearchTerm(content, term));
}

function hasDressSignal(content: string): boolean {
  if (
    /\bdress(?:\s+code)?\b/.test(content) ||
    /\bdress and (?:appearance|grooming)\b/.test(content) ||
    /\bgroom(?:ing)?\b/.test(content) ||
    /\battire\b/.test(content) ||
    /\bapparel\b/.test(content) ||
    /\bclothing\b/.test(content)
  ) {
    return true;
  }

  if (!/\buniforms?\b/.test(content)) {
    return false;
  }

  return hasUniformDressContext(content);
}

function hasUniformDressContext(content: string): boolean {
  return (
    /\bstudent(?:s)?\b[^.]{0,40}\buniforms?\b/.test(content) ||
    /\buniforms?\b[^.]{0,40}\b(dress|attire|appearance|code|guideline|guidelines|violation|violations|policy|policies)\b/.test(
      content,
    ) ||
    /\bschool\s+uniforms?\b/.test(content)
  );
}

function containsSearchTerm(content: string, term: string): boolean {
  const normalizedContent = content.toLowerCase();
  const normalizedTerm = term.toLowerCase();
  if (!normalizedTerm) {
    return false;
  }

  if (normalizedTerm.includes(" ")) {
    return normalizedContent.includes(normalizedTerm);
  }

  if (/^[a-z]+$/.test(normalizedTerm)) {
    const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(normalizedTerm)}([^a-z0-9]|$)`);
    return regex.test(normalizedContent);
  }

  return normalizedContent.includes(normalizedTerm);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
