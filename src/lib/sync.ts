import { fetchBillActions, fetchBillDetail, fetchBillList } from "@/lib/iga-api";
import { readBillIndex, writeBillIndex, writeBillRecord } from "@/lib/cache";
import type {
  ApiBillDetailResponse,
  ApiBillListItem,
  BillIndex,
  BillIndexItem,
  BillRecord,
  ChamberName,
  SyncOptions,
  SyncResult,
} from "@/lib/types";

function chamberFromValue(chamber: ApiBillDetailResponse["originChamber"]): ChamberName {
  const value =
    typeof chamber === "string" ? chamber.toLowerCase() : (chamber?.name ?? "").toLowerCase();

  if (value.includes("house")) {
    return "House";
  }

  if (value.includes("senate")) {
    return "Senate";
  }

  return "Unknown";
}

function displayFromItem(item: ApiBillListItem): string {
  return item.displayName ?? item.billName;
}

function cleanCategories(raw: string[]): string[] {
  const seen = new Set<string>();
  const categories: string[] = [];

  for (const item of raw) {
    const cleaned = item.trim();
    if (!cleaned) {
      continue;
    }

    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    categories.push(cleaned);

    if (categories.length >= 4) {
      break;
    }
  }

  return categories;
}

function toIndexItem(source: ApiBillListItem, detail: ApiBillDetailResponse): BillIndexItem {
  const latest = detail.latestVersion;
  const subjects = latest?.subjects?.map((subject) => subject.entry ?? "") ?? [];
  const categories = cleanCategories([
    ...subjects,
    detail.type ?? source.type ?? "",
    latest?.stageVerbose ?? "",
  ]);

  const authorNames = (detail.authors ?? [])
    .map((author) => author.fullName ?? `${author.firstName ?? author.firstname ?? ""} ${author.lastName ?? author.lastname ?? ""}`.trim())
    .filter(Boolean)
    .slice(0, 4) as string[];

  return {
    billName: detail.billName,
    displayName: displayFromItem(source),
    description: detail.description ?? source.description ?? "No description available.",
    type: detail.type ?? source.type ?? "Unknown",
    originChamber: chamberFromValue(detail.originChamber ?? source.originChamber),
    currentChamber: chamberFromValue(detail.currentChamber ?? detail.originChamber ?? source.originChamber),
    categories,
    status: detail.status ?? detail.committeeStatus ?? "Status unavailable",
    stage: detail.stage ?? latest?.stageVerbose ?? latest?.stage ?? "Stage unavailable",
    filedDate: latest?.filed ?? source.filed,
    updatedAt: latest?.updated ?? latest?.printed,
    latestVersionName: latest?.printVersionName,
    authorNames,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  });

  await Promise.all(workers);
}

export async function syncBills(options: SyncOptions): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const year = options.year;

  const listResponse = await fetchBillList(year);
  const allBills = listResponse.items ?? [];

  const selectedNames = options.billNames?.map((billName) => billName.toLowerCase());
  let targetBills = allBills;

  if (selectedNames && selectedNames.length > 0) {
    const selectedSet = new Set(selectedNames);
    targetBills = allBills.filter((bill) => selectedSet.has(bill.billName.toLowerCase()));
  }

  if (options.limit && options.limit > 0) {
    targetBills = targetBills.slice(0, options.limit);
  }

  const indexUpdates = new Map<string, BillIndexItem>();
  const failures: Array<{ billName: string; reason: string }> = [];

  await runWithConcurrency(targetBills, options.concurrency ?? 4, async (bill) => {
    try {
      const detail = await fetchBillDetail(year, bill.billName);
      const actionResponse = await fetchBillActions(year, bill.billName);

      const record: BillRecord = {
        year,
        billName: bill.billName,
        fetchedAt: new Date().toISOString(),
        detail,
        actions: actionResponse.items ?? [],
      };

      await writeBillRecord(record);
      indexUpdates.set(bill.billName.toLowerCase(), toIndexItem(bill, detail));
    } catch (error) {
      failures.push({
        billName: bill.billName,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  const existing = await readBillIndex(year);
  const map = new Map<string, BillIndexItem>();

  for (const item of existing?.items ?? []) {
    map.set(item.billName.toLowerCase(), item);
  }

  for (const [billName, item] of indexUpdates.entries()) {
    map.set(billName, item);
  }

  const mergedItems = [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));

  const nextIndex: BillIndex = {
    year,
    generatedAt: new Date().toISOString(),
    count: mergedItems.length,
    items: mergedItems,
  };

  await writeBillIndex(nextIndex);

  return {
    year,
    startedAt,
    finishedAt: new Date().toISOString(),
    pulled: indexUpdates.size,
    failed: failures.length,
    failures,
    indexCount: mergedItems.length,
  };
}
