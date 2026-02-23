import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendDir = join(__dirname, "..");

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

function quoteIdentifier(name) {
  if (!/^[A-Za-z0-9$_-]+$/.test(name)) {
    throw new Error(`Invalid MySQL identifier: ${name}`);
  }
  return `\`${name.replace(/`/g, "``")}\``;
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => (statement.endsWith(";") ? statement : `${statement};`));
}

loadDotEnv(join(backendDir, ".env"));

const MYSQL_URL = process.env.MYSQL_URL || "";
const MYSQL_HOST = process.env.MYSQL_HOST || "127.0.0.1";
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || "creative_spark";
const MYSQL_USER = process.env.MYSQL_USER || "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "";
const MYSQL_CONNECTION_LIMIT = Number(process.env.MYSQL_CONNECTION_LIMIT || 10);

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

async function main() {
  const schemaPath = join(backendDir, "mysql-schema.sql");
  if (!existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  const rawSql = readFileSync(schemaPath, "utf8");
  const statements = splitSqlStatements(rawSql);
  if (statements.length === 0) {
    throw new Error("No SQL statements found in schema file.");
  }

  await ensureDatabaseExists();

  const pool = createPool();
  try {
    for (const statement of statements) {
      await pool.execute(statement);
    }
  } finally {
    await pool.end();
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        schemaPath,
        statementsApplied: statements.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Schema apply failed: ${message}`);
  process.exit(1);
});
