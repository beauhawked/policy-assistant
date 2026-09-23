import { ChangeEvent, DragEvent, ReactNode, useState } from "react";
import {
  AssistantMessageSection,
  AssistantSectionKind,
  AuthMode,
  ChatMessage,
  DetailView,
  EvidenceItem,
  HandbookDocument,
  HandbookType,
  LibraryPolicyRecord,
  MESSAGE_LIST_NEAR_BOTTOM_PX,
  PolicyAnswerEvidenceSnapshot,
  PolicyDataset,
  PolicyImportQuality,
  ReferenceCard,
  ReferenceField,
  ReferenceLookup,
  RenderedChatBubble,
} from "./types";

export function isMessageListNearBottom(
  element: HTMLDivElement,
  thresholdPx: number = MESSAGE_LIST_NEAR_BOTTOM_PX,
): boolean {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= thresholdPx;
}

export function RailIcon({ paths }: { paths: string[] }): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export function HealthMark({ good }: { good: boolean }): ReactNode {
  return <span className={`piq-health-mark${good ? " is-good" : " is-warn"}`} aria-hidden="true" />;
}

export function FileDropzone({
  id,
  title,
  hint,
  accept,
  glyph,
  file,
  onFile,
}: {
  id: string;
  title: string;
  hint: string;
  accept: string;
  glyph: string;
  file: File | null;
  onFile: (file: File | null) => void;
}): ReactNode {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) {
      onFile(dropped);
    }
  };

  return (
    <label
      htmlFor={id}
      className={`piq-dropzone${isDragging ? " is-dragging" : ""}${file ? " is-filled" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <span className="piq-dropzone-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="piq-dropzone-title">{title}</span>
      <span className="piq-dropzone-hint">{file ? file.name : hint}</span>
      <input
        id={id}
        name="file"
        type="file"
        accept={accept}
        className="piq-dropzone-input"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onFile(event.target.files?.[0] ?? null)
        }
      />
    </label>
  );
}

export function deriveFirstName(email: string): string {
  const localPart = email.split("@")[0] ?? "Administrator";
  const rawName = localPart.split(/[\._\-]/)[0] ?? "Administrator";
  return rawName.charAt(0).toUpperCase() + rawName.slice(1);
}

export function deriveInitials(email: string, districtName: string): string {
  const localPart = email.split("@")[0] ?? "";
  const parts = localPart.split(/[\._\-]/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const dist = districtName.trim();
  if (dist.length >= 2) {
    return dist.slice(0, 2).toUpperCase();
  }
  return "PA";
}

export function findMetadataValue(metadata: ReferenceField[], label: string): string {
  const normalized = label.trim().toLowerCase();
  const match = metadata.find((item) => item.label.trim().toLowerCase() === normalized);
  return match?.value ?? "";
}

export function formatShortDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatLongDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelativeDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const elapsedMs = Date.now() - parsed.getTime();
  const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
  const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

  if (elapsedMinutes < 2) return "Just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  if (elapsedDays === 1) return "Yesterday";
  if (elapsedDays < 7) return `${elapsedDays}d ago`;

  return formatShortDate(value);
}

export function formatDatasetSource(dataset: PolicyDataset): string {
  if (dataset.sourceType === "scraper_import") {
    const platform = formatDatasetSourcePlatform(dataset.sourcePlatform);
    return platform ? `Scraper · ${platform}` : "Scraper";
  }
  return "CSV upload";
}

export function formatDatasetSourcePlatform(sourcePlatform: string): string {
  if (sourcePlatform === "boarddocs") return "BoardDocs";
  if (sourcePlatform === "table-link") return "Table-based";
  if (sourcePlatform === "accordion-pdf") return "Accordion + PDF";
  if (sourcePlatform === "parentsquare") return "ParentSquare";
  return sourcePlatform.trim();
}

export function readSetupDone(userId: string): boolean {
  if (!userId || typeof window === "undefined") return false;
  return window.localStorage.getItem(`piq-setup-done-${userId}`) === "1";
}

export function writeSetupDone(userId: string): void {
  if (!userId || typeof window === "undefined") return;
  window.localStorage.setItem(`piq-setup-done-${userId}`, "1");
}

export function buildClientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildPolicyImportQualityMessages(quality: PolicyImportQuality): string[] {
  const warnings: string[] = [];
  if (quality.missingWordingCount > 0) {
    warnings.push(`${quality.missingWordingCount} policies have empty wording.`);
  }
  if (quality.missingTitleCount > 0) {
    warnings.push(`${quality.missingTitleCount} policies are missing a title.`);
  }
  if (quality.missingCodeCount > 0) {
    warnings.push(`${quality.missingCodeCount} policies are missing a code.`);
  }
  if (quality.duplicateCodeCount > 0) {
    warnings.push(`${quality.duplicateCodeCount} duplicate policy codes detected.`);
  }
  return warnings;
}

export function buildEvidenceChips(
  evidence: PolicyAnswerEvidenceSnapshot | null | undefined,
  messageId: string,
  onOpenEvidence: (item: EvidenceItem) => void,
): ReactNode {
  if (!evidence) return null;
  const items: EvidenceItem[] = [];

  for (const match of evidence.policyMatches ?? []) {
    items.push({
      id: `p-${match.id}`,
      messageId,
      label: match.policyCode || "Policy",
      title: match.policyTitle || match.policyCode || "District Policy",
      quote: match.policyTitle ? `${match.policyCode}: ${match.policyTitle}` : match.policyCode,
      meta: match.revisedDate ? `Revised ${match.revisedDate}` : "Board Policy",
      lookup: evidence.policyDataset?.id
        ? {
            kind: "policy",
            datasetId: evidence.policyDataset.id,
            policyCode: match.policyCode,
            policyTitle: match.policyTitle,
          }
        : undefined,
    });
  }

  for (const hv of evidence.handbookVersions ?? []) {
    const typeLabel = hv.handbookType === "staff" ? "Staff Handbook" : "Student Handbook";
    for (const ex of hv.matchedExcerpts ?? []) {
      items.push({
        id: `h-${ex.id}`,
        messageId,
        label: hv.title || typeLabel,
        title: ex.sectionTitle || typeLabel,
        quote: ex.sectionTitle,
        meta: typeLabel,
        lookup: {
          kind: "handbook",
          handbookType: hv.handbookType,
          sectionTitle: ex.sectionTitle,
        },
      });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="piq-citation-chips">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="piq-chip"
          onClick={() => onOpenEvidence(item)}
          title="View source evidence"
        >
          {item.label} ↗
        </button>
      ))}
    </div>
  );
}

export function expandChatMessage(
  message: ChatMessage,
  selectedDatasetId: string,
): RenderedChatBubble[] {
  if (message.role === "user") {
    return [
      {
        id: message.id,
        role: "user",
        kind: "general",
        content: message.content,
      },
    ];
  }

  const sections = splitAssistantMessageIntoSections(message.content);
  return sections.map((section, index) => {
    const card = buildReferenceCard(section, selectedDatasetId);
    let label: string | undefined;
    if (section.kind === "action") label = "RECOMMENDED ACTIONS";
    if (section.kind === "implications") label = "LEGAL, ETHICAL & ACADEMIC IMPLICATIONS";

    return {
      id: `${message.id}-s${index}`,
      role: "assistant",
      kind: section.kind,
      label,
      content: section.content,
      answerEvidence: message.answerEvidence,
      referenceCard: card,
    };
  });
}

export function splitAssistantMessageIntoSections(content: string): AssistantMessageSection[] {
  const lines = content.split("\n");
  const sections: AssistantMessageSection[] = [];
  let currentKind: AssistantSectionKind = "general";
  let currentLines: string[] = [];

  const pushCurrent = (): void => {
    const text = currentLines.join("\n").trim();
    if (text) {
      sections.push({ kind: currentKind, content: text });
    }
    currentLines = [];
  };

  for (const line of lines) {
    if (isRelevantPoliciesHeading(line)) {
      pushCurrent();
      currentKind = "policy";
      continue;
    }
    if (isRelevantHandbookHeading(line)) {
      pushCurrent();
      currentKind = "handbook";
      continue;
    }
    if (isActionStepsHeading(line)) {
      pushCurrent();
      currentKind = "action";
      continue;
    }
    if (isImplicationsHeading(line)) {
      pushCurrent();
      currentKind = "implications";
      continue;
    }

    currentLines.push(line);
  }
  pushCurrent();

  return sections;
}

export function isRelevantPoliciesHeading(line: string): boolean {
  return /^\s*(?:\*\*)?Relevant Policies\s*:?\s*(?:\*\*)?\s*$/i.test(line);
}

export function isRelevantHandbookHeading(line: string): boolean {
  return /^\s*(?:\*\*)?Relevant Handbook Guidance\s*:?\s*(?:\*\*)?\s*$/i.test(line);
}

export function isActionStepsHeading(line: string): boolean {
  return /^\s*(?:\*\*)?Action Steps\s*:?\s*(?:\*\*)?\s*$/i.test(line);
}

export function isImplicationsHeading(line: string): boolean {
  return /^\s*(?:\*\*)?Legal,\s*Ethical,\s*and\s*Academic Implications\s*:?\s*(?:\*\*)?\s*$/i.test(line);
}

export function buildReferenceCard(
  section: AssistantMessageSection,
  selectedDatasetId: string,
): ReferenceCard | undefined {
  if (section.kind === "policy") {
    return buildPolicyReferenceCard(section.content, selectedDatasetId);
  }
  if (section.kind === "handbook") {
    return buildHandbookReferenceCard(section.content);
  }
  return undefined;
}

export function buildPolicyReferenceCard(
  content: string,
  selectedDatasetId: string,
): ReferenceCard | undefined {
  const fields = parseReferenceFields(content);
  const policyTitle = fields.get("policy title") ?? "";
  const policyCode = fields.get("policy code") ?? "";
  const policyWording = normalizeReferenceSummary(fields.get("policy wording") ?? "");

  if (!policyTitle && !policyCode && !policyWording) {
    return undefined;
  }

  const title = [policyCode, policyTitle].filter(Boolean).join(" - ") || "District Policy";

  return {
    label: "Policy",
    title,
    compactSummary: truncateReferenceSummary(policyWording || "No summary provided."),
    summary: policyWording || "No summary provided.",
    summaryLabel: "Brief Summary",
    detailButtonLabel: "Show full policy",
    fullTextLabel: "Full Policy Wording",
    metadata: [
      buildReferenceField("Policy Section", fields.get("policy section")),
      buildReferenceField("Adopted", fields.get("date of policy adoption date")),
      buildReferenceField("Revised", fields.get("date of policy revision date")),
      buildReferenceField("Status", fields.get("policy status")),
    ].filter(isReferenceField),
    lookup:
      selectedDatasetId && (policyCode || policyTitle)
        ? {
            kind: "policy",
            datasetId: selectedDatasetId,
            policyCode,
            policyTitle,
          }
        : undefined,
  };
}

export function buildHandbookReferenceCard(content: string): ReferenceCard | undefined {
  const fields = parseReferenceFields(content);
  const sectionTitle = fields.get("handbook section") ?? "";
  const handbookGuidance = normalizeReferenceSummary(fields.get("handbook guidance") ?? "");
  const handbookType = extractHandbookType(content);

  if (!sectionTitle && !handbookGuidance) {
    return undefined;
  }

  const isNoMatch =
    /^no matching .*handbook guidance$/i.test(sectionTitle.trim()) ||
    /no matching .*handbook guidance found/i.test(handbookGuidance);

  if (isNoMatch) {
    return undefined;
  }

  return {
    label:
      handbookType === "staff"
        ? "Staff Handbook"
        : handbookType === "student"
          ? "Student Handbook"
          : "Handbook",
    title: sectionTitle || "Handbook Guidance",
    compactSummary: truncateReferenceSummary(handbookGuidance || "No summary provided."),
    summary: handbookGuidance || "No summary provided.",
    summaryLabel: "Brief Summary",
    detailButtonLabel: "Show full guidance",
    fullTextLabel: "Full Handbook Guidance",
    metadata: [
      buildReferenceField(
        "Handbook Type",
        handbookType === "staff"
          ? "Staff Handbook"
          : handbookType === "student"
            ? "Student Handbook"
            : null,
      ),
    ].filter(isReferenceField),
    lookup:
      !isNoMatch && handbookType && sectionTitle
        ? {
            kind: "handbook",
            handbookType,
            sectionTitle,
          }
        : undefined,
  };
}

export function parseReferenceFields(content: string): Map<string, string> {
  const fields = new Map<string, string>();
  let currentField = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(
      /^(Policy Section|Policy Code|Date of Policy Adoption Date|Date of Policy Revision Date|Policy Status|Policy Title|Policy Wording|Handbook Section|Handbook Guidance|Handbook Type)\s*:\s*(.*)$/i,
    );

    if (match) {
      currentField = match[1].trim().toLowerCase();
      fields.set(currentField, match[2].trim());
      continue;
    }

    if (!currentField) continue;

    const previous = fields.get(currentField) ?? "";
    fields.set(currentField, `${previous}\n${line}`.trim());
  }

  return fields;
}

export function normalizeReferenceSummary(value: string): string {
  return value
    .replace(/^This is a summary of the handbook guidance:\s*/i, "")
    .replace(/^This is a summary of the policy:\s*/i, "")
    .replace(/\s*This is a summary of the handbook guidance\.?$/i, "")
    .replace(/\s*This is a summary of the policy\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateReferenceSummary(value: string, maxLength: number = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const truncated = normalized.slice(0, maxLength);
  const safeBoundary = Math.max(
    truncated.lastIndexOf(" "),
    truncated.lastIndexOf("."),
    truncated.lastIndexOf(","),
  );
  const summary = safeBoundary > maxLength / 2 ? truncated.slice(0, safeBoundary) : truncated;
  return `${summary.trim()}...`;
}

export function buildReferenceField(
  label: string,
  value: string | null | undefined,
): ReferenceField | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  return { label, value: normalized };
}

export function isReferenceField(value: ReferenceField | null): value is ReferenceField {
  return Boolean(value);
}

export function extractHandbookType(content: string): "student" | "staff" | null {
  const match = content.match(/handbook type\s*:\s*(student|staff)/i);
  if (!match) {
    if (
      /\bemployee\b|\bemployees\b|\bstaff\b|\bteacher\b|\bteachers\b|\bfmla\b|\bvacation\b|\bjury duty\b|\bsubpoena\b|\bbereavement\b|\bunion officers?\b/i.test(
        content,
      )
    ) {
      return "staff";
    }
    if (/\bstudent\b|\bstudents\b|\bpupil\b|\bpupils\b|\bparent\b|\bfamily\b/i.test(content)) {
      return "student";
    }
    return null;
  }
  return match[1].toLowerCase() === "staff" ? "staff" : "student";
}

export function formatHandbookTypeLabel(handbookType: "student" | "staff"): string {
  return handbookType === "staff" ? "Staff handbook" : "Student handbook";
}

export function parseNumberedSteps(content: string): string[] {
  const steps: string[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*(?:\d+[\.\)]|\*|-)\s*(.+)$/);
    if (match) {
      steps.push(match[1].trim());
    }
  }
  return steps.length > 0 ? steps : [content];
}

export function totalPolicyCount(datasets: PolicyDataset[]): number {
  return datasets.reduce((sum, dataset) => sum + (dataset.archivedAt ? 0 : dataset.policyCount), 0);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findRelatedPolicies(
  detail: DetailView,
  policies: LibraryPolicyRecord[],
): LibraryPolicyRecord[] {
  const prefix = detail.code.slice(0, 3);
  return policies
    .filter((p) => p.policyCode !== detail.code && p.policyCode.startsWith(prefix))
    .slice(0, 4);
}

export function renderRichText(text: string): ReactNode {
  return text;
}

export function upsertConversation(
  previous: { id: string; datasetId: string; title: string; createdAt: string; updatedAt: string; lastMessageAt: string; messageCount: number }[],
  incoming: { id: string; datasetId: string; title: string; createdAt: string; updatedAt: string; lastMessageAt: string; messageCount: number },
): { id: string; datasetId: string; title: string; createdAt: string; updatedAt: string; lastMessageAt: string; messageCount: number }[] {
  const withoutIncoming = previous.filter((conversation) => conversation.id !== incoming.id);
  const merged = [incoming, ...withoutIncoming];
  return merged.sort(
    (left, right) =>
      new Date(right.lastMessageAt || right.updatedAt).getTime() -
      new Date(left.lastMessageAt || left.updatedAt).getTime(),
  );
}

export function authTitleForMode(mode: AuthMode): string {
  if (mode === "signup") return "Create your workspace";
  if (mode === "forgot") return "Reset your password";
  if (mode === "reset") return "Set a new password";
  return "Sign in";
}

export function authButtonLabel(mode: AuthMode): string {
  if (mode === "signup") return "Create workspace";
  if (mode === "forgot") return "Email reset link";
  if (mode === "reset") return "Update password";
  return "Sign in";
}

export function clearAuthQueryParams(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("verifyToken");
  url.searchParams.delete("resetToken");
  window.history.replaceState(window.history.state, "", url.toString());
}
