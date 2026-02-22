import { parse } from "csv-parse/sync";

import type { NormalizedPolicyRow } from "@/lib/policy-assistant/types";

export interface ParsedPolicyCsv {
  headers: string[];
  rows: NormalizedPolicyRow[];
}

type PolicyField = Exclude<keyof NormalizedPolicyRow, "sourceRowIndex">;

const FIELD_ALIASES: Record<PolicyField, string[]> = {
  policySection: ["section", "policy section", "policy chapter", "chapter"],
  policyCode: ["code", "policy code", "policy number", "number"],
  adoptedDate: ["adopted date", "adoption date", "date adopted", "date of policy adoption date"],
  revisedDate: [
    "revised date",
    "revision date",
    "date revised",
    "date of policy revision date",
    "policy revision date",
  ],
  policyStatus: ["status", "policy status"],
  policyTitle: ["policy title", "title", "name of policy"],
  policyWording: ["policy wording", "wording", "policy text", "text", "body", "content"],
};

const WORDING_FALLBACK_FIELDS = [
  "statutory authority",
  "law(s) implemented",
  "history",
  "notes",
] as const;

export function parsePolicyCsvBuffer(buffer: Buffer): ParsedPolicyCsv {
  const content = buffer.toString("utf8");

  const records = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  if (records.length === 0) {
    throw new Error("The uploaded CSV has no policy rows.");
  }

  const headers = Object.keys(records[0] ?? {});
  if (headers.length === 0) {
    throw new Error("The uploaded CSV is missing a header row.");
  }

  const resolvedColumns = resolvePolicyColumns(headers);
  if (!resolvedColumns.policyTitle && !resolvedColumns.policyWording) {
    throw new Error(
      "Could not detect policy columns. Include at least 'Policy Title' or 'Policy Wording' in the CSV headers.",
    );
  }

  const rows: NormalizedPolicyRow[] = [];

  for (const [index, rawRecord] of records.entries()) {
    const record = normalizeRowValues(rawRecord);

    const policySection = readValue(record, resolvedColumns.policySection);
    const policyCode = readValue(record, resolvedColumns.policyCode);
    const adoptedDate = readValue(record, resolvedColumns.adoptedDate);
    const revisedDate = readValue(record, resolvedColumns.revisedDate);
    const policyStatus = readValue(record, resolvedColumns.policyStatus);
    const policyTitle = readValue(record, resolvedColumns.policyTitle);
    const wordingPrimary = readValue(record, resolvedColumns.policyWording);
    const wordingFallback = buildWordingFallback(record);
    const policyWording = wordingPrimary || wordingFallback;

    if (
      !policySection &&
      !policyCode &&
      !adoptedDate &&
      !revisedDate &&
      !policyStatus &&
      !policyTitle &&
      !policyWording
    ) {
      continue;
    }

    rows.push({
      policySection,
      policyCode,
      adoptedDate,
      revisedDate,
      policyStatus,
      policyTitle,
      policyWording,
      sourceRowIndex: index + 2,
    });
  }

  if (rows.length === 0) {
    throw new Error("No parseable policy rows were found in the uploaded CSV.");
  }

  return {
    headers,
    rows,
  };
}

function resolvePolicyColumns(headers: string[]): Partial<Record<PolicyField, string>> {
  const canonicalToOriginal = new Map<string, string>();
  for (const header of headers) {
    const canonical = canonicalizeHeader(header);
    if (canonical && !canonicalToOriginal.has(canonical)) {
      canonicalToOriginal.set(canonical, header);
    }
  }

  const resolved: Partial<Record<PolicyField, string>> = {};

  for (const field of Object.keys(FIELD_ALIASES) as PolicyField[]) {
    for (const alias of FIELD_ALIASES[field]) {
      const key = canonicalizeHeader(alias);
      const original = canonicalToOriginal.get(key);
      if (original) {
        resolved[field] = original;
        break;
      }
    }
  }

  return resolved;
}

function normalizeRowValues(record: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    normalized[key] = normalizeValue(value);
  }
  return normalized;
}

function readValue(record: Record<string, string>, columnName: string | undefined): string {
  if (!columnName) {
    return "";
  }
  return normalizeValue(record[columnName]);
}

function buildWordingFallback(record: Record<string, string>): string {
  const sections: string[] = [];
  const canonicalRecord = new Map<string, string>();

  for (const [key, value] of Object.entries(record)) {
    canonicalRecord.set(canonicalizeHeader(key), normalizeValue(value));
  }

  for (const field of WORDING_FALLBACK_FIELDS) {
    const canonicalField = canonicalizeHeader(field);
    const value = canonicalRecord.get(canonicalField) ?? "";
    if (!value) {
      continue;
    }
    sections.push(`${titleCase(field)}: ${value}`);
  }

  return sections.join("\n");
}

function canonicalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}
