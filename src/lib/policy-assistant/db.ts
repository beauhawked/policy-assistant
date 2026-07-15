import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import type {
  AuthUser,
  ConversationRole,
  EmbeddingCoverage,
  HandbookSearchCandidate,
  HandbookSemanticCandidate,
  HandbookDocument,
  HandbookType,
  NormalizedPolicyRow,
  PolicyConversation,
  PolicyConversationMessage,
  PolicyAnswerEvidenceSnapshot,
  PolicyDataset,
  PolicyDatasetSourceType,
  PolicySearchCandidate,
  PolicySemanticCandidate,
  StoredHandbookChunk,
  StoredPolicy,
} from "@/lib/policy-assistant/types";

interface CreatePolicyDatasetInput {
  userId: string;
  districtName: string;
  title?: string;
  filename: string;
  sourceType?: PolicyDatasetSourceType;
  sourceUrl?: string;
  sourcePlatform?: string;
  headers: string[];
  rows: NormalizedPolicyRow[];
}

interface CreatePolicyImportPreviewInput {
  userId: string;
  districtName: string;
  filename: string;
  sourceUrl: string;
  platform: string;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
  headers: string[];
  rows: NormalizedPolicyRow[];
  ttlMinutes?: number;
}

export interface PolicyImportPreview {
  id: string;
  userId: string;
  districtName: string;
  filename: string;
  sourceUrl: string;
  platform: string;
  sourceCount: number;
  sourceLabel: string;
  failedCount: number;
  headers: string[];
  rows: NormalizedPolicyRow[];
  createdAt: string;
  expiresAt: string;
}

interface HandbookChunkInput {
  sectionTitle: string;
  content: string;
  sourceIndex: number;
}

interface CreateHandbookDocumentInput {
  userId: string;
  districtName: string;
  title?: string;
  filename: string;
  handbookType: HandbookType;
  chunks: HandbookChunkInput[];
}

interface RawPolicyDataset {
  id: string;
  user_id: string;
  title?: string | null;
  district_name: string;
  filename: string;
  uploaded_at: Date | string;
  policy_count: number | string;
  source_type?: string | null;
  source_url?: string | null;
  source_platform?: string | null;
  archived_at?: Date | string | null;
}

interface RawPolicyImportPreview {
  id: string;
  user_id: string;
  district_name: string;
  filename: string;
  source_url: string;
  platform: string;
  source_count: number | string;
  source_label: string;
  failed_count: number | string;
  source_headers: unknown;
  rows: unknown;
  created_at: Date | string;
  expires_at: Date | string;
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

interface RawPolicySearchCandidate extends RawStoredPolicy {
  full_text_rank: number | string;
  trigram_score: number | string;
  combined_rank: number | string;
}

interface RawHandbookDocument {
  id: string;
  user_id: string;
  title?: string | null;
  district_name: string;
  filename: string;
  uploaded_at: Date | string;
  chunk_count: number | string;
  handbook_type?: string | null;
  archived_at?: Date | string | null;
}

interface RawStoredHandbookChunk {
  id: number | string;
  document_id: string;
  handbook_type?: string | null;
  section_title: string;
  content: string;
  source_index: number | string;
}

interface RawHandbookChunkDetail extends RawStoredHandbookChunk {
  filename: string;
  title?: string | null;
}

interface RawHandbookSearchCandidate extends RawStoredHandbookChunk {
  full_text_rank: number | string;
  trigram_score: number | string;
  combined_rank: number | string;
}

interface RawAuthUser {
  id: string;
  email: string;
  district_name: string;
  created_at: Date | string;
  email_verified_at: Date | string | null;
}

interface RawAuthUserWithPassword extends RawAuthUser {
  password_hash: string;
}

interface CreateSessionResult {
  id: string;
  expiresAt: string;
}

interface RawOneTimeTokenRecord {
  id: number | string;
  user_id: string;
  expires_at: Date | string;
}

interface RawRateLimitCounter {
  count: number | string;
}

interface RawPolicyConversation {
  id: string;
  user_id: string;
  dataset_id: string;
  title: string;
  created_at: Date | string;
  updated_at: Date | string;
  last_message_at?: Date | string;
  message_count?: number | string;
}

interface RawPolicyConversationMessage {
  id: number | string;
  conversation_id: string;
  role: ConversationRole;
  content: string;
  created_at: Date | string;
  answer_evidence?: unknown;
}

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;
let vectorExtensionReady = false;

export async function createPolicyDataset(input: CreatePolicyDatasetInput): Promise<PolicyDataset> {
  await ensureSchema();
  const client = await getClient();

  const datasetId = randomUUID();
  const uploadedAt = new Date().toISOString();
  const normalizedDistrictName = input.districtName.trim() || "Unnamed District";
  const normalizedTitle = normalizeDatasetTitle(input.title, input.filename);
  const sourceType = input.sourceType ?? "csv_upload";
  const sourceUrl = input.sourceUrl?.trim() ?? "";
  const sourcePlatform = input.sourcePlatform?.trim() ?? "";

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO policy_datasets (
        id,
        user_id,
        title,
        district_name,
        filename,
        uploaded_at,
        policy_count,
        source_type,
        source_url,
        source_platform,
        source_headers
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      `,
      [
        datasetId,
        input.userId,
        normalizedTitle,
        normalizedDistrictName,
        input.filename,
        uploadedAt,
        input.rows.length,
        sourceType,
        sourceUrl,
        sourcePlatform,
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
    title: normalizedTitle,
    districtName: normalizedDistrictName,
    filename: input.filename,
    uploadedAt,
    policyCount: input.rows.length,
    sourceType,
    sourceUrl,
    sourcePlatform,
    archivedAt: null,
  };
}

export async function createPolicyImportPreview(
  input: CreatePolicyImportPreviewInput,
): Promise<PolicyImportPreview> {
  await ensureSchema();

  const previewId = randomUUID();
  const normalizedDistrictName = input.districtName.trim() || "Unnamed District";
  const ttlMinutes = input.ttlMinutes && input.ttlMinutes > 0 ? Math.min(input.ttlMinutes, 360) : 120;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  await getPool().query(
    `
    INSERT INTO policy_import_previews (
      id,
      user_id,
      district_name,
      filename,
      source_url,
      platform,
      source_count,
      source_label,
      failed_count,
      source_headers,
      rows,
      expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)
    `,
    [
      previewId,
      input.userId,
      normalizedDistrictName,
      input.filename,
      input.sourceUrl,
      input.platform,
      input.sourceCount,
      input.sourceLabel,
      input.failedCount,
      JSON.stringify(input.headers),
      JSON.stringify(input.rows),
      expiresAt,
    ],
  );

  const preview = await getPolicyImportPreview(input.userId, previewId);
  if (!preview) {
    throw new Error("Policy import preview could not be loaded after creation.");
  }

  return preview;
}

export async function getPolicyImportPreview(
  userId: string,
  previewId: string,
): Promise<PolicyImportPreview | null> {
  await ensureSchema();

  const result = await getPool().query<RawPolicyImportPreview>(
    `
    SELECT
      id,
      user_id,
      district_name,
      filename,
      source_url,
      platform,
      source_count,
      source_label,
      failed_count,
      source_headers,
      rows,
      created_at,
      expires_at
    FROM policy_import_previews
    WHERE id = $1
    AND user_id = $2
    AND expires_at > NOW()
    LIMIT 1
    `,
    [previewId, userId],
  );

  const row = result.rows[0];
  return row ? mapPolicyImportPreview(row) : null;
}

export async function deletePolicyImportPreview(userId: string, previewId: string): Promise<void> {
  await ensureSchema();

  await getPool().query(
    `
    DELETE FROM policy_import_previews
    WHERE id = $1
    AND user_id = $2
    `,
    [previewId, userId],
  );
}

export async function cleanupExpiredPolicyImportPreviews(): Promise<void> {
  await ensureSchema();

  await getPool().query(
    `
    DELETE FROM policy_import_previews
    WHERE expires_at <= NOW()
    `,
  );
}

export async function createHandbookDocument(
  input: CreateHandbookDocumentInput,
): Promise<HandbookDocument> {
  await ensureSchema();
  const client = await getClient();

  const documentId = randomUUID();
  const uploadedAt = new Date().toISOString();
  const normalizedDistrictName = input.districtName.trim() || "Unnamed District";
  const normalizedTitle = normalizeHandbookTitle(input.title, input.filename, input.handbookType);

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO handbook_documents (
        id,
        user_id,
        title,
        district_name,
        filename,
        uploaded_at,
        chunk_count,
        handbook_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        documentId,
        input.userId,
        normalizedTitle,
        normalizedDistrictName,
        input.filename,
        uploadedAt,
        input.chunks.length,
        input.handbookType,
      ],
    );

    for (const chunk of input.chunks) {
      await client.query(
        `
        INSERT INTO handbook_chunks (
          document_id,
          section_title,
          content,
          search_text,
          source_index
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          documentId,
          chunk.sectionTitle,
          chunk.content,
          buildHandbookSearchText(chunk.sectionTitle, chunk.content),
          chunk.sourceIndex,
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
    id: documentId,
    title: normalizedTitle,
    districtName: normalizedDistrictName,
    filename: input.filename,
    uploadedAt,
    chunkCount: input.chunks.length,
    handbookType: input.handbookType,
    archivedAt: null,
  };
}

export async function getPolicyDataset(userId: string, datasetId: string): Promise<PolicyDataset | null> {
  await ensureSchema();

  const queryResult = await getPool().query<RawPolicyDataset>(
    `
    SELECT
      id,
      user_id,
      title,
      district_name,
      filename,
      uploaded_at,
      policy_count,
      source_type,
      source_url,
      source_platform,
      archived_at
    FROM policy_datasets
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [datasetId, userId],
  );

  const row = queryResult.rows[0];
  return row ? mapDataset(row) : null;
}

export async function listPolicyDatasets(
  userId: string,
  limit = 20,
  options?: { includeArchived?: boolean },
): Promise<PolicyDataset[]> {
  await ensureSchema();

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const queryResult = await getPool().query<RawPolicyDataset>(
    `
    SELECT
      id,
      user_id,
      title,
      district_name,
      filename,
      uploaded_at,
      policy_count,
      source_type,
      source_url,
      source_platform,
      archived_at
    FROM policy_datasets
    WHERE user_id = $1
    ${options?.includeArchived ? "" : "AND archived_at IS NULL"}
    ORDER BY archived_at NULLS FIRST, uploaded_at DESC
    LIMIT $2
    `,
    [userId, safeLimit],
  );

  return queryResult.rows.map(mapDataset);
}

export async function updatePolicyDatasetTitle(
  userId: string,
  datasetId: string,
  title: string,
): Promise<PolicyDataset | null> {
  await ensureSchema();

  const result = await getPool().query<RawPolicyDataset>(
    `
    UPDATE policy_datasets
    SET title = $3
    WHERE id = $1
    AND user_id = $2
    RETURNING
      id,
      user_id,
      title,
      district_name,
      filename,
      uploaded_at,
      policy_count,
      source_type,
      source_url,
      source_platform,
      archived_at
    `,
    [datasetId, userId, normalizeDatasetTitle(title, "Policy Dataset")],
  );

  const row = result.rows[0];
  return row ? mapDataset(row) : null;
}

export async function setPolicyDatasetArchived(
  userId: string,
  datasetId: string,
  archived: boolean,
): Promise<PolicyDataset | null> {
  await ensureSchema();

  const result = await getPool().query<RawPolicyDataset>(
    `
    UPDATE policy_datasets
    SET archived_at = ${archived ? "COALESCE(archived_at, NOW())" : "NULL"}
    WHERE id = $1
    AND user_id = $2
    RETURNING
      id,
      user_id,
      title,
      district_name,
      filename,
      uploaded_at,
      policy_count,
      source_type,
      source_url,
      source_platform,
      archived_at
    `,
    [datasetId, userId],
  );

  const row = result.rows[0];
  return row ? mapDataset(row) : null;
}

export async function deletePolicyDataset(userId: string, datasetId: string): Promise<boolean> {
  await ensureSchema();

  const result = await getPool().query<{ id: string }>(
    `
    DELETE FROM policy_datasets
    WHERE id = $1
    AND user_id = $2
    RETURNING id
    `,
    [datasetId, userId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function listHandbookDocuments(
  userId: string,
  limit = 20,
  options?: { includeArchived?: boolean },
): Promise<HandbookDocument[]> {
  await ensureSchema();

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const queryResult = await getPool().query<RawHandbookDocument>(
    `
    SELECT
      id,
      user_id,
      title,
      district_name,
      filename,
      uploaded_at,
      chunk_count,
      handbook_type,
      archived_at
    FROM handbook_documents
    WHERE user_id = $1
    ${options?.includeArchived ? "" : "AND archived_at IS NULL"}
    ORDER BY archived_at NULLS FIRST, uploaded_at DESC
    LIMIT $2
    `,
    [userId, safeLimit],
  );

  return queryResult.rows.map(mapHandbookDocument);
}

export async function getHandbookDocumentsByIds(
  userId: string,
  documentIds: string[],
): Promise<HandbookDocument[]> {
  await ensureSchema();

  const ids = Array.from(new Set(documentIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return [];
  }

  const result = await getPool().query<RawHandbookDocument>(
    `
    SELECT
      id,
      user_id,
      title,
      district_name,
      filename,
      uploaded_at,
      chunk_count,
      handbook_type,
      archived_at
    FROM handbook_documents
    WHERE user_id = $1
    AND id = ANY($2::text[])
    `,
    [userId, ids],
  );

  return result.rows.map(mapHandbookDocument);
}

export async function updateHandbookDocumentTitle(
  userId: string,
  documentId: string,
  title: string,
): Promise<HandbookDocument | null> {
  await ensureSchema();

  const result = await getPool().query<RawHandbookDocument>(
    `
    UPDATE handbook_documents
    SET title = $3
    WHERE id = $1
    AND user_id = $2
    RETURNING
      id,
      user_id,
      title,
      district_name,
      filename,
      uploaded_at,
      chunk_count,
      handbook_type,
      archived_at
    `,
    [documentId, userId, normalizeHandbookTitle(title, "Handbook", "student")],
  );

  const row = result.rows[0];
  return row ? mapHandbookDocument(row) : null;
}

export async function setHandbookDocumentArchived(
  userId: string,
  documentId: string,
  archived: boolean,
): Promise<HandbookDocument | null> {
  await ensureSchema();

  const result = await getPool().query<RawHandbookDocument>(
    `
    UPDATE handbook_documents
    SET archived_at = ${archived ? "COALESCE(archived_at, NOW())" : "NULL"}
    WHERE id = $1
    AND user_id = $2
    RETURNING
      id,
      user_id,
      title,
      district_name,
      filename,
      uploaded_at,
      chunk_count,
      handbook_type,
      archived_at
    `,
    [documentId, userId],
  );

  const row = result.rows[0];
  return row ? mapHandbookDocument(row) : null;
}

export async function deleteHandbookDocument(userId: string, documentId: string): Promise<boolean> {
  await ensureSchema();

  const result = await getPool().query<{ id: string }>(
    `
    DELETE FROM handbook_documents
    WHERE id = $1
    AND user_id = $2
    RETURNING id
    `,
    [documentId, userId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function searchDatasetPolicies(
  userId: string,
  datasetId: string,
  terms: string[],
  options?: { limit?: number },
): Promise<StoredPolicy[]> {
  await ensureSchema();

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 1500) : 1000;
  const poolInstance = getPool();

  if (terms.length === 0) {
    const result = await poolInstance.query<RawStoredPolicy>(
      `
      SELECT
        p.id,
        p.dataset_id,
        p.policy_section,
        p.policy_code,
        p.adopted_date,
        p.revised_date,
        p.policy_status,
        p.policy_title,
        p.policy_wording,
        p.source_row_index
      FROM policies p
      JOIN policy_datasets d ON d.id = p.dataset_id
      WHERE p.dataset_id = $1
      AND d.user_id = $2
      ORDER BY p.id ASC
      LIMIT $3
      `,
      [datasetId, userId, limit],
    );
    return result.rows.map(mapStoredPolicy);
  }

  const patterns = terms.map((term) => `%${escapeLike(term.toLowerCase())}%`);
  const whereClauses = patterns.map(
    (_value, index) => `p.search_text ILIKE $${index + 3} ESCAPE '\\'`,
  );
  const params = [datasetId, userId, ...patterns, limit];
  const limitPlaceholder = `$${params.length}`;

  const filteredResult = await poolInstance.query<RawStoredPolicy>(
    `
    SELECT
      p.id,
      p.dataset_id,
      p.policy_section,
      p.policy_code,
      p.adopted_date,
      p.revised_date,
      p.policy_status,
      p.policy_title,
      p.policy_wording,
      p.source_row_index
    FROM policies p
    JOIN policy_datasets d ON d.id = p.dataset_id
    WHERE p.dataset_id = $1
    AND d.user_id = $2
    AND (${whereClauses.join(" OR ")})
    ORDER BY p.id ASC
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
      p.id,
      p.dataset_id,
      p.policy_section,
      p.policy_code,
      p.adopted_date,
      p.revised_date,
      p.policy_status,
      p.policy_title,
      p.policy_wording,
      p.source_row_index
    FROM policies p
    JOIN policy_datasets d ON d.id = p.dataset_id
    WHERE p.dataset_id = $1
    AND d.user_id = $2
    ORDER BY p.id ASC
    LIMIT $3
    `,
    [datasetId, userId, limit],
  );

  return fallbackResult.rows.map(mapStoredPolicy);
}

export async function searchDatasetPolicyCandidates(
  userId: string,
  datasetId: string,
  query: string,
  options?: { limit?: number },
): Promise<PolicySearchCandidate[]> {
  await ensureSchema();

  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const trigramQuery = normalizeTrigramSearchQuery(normalizedQuery);
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;
  const result = await getPool().query<RawPolicySearchCandidate>(
    `
    WITH search_query AS (
      SELECT websearch_to_tsquery('english', $3) AS query
    )
    SELECT
      p.id,
      p.dataset_id,
      p.policy_section,
      p.policy_code,
      p.adopted_date,
      p.revised_date,
      p.policy_status,
      p.policy_title,
      p.policy_wording,
      p.source_row_index,
      ts_rank_cd(p.search_vector, search_query.query) AS full_text_rank,
      GREATEST(
        similarity(p.policy_code, $4),
        similarity(p.policy_title, $4),
        similarity(p.policy_section, $4),
        similarity(p.search_text, $4)
      ) AS trigram_score,
      (
        ts_rank_cd(p.search_vector, search_query.query) * 1.6
        +
        GREATEST(
          similarity(p.policy_code, $4),
          similarity(p.policy_title, $4),
          similarity(p.policy_section, $4),
          similarity(p.search_text, $4)
        )
      ) AS combined_rank
    FROM policies p
    JOIN policy_datasets d ON d.id = p.dataset_id
    CROSS JOIN search_query
    WHERE p.dataset_id = $1
    AND d.user_id = $2
    AND (
      p.search_vector @@ search_query.query
      OR p.policy_code % $4
      OR p.policy_title % $4
      OR p.policy_section % $4
      OR p.search_text % $4
    )
    ORDER BY combined_rank DESC, full_text_rank DESC, trigram_score DESC, p.id ASC
    LIMIT $5
    `,
    [datasetId, userId, normalizedQuery, trigramQuery, limit],
  );

  return result.rows.map(mapPolicySearchCandidate);
}

export async function searchHandbookChunks(
  userId: string,
  terms: string[],
  options?: { limit?: number; handbookTypes?: HandbookType[] },
): Promise<StoredHandbookChunk[]> {
  await ensureSchema();

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 1500) : 1000;
  const handbookTypes = normalizeHandbookTypes(options?.handbookTypes);
  const poolInstance = getPool();

  if (terms.length === 0) {
    const params: Array<string | number | HandbookType[]> = [userId];
    let typeClause = "";
    if (handbookTypes.length > 0) {
      params.push(handbookTypes);
      typeClause = `AND d.handbook_type = ANY($${params.length}::text[])`;
    }
    params.push(limit);
    const limitPlaceholder = `$${params.length}`;

    const result = await poolInstance.query<RawStoredHandbookChunk>(
      `
      SELECT
        c.id,
        c.document_id,
        d.handbook_type,
        c.section_title,
        c.content,
        c.source_index
      FROM handbook_chunks c
      JOIN handbook_documents d ON d.id = c.document_id
      WHERE d.user_id = $1
      AND d.archived_at IS NULL
      ${typeClause}
      ORDER BY d.uploaded_at DESC, c.source_index ASC, c.id ASC
      LIMIT ${limitPlaceholder}
      `,
      params,
    );

    return result.rows.map(mapStoredHandbookChunk);
  }

  const patterns = terms.map((term) => `%${escapeLike(term.toLowerCase())}%`);
  const params: Array<string | number | HandbookType[]> = [userId];
  let typeClause = "";
  if (handbookTypes.length > 0) {
    params.push(handbookTypes);
    typeClause = `AND d.handbook_type = ANY($${params.length}::text[])`;
  }
  const whereClauses = patterns.map(
    (_value, index) => `c.search_text ILIKE $${params.length + index + 1} ESCAPE '\\'`,
  );
  params.push(...patterns);
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;

  const filteredResult = await poolInstance.query<RawStoredHandbookChunk>(
    `
    SELECT
      c.id,
      c.document_id,
      d.handbook_type,
      c.section_title,
      c.content,
      c.source_index
    FROM handbook_chunks c
    JOIN handbook_documents d ON d.id = c.document_id
    WHERE d.user_id = $1
    AND d.archived_at IS NULL
    ${typeClause}
    AND (${whereClauses.join(" OR ")})
    ORDER BY d.uploaded_at DESC, c.source_index ASC, c.id ASC
    LIMIT ${limitPlaceholder}
    `,
    params,
  );

  if (filteredResult.rows.length > 0) {
    return filteredResult.rows.map(mapStoredHandbookChunk);
  }

  const fallbackParams: Array<string | number | HandbookType[]> = [userId];
  if (handbookTypes.length > 0) {
    fallbackParams.push(handbookTypes);
  }
  fallbackParams.push(limit);
  const fallbackLimitPlaceholder = `$${fallbackParams.length}`;

  const fallbackResult = await poolInstance.query<RawStoredHandbookChunk>(
    `
    SELECT
      c.id,
      c.document_id,
      d.handbook_type,
      c.section_title,
      c.content,
      c.source_index
    FROM handbook_chunks c
    JOIN handbook_documents d ON d.id = c.document_id
    WHERE d.user_id = $1
    AND d.archived_at IS NULL
    ${typeClause}
    ORDER BY d.uploaded_at DESC, c.source_index ASC, c.id ASC
    LIMIT ${fallbackLimitPlaceholder}
    `,
    fallbackParams,
  );

  return fallbackResult.rows.map(mapStoredHandbookChunk);
}

export async function searchHandbookChunkCandidates(
  userId: string,
  query: string,
  options?: { limit?: number; handbookTypes?: HandbookType[] },
): Promise<HandbookSearchCandidate[]> {
  await ensureSchema();

  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const trigramQuery = normalizeTrigramSearchQuery(normalizedQuery);
  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;
  const handbookTypes = normalizeHandbookTypes(options?.handbookTypes);
  const params: Array<string | number | HandbookType[]> = [userId, normalizedQuery, trigramQuery];
  let typeClause = "";

  if (handbookTypes.length > 0) {
    params.push(handbookTypes);
    typeClause = `AND d.handbook_type = ANY($${params.length}::text[])`;
  }

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;

  const result = await getPool().query<RawHandbookSearchCandidate>(
    `
    WITH search_query AS (
      SELECT websearch_to_tsquery('english', $2) AS query
    )
    SELECT
      c.id,
      c.document_id,
      d.handbook_type,
      c.section_title,
      c.content,
      c.source_index,
      ts_rank_cd(c.search_vector, search_query.query) AS full_text_rank,
      GREATEST(
        similarity(c.section_title, $3),
        similarity(c.search_text, $3)
      ) AS trigram_score,
      (
        ts_rank_cd(c.search_vector, search_query.query) * 1.6
        +
        GREATEST(
          similarity(c.section_title, $3),
          similarity(c.search_text, $3)
        )
      ) AS combined_rank
    FROM handbook_chunks c
    JOIN handbook_documents d ON d.id = c.document_id
    CROSS JOIN search_query
    WHERE d.user_id = $1
    AND d.archived_at IS NULL
    ${typeClause}
    AND (
      c.search_vector @@ search_query.query
      OR c.section_title % $3
      OR c.search_text % $3
    )
    ORDER BY combined_rank DESC, full_text_rank DESC, trigram_score DESC, d.uploaded_at DESC, c.id ASC
    LIMIT ${limitPlaceholder}
    `,
    params,
  );

  return result.rows.map(mapHandbookSearchCandidate);
}

export async function getPolicyDetail(
  userId: string,
  datasetId: string,
  policyCode: string,
  policyTitle?: string,
): Promise<StoredPolicy | null> {
  await ensureSchema();

  const trimmedCode = policyCode.trim();
  const trimmedTitle = policyTitle?.trim() ?? "";
  if (!trimmedCode && !trimmedTitle) {
    return null;
  }

  const result = await getPool().query<RawStoredPolicy>(
    `
    SELECT
      p.id,
      p.dataset_id,
      p.policy_section,
      p.policy_code,
      p.adopted_date,
      p.revised_date,
      p.policy_status,
      p.policy_title,
      p.policy_wording,
      p.source_row_index
    FROM policies p
    JOIN policy_datasets d ON d.id = p.dataset_id
    WHERE p.dataset_id = $1
    AND d.user_id = $2
    AND (
      ($3 <> '' AND LOWER(p.policy_code) = LOWER($3))
      OR
      ($3 = '' AND $4 <> '' AND LOWER(p.policy_title) = LOWER($4))
    )
    ORDER BY p.id ASC
    LIMIT 1
    `,
    [datasetId, userId, trimmedCode, trimmedTitle],
  );

  const row = result.rows[0];
  return row ? mapStoredPolicy(row) : null;
}

export async function getHandbookSectionDetail(
  userId: string,
  handbookType: HandbookType,
  sectionTitle: string,
): Promise<{
  handbookType: HandbookType;
  sectionTitle: string;
  content: string;
  title: string;
  filename: string;
  chunkCount: number;
} | null> {
  await ensureSchema();

  const trimmedSectionTitle = sectionTitle.trim();
  if (!trimmedSectionTitle) {
    return null;
  }

  const result = await getPool().query<RawHandbookChunkDetail>(
    `
    WITH matching_document AS (
      SELECT hd.id, hd.title, hd.filename, hd.handbook_type, hd.uploaded_at
      FROM handbook_documents hd
      JOIN handbook_chunks hc ON hc.document_id = hd.id
      WHERE hd.user_id = $1
      AND hd.handbook_type = $2
      AND hd.archived_at IS NULL
      AND LOWER(hc.section_title) = LOWER($3)
      ORDER BY hd.uploaded_at DESC, hd.id DESC
      LIMIT 1
    )
    SELECT
      hc.id,
      hc.document_id,
      md.handbook_type,
      hc.section_title,
      hc.content,
      hc.source_index,
      md.title,
      md.filename
    FROM handbook_chunks hc
    JOIN matching_document md ON md.id = hc.document_id
    WHERE LOWER(hc.section_title) = LOWER($3)
    ORDER BY hc.source_index ASC, hc.id ASC
    `,
    [userId, handbookType, trimmedSectionTitle],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const dedupedRows = new Map<string, RawHandbookChunkDetail>();
  for (const row of result.rows) {
    const normalizedContent = row.content.replace(/\s+/g, " ").trim();
    if (!normalizedContent || dedupedRows.has(normalizedContent)) {
      continue;
    }
    dedupedRows.set(normalizedContent, row);
  }

  const rows = Array.from(dedupedRows.values());
  if (rows.length === 0) {
    return null;
  }

  return {
    handbookType: normalizeHandbookType(rows[0].handbook_type),
    sectionTitle: rows[0].section_title,
    content: rows.map((row) => row.content.trim()).join("\n\n"),
    title: normalizeHandbookTitle(
      rows[0].title ?? undefined,
      rows[0].filename,
      normalizeHandbookType(rows[0].handbook_type),
    ),
    filename: rows[0].filename,
    chunkCount: rows.length,
  };
}

export async function createUserAccount(
  email: string,
  passwordHash: string,
  districtName: string,
): Promise<AuthUser> {
  await ensureSchema();

  const userId = randomUUID();
  const normalizedEmail = normalizeEmail(email);
  const normalizedDistrictName = districtName.trim() || "Unnamed District";

  const result = await getPool().query<RawAuthUser>(
    `
    INSERT INTO users (id, email, district_name, password_hash, email_verified_at)
    VALUES ($1, $2, $3, $4, NULL)
    RETURNING id, email, district_name, created_at, email_verified_at
    `,
    [userId, normalizedEmail, normalizedDistrictName, passwordHash],
  );

  return mapAuthUser(result.rows[0]);
}

export async function findUserByEmail(
  email: string,
): Promise<{ user: AuthUser; passwordHash: string } | null> {
  await ensureSchema();

  const normalizedEmail = normalizeEmail(email);
  const result = await getPool().query<RawAuthUserWithPassword>(
    `
    SELECT id, email, district_name, password_hash, created_at, email_verified_at
    FROM users
    WHERE email = $1
    LIMIT 1
    `,
    [normalizedEmail],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    user: mapAuthUser(row),
    passwordHash: row.password_hash,
  };
}

export async function findUserById(userId: string): Promise<AuthUser | null> {
  await ensureSchema();

  const result = await getPool().query<RawAuthUser>(
    `
    SELECT id, email, district_name, created_at, email_verified_at
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId],
  );

  const row = result.rows[0];
  return row ? mapAuthUser(row) : null;
}

export async function setUserEmailVerified(userId: string): Promise<AuthUser | null> {
  await ensureSchema();

  const result = await getPool().query<RawAuthUser>(
    `
    UPDATE users
    SET email_verified_at = COALESCE(email_verified_at, NOW())
    WHERE id = $1
    RETURNING id, email, district_name, created_at, email_verified_at
    `,
    [userId],
  );

  const row = result.rows[0];
  return row ? mapAuthUser(row) : null;
}

export async function updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await ensureSchema();

  await getPool().query(
    `
    UPDATE users
    SET password_hash = $2
    WHERE id = $1
    `,
    [userId, passwordHash],
  );
}

export async function createAuthSession(userId: string, ttlDays = 30): Promise<CreateSessionResult> {
  await ensureSchema();

  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await getPool().query(
    `
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES ($1, $2, $3)
    `,
    [sessionId, userId, expiresAt],
  );

  return {
    id: sessionId,
    expiresAt,
  };
}

export async function getUserBySessionId(sessionId: string): Promise<AuthUser | null> {
  await ensureSchema();

  const result = await getPool().query<RawAuthUser>(
    `
    SELECT u.id, u.email, u.district_name, u.created_at, u.email_verified_at
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = $1
    AND s.expires_at > NOW()
    LIMIT 1
    `,
    [sessionId],
  );

  const row = result.rows[0];
  return row ? mapAuthUser(row) : null;
}

export async function deleteAuthSession(sessionId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM auth_sessions WHERE id = $1`, [sessionId]);
}

export async function deleteAuthSessionsForUser(userId: string): Promise<void> {
  await ensureSchema();
  await getPool().query(`DELETE FROM auth_sessions WHERE user_id = $1`, [userId]);
}

export async function createEmailVerificationTokenRecord(
  userId: string,
  tokenHash: string,
  ttlHours = 24,
): Promise<{ expiresAt: string }> {
  await ensureSchema();

  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  await getPool().query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);

  await getPool().query(
    `
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt],
  );

  return { expiresAt };
}

export async function consumeEmailVerificationTokenByHash(tokenHash: string): Promise<string | null> {
  await ensureSchema();
  const client = await getClient();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<RawOneTimeTokenRecord>(
      `
      SELECT id, user_id, expires_at
      FROM email_verification_tokens
      WHERE token_hash = $1
      AND used_at IS NULL
      FOR UPDATE
      `,
      [tokenHash],
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      await client.query("ROLLBACK");
      return null;
    }

    const expiresAt = new Date(tokenRow.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      await client.query(
        `
        UPDATE email_verification_tokens
        SET used_at = NOW()
        WHERE id = $1
        `,
        [tokenRow.id],
      );
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE id = $1
      `,
      [tokenRow.id],
    );

    await client.query(
      `
      DELETE FROM email_verification_tokens
      WHERE user_id = $1
      AND id <> $2
      `,
      [tokenRow.user_id, tokenRow.id],
    );

    await client.query("COMMIT");
    return tokenRow.user_id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createPasswordResetTokenRecord(
  userId: string,
  tokenHash: string,
  ttlMinutes = 60,
): Promise<{ expiresAt: string }> {
  await ensureSchema();

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  await getPool().query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);

  await getPool().query(
    `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt],
  );

  return { expiresAt };
}

export async function consumePasswordResetTokenByHash(tokenHash: string): Promise<string | null> {
  await ensureSchema();
  const client = await getClient();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query<RawOneTimeTokenRecord>(
      `
      SELECT id, user_id, expires_at
      FROM password_reset_tokens
      WHERE token_hash = $1
      AND used_at IS NULL
      FOR UPDATE
      `,
      [tokenHash],
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      await client.query("ROLLBACK");
      return null;
    }

    const expiresAt = new Date(tokenRow.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      await client.query(
        `
        UPDATE password_reset_tokens
        SET used_at = NOW()
        WHERE id = $1
        `,
        [tokenRow.id],
      );
      await client.query("COMMIT");
      return null;
    }

    await client.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = $1
      `,
      [tokenRow.id],
    );

    await client.query(
      `
      DELETE FROM password_reset_tokens
      WHERE user_id = $1
      AND id <> $2
      `,
      [tokenRow.user_id, tokenRow.id],
    );

    await client.query("COMMIT");
    return tokenRow.user_id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function incrementRateLimitBucket(
  scope: string,
  identifier: string,
  windowStartedAt: string,
): Promise<number> {
  await ensureSchema();

  const key = `${scope}:${identifier}:${windowStartedAt}`;
  const result = await getPool().query<RawRateLimitCounter>(
    `
    INSERT INTO policy_rate_limits (key, scope, identifier, window_started_at, count)
    VALUES ($1, $2, $3, $4, 1)
    ON CONFLICT (key)
    DO UPDATE SET count = policy_rate_limits.count + 1
    RETURNING count
    `,
    [key, scope, identifier, windowStartedAt],
  );

  return Number(result.rows[0]?.count ?? 1);
}

export async function cleanupExpiredRateLimitBuckets(): Promise<void> {
  await ensureSchema();

  await getPool().query(
    `
    DELETE FROM policy_rate_limits
    WHERE window_started_at < NOW() - INTERVAL '2 days'
    `,
  );
}

export async function createPolicyConversation(
  userId: string,
  datasetId: string,
  title: string,
): Promise<PolicyConversation> {
  await ensureSchema();

  const normalizedTitle = title.trim() || "Untitled conversation";
  const conversationId = randomUUID();

  const result = await getPool().query<RawPolicyConversation>(
    `
    INSERT INTO policy_conversations (id, user_id, dataset_id, title, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING
      id,
      user_id,
      dataset_id,
      title,
      created_at,
      updated_at,
      updated_at AS last_message_at,
      0::integer AS message_count
    `,
    [conversationId, userId, datasetId, normalizedTitle],
  );

  return mapPolicyConversation(result.rows[0]);
}

export async function getPolicyConversation(
  userId: string,
  conversationId: string,
): Promise<PolicyConversation | null> {
  await ensureSchema();

  const result = await getPool().query<RawPolicyConversation>(
    `
    SELECT
      c.id,
      c.user_id,
      c.dataset_id,
      c.title,
      c.created_at,
      c.updated_at,
      COALESCE(MAX(m.created_at), c.updated_at) AS last_message_at,
      COUNT(m.id)::integer AS message_count
    FROM policy_conversations c
    LEFT JOIN policy_conversation_messages m ON m.conversation_id = c.id
    WHERE c.id = $1
    AND c.user_id = $2
    GROUP BY c.id
    LIMIT 1
    `,
    [conversationId, userId],
  );

  const row = result.rows[0];
  return row ? mapPolicyConversation(row) : null;
}

export async function listPolicyConversations(
  userId: string,
  options?: { datasetId?: string; limit?: number },
): Promise<PolicyConversation[]> {
  await ensureSchema();

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 100) : 30;
  const datasetId = options?.datasetId?.trim();

  if (datasetId) {
    const result = await getPool().query<RawPolicyConversation>(
      `
      SELECT
        c.id,
        c.user_id,
        c.dataset_id,
        c.title,
        c.created_at,
        c.updated_at,
        COALESCE(MAX(m.created_at), c.updated_at) AS last_message_at,
        COUNT(m.id)::integer AS message_count
      FROM policy_conversations c
      LEFT JOIN policy_conversation_messages m ON m.conversation_id = c.id
      WHERE c.user_id = $1
      AND c.dataset_id = $2
      GROUP BY c.id
      ORDER BY COALESCE(MAX(m.created_at), c.updated_at) DESC
      LIMIT $3
      `,
      [userId, datasetId, limit],
    );

    return result.rows.map(mapPolicyConversation);
  }

  const result = await getPool().query<RawPolicyConversation>(
    `
    SELECT
      c.id,
      c.user_id,
      c.dataset_id,
      c.title,
      c.created_at,
      c.updated_at,
      COALESCE(MAX(m.created_at), c.updated_at) AS last_message_at,
      COUNT(m.id)::integer AS message_count
    FROM policy_conversations c
    LEFT JOIN policy_conversation_messages m ON m.conversation_id = c.id
    WHERE c.user_id = $1
    GROUP BY c.id
    ORDER BY COALESCE(MAX(m.created_at), c.updated_at) DESC
    LIMIT $2
    `,
    [userId, limit],
  );

  return result.rows.map(mapPolicyConversation);
}

export async function listPolicyConversationMessages(
  userId: string,
  conversationId: string,
  options?: { limit?: number },
): Promise<PolicyConversationMessage[]> {
  await ensureSchema();

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 400) : 240;

  const result = await getPool().query<RawPolicyConversationMessage>(
    `
    SELECT
      m.id,
      m.conversation_id,
      m.role,
      m.content,
      m.created_at,
      m.answer_evidence
    FROM policy_conversation_messages m
    JOIN policy_conversations c ON c.id = m.conversation_id
    WHERE m.conversation_id = $1
    AND c.user_id = $2
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT $3
    `,
    [conversationId, userId, limit],
  );

  return result.rows.map(mapPolicyConversationMessage);
}

export async function appendPolicyConversationMessage(
  conversationId: string,
  role: ConversationRole,
  content: string,
  answerEvidence?: PolicyAnswerEvidenceSnapshot | null,
): Promise<PolicyConversationMessage> {
  await ensureSchema();

  const normalizedContent = content.trim();
  if (!normalizedContent) {
    throw new Error("Conversation message content cannot be empty.");
  }

  const client = await getClient();

  try {
    await client.query("BEGIN");

    const messageResult = await client.query<RawPolicyConversationMessage>(
      `
      INSERT INTO policy_conversation_messages (conversation_id, role, content, answer_evidence)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING id, conversation_id, role, content, created_at, answer_evidence
      `,
      [
        conversationId,
        role,
        normalizedContent,
        answerEvidence ? JSON.stringify(answerEvidence) : null,
      ],
    );

    await client.query(
      `
      UPDATE policy_conversations
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [conversationId],
    );

    await client.query("COMMIT");
    return mapPolicyConversationMessage(messageResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureSchema(): Promise<void> {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    const client = await getClient();
    try {
      await enableRetrievalExtensions(client);

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          district_name TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL,
          email_verified_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
      `);

      await client.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS district_name TEXT NOT NULL DEFAULT '';
      `);

      await client.query(`
        ALTER TABLE users
        ALTER COLUMN district_name SET DEFAULT '';
      `);

      await client.query(`
        UPDATE users
        SET district_name = ''
        WHERE district_name IS NULL;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
        ON email_verification_tokens(user_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
        ON email_verification_tokens(expires_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
        ON password_reset_tokens(user_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
        ON password_reset_tokens(expires_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS policy_rate_limits (
          key TEXT PRIMARY KEY,
          scope TEXT NOT NULL,
          identifier TEXT NOT NULL,
          window_started_at TIMESTAMPTZ NOT NULL,
          count INTEGER NOT NULL DEFAULT 0
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_rate_limits_scope_identifier
        ON policy_rate_limits(scope, identifier, window_started_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS policy_datasets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT '',
          district_name TEXT NOT NULL,
          filename TEXT NOT NULL,
          uploaded_at TIMESTAMPTZ NOT NULL,
          policy_count INTEGER NOT NULL DEFAULT 0,
          source_type TEXT NOT NULL DEFAULT 'csv_upload',
          source_url TEXT NOT NULL DEFAULT '',
          source_platform TEXT NOT NULL DEFAULT '',
          archived_at TIMESTAMPTZ,
          source_headers JSONB NOT NULL DEFAULT '[]'::jsonb
        );
      `);

      await client.query(`
        ALTER TABLE policy_datasets
        ADD COLUMN IF NOT EXISTS user_id TEXT;
      `);

      await client.query(`
        ALTER TABLE policy_datasets
        ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
      `);

      await client.query(`
        ALTER TABLE policy_datasets
        ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'csv_upload';
      `);

      await client.query(`
        ALTER TABLE policy_datasets
        ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT '';
      `);

      await client.query(`
        ALTER TABLE policy_datasets
        ADD COLUMN IF NOT EXISTS source_platform TEXT NOT NULL DEFAULT '';
      `);

      await client.query(`
        ALTER TABLE policy_datasets
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_datasets_user_id ON policy_datasets(user_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_datasets_user_active_uploaded
        ON policy_datasets(user_id, uploaded_at DESC)
        WHERE archived_at IS NULL;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS policy_import_previews (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          district_name TEXT NOT NULL,
          filename TEXT NOT NULL,
          source_url TEXT NOT NULL,
          platform TEXT NOT NULL,
          source_count INTEGER NOT NULL DEFAULT 0,
          source_label TEXT NOT NULL DEFAULT '',
          failed_count INTEGER NOT NULL DEFAULT 0,
          source_headers JSONB NOT NULL DEFAULT '[]'::jsonb,
          rows JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_import_previews_user_id
        ON policy_import_previews(user_id, created_at DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_import_previews_expires_at
        ON policy_import_previews(expires_at);
      `);

      await client.query(`
        UPDATE users AS u
        SET district_name = sub.district_name
        FROM (
          SELECT DISTINCT ON (user_id) user_id, district_name
          FROM policy_datasets
          WHERE TRIM(district_name) <> ''
          ORDER BY user_id, uploaded_at DESC
        ) AS sub
        WHERE u.id = sub.user_id
        AND TRIM(u.district_name) = '';
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

      await client.query(`
        ALTER TABLE policies
        ADD COLUMN IF NOT EXISTS search_vector TSVECTOR NOT NULL DEFAULT ''::tsvector;
      `);

      await client.query(`
        CREATE OR REPLACE FUNCTION policy_assistant_set_policy_search_vector()
        RETURNS trigger AS $$
        BEGIN
          NEW.search_text := LOWER(CONCAT_WS(
            ' ',
            NEW.policy_section,
            NEW.policy_code,
            NEW.adopted_date,
            NEW.revised_date,
            NEW.policy_status,
            NEW.policy_title,
            NEW.policy_wording
          ));

          NEW.search_vector :=
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.policy_code, '')), 'A') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.policy_title, '')), 'A') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.policy_section, '')), 'B') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.policy_status, '')), 'D') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.policy_wording, '')), 'C');

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await client.query(`
        DROP TRIGGER IF EXISTS trg_policy_assistant_policies_search_vector ON policies;
      `);

      await client.query(`
        CREATE TRIGGER trg_policy_assistant_policies_search_vector
        BEFORE INSERT OR UPDATE OF
          policy_section,
          policy_code,
          adopted_date,
          revised_date,
          policy_status,
          policy_title,
          policy_wording,
          search_text
        ON policies
        FOR EACH ROW
        EXECUTE FUNCTION policy_assistant_set_policy_search_vector();
      `);

      await client.query(`
        UPDATE policies
        SET
          search_text = LOWER(CONCAT_WS(
            ' ',
            policy_section,
            policy_code,
            adopted_date,
            revised_date,
            policy_status,
            policy_title,
            policy_wording
          )),
          search_vector =
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(policy_code, '')), 'A') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(policy_title, '')), 'A') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(policy_section, '')), 'B') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(policy_status, '')), 'D') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(policy_wording, '')), 'C')
        WHERE search_vector = ''::tsvector
        OR search_text = '';
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policies_search_vector
        ON policies USING GIN(search_vector);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policies_search_text_trgm
        ON policies USING GIN(search_text gin_trgm_ops);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policies_title_trgm
        ON policies USING GIN(policy_title gin_trgm_ops);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policies_code_trgm
        ON policies USING GIN(policy_code gin_trgm_ops);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policies_section_trgm
        ON policies USING GIN(policy_section gin_trgm_ops);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS handbook_documents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT '',
          district_name TEXT NOT NULL,
          filename TEXT NOT NULL,
          uploaded_at TIMESTAMPTZ NOT NULL,
          chunk_count INTEGER NOT NULL DEFAULT 0,
          handbook_type TEXT NOT NULL DEFAULT 'student',
          archived_at TIMESTAMPTZ
        );
      `);

      await client.query(`
        ALTER TABLE handbook_documents
        ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
      `);

      await client.query(`
        ALTER TABLE handbook_documents
        ADD COLUMN IF NOT EXISTS handbook_type TEXT;
      `);

      await client.query(`
        ALTER TABLE handbook_documents
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
      `);

      await client.query(`
        UPDATE handbook_documents
        SET handbook_type = 'student'
        WHERE handbook_type IS NULL OR TRIM(handbook_type) = '';
      `);

      await client.query(`
        ALTER TABLE handbook_documents
        ALTER COLUMN handbook_type SET DEFAULT 'student';
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_handbook_documents_user_id_type
        ON handbook_documents(user_id, handbook_type, uploaded_at DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_handbook_documents_user_active_type_uploaded
        ON handbook_documents(user_id, handbook_type, uploaded_at DESC)
        WHERE archived_at IS NULL;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_handbook_documents_user_id ON handbook_documents(user_id);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS handbook_chunks (
          id SERIAL PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES handbook_documents(id) ON DELETE CASCADE,
          section_title TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          search_text TEXT NOT NULL DEFAULT '',
          source_index INTEGER NOT NULL DEFAULT 0
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_handbook_chunks_document_id ON handbook_chunks(document_id);
      `);

      await client.query(`
        ALTER TABLE handbook_chunks
        ADD COLUMN IF NOT EXISTS search_vector TSVECTOR NOT NULL DEFAULT ''::tsvector;
      `);

      await client.query(`
        CREATE OR REPLACE FUNCTION policy_assistant_set_handbook_chunk_search_vector()
        RETURNS trigger AS $$
        BEGIN
          NEW.search_text := LOWER(CONCAT_WS(
            ' ',
            NEW.section_title,
            NEW.content
          ));

          NEW.search_vector :=
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.section_title, '')), 'A') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(NEW.content, '')), 'C');

          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await client.query(`
        DROP TRIGGER IF EXISTS trg_policy_assistant_handbook_chunks_search_vector ON handbook_chunks;
      `);

      await client.query(`
        CREATE TRIGGER trg_policy_assistant_handbook_chunks_search_vector
        BEFORE INSERT OR UPDATE OF
          section_title,
          content,
          search_text
        ON handbook_chunks
        FOR EACH ROW
        EXECUTE FUNCTION policy_assistant_set_handbook_chunk_search_vector();
      `);

      await client.query(`
        UPDATE handbook_chunks
        SET
          search_text = LOWER(CONCAT_WS(
            ' ',
            section_title,
            content
          )),
          search_vector =
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(section_title, '')), 'A') ||
            SETWEIGHT(TO_TSVECTOR('english', COALESCE(content, '')), 'C')
        WHERE search_vector = ''::tsvector
        OR search_text = '';
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_handbook_chunks_search_vector
        ON handbook_chunks USING GIN(search_vector);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_handbook_chunks_search_text_trgm
        ON handbook_chunks USING GIN(search_text gin_trgm_ops);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_handbook_chunks_section_title_trgm
        ON handbook_chunks USING GIN(section_title gin_trgm_ops);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS policy_conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          dataset_id TEXT NOT NULL REFERENCES policy_datasets(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_conversations_user_id ON policy_conversations(user_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_conversations_dataset_id ON policy_conversations(dataset_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_conversations_updated_at ON policy_conversations(updated_at DESC);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS policy_conversation_messages (
          id BIGSERIAL PRIMARY KEY,
          conversation_id TEXT NOT NULL REFERENCES policy_conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          answer_evidence JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        ALTER TABLE policy_conversation_messages
        ADD COLUMN IF NOT EXISTS answer_evidence JSONB;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_conversation_messages_conversation_id
        ON policy_conversation_messages(conversation_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_conversation_messages_created_at
        ON policy_conversation_messages(created_at);
      `);

      if (vectorExtensionReady) {
        await client.query(`
          ALTER TABLE policies
          ADD COLUMN IF NOT EXISTS embedding vector(1536);
        `);

        await client.query(`
          ALTER TABLE handbook_chunks
          ADD COLUMN IF NOT EXISTS embedding vector(1536);
        `);

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_policies_embedding
          ON policies USING hnsw (embedding vector_cosine_ops);
        `);

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_handbook_chunks_embedding
          ON handbook_chunks USING hnsw (embedding vector_cosine_ops);
        `);
      }
    } finally {
      client.release();
    }
  })();

  return schemaReadyPromise;
}

async function enableRetrievalExtensions(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  `);

  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
    `);
    vectorExtensionReady = true;
  } catch (error) {
    vectorExtensionReady = false;
    console.error(
      "[policy_assistant_db] pgvector extension unavailable; semantic retrieval disabled",
      error,
    );
  }
}

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = resolveDatabaseUrl();
  pool = new Pool({ connectionString });
  const databaseSchema = resolveDatabaseSchema();

  if (databaseSchema) {
    pool.on("connect", (client) => {
      void client
        .query(`SET search_path TO ${quoteIdentifier(databaseSchema)}, public`)
        .catch((error) => {
          console.error("[policy_assistant_db] failed to set search_path", error);
        });
    });
  }

  return pool;
}

async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

function resolveDatabaseUrl(): string {
  const url =
    process.env.POLICY_ASSISTANT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.STORAGE_URL?.trim() ||
    process.env.STORAGE_DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      "Postgres database URL is missing. Set one of POLICY_ASSISTANT_DATABASE_URL, POSTGRES_URL, DATABASE_URL, or DATABASE_URL_UNPOOLED.",
    );
  }

  return url;
}

function resolveDatabaseSchema(): string | null {
  const explicitSchema = process.env.POLICY_ASSISTANT_DB_SCHEMA?.trim();
  if (explicitSchema) {
    return validateDatabaseSchema(explicitSchema);
  }

  try {
    const url = new URL(resolveDatabaseUrl());
    const options = url.searchParams.get("options")?.trim();
    if (!options) {
      return null;
    }

    const match = options.match(/(?:^|\s)-csearch_path=([A-Za-z_][A-Za-z0-9_]*)/);
    if (!match) {
      return null;
    }

    return validateDatabaseSchema(match[1]);
  } catch {
    return null;
  }
}

function validateDatabaseSchema(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error("POLICY_ASSISTANT_DB_SCHEMA contains an invalid schema name.");
  }

  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
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

function buildHandbookSearchText(sectionTitle: string, content: string): string {
  return [sectionTitle, content].join(" ").toLowerCase();
}

function normalizeHandbookType(value: string | null | undefined): HandbookType {
  return value === "staff" ? "staff" : "student";
}

function normalizeHandbookTypes(
  values: HandbookType[] | undefined,
): HandbookType[] {
  if (!values || values.length === 0) {
    return [];
  }

  return Array.from(new Set(values.map((value) => normalizeHandbookType(value))));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeDatasetTitle(value: string | undefined, fallbackFilename: string): string {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (normalized) {
    return normalized.slice(0, 160);
  }

  const filenameTitle = fallbackFilename
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");

  return (filenameTitle || "Policy Dataset").slice(0, 160);
}

function normalizePolicyDatasetSourceType(value: string | null | undefined): PolicyDatasetSourceType {
  return value === "scraper_import" ? "scraper_import" : "csv_upload";
}

function normalizeHandbookTitle(
  value: string | undefined,
  fallbackFilename: string,
  handbookType: HandbookType,
): string {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (normalized) {
    return normalized.slice(0, 160);
  }

  const filenameTitle = fallbackFilename
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");

  const fallbackTitle = handbookType === "staff" ? "Staff Handbook" : "Student Handbook";
  return (filenameTitle || fallbackTitle).slice(0, 160);
}

function mapDataset(row: RawPolicyDataset): PolicyDataset {
  return {
    id: row.id,
    title: normalizeDatasetTitle(row.title ?? undefined, row.filename),
    districtName: row.district_name,
    filename: row.filename,
    uploadedAt: formatTimestamp(row.uploaded_at),
    policyCount: Number(row.policy_count),
    sourceType: normalizePolicyDatasetSourceType(row.source_type),
    sourceUrl: row.source_url?.trim() ?? "",
    sourcePlatform: row.source_platform?.trim() ?? "",
    archivedAt: row.archived_at ? formatTimestamp(row.archived_at) : null,
  };
}

function mapPolicyImportPreview(row: RawPolicyImportPreview): PolicyImportPreview {
  return {
    id: row.id,
    userId: row.user_id,
    districtName: row.district_name,
    filename: row.filename,
    sourceUrl: row.source_url,
    platform: row.platform,
    sourceCount: Number(row.source_count),
    sourceLabel: row.source_label,
    failedCount: Number(row.failed_count),
    headers: normalizeStringArray(row.source_headers),
    rows: normalizePolicyRows(row.rows),
    createdAt: formatTimestamp(row.created_at),
    expiresAt: formatTimestamp(row.expires_at),
  };
}

function mapHandbookDocument(row: RawHandbookDocument): HandbookDocument {
  const handbookType = normalizeHandbookType(row.handbook_type);

  return {
    id: row.id,
    title: normalizeHandbookTitle(row.title ?? undefined, row.filename, handbookType),
    districtName: row.district_name,
    filename: row.filename,
    uploadedAt: formatTimestamp(row.uploaded_at),
    chunkCount: Number(row.chunk_count),
    handbookType,
    archivedAt: row.archived_at ? formatTimestamp(row.archived_at) : null,
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

function mapPolicySearchCandidate(row: RawPolicySearchCandidate): PolicySearchCandidate {
  return {
    ...mapStoredPolicy(row),
    fullTextRank: Number(row.full_text_rank),
    trigramScore: Number(row.trigram_score),
    combinedRank: Number(row.combined_rank),
  };
}

function mapStoredHandbookChunk(row: RawStoredHandbookChunk): StoredHandbookChunk {
  return {
    id: Number(row.id),
    documentId: row.document_id,
    handbookType: normalizeHandbookType(row.handbook_type),
    sectionTitle: row.section_title,
    content: row.content,
    sourceIndex: Number(row.source_index),
  };
}

function mapHandbookSearchCandidate(
  row: RawHandbookSearchCandidate,
): HandbookSearchCandidate {
  return {
    ...mapStoredHandbookChunk(row),
    fullTextRank: Number(row.full_text_rank),
    trigramScore: Number(row.trigram_score),
    combinedRank: Number(row.combined_rank),
  };
}

function mapAuthUser(row: RawAuthUser): AuthUser {
  return {
    id: row.id,
    email: row.email,
    districtName: row.district_name || "",
    createdAt: formatTimestamp(row.created_at),
    emailVerifiedAt: row.email_verified_at ? formatTimestamp(row.email_verified_at) : null,
  };
}

function mapPolicyConversation(row: RawPolicyConversation): PolicyConversation {
  const lastMessageAt = row.last_message_at ?? row.updated_at;
  const messageCount = row.message_count ?? 0;

  return {
    id: row.id,
    datasetId: row.dataset_id,
    title: row.title,
    createdAt: formatTimestamp(row.created_at),
    updatedAt: formatTimestamp(row.updated_at),
    lastMessageAt: formatTimestamp(lastMessageAt),
    messageCount: Number(messageCount),
  };
}

function mapPolicyConversationMessage(
  row: RawPolicyConversationMessage,
): PolicyConversationMessage {
  return {
    id: Number(row.id),
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: formatTimestamp(row.created_at),
    answerEvidence: normalizePolicyAnswerEvidence(row.answer_evidence),
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item ?? ""));
}

function normalizePolicyRows(value: unknown): NormalizedPolicyRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const row = isRecord(item) ? item : {};
    return {
      policySection: normalizeString(row.policySection),
      policyCode: normalizeString(row.policyCode),
      adoptedDate: normalizeString(row.adoptedDate),
      revisedDate: normalizeString(row.revisedDate),
      policyStatus: normalizeString(row.policyStatus),
      policyTitle: normalizeString(row.policyTitle),
      policyWording: normalizeString(row.policyWording),
      sourceRowIndex: normalizeNumber(row.sourceRowIndex, index + 2),
    };
  });
}

function normalizePolicyAnswerEvidence(value: unknown): PolicyAnswerEvidenceSnapshot | null {
  if (!isRecord(value) || !isRecord(value.policyDataset)) {
    return null;
  }

  const policyDataset = value.policyDataset;
  const datasetId = normalizeString(policyDataset.id).trim();
  const capturedAt = normalizeString(value.capturedAt).trim();
  if (!datasetId || !capturedAt) {
    return null;
  }

  const policyMatches = Array.isArray(value.policyMatches)
    ? value.policyMatches
        .filter(isRecord)
        .map((match) => ({
          id: normalizeNumber(match.id, 0),
          policySection: normalizeString(match.policySection),
          policyCode: normalizeString(match.policyCode),
          policyTitle: normalizeString(match.policyTitle),
          revisedDate: normalizeString(match.revisedDate),
        }))
        .filter((match) => match.id > 0)
    : [];

  const handbookVersions = Array.isArray(value.handbookVersions)
    ? value.handbookVersions
        .filter(isRecord)
        .map((version) => {
          const versionId = normalizeString(version.id).trim();
          const matchedExcerpts = Array.isArray(version.matchedExcerpts)
            ? version.matchedExcerpts
                .filter(isRecord)
                .map((excerpt) => ({
                  id: normalizeNumber(excerpt.id, 0),
                  sectionTitle: normalizeString(excerpt.sectionTitle),
                  sourceIndex: normalizeNumber(excerpt.sourceIndex, 0),
                }))
                .filter((excerpt) => excerpt.id > 0)
            : [];

          return {
            id: versionId,
            title: normalizeString(version.title),
            handbookType: normalizeHandbookType(normalizeString(version.handbookType)),
            filename: normalizeString(version.filename),
            uploadedAt: normalizeString(version.uploadedAt),
            chunkCount: normalizeNumber(version.chunkCount, 0),
            matchedExcerpts,
          };
        })
        .filter((version) => version.id)
    : [];

  return {
    capturedAt,
    policyDataset: {
      id: datasetId,
      title: normalizeString(policyDataset.title),
      districtName: normalizeString(policyDataset.districtName),
      filename: normalizeString(policyDataset.filename),
      uploadedAt: normalizeString(policyDataset.uploadedAt),
      policyCount: normalizeNumber(policyDataset.policyCount, 0),
      sourceType: normalizePolicyDatasetSourceType(normalizeString(policyDataset.sourceType)),
      sourceUrl: normalizeString(policyDataset.sourceUrl),
      sourcePlatform: normalizeString(policyDataset.sourcePlatform),
    },
    policyMatches,
    handbookVersions,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSearchQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTrigramSearchQuery(value: string): string {
  return value.replace(/\s+OR\s+/gi, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Semantic (vector) retrieval support
// ---------------------------------------------------------------------------

interface RawPolicySemanticCandidate extends RawStoredPolicy {
  semantic_score: number | string;
}

interface RawHandbookSemanticCandidate extends RawStoredHandbookChunk {
  semantic_score: number | string;
}

export interface PolicyEmbeddingBacklogRow {
  id: number;
  policySection: string;
  policyCode: string;
  policyTitle: string;
  policyWording: string;
}

export interface HandbookChunkEmbeddingBacklogRow {
  id: number;
  handbookType: HandbookType;
  sectionTitle: string;
  content: string;
}

/** True when the pgvector extension is installed and embedding columns exist. */
export async function isVectorSearchAvailable(): Promise<boolean> {
  await ensureSchema();
  return vectorExtensionReady;
}

export async function listPolicyEmbeddingBacklog(
  options?: { limit?: number; datasetId?: string },
): Promise<PolicyEmbeddingBacklogRow[]> {
  await ensureSchema();
  if (!vectorExtensionReady) {
    return [];
  }

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 500) : 200;
  const params: Array<string | number> = [];
  let datasetClause = "";
  if (options?.datasetId) {
    params.push(options.datasetId);
    datasetClause = `AND p.dataset_id = $${params.length}`;
  }
  params.push(limit);

  const result = await getPool().query<{
    id: number | string;
    policy_section: string;
    policy_code: string;
    policy_title: string;
    policy_wording: string;
  }>(
    `
    SELECT p.id, p.policy_section, p.policy_code, p.policy_title, p.policy_wording
    FROM policies p
    WHERE p.embedding IS NULL
    ${datasetClause}
    ORDER BY p.id ASC
    LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    policySection: row.policy_section,
    policyCode: row.policy_code,
    policyTitle: row.policy_title,
    policyWording: row.policy_wording,
  }));
}

export async function listHandbookChunkEmbeddingBacklog(
  options?: { limit?: number; documentId?: string },
): Promise<HandbookChunkEmbeddingBacklogRow[]> {
  await ensureSchema();
  if (!vectorExtensionReady) {
    return [];
  }

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 500) : 200;
  const params: Array<string | number> = [];
  let documentClause = "";
  if (options?.documentId) {
    params.push(options.documentId);
    documentClause = `AND c.document_id = $${params.length}`;
  }
  params.push(limit);

  const result = await getPool().query<{
    id: number | string;
    handbook_type: string | null;
    section_title: string;
    content: string;
  }>(
    `
    SELECT c.id, d.handbook_type, c.section_title, c.content
    FROM handbook_chunks c
    JOIN handbook_documents d ON d.id = c.document_id
    WHERE c.embedding IS NULL
    ${documentClause}
    ORDER BY c.id ASC
    LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    handbookType: normalizeHandbookType(row.handbook_type),
    sectionTitle: row.section_title,
    content: row.content,
  }));
}

export async function updatePolicyEmbeddings(
  items: Array<{ id: number; vectorLiteral: string }>,
): Promise<void> {
  await ensureSchema();
  if (!vectorExtensionReady || items.length === 0) {
    return;
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      await client.query(
        `UPDATE policies SET embedding = $2::vector WHERE id = $1`,
        [item.id, item.vectorLiteral],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateHandbookChunkEmbeddings(
  items: Array<{ id: number; vectorLiteral: string }>,
): Promise<void> {
  await ensureSchema();
  if (!vectorExtensionReady || items.length === 0) {
    return;
  }

  const client = await getClient();
  try {
    await client.query("BEGIN");
    for (const item of items) {
      await client.query(
        `UPDATE handbook_chunks SET embedding = $2::vector WHERE id = $1`,
        [item.id, item.vectorLiteral],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function searchDatasetPoliciesByEmbedding(
  userId: string,
  datasetId: string,
  vectorLiteral: string,
  options?: { limit?: number },
): Promise<PolicySemanticCandidate[]> {
  await ensureSchema();
  if (!vectorExtensionReady) {
    return [];
  }

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 60) : 20;
  const result = await getPool().query<RawPolicySemanticCandidate>(
    `
    SELECT
      p.id,
      p.dataset_id,
      p.policy_section,
      p.policy_code,
      p.adopted_date,
      p.revised_date,
      p.policy_status,
      p.policy_title,
      p.policy_wording,
      p.source_row_index,
      1 - (p.embedding <=> $3::vector) AS semantic_score
    FROM policies p
    JOIN policy_datasets d ON d.id = p.dataset_id
    WHERE p.dataset_id = $1
    AND d.user_id = $2
    AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> $3::vector ASC, p.id ASC
    LIMIT $4
    `,
    [datasetId, userId, vectorLiteral, limit],
  );

  return result.rows.map((row) => ({
    ...mapStoredPolicy(row),
    semanticScore: Number(row.semantic_score),
  }));
}

export async function searchHandbookChunksByEmbedding(
  userId: string,
  vectorLiteral: string,
  options?: { limit?: number; handbookTypes?: HandbookType[] },
): Promise<HandbookSemanticCandidate[]> {
  await ensureSchema();
  if (!vectorExtensionReady) {
    return [];
  }

  const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 60) : 20;
  const handbookTypes = normalizeHandbookTypes(options?.handbookTypes);
  const params: Array<string | number | HandbookType[]> = [userId, vectorLiteral];
  let typeClause = "";
  if (handbookTypes.length > 0) {
    params.push(handbookTypes);
    typeClause = `AND d.handbook_type = ANY($${params.length}::text[])`;
  }
  params.push(limit);

  const result = await getPool().query<RawHandbookSemanticCandidate>(
    `
    SELECT
      c.id,
      c.document_id,
      d.handbook_type,
      c.section_title,
      c.content,
      c.source_index,
      1 - (c.embedding <=> $2::vector) AS semantic_score
    FROM handbook_chunks c
    JOIN handbook_documents d ON d.id = c.document_id
    WHERE d.user_id = $1
    AND d.archived_at IS NULL
    AND c.embedding IS NOT NULL
    ${typeClause}
    ORDER BY c.embedding <=> $2::vector ASC, c.id ASC
    LIMIT $${params.length}
    `,
    params,
  );

  return result.rows.map((row) => ({
    ...mapStoredHandbookChunk(row),
    semanticScore: Number(row.semantic_score),
  }));
}

export async function getEmbeddingCoverage(): Promise<EmbeddingCoverage> {
  await ensureSchema();

  if (!vectorExtensionReady) {
    const totals = await getPool().query<{ policies_total: string; chunks_total: string }>(
      `
      SELECT
        (SELECT COUNT(*) FROM policies) AS policies_total,
        (SELECT COUNT(*) FROM handbook_chunks) AS chunks_total
      `,
    );
    return {
      policiesTotal: Number(totals.rows[0]?.policies_total ?? 0),
      policiesEmbedded: 0,
      handbookChunksTotal: Number(totals.rows[0]?.chunks_total ?? 0),
      handbookChunksEmbedded: 0,
    };
  }

  const result = await getPool().query<{
    policies_total: string;
    policies_embedded: string;
    chunks_total: string;
    chunks_embedded: string;
  }>(
    `
    SELECT
      (SELECT COUNT(*) FROM policies) AS policies_total,
      (SELECT COUNT(*) FROM policies WHERE embedding IS NOT NULL) AS policies_embedded,
      (SELECT COUNT(*) FROM handbook_chunks) AS chunks_total,
      (SELECT COUNT(*) FROM handbook_chunks WHERE embedding IS NOT NULL) AS chunks_embedded
    `,
  );

  return {
    policiesTotal: Number(result.rows[0]?.policies_total ?? 0),
    policiesEmbedded: Number(result.rows[0]?.policies_embedded ?? 0),
    handbookChunksTotal: Number(result.rows[0]?.chunks_total ?? 0),
    handbookChunksEmbedded: Number(result.rows[0]?.chunks_embedded ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Full-content library views
// ---------------------------------------------------------------------------

/** All policies in one dataset, ordered for reading (section, then code). */
export async function listDatasetPolicies(
  userId: string,
  datasetId: string,
): Promise<StoredPolicy[]> {
  await ensureSchema();

  const result = await getPool().query<RawStoredPolicy>(
    `
    SELECT
      p.id,
      p.dataset_id,
      p.policy_section,
      p.policy_code,
      p.adopted_date,
      p.revised_date,
      p.policy_status,
      p.policy_title,
      p.policy_wording,
      p.source_row_index
    FROM policies p
    JOIN policy_datasets d ON d.id = p.dataset_id
    WHERE p.dataset_id = $1
    AND d.user_id = $2
    ORDER BY p.policy_section ASC, p.policy_code ASC, p.id ASC
    LIMIT 10000
    `,
    [datasetId, userId],
  );

  return result.rows.map(mapStoredPolicy);
}

/** One handbook document's full content, chunks in original order. */
export async function listHandbookDocumentChunks(
  userId: string,
  documentId: string,
): Promise<StoredHandbookChunk[]> {
  await ensureSchema();

  const result = await getPool().query<RawStoredHandbookChunk>(
    `
    SELECT
      c.id,
      c.document_id,
      d.handbook_type,
      c.section_title,
      c.content,
      c.source_index
    FROM handbook_chunks c
    JOIN handbook_documents d ON d.id = c.document_id
    WHERE c.document_id = $1
    AND d.user_id = $2
    ORDER BY c.source_index ASC, c.id ASC
    LIMIT 5000
    `,
    [documentId, userId],
  );

  return result.rows.map(mapStoredHandbookChunk);
}

/** Permanently delete one conversation and its messages (cascade). */
export async function deletePolicyConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  await ensureSchema();

  const result = await getPool().query<{ id: string }>(
    `
    DELETE FROM policy_conversations
    WHERE id = $1 AND user_id = $2
    RETURNING id
    `,
    [conversationId, userId],
  );

  return (result.rowCount ?? 0) > 0;
}
