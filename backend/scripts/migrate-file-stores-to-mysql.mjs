import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, "..");
const dataDir = join(backendDir, "data");
const workspacesDir = join(dataDir, "workspaces");
const incidentsLogPath = join(dataDir, "incidents.log");

function loadDotEnv(envPath) {
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || key in process.env) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadDotEnv(join(backendDir, ".env"));

const MYSQL_URL = process.env.MYSQL_URL || "";
const MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || "creative_spark";
const MYSQL_USER = process.env.MYSQL_USER || "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "";
const MYSQL_CONNECTION_LIMIT = Number(process.env.MYSQL_CONNECTION_LIMIT || 10);

const MYSQL_STATE_CHUNK_BYTES = Math.max(
  128 * 1024,
  Number(process.env.MYSQL_STATE_CHUNK_BYTES || 512 * 1024),
);
const MYSQL_STATE_INLINE_LIMIT_BYTES = Math.max(
  128 * 1024,
  Number(process.env.MYSQL_STATE_INLINE_LIMIT_BYTES || MYSQL_STATE_CHUNK_BYTES),
);
const CHUNKED_STATE_FORMAT = "chunked-json-v1";
const DEFAULT_WORKSPACE_ID = "main";

const STORE_KEY_CAMPAIGNS = "campaigns";
const STORE_KEY_DRIVE = "drive";
const STORE_KEY_CHAT = "chat";
const STATE_FILE_BY_KEY = {
  [STORE_KEY_CAMPAIGNS]: "campaigns.json",
  [STORE_KEY_DRIVE]: "drive.json",
  [STORE_KEY_CHAT]: "chat.json",
};

function normalizeWorkspaceId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) {
    return DEFAULT_WORKSPACE_ID;
  }
  return normalized.slice(0, 40);
}

function toWorkspaceStateKey(baseKey, workspaceId) {
  const normalized = normalizeWorkspaceId(workspaceId);
  return normalized === DEFAULT_WORKSPACE_ID ? baseKey : `${baseKey}:${normalized}`;
}

function getBaseStateKey(stateKey) {
  return String(stateKey || "").split(":")[0];
}

function readJsonFile(pathname) {
  if (!existsSync(pathname)) {
    throw new Error(`Missing source file: ${pathname}`);
  }
  return JSON.parse(readFileSync(pathname, "utf8"));
}

function readJsonFileIfExists(pathname) {
  if (!existsSync(pathname)) {
    return null;
  }
  return JSON.parse(readFileSync(pathname, "utf8"));
}

function splitBufferIntoChunks(buffer, chunkSize) {
  const chunks = [];
  for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
    const nextOffset = Math.min(offset + chunkSize, buffer.byteLength);
    chunks.push(buffer.subarray(offset, nextOffset));
  }
  return chunks;
}

function quoteIdentifier(name) {
  if (!/^[A-Za-z0-9$_-]+$/.test(name)) {
    throw new Error(`Invalid MySQL identifier: ${name}`);
  }
  return `\`${name.replace(/`/g, "``")}\``;
}

function buildStateSummary(stateKey, payload) {
  if (!payload || typeof payload !== "object") {
    return { stateKey, type: typeof payload };
  }

  const baseKey = getBaseStateKey(stateKey);
  if (baseKey === STORE_KEY_CAMPAIGNS) {
    return {
      stateKey,
      campaigns: Array.isArray(payload.campaigns) ? payload.campaigns.length : 0,
    };
  }

  if (baseKey === STORE_KEY_DRIVE) {
    return {
      stateKey,
      folders: Array.isArray(payload.folders) ? payload.folders.length : 0,
      files: Array.isArray(payload.files) ? payload.files.length : 0,
    };
  }

  if (baseKey === STORE_KEY_CHAT) {
    const threads = Array.isArray(payload.threads) ? payload.threads.length : 0;
    const threadedMessages = Array.isArray(payload.threads)
      ? payload.threads.reduce(
          (total, thread) =>
            total + (Array.isArray(thread?.messages) ? thread.messages.length : 0),
          0,
        )
      : 0;
    const legacyMessages = Array.isArray(payload.messages) ? payload.messages.length : 0;
    const memories = Array.isArray(payload.memories) ? payload.memories.length : 0;
    return {
      stateKey,
      threads,
      messages: threadedMessages > 0 ? threadedMessages : legacyMessages,
      memories,
    };
  }

  return { stateKey, keys: Object.keys(payload).length };
}

function summarizeStatesByKey(statesByKey) {
  const output = {};
  for (const stateKey of Object.keys(statesByKey).sort()) {
    output[stateKey] = buildStateSummary(stateKey, statesByKey[stateKey]);
  }
  return output;
}

function createPool() {
  if (MYSQL_URL) {
    return mysql.createPool({
      uri: MYSQL_URL,
      waitForConnections: true,
      connectionLimit: MYSQL_CONNECTION_LIMIT,
    });
  }

  return mysql.createPool({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: MYSQL_CONNECTION_LIMIT,
  });
}

async function ensureDatabaseExists() {
  if (MYSQL_URL) {
    return;
  }

  const connection = await mysql.createConnection({
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
  });
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(MYSQL_DATABASE)}`);
  } finally {
    await connection.end();
  }
}

async function ensureSchema(pool) {
  const schemaSql = readFileSync(join(backendDir, "mysql-schema.sql"), "utf8");
  const statements = schemaSql
    .split(/;\s*(?:\r?\n|$)/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await pool.execute(statement);
  }
}

async function writeState(pool, stateKey, payload) {
  const serialized = JSON.stringify(payload);
  const buffer = Buffer.from(serialized, "utf8");
  const shouldChunk = buffer.byteLength > MYSQL_STATE_INLINE_LIMIT_BYTES;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (shouldChunk) {
      const chunks = splitBufferIntoChunks(buffer, MYSQL_STATE_CHUNK_BYTES);
      const envelope = JSON.stringify({
        format: CHUNKED_STATE_FORMAT,
        chunkCount: chunks.length,
        byteLength: buffer.byteLength,
      });

      await connection.execute(
        `
          INSERT INTO platform_state (state_key, state_json)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE
            state_json = VALUES(state_json),
            updated_at = CURRENT_TIMESTAMP
        `,
        [stateKey, envelope],
      );

      await connection.execute("DELETE FROM platform_state_chunks WHERE state_key = ?", [stateKey]);
      for (let index = 0; index < chunks.length; index += 1) {
        await connection.execute(
          `
            INSERT INTO platform_state_chunks (state_key, chunk_index, chunk_data)
            VALUES (?, ?, ?)
          `,
          [stateKey, index, chunks[index]],
        );
      }

      await connection.commit();
      return {
        stateKey,
        bytes: buffer.byteLength,
        chunked: true,
        chunkCount: chunks.length,
      };
    }

    await connection.execute(
      `
        INSERT INTO platform_state (state_key, state_json)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          state_json = VALUES(state_json),
          updated_at = CURRENT_TIMESTAMP
      `,
      [stateKey, serialized],
    );
    await connection.execute("DELETE FROM platform_state_chunks WHERE state_key = ?", [stateKey]);

    await connection.commit();
    return {
      stateKey,
      bytes: buffer.byteLength,
      chunked: false,
      chunkCount: 0,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback failures and return original migration error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function readState(pool, stateKey) {
  const [stateRows] = await pool.execute(
    "SELECT state_json FROM platform_state WHERE state_key = ? LIMIT 1",
    [stateKey],
  );

  if (!Array.isArray(stateRows) || stateRows.length === 0) {
    return null;
  }

  const parsed = JSON.parse(String(stateRows[0].state_json));
  if (
    parsed &&
    typeof parsed === "object" &&
    parsed.format === CHUNKED_STATE_FORMAT &&
    Number.isInteger(parsed.chunkCount) &&
    parsed.chunkCount > 0
  ) {
    const [chunkRows] = await pool.execute(
      `
        SELECT chunk_index, chunk_data
        FROM platform_state_chunks
        WHERE state_key = ?
        ORDER BY chunk_index ASC
      `,
      [stateKey],
    );

    if (!Array.isArray(chunkRows) || chunkRows.length !== parsed.chunkCount) {
      throw new Error(`Chunk mismatch for state ${stateKey}`);
    }

    const buffers = [];
    for (let index = 0; index < chunkRows.length; index += 1) {
      const row = chunkRows[index];
      if (Number(row.chunk_index) !== index) {
        throw new Error(`Chunk order mismatch for state ${stateKey}`);
      }
      if (Buffer.isBuffer(row.chunk_data)) {
        buffers.push(row.chunk_data);
      } else if (row.chunk_data instanceof Uint8Array) {
        buffers.push(Buffer.from(row.chunk_data));
      } else if (typeof row.chunk_data === "string") {
        buffers.push(Buffer.from(row.chunk_data, "utf8"));
      } else {
        throw new Error(`Invalid chunk payload for state ${stateKey}`);
      }
    }

    return JSON.parse(Buffer.concat(buffers).toString("utf8"));
  }

  return parsed;
}

function readIncidentsFromFile() {
  if (!existsSync(incidentsLogPath)) {
    return [];
  }

  const raw = readFileSync(incidentsLogPath, "utf8");
  if (!raw.trim()) {
    return [];
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function toMysqlDateTime(value) {
  const candidate = new Date(value || Date.now());
  if (Number.isNaN(candidate.getTime())) {
    return new Date().toISOString().slice(0, 23).replace("T", " ");
  }
  return candidate.toISOString().slice(0, 23).replace("T", " ");
}

async function writeIncidents(pool, incidents) {
  if (!Array.isArray(incidents) || incidents.length === 0) {
    return { migrated: 0 };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const incident of incidents) {
      const id = String(incident.id || "").trim();
      if (!id) {
        continue;
      }

      const meta =
        incident.meta && typeof incident.meta === "object"
          ? JSON.stringify(incident.meta)
          : null;

      await connection.execute(
        `
          INSERT INTO telemetry_incidents (
            id, request_id, workspace_id, type, message, stack, source, route, user_agent, meta_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            request_id = VALUES(request_id),
            workspace_id = VALUES(workspace_id),
            type = VALUES(type),
            message = VALUES(message),
            stack = VALUES(stack),
            source = VALUES(source),
            route = VALUES(route),
            user_agent = VALUES(user_agent),
            meta_json = VALUES(meta_json),
            created_at = VALUES(created_at),
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          id,
          String(incident.requestId || ""),
          normalizeWorkspaceId(incident.workspaceId || DEFAULT_WORKSPACE_ID),
          String(incident.type || "client_error").slice(0, 80),
          String(incident.message || "").slice(0, 4000),
          String(incident.stack || ""),
          String(incident.source || "frontend").slice(0, 120),
          String(incident.route || "").slice(0, 300),
          String(incident.userAgent || "").slice(0, 300),
          meta,
          toMysqlDateTime(incident.createdAt),
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // noop
    }
    throw error;
  } finally {
    connection.release();
  }

  return { migrated: incidents.length };
}

async function readIncidentCount(pool) {
  const [rows] = await pool.execute("SELECT COUNT(*) AS total FROM telemetry_incidents");
  if (!Array.isArray(rows) || rows.length === 0) {
    return 0;
  }
  return Number(rows[0].total || 0);
}

function collectSourceStates() {
  const states = {
    [STORE_KEY_CAMPAIGNS]: readJsonFile(join(dataDir, STATE_FILE_BY_KEY[STORE_KEY_CAMPAIGNS])),
    [STORE_KEY_DRIVE]: readJsonFile(join(dataDir, STATE_FILE_BY_KEY[STORE_KEY_DRIVE])),
    [STORE_KEY_CHAT]: readJsonFile(join(dataDir, STATE_FILE_BY_KEY[STORE_KEY_CHAT])),
  };

  if (!existsSync(workspacesDir)) {
    return states;
  }

  const entries = readdirSync(workspacesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const workspaceId = normalizeWorkspaceId(entry.name);
    if (workspaceId === DEFAULT_WORKSPACE_ID) {
      continue;
    }

    const workspacePath = join(workspacesDir, entry.name);
    for (const baseKey of Object.keys(STATE_FILE_BY_KEY)) {
      const fileName = STATE_FILE_BY_KEY[baseKey];
      const payload = readJsonFileIfExists(join(workspacePath, fileName));
      if (!payload) {
        continue;
      }
      states[toWorkspaceStateKey(baseKey, workspaceId)] = payload;
    }
  }

  return states;
}

async function recordMigration(pool, input) {
  const serialized = JSON.stringify(input);
  const checksum = createHash("sha256").update(serialized).digest("hex");
  await pool.execute(
    `
      INSERT INTO schema_migrations (migration_name, checksum, details_json)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        checksum = VALUES(checksum),
        details_json = VALUES(details_json),
        applied_at = CURRENT_TIMESTAMP
    `,
    ["migrate-file-stores-to-mysql", checksum, serialized],
  );
}

async function main() {
  await ensureDatabaseExists();
  const sourceStates = collectSourceStates();
  const sourceSummary = summarizeStatesByKey(sourceStates);
  const sourceIncidents = readIncidentsFromFile();
  const sourceIncidentSummary = { count: sourceIncidents.length };

  const pool = createPool();
  try {
    await ensureSchema(pool);

    const migrationStats = {};
    for (const [stateKey, payload] of Object.entries(sourceStates)) {
      migrationStats[stateKey] = await writeState(pool, stateKey, payload);
    }

    const incidentStats = await writeIncidents(pool, sourceIncidents);

    const dbStates = {};
    for (const stateKey of Object.keys(sourceStates)) {
      dbStates[stateKey] = await readState(pool, stateKey);
    }
    const dbSummary = summarizeStatesByKey(dbStates);
    const dbIncidentSummary = { count: await readIncidentCount(pool) };

    const stateParity = JSON.stringify(sourceSummary) === JSON.stringify(dbSummary);
    const incidentParity = sourceIncidentSummary.count === dbIncidentSummary.count;
    if (!stateParity || !incidentParity) {
      throw new Error(
        `Migration parity check failed. stateParity=${stateParity} incidentParity=${incidentParity}`,
      );
    }

    const result = {
      success: true,
      sourceSummary,
      dbSummary,
      sourceIncidents: sourceIncidentSummary,
      dbIncidents: dbIncidentSummary,
      migrationStats,
      incidentStats,
    };
    await recordMigration(pool, result);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Migration failed: ${message}`);
  process.exit(1);
});
