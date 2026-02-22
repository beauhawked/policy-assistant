import { promises as fs } from "node:fs";
import path from "node:path";

import type { BillComparison, BillIndex, BillRecord } from "@/lib/types";

const CACHE_ROOT = path.join(process.cwd(), "data", "cache");

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

async function ensureDirForFile(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureDirForFile(filePath);
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function indexFile(year: string): string {
  return path.join(CACHE_ROOT, `index-${year}.json`);
}

function billFile(year: string, billName: string): string {
  return path.join(CACHE_ROOT, "bills", year, `${safeSegment(billName)}.json`);
}

function versionTextFile(year: string, billName: string, versionName: string): string {
  return path.join(
    CACHE_ROOT,
    "text",
    year,
    safeSegment(billName),
    `${safeSegment(versionName)}.txt`,
  );
}

function comparisonFile(
  year: string,
  billName: string,
  fromVersion: string,
  toVersion: string,
): string {
  return path.join(
    CACHE_ROOT,
    "comparisons",
    year,
    safeSegment(billName),
    `${safeSegment(fromVersion)}__${safeSegment(toVersion)}.json`,
  );
}

export async function readBillIndex(year: string): Promise<BillIndex | null> {
  return readJson<BillIndex>(indexFile(year));
}

export async function writeBillIndex(index: BillIndex): Promise<void> {
  await writeJson(indexFile(index.year), index);
}

export async function readBillRecord(year: string, billName: string): Promise<BillRecord | null> {
  return readJson<BillRecord>(billFile(year, billName));
}

export async function writeBillRecord(record: BillRecord): Promise<void> {
  await writeJson(billFile(record.year, record.billName), record);
}

export async function readVersionText(
  year: string,
  billName: string,
  versionName: string,
): Promise<string | null> {
  try {
    const text = await fs.readFile(versionTextFile(year, billName, versionName), "utf8");
    return text;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeVersionText(
  year: string,
  billName: string,
  versionName: string,
  text: string,
): Promise<void> {
  const filePath = versionTextFile(year, billName, versionName);
  await ensureDirForFile(filePath);
  await fs.writeFile(filePath, text, "utf8");
}

export async function readComparison(
  year: string,
  billName: string,
  fromVersion: string,
  toVersion: string,
): Promise<BillComparison | null> {
  return readJson<BillComparison>(comparisonFile(year, billName, fromVersion, toVersion));
}

export async function writeComparison(comparison: BillComparison): Promise<void> {
  await writeJson(
    comparisonFile(
      comparison.year,
      comparison.billName,
      comparison.fromVersion,
      comparison.toVersion,
    ),
    comparison,
  );
}
