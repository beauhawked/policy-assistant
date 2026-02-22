import { readBillIndex, readBillRecord, readComparison, readVersionText, writeComparison, writeVersionText } from "@/lib/cache";
import { createBillComparison } from "@/lib/compare";
import { fetchBillVersion, fetchVersionTextFromApi } from "@/lib/iga-api";
import { syncBills } from "@/lib/sync";
import type { ApiBillVersionDetail, ApiBillVersionSummary, BillComparison, BillIndex, BillRecord } from "@/lib/types";

export const DEFAULT_YEAR = "2026";

function normalizeVersionName(version: ApiBillVersionSummary | undefined): string | null {
  if (!version) {
    return null;
  }

  return version.printVersionName ?? null;
}

function sortVersions(versions: ApiBillVersionSummary[]): ApiBillVersionSummary[] {
  return [...versions].sort((left, right) => {
    const leftDate = Date.parse(left.updated ?? left.printed ?? left.created ?? left.filed ?? "");
    const rightDate = Date.parse(right.updated ?? right.printed ?? right.created ?? right.filed ?? "");

    if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) {
      return leftDate - rightDate;
    }

    return (left.printVersionName ?? "").localeCompare(right.printVersionName ?? "");
  });
}

export async function getBillIndex(year = DEFAULT_YEAR): Promise<BillIndex | null> {
  return readBillIndex(year);
}

export async function getBillRecord(
  billName: string,
  year = DEFAULT_YEAR,
  autoSync = true,
): Promise<BillRecord | null> {
  const normalized = billName.toUpperCase();

  const cached = await readBillRecord(year, normalized);
  if (cached) {
    return cached;
  }

  if (!autoSync) {
    return null;
  }

  await syncBills({ year, billNames: [normalized], concurrency: 1 });
  return readBillRecord(year, normalized);
}

async function getVersionText(
  year: string,
  billName: string,
  versionName: string,
): Promise<string> {
  const cached = await readVersionText(year, billName, versionName);
  if (cached) {
    return cached;
  }

  let detail: ApiBillVersionDetail | null = null;
  const normalizedVersionName = versionName.toUpperCase();
  const normalizedBillName = billName.toUpperCase();

  const record = await readBillRecord(year, normalizedBillName);
  if (record) {
    const foundVersion = [...(record.detail.versions ?? []), record.detail.latestVersion]
      .filter(Boolean)
      .find(
        (version) =>
          (version?.printVersionName ?? "").toUpperCase() === normalizedVersionName,
      ) as ApiBillVersionDetail | undefined;

    if (foundVersion) {
      detail = foundVersion;
    }
  }

  if (!detail) {
    detail = await fetchBillVersion(year, normalizedBillName, normalizedVersionName);
  }

  const text = await fetchVersionTextFromApi(year, billName, versionName, detail);
  await writeVersionText(year, billName, versionName, text);

  return text;
}

export async function compareBillVersions(
  year: string,
  billName: string,
  fromVersionName: string,
  toVersionName: string,
): Promise<BillComparison> {
  const normalizedBill = billName.toUpperCase();
  const normalizedFrom = fromVersionName.toUpperCase();
  const normalizedTo = toVersionName.toUpperCase();

  const cached = await readComparison(year, normalizedBill, normalizedFrom, normalizedTo);
  if (cached) {
    return cached;
  }

  const [originalText, updatedText] = await Promise.all([
    getVersionText(year, normalizedBill, normalizedFrom),
    getVersionText(year, normalizedBill, normalizedTo),
  ]);

  const comparison = createBillComparison(
    year,
    normalizedBill,
    normalizedFrom,
    normalizedTo,
    originalText,
    updatedText,
  );

  await writeComparison(comparison);
  return comparison;
}

export async function getDefaultVersionPair(
  billName: string,
  year = DEFAULT_YEAR,
): Promise<{ fromVersion: string; toVersion: string } | null> {
  const record = await getBillRecord(billName, year, false);

  if (!record) {
    return null;
  }

  const versions = sortVersions(record.detail.versions ?? []);
  if (versions.length < 2) {
    return null;
  }

  const fromVersion = normalizeVersionName(versions[0]);
  const toVersion = normalizeVersionName(versions[versions.length - 1]);

  if (!fromVersion || !toVersion || fromVersion === toVersion) {
    return null;
  }

  return {
    fromVersion,
    toVersion,
  };
}

export function orderedVersions(record: BillRecord): ApiBillVersionSummary[] {
  return sortVersions(record.detail.versions ?? []);
}
