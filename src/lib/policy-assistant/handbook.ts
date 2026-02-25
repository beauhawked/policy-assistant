import pdfParse from "pdf-parse/lib/pdf-parse.js";

export interface HandbookChunkDraft {
  sectionTitle: string;
  content: string;
  sourceIndex: number;
}

const MAX_HANDBOOK_TEXT_LENGTH = 900_000;
const HANDBOOK_CHUNK_TARGET = 1600;
const HANDBOOK_CHUNK_MAX = 2100;

export async function extractHandbookText(filename: string, buffer: Buffer): Promise<string> {
  const extension = getFileExtension(filename);

  if (extension === ".pdf") {
    const parsed = await pdfParse(buffer);
    return normalizeHandbookText(parsed.text ?? "");
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  return normalizeHandbookText(decoder.decode(buffer));
}

export function chunkHandbookText(text: string): HandbookChunkDraft[] {
  const normalized = normalizeHandbookText(text).slice(0, MAX_HANDBOOK_TEXT_LENGTH);
  if (!normalized) {
    return [];
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter((block) => block.length >= 24);

  if (blocks.length === 0) {
    return [];
  }

  const chunks: HandbookChunkDraft[] = [];
  let activeHeading = "General Guidance";
  let chunkBuffer = "";

  const flushChunk = () => {
    const content = chunkBuffer.trim();
    if (!content) {
      return;
    }

    chunks.push({
      sectionTitle: activeHeading,
      content,
      sourceIndex: chunks.length + 1,
    });
    chunkBuffer = "";
  };

  for (const block of blocks) {
    const inlineSplitBlocks = splitBlockByInlineHeadings(block);
    for (const inlineBlock of inlineSplitBlocks) {
      let contentBlock = inlineBlock;
      const inlineHeading = extractLeadingInlineHeading(contentBlock);
      if (inlineHeading) {
        flushChunk();
        activeHeading = sanitizeHeading(inlineHeading.heading);
        contentBlock = inlineHeading.content;
      }

      if (!contentBlock) {
        continue;
      }

      if (isLikelyHeading(contentBlock)) {
        flushChunk();
        activeHeading = sanitizeHeading(contentBlock);
        continue;
      }

      const candidate = chunkBuffer ? `${chunkBuffer}\n\n${contentBlock}` : contentBlock;
      if (candidate.length > HANDBOOK_CHUNK_MAX && chunkBuffer) {
        flushChunk();
        chunkBuffer = contentBlock;
        continue;
      }

      if (candidate.length > HANDBOOK_CHUNK_MAX) {
        const split = splitLongBlock(contentBlock);
        for (const section of split) {
          chunkBuffer = section;
          flushChunk();
        }
        continue;
      }

      chunkBuffer = candidate;

      if (chunkBuffer.length >= HANDBOOK_CHUNK_TARGET) {
        flushChunk();
      }
    }
  }

  flushChunk();
  return chunks;
}

function normalizeHandbookText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n[ ]+/g, "\n")
    .trim();
}

function getFileExtension(filename: string): string {
  const index = filename.lastIndexOf(".");
  if (index < 0) {
    return "";
  }

  return filename.slice(index).toLowerCase();
}

function isLikelyHeading(block: string): boolean {
  if (block.length < 4 || block.length > 110) {
    return false;
  }

  if (/[.!?]$/.test(block)) {
    return false;
  }

  const words = block.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 14) {
    return false;
  }

  const uppercaseStartCount = words.filter((word) => /^[A-Z0-9]/.test(word)).length;
  return uppercaseStartCount >= Math.ceil(words.length * 0.7);
}

function sanitizeHeading(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "General Guidance";
  }

  return normalized.length <= 90 ? normalized : `${normalized.slice(0, 87)}...`;
}

function splitLongBlock(block: string): string[] {
  const sentences =
    block.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((sentence) => sentence.trim()) ?? [block];
  const parts: string[] = [];
  let bucket = "";

  for (const sentence of sentences) {
    const candidate = bucket ? `${bucket} ${sentence}` : sentence;
    if (candidate.length > HANDBOOK_CHUNK_MAX && bucket) {
      parts.push(bucket);
      bucket = sentence;
      continue;
    }
    bucket = candidate;
  }

  if (bucket) {
    parts.push(bucket);
  }

  return parts.filter((part) => part.trim().length > 0);
}

function splitBlockByInlineHeadings(block: string): string[] {
  const parts: string[] = [];
  const headingBoundaryPattern =
    /([.!?]\s+)([A-Z0-9][A-Z0-9/&-]{1,}(?:\s+[A-Z0-9][A-Z0-9/&-]{1,}){0,6})(?=\s+[A-Z][a-z])/g;
  let cursor = 0;

  let match: RegExpExecArray | null = headingBoundaryPattern.exec(block);
  while (match) {
    const splitIndex = match.index + match[1].length;
    const current = block.slice(cursor, splitIndex).trim();
    if (current.length >= 24) {
      parts.push(current);
    }
    cursor = splitIndex;
    match = headingBoundaryPattern.exec(block);
  }

  const tail = block.slice(cursor).trim();
  if (tail.length >= 24) {
    parts.push(tail);
  }

  return parts.length > 0 ? parts : [block];
}

function extractLeadingInlineHeading(
  block: string,
): {
  heading: string;
  content: string;
} | null {
  const headingMatch = block.match(
    /^([A-Z0-9][A-Z0-9/&-]{1,}(?:\s+[A-Z0-9][A-Z0-9/&-]{1,}){0,6})(?=\s+[A-Z][a-z])\s*(.*)$/s,
  );
  if (!headingMatch) {
    return null;
  }

  const heading = sanitizeHeading(headingMatch[1]);
  if (heading.length < 3 || heading.length > 90) {
    return null;
  }

  const content = headingMatch[2]?.trim() ?? "";
  return {
    heading,
    content,
  };
}
