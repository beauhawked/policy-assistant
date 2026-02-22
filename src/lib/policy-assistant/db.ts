import { randomUUID } from "node:crypto";

import { Pool, type PoolClient } from "pg";

import type {
  AuthUser,
  ConversationRole,
  NormalizedPolicyRow,
  PolicyConversation,
  PolicyConversationMessage,
  PolicyDataset,
  StoredPolicy,
} from "@/lib/policy-assistant/types";

interface CreatePolicyDatasetInput {
  userId: string;
  districtName: string;
  filename: string;
  headers: string[];
  rows: NormalizedPolicyRow[];
}

interface RawPolicyDataset {
  id: string;
  user_id: string;
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

interface RawAuthUser {
  id: string;
  email: string;
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
}

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;

export async function createPolicyDataset(input: CreatePolicyDatasetInput): Promise<PolicyDataset> {
  await ensureSchema();
  const client = await getClient();

  const datasetId = randomUUID();
  const uploadedAt = new Date().toISOString();
  const normalizedDistrictName = input.districtName.trim() || "Unnamed District";

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO policy_datasets (
        id,
        user_id,
        district_name,
        filename,
        uploaded_at,
        policy_count,
        source_headers
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        datasetId,
        input.userId,
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

export async function getPolicyDataset(userId: string, datasetId: string): Promise<PolicyDataset | null> {
  await ensureSchema();

  const queryResult = await getPool().query<RawPolicyDataset>(
    `
    SELECT id, user_id, district_name, filename, uploaded_at, policy_count
    FROM policy_datasets
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [datasetId, userId],
  );

  const row = queryResult.rows[0];
  return row ? mapDataset(row) : null;
}

export async function listPolicyDatasets(userId: string, limit = 20): Promise<PolicyDataset[]> {
  await ensureSchema();

  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const queryResult = await getPool().query<RawPolicyDataset>(
    `
    SELECT id, user_id, district_name, filename, uploaded_at, policy_count
    FROM policy_datasets
    WHERE user_id = $1
    ORDER BY uploaded_at DESC
    LIMIT $2
    `,
    [userId, safeLimit],
  );

  return queryResult.rows.map(mapDataset);
}

export async function searchDatasetPolicies(
  userId: string,
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

export async function createUserAccount(email: string, passwordHash: string): Promise<AuthUser> {
  await ensureSchema();

  const userId = randomUUID();
  const normalizedEmail = normalizeEmail(email);

  const result = await getPool().query<RawAuthUser>(
    `
    INSERT INTO users (id, email, password_hash, email_verified_at)
    VALUES ($1, $2, $3, NULL)
    RETURNING id, email, created_at, email_verified_at
    `,
    [userId, normalizedEmail, passwordHash],
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
    SELECT id, email, password_hash, created_at, email_verified_at
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
    SELECT id, email, created_at, email_verified_at
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
    RETURNING id, email, created_at, email_verified_at
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
    SELECT u.id, u.email, u.created_at, u.email_verified_at
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
      m.created_at
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
      INSERT INTO policy_conversation_messages (conversation_id, role, content)
      VALUES ($1, $2, $3)
      RETURNING id, conversation_id, role, content, created_at
      `,
      [conversationId, role, normalizedContent],
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
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
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
          district_name TEXT NOT NULL,
          filename TEXT NOT NULL,
          uploaded_at TIMESTAMPTZ NOT NULL,
          policy_count INTEGER NOT NULL DEFAULT 0,
          source_headers JSONB NOT NULL DEFAULT '[]'::jsonb
        );
      `);

      await client.query(`
        ALTER TABLE policy_datasets
        ADD COLUMN IF NOT EXISTS user_id TEXT;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_datasets_user_id ON policy_datasets(user_id);
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
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_conversation_messages_conversation_id
        ON policy_conversation_messages(conversation_id);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_policy_conversation_messages_created_at
        ON policy_conversation_messages(created_at);
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
  pool = new Pool({ connectionString });
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

function mapAuthUser(row: RawAuthUser): AuthUser {
  return {
    id: row.id,
    email: row.email,
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
