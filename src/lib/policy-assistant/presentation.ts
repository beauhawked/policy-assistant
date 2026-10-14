export function parseNumberedSteps(content: string): string[] {
  const steps: string[] = [];
  let pendingPrefix = "";

  for (const raw of stripLeadingSectionLabel(content).split("\n")) {
    const line = raw.trim();
    if (!line) {
      continue;
    }

    const subsection = normalizeSubsectionHeading(line);
    if (subsection === "evidence") {
      continue;
    }
    if (subsection === "uncertainty") {
      pendingPrefix = "Uncertainty: ";
      continue;
    }

    const isNewStep = /^(?:[-*•]\s+|\*\*?\d+[.)]\s*|\d+[.)]\s+)/.test(line);
    const text = line
      .replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, "")
      .replace(/^\*\*(\d+[.)])\s*/, "")
      .trim();
    if (!text) {
      continue;
    }

    if (isNewStep || steps.length === 0 || pendingPrefix) {
      steps.push(`${pendingPrefix}${text}`);
      pendingPrefix = "";
    } else {
      steps[steps.length - 1] = `${steps[steps.length - 1]} ${line}`;
    }
  }

  return steps;
}

function normalizeSubsectionHeading(line: string): "evidence" | "uncertainty" | null {
  const normalized = line
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/:\s*$/, "")
    .trim()
    .toLowerCase();

  if (normalized === "evidence-backed steps" || normalized === "evidence based steps") {
    return "evidence";
  }
  if (normalized === "uncertainty" || normalized === "uncertainties") {
    return "uncertainty";
  }
  return null;
}

function stripLeadingSectionLabel(content: string): string {
  return content
    .replace(
      /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*Action Steps\s*:?\s*(?:\*\*)?\s*\n?/i,
      "",
    )
    .replace(
      /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*Legal,\s*Ethical,\s*and\s*Academic Implications\s*:?\s*(?:\*\*)?\s*\n?/i,
      "",
    )
    .trim();
}
