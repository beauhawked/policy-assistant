import { diffLines } from "diff";

import type { BillComparison } from "@/lib/types";

function lineCount(text: string): number {
  if (!text) {
    return 0;
  }

  return text.split("\n").length;
}

function compressSnippet(value: string, max = 520): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) {
    return clean;
  }

  return `${clean.slice(0, max - 3)}...`;
}

function collectHighlights(
  originalText: string,
  updatedText: string,
): Array<{ before: string; after: string }> {
  const pieces = diffLines(originalText, updatedText, { newlineIsToken: false });
  const highlights: Array<{ before: string; after: string }> = [];

  let pendingRemoved = "";

  for (const piece of pieces) {
    const value = piece.value?.trim();
    if (!value) {
      continue;
    }

    if (piece.removed) {
      pendingRemoved = `${pendingRemoved}\n${value}`.trim();
      continue;
    }

    if (piece.added) {
      highlights.push({
        before: compressSnippet(pendingRemoved || "No matching text in previous version."),
        after: compressSnippet(value),
      });
      pendingRemoved = "";
      continue;
    }

    if (pendingRemoved) {
      highlights.push({
        before: compressSnippet(pendingRemoved),
        after: "Removed without direct replacement.",
      });
      pendingRemoved = "";
    }

    if (highlights.length >= 12) {
      break;
    }
  }

  if (pendingRemoved && highlights.length < 12) {
    highlights.push({
      before: compressSnippet(pendingRemoved),
      after: "Removed without direct replacement.",
    });
  }

  return highlights.slice(0, 10);
}

function summarizeTopics(changedText: string): string[] {
  const topics = [
    { label: "education policy", terms: ["school", "student", "teacher", "education"] },
    { label: "tax and finance", terms: ["tax", "revenue", "appropriation", "fiscal"] },
    { label: "public safety", terms: ["crime", "police", "court", "firearm", "penalty"] },
    { label: "health care", terms: ["health", "medicaid", "hospital", "insurance"] },
    { label: "local government", terms: ["county", "municipal", "township", "local unit"] },
    { label: "labor and employment", terms: ["employee", "employment", "wage", "workforce"] },
  ];

  const lowered = changedText.toLowerCase();
  const matched = topics
    .filter((topic) => topic.terms.some((term) => lowered.includes(term)))
    .slice(0, 2)
    .map((topic) => `Revision language appears to materially touch ${topic.label}.`);

  const effectiveDateChanged =
    lowered.includes("effective") && (lowered.includes("july") || lowered.includes("january"));

  if (effectiveDateChanged) {
    matched.push("Effective date wording changed, which may alter when provisions become active.");
  }

  return matched;
}

function buildSummary(
  fromVersion: string,
  toVersion: string,
  stats: BillComparison["stats"],
  highlights: Array<{ before: string; after: string }>,
): string[] {
  const summary: string[] = [];

  summary.push(
    `${toVersion} compared with ${fromVersion}: +${stats.addedLines} lines, -${stats.removedLines} lines (${Math.round(
      stats.changeRatio * 100,
    )}% of lines changed).`,
  );

  if (highlights.length > 0) {
    summary.push("The update includes direct wording substitutions, not only formatting edits.");
  }

  const topicHints = summarizeTopics(
    highlights
      .map((highlight) => `${highlight.before}\n${highlight.after}`)
      .join("\n"),
  );

  summary.push(...topicHints);

  if (summary.length < 3 && stats.addedLines + stats.removedLines < 20) {
    summary.push("This appears to be a small technical update with limited structural change.");
  }

  return summary.slice(0, 4);
}

export function createBillComparison(
  year: string,
  billName: string,
  fromVersion: string,
  toVersion: string,
  originalText: string,
  updatedText: string,
): BillComparison {
  const pieces = diffLines(originalText, updatedText, { newlineIsToken: false });

  let addedLines = 0;
  let removedLines = 0;
  let unchangedLines = 0;

  for (const piece of pieces) {
    const count = lineCount(piece.value);

    if (piece.added) {
      addedLines += count;
    } else if (piece.removed) {
      removedLines += count;
    } else {
      unchangedLines += count;
    }
  }

  const changeRatio =
    unchangedLines + addedLines + removedLines === 0
      ? 0
      : (addedLines + removedLines) / (unchangedLines + addedLines + removedLines);

  const highlights = collectHighlights(originalText, updatedText);

  return {
    year,
    billName,
    fromVersion,
    toVersion,
    generatedAt: new Date().toISOString(),
    originalText,
    updatedText,
    highlights,
    stats: {
      addedLines,
      removedLines,
      unchangedLines,
      changeRatio,
    },
    summary: buildSummary(
      fromVersion,
      toVersion,
      {
        addedLines,
        removedLines,
        unchangedLines,
        changeRatio,
      },
      highlights,
    ),
  };
}
