import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

import BetterSqlite3, { type Database } from "better-sqlite3";

import type { NormalizedPolicyRow, PolicyDataset, StoredPolicy } from "@/lib/policy-assistant/types";

interface CreatePolicyDatasetInput {
  districtName: string;
  filename: string;
  headers: string[];
  rows: NormalizedPolicyRow[];
}

interface RawPolicyDataset {
  id: string;
  district_name: string;
  filename: string;
  uploaded_at: string;
  policy_count: number;
}

interface RawStoredPolicy {
  id: number;
  dataset_id: string;
  policy_section: string;
  policy_code: string;
  adopted_date: string;
  revised_date: string;
  policy_status: string;
  policy_title: string;
  policy_wording: string;
  source_row_index: number;
}

let database: Database | null = null;

export function createPolicyDataset(input: CreatePolicyDatasetInput): PolicyDataset {
  const db = getDatabase();

  const datasetId = randomUUID();
  const uploadedAt = new Date().toISOString();
  const normalizedDistrictName = input.districtName.trim() || "Unnamed District";

  const insertDataset = db.prepare(`
    INSERT INTO policy_datasets (
      id,
      district_name,
      filename,
      uploaded_at,
      policy_count,
      source_headers
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertPolicy = db.prepare(`
    INSERT INTO policies (
      dataset_id,
      policy_section,
      policy_code,
      adopted_date,
      revised_date,
      policy_status,
      policy_title,
      policy_wording,
      search_text,
      source_row_index
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertDataset.run(
      datasetId,
      normalizedDistrictName,
      input.filename,
      uploadedAt,
      input.rows.length,
      JSON.stringify(input.headers),
    );

    for (const row of input.rows) {
      const searchText = buildSearchText(row);

      insertPolicy.run(
        datasetId,
        row.policySection,
        row.policyCode,
        row.adoptedDate,
        row.revisedDate,
        row.policyStatus,
        row.policyTitle,
        row.policyWording,
        searchText,
        row.sourceRowIndex,
      );
    }
  });

  transaction();

  return {
    id: datasetId,
    districtName: normalizedDistrictName,
    filename: input.filename,
    uploadedAt,
    policyCount: input.rows.length,
  };
}

export function getPolicyDataset(datasetId: string): PolicyDataset | null {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT id, district_name, filename, uploaded_at, policy_count
    FROM policy_datasets
    WHERE id = ?
    LIMIT 1
  `);
  const row = statement.get(datasetId) as RawPolicyDataset | undefined;
  return row ? mapDataset(row) : null;
}

export function listPolicyDatasets(limit = 20): PolicyDataset[] {
  const db = getDatabase();
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const statement = db.prepare(`
    SELECT id, district_name, filename, uploaded_at, policy_count
    FROM policy_datasets
    ORDER BY uploaded_at DESC
    LIMIT ?
  `);
  const rows = statement.all(safeLimit) as RawPolicyDataset[];
  return rows.map(mapDataset);
}

export function searchDatasetPolicies(
  datasetId: string,
  terms: string[],
  options?: { limit?: number },
): StoredPolicy[] {
  const db = getDatabase();
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 500) : 300;

  let rows: RawStoredPolicy[] = [];

  if (terms.length === 0) {
    const statement = db.prepare(`
      SELECT
        id,
        dataset_id,
        policy_section,
        policy_code,
        adopted_date,
        revised_date,
        policy_status,
        policy_title,
        policy_wording,
        source_row_index
      FROM policies
      WHERE dataset_id = ?
      ORDER BY id ASC
      LIMIT ?
    `);
    rows = statement.all(datasetId, limit) as RawStoredPolicy[];
  } else {
    const conditions = terms.map(() => "search_text LIKE ?").join(" OR ");
    const statement = db.prepare(`
      SELECT
        id,
        dataset_id,
        policy_section,
        policy_code,
        adopted_date,
        revised_date,
        policy_status,
        policy_title,
        policy_wording,
        source_row_index
      FROM policies
      WHERE dataset_id = ?
      AND (${conditions})
      ORDER BY id ASC
      LIMIT ?
    `);
    const patterns = terms.map((term) => `%${escapeLike(term.toLowerCase())}%`);
    rows = statement.all(datasetId, ...patterns, limit) as RawStoredPolicy[];

    if (rows.length === 0) {
      const fallbackStatement = db.prepare(`
        SELECT
          id,
          dataset_id,
          policy_section,
          policy_code,
          adopted_date,
          revised_date,
          policy_status,
          policy_title,
          policy_wording,
          source_row_index
        FROM policies
        WHERE dataset_id = ?
        ORDER BY id ASC
        LIMIT ?
      `);
      rows = fallbackStatement.all(datasetId, limit) as RawStoredPolicy[];
    }
  }

  return rows.map(mapStoredPolicy);
}

function getDatabase(): Database {
  if (database) {
    return database;
  }

  const dbPath = getPolicyDatabasePath();
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new BetterSqlite3(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_datasets (
      id TEXT PRIMARY KEY,
      district_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      policy_count INTEGER NOT NULL DEFAULT 0,
      source_headers TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id TEXT NOT NULL,
      policy_section TEXT NOT NULL DEFAULT '',
      policy_code TEXT NOT NULL DEFAULT '',
      adopted_date TEXT NOT NULL DEFAULT '',
      revised_date TEXT NOT NULL DEFAULT '',
      policy_status TEXT NOT NULL DEFAULT '',
      policy_title TEXT NOT NULL DEFAULT '',
      policy_wording TEXT NOT NULL DEFAULT '',
      search_text TEXT NOT NULL DEFAULT '',
      source_row_index INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(dataset_id) REFERENCES policy_datasets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_policies_dataset_id ON policies(dataset_id);
  `);

  database = db;
  return db;
}

function getPolicyDatabasePath(): string {
  const configured = process.env.POLICY_ASSISTANT_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  return path.join(process.cwd(), "data", "policy-assistant.sqlite");
}

function buildSearchText(row: NormalizedPolicyRow): string {
  return [
    row.policySection,
    row.policyCode,
    row.adoptedDate,
    row.revisedDate,
    row.policyStatus,
    row.policyTitle,
    row.policyWording,
  ]
    .join(" ")
    .toLowerCase();
}

function escapeLike(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function mapDataset(row: RawPolicyDataset): PolicyDataset {
  return {
    id: row.id,
    districtName: row.district_name,
    filename: row.filename,
    uploadedAt: row.uploaded_at,
    policyCount: row.policy_count,
  };
}

function mapStoredPolicy(row: RawStoredPolicy): StoredPolicy {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    policySection: row.policy_section,
    policyCode: row.policy_code,
    adoptedDate: row.adopted_date,
    revisedDate: row.revised_date,
    policyStatus: row.policy_status,
    policyTitle: row.policy_title,
    policyWording: row.policy_wording,
    sourceRowIndex: row.source_row_index,
  };
}
