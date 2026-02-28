import {
  searchDatasetPolicies,
  searchHandbookChunks,
  searchStateLawCorpus,
} from "@/lib/policy-assistant/db";
import { getScenarioEmbedding } from "@/lib/policy-assistant/embeddings";
import type {
  HandbookRetrievalResult,
  RetrievalResult,
  StateLawRetrievalResult,
  StoredHandbookChunk,
  StoredPolicy,
  StoredStateLawChunk,
} from "@/lib/policy-assistant/types";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "will",
  "with",
  "does",
  "definition",
  "define",
  "defined",
  "require",
  "required",
  "requires",
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
  "law",
  "laws",
  "state",
  "indiana",
  "code",
  "violation",
  "violations",
]);

const STUDENT_CONTEXT_TERMS = ["student", "students", "pupil", "pupils"];
const ATTENDANCE_TERMS = ["attendance", "absence", "absences", "absent", "truancy", "tardy", "excused"];
const RECORDS_TERMS = ["record", "records", "retention", "ferpa", "privacy", "confidential"];

export interface RetrievalBundle {
  terms: string[];
  policies: RetrievalResult[];
}

export interface HandbookRetrievalBundle {
  terms: string[];
  guidance: HandbookRetrievalResult[];
}

export interface StateLawRetrievalBundle {
  terms: string[];
  guidance: StateLawRetrievalResult[];
}

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
  return buildHandbookRetrievalBundle(userId, scenario, terms, intent, options);
}

export function retrieveRelevantStateLawGuidance(
  stateCode: string,
  scenario: string,
  options?: { limit?: number },
): Promise<StateLawRetrievalBundle> {
  const terms = extractSearchTerms(scenario);
  const intent = detectIntent(scenario);
  return buildStateLawRetrievalBundle(stateCode, scenario, terms, intent, options);
}

async function buildRetrievalBundle(
  userId: string,
  datasetId: string,
  scenario: string,
  terms: string[],
  intent: RetrievalIntent,
  options?: { limit?: number },
): Promise<RetrievalBundle> {
  const lexicalCandidates = await searchDatasetPolicies(userId, datasetId, terms, { limit: 350 });
  const scenarioEmbedding = await getScenarioEmbedding(scenario);
  const semanticCandidates = scenarioEmbedding
    ? await searchDatasetPolicies(userId, datasetId, [], { limit: 900 })
    : [];
  const candidates = mergePolicyCandidates(lexicalCandidates, semanticCandidates);
  const scored = scorePolicies(candidates, scenario, terms, intent, scenarioEmbedding);
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 12) : 6;
  const threshold = getPolicyThreshold(intent);
  const strongMatches = scored.filter((policy) => policy.relevanceScore >= threshold);
  const weakMatches = scored.filter((policy) => policy.relevanceScore > 0);
  const strictIntent = intent.dress || intent.attendance || intent.records;
  const filteredStrong = strongMatches.filter((policy) => isPolicyIntentMatch(policy, intent));
  const filteredWeak = weakMatches.filter((policy) => isPolicyIntentMatch(policy, intent));
  const relevant = strictIntent
    ? filteredStrong.length > 0
      ? filteredStrong
      : filteredWeak.slice(0, 1)
    : filteredStrong.length > 0
      ? filteredStrong
      : filteredWeak.slice(0, 2);

  return {
    terms,
    policies: relevant.slice(0, limit),
  };
}

function scorePolicies(
  policies: StoredPolicy[],
  scenario: string,
  terms: string[],
  intent: RetrievalIntent,
  scenarioEmbedding: number[] | null,
): RetrievalResult[] {
  const scenarioLower = scenario.toLowerCase();
  const policyCodeMatches = extractLikelyPolicyCodes(scenarioLower);

  const scored = policies.map((policy) => {
    const section = policy.policySection.toLowerCase();
    const code = policy.policyCode.toLowerCase();
    const title = policy.policyTitle.toLowerCase();
    const wording = policy.policyWording.toLowerCase();
    const combined = `${section} ${title} ${wording}`;
    const hasDressContext = hasDressSignal(combined);
    const hasDressCodePhrase = /\bdress\s+code\b/.test(combined);
    let score = 0;
    const semanticSimilarity = scenarioEmbedding
      ? cosineSimilarity(scenarioEmbedding, policy.embedding)
      : null;

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

    if (intent.attendance && !hasStudentAttendanceSignal(section, title, combined)) {
      score -= 8;
    }

    if ((intent.attendance || intent.records) && !intent.staffRequested && isStaffPolicy) {
      score -= 10;
    }

    if ((intent.attendance || intent.records || intent.dress) && intent.studentRequested) {
      const inStudentSection = /\b5000\b/.test(section);
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

    if (semanticSimilarity !== null) {
      score += Math.round(Math.max(0, semanticSimilarity) * 16);
      if ((intent.dress || intent.attendance || intent.records) && semanticSimilarity < 0.08) {
        score -= 4;
      }
    }

    return {
      ...policy,
      relevanceScore: score,
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

  if (intent.attendance && !containsAny(combined, ATTENDANCE_TERMS)) {
    return false;
  }

  if (intent.attendance && !hasStudentAttendanceSignal(section, title, combined)) {
    return false;
  }

  if (intent.attendance && !titleHasAttendanceSignal) {
    return false;
  }

  if (intent.records && !containsAny(combined, RECORDS_TERMS)) {
    return false;
  }

  if (intent.records && !titleHasRecordsSignal) {
    return false;
  }

  if (
    intent.records &&
    intent.studentRecordsRequested &&
    !hasStudentRecordsSignal(combined)
  ) {
    return false;
  }

  if (intent.records && intent.studentRecordsRequested) {
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
  options?: { limit?: number },
): Promise<HandbookRetrievalBundle> {
  const lexicalCandidates = await searchHandbookChunks(userId, terms, { limit: 280 });
  const scenarioEmbedding = await getScenarioEmbedding(scenario);
  const semanticCandidates = scenarioEmbedding
    ? await searchHandbookChunks(userId, [], { limit: 700 })
    : [];
  const candidates = mergeHandbookCandidates(lexicalCandidates, semanticCandidates);
  const scored = scoreHandbookChunks(candidates, scenario, terms, intent, scenarioEmbedding);
  const defaultLimit = intent.dress ? 2 : 4;
  const limit =
    options?.limit && options.limit > 0 ? Math.min(options.limit, 10) : defaultLimit;
  const threshold = getHandbookThreshold(intent);
  const strongMatches = scored.filter((chunk) => chunk.relevanceScore >= threshold);
  const weakMatches = scored.filter((chunk) => chunk.relevanceScore > 0);
  const strictIntent = intent.dress || intent.attendance || intent.records;
  const filteredStrong = strongMatches.filter((chunk) => isHandbookIntentMatch(chunk, intent));
  const filteredWeak = weakMatches.filter((chunk) => isHandbookIntentMatch(chunk, intent));
  const dressTitleStrong = intent.dress
    ? filteredStrong.filter((chunk) => hasDressSignal(chunk.sectionTitle.toLowerCase()))
    : [];
  const dressTitleWeak = intent.dress
    ? filteredWeak.filter((chunk) => hasDressSignal(chunk.sectionTitle.toLowerCase()))
    : [];

  let relevant: HandbookRetrievalResult[];
  if (strictIntent && intent.dress) {
    relevant =
      dressTitleStrong.length > 0
        ? dressTitleStrong
        : filteredStrong.length > 0
          ? filteredStrong
          : dressTitleWeak.length > 0
            ? dressTitleWeak.slice(0, 1)
            : filteredWeak.slice(0, 1);
  } else if (strictIntent) {
    relevant = filteredStrong.length > 0 ? filteredStrong : filteredWeak.slice(0, 1);
  } else {
    relevant = filteredStrong.length > 0 ? filteredStrong : filteredWeak.slice(0, 2);
  }

  return {
    terms,
    guidance: dedupeHandbookGuidance(relevant).slice(0, limit),
  };
}

function scoreHandbookChunks(
  chunks: StoredHandbookChunk[],
  scenario: string,
  terms: string[],
  intent: RetrievalIntent,
  scenarioEmbedding: number[] | null,
): HandbookRetrievalResult[] {
  const scenarioLower = scenario.toLowerCase();

  const scored = chunks.map((chunk) => {
    const title = chunk.sectionTitle.toLowerCase();
    const content = chunk.content.toLowerCase();
    const combined = `${title} ${content}`;
    const hasDressContext = hasDressSignal(combined);
    const hasDressCodePhrase = /\bdress\s+code\b/.test(combined);
    let score = 0;
    const semanticSimilarity = scenarioEmbedding
      ? cosineSimilarity(scenarioEmbedding, chunk.embedding)
      : null;

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

    if (intent.dress && !hasDressContext) {
      score -= intent.disciplineRequested ? 10 : 24;
    }

    if (intent.attendance && !containsAny(combined, ATTENDANCE_TERMS)) {
      score -= 8;
    }

    if (semanticSimilarity !== null) {
      score += Math.round(Math.max(0, semanticSimilarity) * 16);
      if ((intent.dress || intent.attendance || intent.records) && semanticSimilarity < 0.08) {
        score -= 4;
      }
    }

    return {
      ...chunk,
      relevanceScore: score,
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

  if (intent.attendance && !containsAny(combined, ATTENDANCE_TERMS)) {
    return false;
  }

  if (intent.records && !containsAny(combined, RECORDS_TERMS)) {
    return false;
  }

  return true;
}

async function buildStateLawRetrievalBundle(
  stateCode: string,
  scenario: string,
  terms: string[],
  intent: RetrievalIntent,
  options?: { limit?: number },
): Promise<StateLawRetrievalBundle> {
  const lexicalCandidates = await searchStateLawCorpus(stateCode, terms, { limit: 320 });
  const scenarioEmbedding = await getScenarioEmbedding(scenario);
  const semanticCandidates = scenarioEmbedding
    ? await searchStateLawCorpus(stateCode, [], { limit: 900 })
    : [];
  const candidates = mergeStateLawCandidates(lexicalCandidates, semanticCandidates);
  const scored = scoreStateLawChunks(candidates, terms, intent, scenarioEmbedding);
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 8) : 3;
  const threshold = getStateLawThreshold(intent);
  const strongMatches = scored.filter((chunk) => chunk.relevanceScore >= threshold);
  const weakMatches = scored.filter((chunk) => chunk.relevanceScore > 0);
  const filteredStrong = strongMatches.filter((chunk) => isStateLawIntentMatch(chunk, intent));
  const filteredWeak = weakMatches.filter((chunk) => isStateLawIntentMatch(chunk, intent));
  const relevant = filteredStrong.length > 0 ? filteredStrong : filteredWeak.slice(0, 2);

  return {
    terms,
    guidance: dedupeStateLawGuidance(relevant).slice(0, limit),
  };
}

function scoreStateLawChunks(
  chunks: StoredStateLawChunk[],
  terms: string[],
  intent: RetrievalIntent,
  scenarioEmbedding: number[] | null,
): StateLawRetrievalResult[] {
  const scored = chunks.map((chunk) => {
    const title = chunk.citationTitle.toLowerCase();
    const sectionId = chunk.sectionId.toLowerCase();
    const sourceName = chunk.sourceName.toLowerCase();
    const content = chunk.content.toLowerCase();
    const combined = `${title} ${sectionId} ${sourceName} ${content}`;
    let score = 0;
    const semanticSimilarity = scenarioEmbedding
      ? cosineSimilarity(scenarioEmbedding, chunk.embedding)
      : null;

    for (const term of terms) {
      if (containsSearchTerm(title, term) || containsSearchTerm(sectionId, term)) {
        score += 7;
      }
      if (containsSearchTerm(sourceName, term)) {
        score += 2;
      }
      if (containsSearchTerm(content, term)) {
        score += 3;
      }
    }

    if (intent.dress && hasDressSignal(combined)) {
      score += 5;
    }

    if (intent.attendance && containsAny(combined, ATTENDANCE_TERMS)) {
      score += 5;
    }

    if (intent.records && containsAny(combined, RECORDS_TERMS)) {
      score += 5;
    }

    if (intent.dress && !hasDressSignal(combined)) {
      score -= 8;
    }

    if (intent.attendance && !containsAny(combined, ATTENDANCE_TERMS)) {
      score -= 6;
    }

    if (intent.records && !containsAny(combined, RECORDS_TERMS)) {
      score -= 6;
    }

    if (semanticSimilarity !== null) {
      score += Math.round(Math.max(0, semanticSimilarity) * 16);
      if ((intent.dress || intent.attendance || intent.records) && semanticSimilarity < 0.08) {
        score -= 4;
      }
    }

    return {
      ...chunk,
      relevanceScore: score,
    };
  });

  return scored.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    if (a.citationTitle.length !== b.citationTitle.length) {
      return a.citationTitle.length - b.citationTitle.length;
    }
    return a.id - b.id;
  });
}

function isStateLawIntentMatch(chunk: StoredStateLawChunk, intent: RetrievalIntent): boolean {
  const title = chunk.citationTitle.toLowerCase();
  const content = chunk.content.toLowerCase();
  const combined = `${title} ${content}`;

  if (intent.dress && !hasDressSignal(combined)) {
    return false;
  }

  if (intent.attendance && !containsAny(combined, ATTENDANCE_TERMS)) {
    return false;
  }

  if (intent.records && !containsAny(combined, RECORDS_TERMS)) {
    return false;
  }

  return true;
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

  const expanded = expandIntentTerms(normalized);
  for (const term of expanded) {
    tokens.push(term);
  }

  const uniqueTerms = new Set(tokens);
  return Array.from(uniqueTerms).slice(0, 16);
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

  if (/\bdress\b|\bclothing\b|\bapparel\b/.test(normalizedScenario)) {
    expanded.add("dress");
    expanded.add("dress code");
    expanded.add("apparel");
    expanded.add("clothing");
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

  return Array.from(expanded);
}

function extractLikelyPolicyCodes(input: string): string[] {
  const matches = input.match(/(?:po\s*)?\d{3,5}(?:\.\d+)?/gi) ?? [];
  return Array.from(new Set(matches.map((match) => match.replace(/\s+/g, ""))));
}

interface RetrievalIntent {
  dress: boolean;
  attendance: boolean;
  records: boolean;
  staffRequested: boolean;
  studentRequested: boolean;
  studentRecordsRequested: boolean;
  disciplineRequested: boolean;
}

function detectIntent(scenario: string): RetrievalIntent {
  const normalized = normalizeScenario(scenario);

  return {
    dress: /\bdress|appearance|uniform|groom\w*|attire|apparel|clothing\b/.test(normalized),
    attendance: /\battendance|absence|absent|truancy|tardy|late|excused\b/.test(normalized),
    records: /\brecord|records|retention|ferpa|privacy|confidential\b/.test(normalized),
    staffRequested: /\bstaff|support staff|administrator|administration|professional staff\b/.test(normalized),
    studentRequested: /\bstudent|students|pupil|pupils\b/.test(normalized),
    studentRecordsRequested: /\bstudent\s+records?\b|\bferpa\b/.test(normalized),
    disciplineRequested: /\bdiscipline|suspend|suspension|expel|expulsion|consequence|consequences\b/.test(
      normalized,
    ),
  };
}

function getPolicyThreshold(intent: RetrievalIntent): number {
  if (intent.dress) {
    return 12;
  }

  if (intent.attendance || intent.records) {
    return 8;
  }

  return 4;
}

function getHandbookThreshold(intent: RetrievalIntent): number {
  if (intent.dress) {
    return 8;
  }

  if (intent.attendance || intent.records) {
    return 7;
  }

  return 4;
}

function getStateLawThreshold(intent: RetrievalIntent): number {
  if (intent.dress) {
    return 9;
  }

  if (intent.attendance || intent.records) {
    return 8;
  }

  return 5;
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

function mergePolicyCandidates(
  lexicalCandidates: StoredPolicy[],
  semanticCandidates: StoredPolicy[],
): StoredPolicy[] {
  const merged = new Map<number, StoredPolicy>();
  for (const candidate of lexicalCandidates) {
    merged.set(candidate.id, candidate);
  }
  for (const candidate of semanticCandidates) {
    if (!merged.has(candidate.id)) {
      merged.set(candidate.id, candidate);
    }
  }
  return Array.from(merged.values());
}

function mergeHandbookCandidates(
  lexicalCandidates: StoredHandbookChunk[],
  semanticCandidates: StoredHandbookChunk[],
): StoredHandbookChunk[] {
  const merged = new Map<number, StoredHandbookChunk>();
  for (const candidate of lexicalCandidates) {
    merged.set(candidate.id, candidate);
  }
  for (const candidate of semanticCandidates) {
    if (!merged.has(candidate.id)) {
      merged.set(candidate.id, candidate);
    }
  }
  return Array.from(merged.values());
}

function mergeStateLawCandidates(
  lexicalCandidates: StoredStateLawChunk[],
  semanticCandidates: StoredStateLawChunk[],
): StoredStateLawChunk[] {
  const merged = new Map<number, StoredStateLawChunk>();
  for (const candidate of lexicalCandidates) {
    merged.set(candidate.id, candidate);
  }
  for (const candidate of semanticCandidates) {
    if (!merged.has(candidate.id)) {
      merged.set(candidate.id, candidate);
    }
  }
  return Array.from(merged.values());
}

function dedupeStateLawGuidance(
  chunks: StateLawRetrievalResult[],
): StateLawRetrievalResult[] {
  const seen = new Set<string>();
  const deduped: StateLawRetrievalResult[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.sourceUrl}::${chunk.sectionId.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(chunk);
  }

  return deduped;
}

function dedupeHandbookGuidance(
  chunks: HandbookRetrievalResult[],
): HandbookRetrievalResult[] {
  const seen = new Set<string>();
  const deduped: HandbookRetrievalResult[] = [];

  for (const chunk of chunks) {
    const title = normalizeChunkText(chunk.sectionTitle);
    const snippet = normalizeChunkText(chunk.content).slice(0, 180);
    const key = `${title}::${snippet}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(chunk);
  }

  return deduped;
}

function normalizeChunkText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function cosineSimilarity(a: number[] | null, b: number[] | null): number | null {
  if (!a || !b || a.length === 0 || a.length !== b.length) {
    return null;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA <= 0 || normB <= 0) {
    return null;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
