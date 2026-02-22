import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

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
  uploaded_at: Date | string;
  policy_count: number | string;
}

interface RawStoredPolicy {
  id: number | string;
  dataset_id: string;
  policy_section: string;
  policy_code: string;
  adopted_date: string;
  revised_date: string;
  policy_status: string;
  policy_title: string;
  policy_wording: string;
  source_row_index: number | string;
}

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;

export async function createPolicyDataset(input: CreatePolicyDatasetInput): Promise<PolicyDataset> {
  const client = await getClient();
  await ensureSchema();

  const datasetId = randomUUID();
  const uploadedAt = new Date().toISOString();
  const normalizedDistrictName = input.districtName.trim() || "Unnamed District";

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO policy_datasets (
        id,
        district_name,
        filename,
        uploaded_at,
        policy_count,
        source_headers
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        datasetId,
        normalizedDistrictName,
        input.filename,
        uploadedAt,
        input.rows.length,
        JSON.stringify(input.headers),
      ],
    );

    for (const row of input.rows) {
      await client.query(
        `
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          datasetId,
          row.policySection,
          row.policyCode,
          row.adoptedDate,
          row.revisedDate,
          row.policyStatus,
          row.policyTitle,
          row.policyWording,
          buildSearchText(row),
          row.sourceRowIndex,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    id: datasetId,
    districtName: normalizedDistrictName,
    filename: input.filename,
    uploadedAt,
    policyCount: input.rows.length,
  };
}

export async function getPolicyDataset(datasetId: string): Promise<PolicyDataset | null> {
  await ensureSchema();

  const queryResult = await getPool().query<RawPolicyDataset>(
    `
    SELECT id, district_name, filename, uploaded_at, policy_count
    FROM policy_datasets
    WHERE id = $1
    LIMIT 1
    `,
    [datasetId],
  );

  const row = queryResult.rows[0];
  return row ? mapDataset(row) : null;
}

export async function listPolicyDatasets(limit = 20): Promise<PolicyDataset[]> {
  await ensureSchema();

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const queryResult = await getPool().query<RawPolicyDataset>(
    `
    SELECT id, district_name, filename, uploaded_at, policy_count
    FROM policy_datasets
    ORDER BY uploaded_at DESC
    LIMIT $1
    `,
    [safeLimit],
  );

  return queryResult.rows.map(mapDataset);
}

export async function searchDatasetPolicies(
  datasetId: string,
  terms: string[],
  options?: { limit?: number },
): Promise<StoredPolicy[]> {
  await ensureSchema();

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 500) : 300;
  const poolInstance = getPool();

  if (terms.length === 0) {
    const result = await poolInstance.query<RawStoredPolicy>(
      `
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
      WHERE dataset_id = $1
      ORDER BY id ASC
      LIMIT $2
      `,
      [datasetId, limit],
    );
    return result.rows.map(mapStoredPolicy);
  }

  const patterns = terms.map((term) => `%${escapeLike(term.toLowerCase())}%`);
  const whereClauses = patterns.map(
    (_value, index) => `search_text ILIKE $${index + 2} ESCAPE '\\'`,
  );
  const params = [datasetId, ...patterns, limit];
  const limitPlaceholder = `$${params.length}`;

  const filteredResult = await poolInstance.query<RawStoredPolicy>(
    `
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
    WHERE dataset_id = $1
    AND (${whereClauses.join(" OR ")})
    ORDER BY id ASC
    LIMIT ${limitPlaceholder}
    `,
    params,
  );

  if (filteredResult.rows.length > 0) {
    return filteredResult.rows.map(mapStoredPolicy);
  }

  const fallbackResult = await poolInstance.query<RawStoredPolicy>(
    `
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
    WHERE dataset_id = $1
    ORDER BY id ASC
    LIMIT $2
    `,
    [datasetId, limit],
  );

  return fallbackResult.rows.map(mapStoredPolicy);
}

async function ensureSchema(): Promise<void> {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    const client = await getClient();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS policy_datasets (
          id TEXT PRIMARY KEY,
          district_name TEXT NOT NULL,
          filename TEXT NOT NULL,
          uploaded_at TIMESTAMPTZ NOT NULL,
          policy_count INTEGER NOT NULL DEFAULT 0,
          source_headers JSONB NOT NULL DEFAULT '[]'::jsonb
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS policies (
          id SERIAL PRIMARY KEY,
          dataset_id TEXT NOT NULL REFERENCES policy_datasets(id) ON DELETE CASCADE,
          policy_section TEXT NOT NULL DEFAULT '',
          policy_code TEXT NOT NULL DEFAULT '',
          adopted_date TEXT NOT NULL DEFAULT '',
          revised_date TEXT NOT NULL DEFAULT '',
          policy_status TEXT NOT NULL DEFAULT '',
          policy_title TEXT NOT NULL DEFAULT '',
          policy_wording TEXT NOT NULL DEFAULT '',
          search_text TEXT NOT NULL DEFAULT '',
          source_row_index INTEGER NOT NULL DEFAULT 0
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policies_dataset_id ON policies(dataset_id);
      `);
    } finally {
      client.release();
    }
  })();

  return schemaReadyPromise;
}

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = resolveDatabaseUrl();
  pool = new Pool({
    connectionString,
  });

  return pool;
}

async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

function resolveDatabaseUrl(): string {
  const url =
    process.env.POLICY_ASSISTANT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      "Postgres database URL is missing. Set POLICY_ASSISTANT_DATABASE_URL (or POSTGRES_URL in Vercel).",
    );
  }

  return url;
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
  return value.replace(/[\\%_]/g, "\\$&");
}

function mapDataset(row: RawPolicyDataset): PolicyDataset {
  return {
    id: row.id,
    districtName: row.district_name,
    filename: row.filename,
    uploadedAt: formatTimestamp(row.uploaded_at),
    policyCount: Number(row.policy_count),
  };
}

function mapStoredPolicy(row: RawStoredPolicy): StoredPolicy {
  return {
    id: Number(row.id),
    datasetId: row.dataset_id,
    policySection: row.policy_section,
    policyCode: row.policy_code,
    adoptedDate: row.adopted_date,
    revisedDate: row.revised_date,
    policyStatus: row.policy_status,
    policyTitle: row.policy_title,
    policyWording: row.policy_wording,
    sourceRowIndex: Number(row.source_row_index),
  };
}

function formatTimestamp(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString();
}
