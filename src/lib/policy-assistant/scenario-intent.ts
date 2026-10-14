import type { HandbookRetrievalResult, RetrievalResult } from "@/lib/policy-assistant/types";

export interface DetailedScenarioIntent {
  backgroundCheck: boolean;
  dress: boolean;
  attendance: boolean;
  leave: boolean;
  records: boolean;
  bullying: boolean;
  specialEducation: boolean;
  devicePrivacy: boolean;
  safety: boolean;
  studentRequested: boolean;
  disciplineRequested: boolean;
  studentRemoval: boolean;
  multiIssueScenario: boolean;
  staffRequested: boolean;
}

export function detectDetailedIntent(scenario: string): DetailedScenarioIntent {
  const normalized = scenario.toLowerCase();
  const bullying =
    /\bbully|bullying|harass|harassment|taunt|ridicule|mocking|intimidat\w*\b/i.test(normalized);
  const specialEducation =
    /\biep|bip|manifestation|disability|special education|504|behavior intervention plan\b/i.test(
      normalized,
    );
  const devicePrivacy =
    /\belectronic device|phone|phones|video|videos|recorded|recording|social media|privacy|confidential\b/i.test(
      normalized,
    );
  const safety =
    /\bsafe school|safe environment|school safety|student supervision|welfare\b/i.test(normalized);
  const studentRequested = /\bstudent|students|pupil|pupils\b/i.test(normalized);
  const studentRemoval =
    /\bremoval|remove(?:d)?|send(?:ing|s|t)? home|pick(?:ed)? up|early dismissal|exclude(?:d|s|ing)? from (?:class|instruction|school)\b/i.test(
      normalized,
    );
  const disciplineRequested =
    /\bdiscipline|suspend|suspension|expel|expulsion|consequence|consequences|fight|fighting|altercation|removal|remove(?:d)?|send(?:ing|s|t)? home|pick(?:ed)? up|early dismissal|exclude(?:d|s|ing)? from (?:class|instruction|school)\b/i.test(
      normalized,
    );
  const focusedIntentCount = [
    bullying,
    specialEducation,
    devicePrivacy,
    safety,
    disciplineRequested,
  ].filter(Boolean).length;

  return {
    backgroundCheck: /\bbackground checks?\b|\bcriminal history checks?\b/i.test(normalized),
    dress:
      /\bdress\b|\bdress code\b|\buniform\b|\battire\b|\bgroom(?:ing)?\b|\bappearance\b/i.test(
        normalized,
      ),
    attendance:
      /\battendance\b|\babsence\b|\babsent\b|\btruancy\b|\btardy\b|\bexcused\b/i.test(
        normalized,
      ),
    leave:
      /\bleave\b|\bvacation\b|\bsick\b|\bpersonal leave\b|\bmedical\b|\bbereavement\b|\bsubpoena\b|\bjury duty\b/i.test(
        normalized,
      ),
    records:
      /\brecord\b|\brecords\b|\bretention\b|\bferpa\b|\bprivacy\b|\bconfidential\b/i.test(
        normalized,
      ),
    bullying,
    specialEducation,
    devicePrivacy,
    safety,
    studentRequested,
    disciplineRequested,
    studentRemoval,
    multiIssueScenario: focusedIntentCount >= 2,
    staffRequested:
      /\bstaff\b|\badministration\b|\badministrator\b|\bprofessional staff\b|\bsupport staff\b|\bteacher\b|\bprincipal\b|\bsuperintendent\b|\bemployee\b/i.test(
        normalized,
      ),
  };
}

export function filterPortablePolicyMismatches(
  policies: RetrievalResult[],
  scenario: string,
  intent: DetailedScenarioIntent,
): RetrievalResult[] {
  if (policies.length === 0) {
    return [];
  }

  if (intent.backgroundCheck) {
    const backgroundMatches = policies.filter((policy) =>
      /\bbackground checks?|criminal history|criminal records?|convictions?|arrests?|substantiated child abuse\b/i.test(
        `${policy.policyTitle} ${policy.policyWording}`,
      ),
    );
    return backgroundMatches.length > 0 ? backgroundMatches : policies;
  }

  if (!intent.studentRequested || !intent.specialEducation) {
    return policies;
  }

  const asksAboutRecordingOrMeeting =
    /\brecord(?:ed|ing)?\b|\biep (?:team )?meeting\b|\bcase conference\b/i.test(scenario);
  const asksAboutEmployment = /\bemploy(?:ee|ment|ed|er)\b|\bstaff member\b/i.test(scenario);
  const filtered = policies.filter((policy) => {
    const title = policy.policyTitle;
    if (!asksAboutRecordingOrMeeting && /\brecording of iep (?:team )?meetings?\b/i.test(title)) {
      return false;
    }
    if (!asksAboutEmployment && /\bdisability discrimination in employment\b/i.test(title)) {
      return false;
    }
    return true;
  });

  const studentRemovalMatches = intent.studentRemoval
    ? filtered.filter((policy) =>
        /\bsuspension|expulsion|student discipline|student conduct|special education|students? with disabilities|section 504|due process|removal from (?:class|instruction|school)\b/i.test(
          policy.policyTitle,
        ),
      )
    : filtered;

  return studentRemovalMatches.length > 0
    ? studentRemovalMatches
    : filtered.length > 0
      ? filtered
      : policies;
}

export function filterPortableHandbookMismatches(
  guidance: HandbookRetrievalResult[],
  scenario: string,
  intent: DetailedScenarioIntent,
): HandbookRetrievalResult[] {
  if (guidance.length === 0 || !intent.studentRemoval) {
    return guidance;
  }

  const titleAligned = guidance.filter((chunk) => {
    if (hasBusContextMismatch(chunk, scenario)) {
      return false;
    }
    return /\bdiscipline|suspension|expulsion|removal|dismissal|conduct|iep|special education|disabilit|attendance\b/i.test(
      chunk.sectionTitle,
    );
  });

  return titleAligned.length > 0 ? titleAligned : guidance;
}

function hasBusContextMismatch(chunk: HandbookRetrievalResult, scenario: string): boolean {
  const normalizedScenario = scenario.toLowerCase();
  const opening = chunk.content.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 900);
  const busSpecific =
    /\bschool bus\b|\bbus stop\b|\bbus driver\b|\bwhile riding (?:a|the) bus\b/.test(opening);

  return busSpecific && !/\bbus\b|\btransportation\b/.test(normalizedScenario);
}
