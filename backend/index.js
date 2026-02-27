import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync, inflateSync } from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

loadDotEnv(join(__dirname, ".env"));

async function loadWsModule() {
  try {
    return await import("ws");
  } catch {
    return import("../frontend/node_modules/ws/index.js");
  }
}

const wsModule = await loadWsModule();
const wsNamespace = wsModule?.default && typeof wsModule.default === "function"
  ? wsModule.default
  : wsModule;
const WebSocketServer = wsNamespace?.WebSocketServer || wsNamespace?.Server;
const WS_OPEN_STATE = wsNamespace?.WebSocket?.OPEN ?? wsNamespace?.OPEN ?? 1;

if (typeof WebSocketServer !== "function") {
  throw new Error("WebSocket server dependency 'ws' is unavailable.");
}

const PORT = Number(process.env.PORT || 8787);
const STORE_PATH = join(__dirname, "data", "campaigns.json");
const WORKSPACES_DATA_PATH = join(__dirname, "data", "workspaces");
const DRIVE_STORE_PATH = join(__dirname, "data", "drive.json");
const CHAT_STORE_PATH = join(__dirname, "data", "chat.json");
const INCIDENTS_LOG_PATH = join(__dirname, "data", "incidents.log");
const AI_PROVIDER_DEFAULT =
  String(process.env.AI_PROVIDER_DEFAULT || "openrouter").toLowerCase() === "gemini"
    ? "gemini"
    : "openrouter";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const OPENROUTER_ENDPOINT =
  process.env.OPENROUTER_ENDPOINT || "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 45_000);
const OPENROUTER_MAX_RETRIES = Math.max(1, Number(process.env.OPENROUTER_MAX_RETRIES || 2));
const OPENROUTER_MAX_TOKENS = Math.max(128, Number(process.env.OPENROUTER_MAX_TOKENS || 450));
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || "Creative Spark Backend";
const OPENROUTER_APP_URL = process.env.OPENROUTER_APP_URL || "http://127.0.0.1:8787";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
const GEMINI_ENDPOINT_BASE =
  process.env.GEMINI_ENDPOINT_BASE || "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 45_000);
const GEMINI_MAX_RETRIES = Math.max(1, Number(process.env.GEMINI_MAX_RETRIES || 2));
const GEMINI_MAX_OUTPUT_TOKENS = Math.max(
  128,
  Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || 450),
);
const EXTERNAL_SEARCH_PROVIDER = String(process.env.EXTERNAL_SEARCH_PROVIDER || "auto")
  .trim()
  .toLowerCase();
const EXTERNAL_SEARCH_TIMEOUT_MS = Math.max(
  2000,
  Number(process.env.EXTERNAL_SEARCH_TIMEOUT_MS || 6000),
);
const EXTERNAL_SEARCH_MAX_RETRIES = Math.max(
  1,
  Number(process.env.EXTERNAL_SEARCH_MAX_RETRIES || 2),
);
const EXTERNAL_SEARCH_MAX_RESULTS = Math.max(
  1,
  Math.min(10, Number(process.env.EXTERNAL_SEARCH_MAX_RESULTS || 4)),
);
const EXTERNAL_SEARCH_CACHE_TTL_MS = Math.max(
  10_000,
  Number(process.env.EXTERNAL_SEARCH_CACHE_TTL_MS || 5 * 60 * 1000),
);
const SERPER_API_KEY = String(process.env.SERPER_API_KEY || process.env.GOOGLE_SEARCH_API_KEY || "").trim();
const SERPER_ENDPOINT = process.env.SERPER_ENDPOINT || "https://google.serper.dev/search";
const BRAVE_SEARCH_API_KEY = String(process.env.BRAVE_SEARCH_API_KEY || "").trim();
const BRAVE_SEARCH_ENDPOINT =
  process.env.BRAVE_SEARCH_ENDPOINT || "https://api.search.brave.com/res/v1/web/search";
const CHAT_PROMPT_LIMIT = 12_000;
const CHAT_CACHE_TTL_MS = 2 * 60 * 1000;
const DRIVE_UPLOAD_MAX_BYTES = Number(process.env.DRIVE_UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
const STORAGE_MODE = String(process.env.STORAGE_MODE || "").trim().toLowerCase() || "mysql";
const MYSQL_URL = process.env.MYSQL_URL || "";
const MYSQL_HOST = process.env.MYSQL_HOST || "";
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || "";
const MYSQL_USER = process.env.MYSQL_USER || "";
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
const STORE_KEY_CAMPAIGNS = "campaigns";
const STORE_KEY_DRIVE = "drive";
const STORE_KEY_CHAT = "chat";
const MYSQL_NORMALIZED_CAMPAIGN_STORAGE = String(
  process.env.MYSQL_NORMALIZED_CAMPAIGN_STORAGE || "true",
).toLowerCase() !== "false";
const CAMPAIGN_CHILD_TABLES = [
  "campaign_audiences",
  "campaign_channel_roles",
  "campaign_media_plan_rows",
  "campaign_qa_checklist",
  "campaign_ideas",
  "campaign_concepts",
  "campaign_collaboration_members",
  "campaign_collaboration_messages",
  "campaign_collaboration_presence",
  "campaign_evidence_items",
  "campaign_issues",
  "campaign_reminders",
  "campaign_snapshots",
  "campaign_approvals",
  "campaign_audit_events",
];
const DEFAULT_WORKSPACE_ID = "main";
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const BACKEND_ALLOWED_ORIGINS = (
  process.env.BACKEND_ALLOWED_ORIGINS
    ? process.env.BACKEND_ALLOWED_ORIGINS.split(",")
    : DEFAULT_ALLOWED_ORIGINS
)
  .map((origin) => origin.trim())
  .filter(Boolean);
const BACKEND_ALLOW_PRIVATE_NETWORK_ORIGINS = String(
  process.env.BACKEND_ALLOW_PRIVATE_NETWORK_ORIGINS || (process.env.NODE_ENV === "production" ? "false" : "true"),
).toLowerCase() !== "false";
const BACKEND_AUTH_TOKEN = String(process.env.BACKEND_AUTH_TOKEN || "").trim();
const BACKEND_TRUST_PROXY = String(process.env.BACKEND_TRUST_PROXY || "false").toLowerCase() === "true";
const BACKEND_RATE_LIMIT_WINDOW_MS = Math.max(
  1000,
  Number(process.env.BACKEND_RATE_LIMIT_WINDOW_MS || 60_000),
);
const BACKEND_RATE_LIMIT_MAX_REQUESTS = Math.max(
  20,
  Number(process.env.BACKEND_RATE_LIMIT_MAX_REQUESTS || 180),
);
const BACKEND_LOG_REQUESTS = String(process.env.BACKEND_LOG_REQUESTS || "true").toLowerCase() !== "false";
const BACKEND_INCIDENT_LOG_ENABLED =
  String(process.env.BACKEND_INCIDENT_LOG_ENABLED || "true").toLowerCase() !== "false";
const BACKEND_INCIDENT_LOG_MAX_BYTES = Math.max(
  512 * 1024,
  Number(process.env.BACKEND_INCIDENT_LOG_MAX_BYTES || 5 * 1024 * 1024),
);
const REFRESH_SIGNAL_WS_PATH = "/ws/system-refresh";
const REFRESH_SIGNAL_HEARTBEAT_INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.REFRESH_SIGNAL_HEARTBEAT_INTERVAL_MS || 25_000),
);
const REFRESH_SIGNAL_CLIENT_STALE_MS = Math.max(
  REFRESH_SIGNAL_HEARTBEAT_INTERVAL_MS * 2,
  Number(process.env.REFRESH_SIGNAL_CLIENT_STALE_MS || 75_000),
);
const TELEMETRY_INCIDENT_DEFAULT_LIMIT = Math.max(
  10,
  Math.min(500, Number(process.env.TELEMETRY_INCIDENT_DEFAULT_LIMIT || 100)),
);
const TELEMETRY_INCIDENT_MAX_LIMIT = Math.max(
  TELEMETRY_INCIDENT_DEFAULT_LIMIT,
  Math.min(1000, Number(process.env.TELEMETRY_INCIDENT_MAX_LIMIT || 500)),
);
const TELEMETRY_REQUEST_EVENTS_LIMIT = Math.max(
  100,
  Math.min(5000, Number(process.env.TELEMETRY_REQUEST_EVENTS_LIMIT || 1000)),
);
const chatResponseCache = new Map();
const chatInFlight = new Map();
const externalSearchCache = new Map();
const externalSearchInFlight = new Map();
const requestRateWindow = new Map();
const recentRequestEvents = [];
const realtimeClients = new Map();
const refreshSignalClients = new Map();
const knownWorkspaceIds = new Set([DEFAULT_WORKSPACE_ID]);
const workspaceNotifications = new Map();
const refreshSignalSocketServer = new WebSocketServer({ noServer: true });
const normalizedCampaignMigrationChecked = new Set();
let mysqlPoolPromise = null;
let mysqlSchemaEnsured = false;

function nowIso() {
  return new Date().toISOString();
}

function nowDate() {
  return nowIso().slice(0, 10);
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function createCampaignId() {
  return `campaign-${randomUUID()}`;
}

function createConceptId() {
  return `concept-${randomUUID()}`;
}

function createDriveEntryId(type) {
  return `${type}-${randomUUID()}`;
}

function createChatMessageId() {
  return `chat-${randomUUID()}`;
}

function getHeaderValue(headers, key) {
  const value = headers[key];
  return typeof value === "string" ? value : "";
}

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

function getRequestWorkspaceId(req) {
  const headerValue = getHeaderValue(req.headers, "x-workspace-id");
  return normalizeWorkspaceId(headerValue || DEFAULT_WORKSPACE_ID);
}

function toWorkspaceStateKey(baseKey, workspaceId) {
  const normalized = normalizeWorkspaceId(workspaceId);
  return normalized === DEFAULT_WORKSPACE_ID ? baseKey : `${baseKey}:${normalized}`;
}

function getWorkspaceStorePath(workspaceId) {
  const normalized = normalizeWorkspaceId(workspaceId);
  if (normalized === DEFAULT_WORKSPACE_ID) {
    return STORE_PATH;
  }
  return join(WORKSPACES_DATA_PATH, normalized, "campaigns.json");
}

function getWorkspaceDriveStorePath(workspaceId) {
  const normalized = normalizeWorkspaceId(workspaceId);
  if (normalized === DEFAULT_WORKSPACE_ID) {
    return DRIVE_STORE_PATH;
  }
  return join(WORKSPACES_DATA_PATH, normalized, "drive.json");
}

function getWorkspaceChatStorePath(workspaceId) {
  const normalized = normalizeWorkspaceId(workspaceId);
  if (normalized === DEFAULT_WORKSPACE_ID) {
    return CHAT_STORE_PATH;
  }
  return join(WORKSPACES_DATA_PATH, normalized, "chat.json");
}

function normalizeRequestId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length > 128) {
    return "";
  }
  return /^[A-Za-z0-9._:-]+$/.test(trimmed) ? trimmed : "";
}

function normalizeOrigin(value) {
  return String(value || "").trim().toLowerCase();
}

const allowedOriginSet = new Set(BACKEND_ALLOWED_ORIGINS.map(normalizeOrigin));

function getRequestOrigin(req) {
  return getHeaderValue(req.headers, "origin").trim();
}

function getRequestId(req) {
  const context = req && req.__requestContext ? req.__requestContext : null;
  if (context?.requestId) {
    return context.requestId;
  }

  return normalizeRequestId(getHeaderValue(req.headers, "x-request-id")) || `req-${randomUUID()}`;
}

function createRequestContext(req) {
  const context = {
    requestId: getRequestId(req),
    workspaceId: getRequestWorkspaceId(req),
    method: String(req?.method || "UNKNOWN"),
    path: String(req?.url || ""),
    ip: getRequestIp(req),
    origin: getRequestOrigin(req),
    startedAtMs: Date.now(),
    completed: false,
  };
  knownWorkspaceIds.add(context.workspaceId);
  return context;
}

function logRequest(event, fields) {
  if (!BACKEND_LOG_REQUESTS) {
    return;
  }

  const record = {
    timestamp: nowIso(),
    event,
    ...fields,
  };
  recentRequestEvents.push(record);
  if (recentRequestEvents.length > TELEMETRY_REQUEST_EVENTS_LIMIT) {
    recentRequestEvents.splice(0, recentRequestEvents.length - TELEMETRY_REQUEST_EVENTS_LIMIT);
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(record));
}

function logRequestStart(req) {
  const context = req?.__requestContext;
  if (!context) {
    return;
  }

  logRequest("request_started", {
    requestId: context.requestId,
    workspaceId: context.workspaceId,
    method: context.method,
    path: context.path,
    ip: context.ip,
    origin: context.origin || null,
  });
}

function logRequestComplete(req, statusCode) {
  const context = req?.__requestContext;
  if (!context || context.completed) {
    return;
  }

  context.completed = true;
  logRequest("request_completed", {
    requestId: context.requestId,
    workspaceId: context.workspaceId,
    method: context.method,
    path: context.path,
    statusCode,
    durationMs: Math.max(0, Date.now() - context.startedAtMs),
  });
}

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }
  const normalized = normalizeOrigin(origin);
  if (allowedOriginSet.has(normalized)) {
    return true;
  }
  if (!BACKEND_ALLOW_PRIVATE_NETWORK_ORIGINS) {
    return false;
  }
  try {
    const parsed = new URL(origin);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return true;
    }

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
      return true;
    }
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
      return true;
    }
    const match172 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (match172) {
      const secondOctet = Number(match172[1]);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

const BASE_CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-API-Key",
  "X-Request-Id",
  "X-Workspace-Id",
];

function buildCorsAllowHeaders(req) {
  const requestedHeaders = getHeaderValue(req.headers, "access-control-request-headers")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const deduped = new Map();
  for (const header of [...BASE_CORS_ALLOWED_HEADERS, ...requestedHeaders]) {
    const key = header.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, header);
    }
  }
  return [...deduped.values()].join(",");
}

function getRequestIp(req) {
  if (BACKEND_TRUST_PROXY) {
    const forwardedFor = getHeaderValue(req.headers, "x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim() || "unknown";
    }
  }
  return req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(req) {
  const ip = getRequestIp(req);
  const now = Date.now();
  const record = requestRateWindow.get(ip);

  if (!record || record.expiresAt <= now) {
    requestRateWindow.set(ip, { count: 1, expiresAt: now + BACKEND_RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= BACKEND_RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  record.count += 1;
  return true;
}

function pruneRateLimitWindow() {
  const now = Date.now();
  for (const [ip, record] of requestRateWindow.entries()) {
    if (!record || record.expiresAt <= now) {
      requestRateWindow.delete(ip);
    }
  }
}

setInterval(() => {
  pruneRateLimitWindow();
}, Math.max(5000, Math.floor(BACKEND_RATE_LIMIT_WINDOW_MS / 2))).unref();

setInterval(() => {
  void rebuildAllWorkspaceNotifications();
}, 60_000).unref();

function isAuthorizedRequest(req) {
  if (!BACKEND_AUTH_TOKEN) {
    return true;
  }

  const authorizationHeader = getHeaderValue(req.headers, "authorization");
  const apiKeyHeader = getHeaderValue(req.headers, "x-api-key");
  const bearerToken =
    authorizationHeader.toLowerCase().startsWith("bearer ")
      ? authorizationHeader.slice(7).trim()
      : "";

  return apiKeyHeader === BACKEND_AUTH_TOKEN || bearerToken === BACKEND_AUTH_TOKEN;
}

function isAuthorizedRealtimeRequest(req, url) {
  if (!BACKEND_AUTH_TOKEN) {
    return true;
  }

  if (isAuthorizedRequest(req)) {
    return true;
  }

  const token = String(url.searchParams.get("token") || "").trim();
  return token === BACKEND_AUTH_TOKEN;
}

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function createRealtimeClientId() {
  return `rt-${randomUUID()}`;
}

function writeRealtimeEvent(res, event, payload) {
  try {
    const serialized = JSON.stringify(payload ?? {});
    res.write(`event: ${event}\n`);
    res.write(`data: ${serialized}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function broadcastRealtimeEvent(workspaceId, payload) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  for (const [clientId, client] of realtimeClients.entries()) {
    if (!client || client.workspaceId !== normalizedWorkspaceId) {
      continue;
    }

    if (
      client.campaignId &&
      payload &&
      typeof payload === "object" &&
      "campaignId" in payload &&
      payload.campaignId &&
      payload.campaignId !== client.campaignId
    ) {
      continue;
    }

    const sent = writeRealtimeEvent(client.res, "update", payload);
    if (!sent) {
      realtimeClients.delete(clientId);
      try {
        client.res.end();
      } catch {
        // no-op
      }
    }
  }
}

function openRealtimeStream(req, res, url) {
  const origin = getRequestOrigin(req);
  const requestId = getRequestId(req);
  const workspaceId = normalizeWorkspaceId(url.searchParams.get("workspaceId") || getRequestWorkspaceId(req));
  const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
  const clientId = createRealtimeClientId();
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": buildCorsAllowHeaders(req),
    "Access-Control-Expose-Headers": "X-Request-Id",
    Vary: "Origin",
    "X-Request-Id": requestId,
    "X-Accel-Buffering": "no",
  };

  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  res.writeHead(200, headers);
  writeRealtimeEvent(res, "connected", {
    clientId,
    workspaceId,
    campaignId,
    requestId,
    timestamp: nowIso(),
  });

  const heartbeatId = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeatId);
      return;
    }
    res.write(`event: ping\ndata: {"timestamp":"${nowIso()}"}\n\n`);
  }, 25_000);
  heartbeatId.unref();

  realtimeClients.set(clientId, { id: clientId, workspaceId, campaignId, res });
  req.on("close", () => {
    clearInterval(heartbeatId);
    realtimeClients.delete(clientId);
    logRequestComplete(req, 200);
  });
}

function createRefreshSignalClientId() {
  return `ws-refresh-${randomUUID()}`;
}

function normalizeWebSocketMessage(raw) {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw instanceof Buffer) {
    return raw.toString("utf8");
  }
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw).toString("utf8");
  }
  return "";
}

function parseWebSocketMessage(raw) {
  const text = normalizeWebSocketMessage(raw).trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function sendRefreshSignalWebSocketMessage(socket, payload) {
  if (!socket || socket.readyState !== WS_OPEN_STATE) {
    return false;
  }
  try {
    socket.send(JSON.stringify(payload ?? {}));
    return true;
  } catch {
    return false;
  }
}

function removeRefreshSignalClient(clientId) {
  const record = refreshSignalClients.get(clientId);
  if (!record) {
    return;
  }
  refreshSignalClients.delete(clientId);
  try {
    if (record.socket.readyState === WS_OPEN_STATE) {
      record.socket.close(1000, "Connection closed");
    }
  } catch {
    // no-op
  }
}

function broadcastRefreshSignal(reason = "System requested refresh", source = "system", delayMs = 0) {
  const normalizedReason = hasText(reason) ? String(reason).trim() : "System requested refresh";
  const safeDelayMs = Number.isFinite(Number(delayMs))
    ? Math.max(0, Math.min(10_000, Math.round(Number(delayMs))))
    : 0;
  const payload = {
    type: "REFRESH_SIGNAL",
    reason: normalizedReason,
    source: hasText(source) ? String(source).trim() : "system",
    delayMs: safeDelayMs,
    timestamp: nowIso(),
  };

  let sent = 0;
  for (const [clientId, record] of refreshSignalClients.entries()) {
    const delivered = sendRefreshSignalWebSocketMessage(record.socket, payload);
    if (delivered) {
      sent += 1;
      continue;
    }
    removeRefreshSignalClient(clientId);
  }

  return {
    sent,
    connected: refreshSignalClients.size,
    payload,
  };
}

function registerRefreshSignalWebSocket(socket, req, url) {
  const workspaceId = normalizeWorkspaceId(url.searchParams.get("workspaceId") || getRequestWorkspaceId(req));
  const clientId = createRefreshSignalClientId();
  const nowMs = Date.now();
  refreshSignalClients.set(clientId, {
    id: clientId,
    socket,
    workspaceId,
    isAlive: true,
    lastSeenAt: nowMs,
  });

  sendRefreshSignalWebSocketMessage(socket, {
    type: "CONNECTED",
    clientId,
    workspaceId,
    heartbeatIntervalMs: REFRESH_SIGNAL_HEARTBEAT_INTERVAL_MS,
    timestamp: nowIso(),
  });

  socket.on("pong", () => {
    const current = refreshSignalClients.get(clientId);
    if (!current) {
      return;
    }
    current.isAlive = true;
    current.lastSeenAt = Date.now();
  });

  socket.on("message", (raw) => {
    const parsed = parseWebSocketMessage(raw);
    if (!parsed) {
      return;
    }
    const current = refreshSignalClients.get(clientId);
    if (!current) {
      return;
    }
    current.isAlive = true;
    current.lastSeenAt = Date.now();

    const type = String(parsed.type || "").trim().toUpperCase();
    if (type === "PING") {
      sendRefreshSignalWebSocketMessage(socket, {
        type: "PONG",
        timestamp: nowIso(),
      });
    }
  });

  socket.on("close", () => {
    refreshSignalClients.delete(clientId);
  });

  socket.on("error", () => {
    refreshSignalClients.delete(clientId);
  });
}

setInterval(() => {
  const nowMs = Date.now();
  for (const [clientId, record] of refreshSignalClients.entries()) {
    const socket = record?.socket;
    if (!socket || socket.readyState !== WS_OPEN_STATE) {
      removeRefreshSignalClient(clientId);
      continue;
    }

    if (!record.isAlive || nowMs - record.lastSeenAt > REFRESH_SIGNAL_CLIENT_STALE_MS) {
      try {
        socket.terminate();
      } catch {
        // no-op
      }
      removeRefreshSignalClient(clientId);
      continue;
    }

    record.isAlive = false;
    try {
      socket.ping();
    } catch {
      removeRefreshSignalClient(clientId);
      continue;
    }

    sendRefreshSignalWebSocketMessage(socket, {
      type: "PING",
      timestamp: nowIso(),
    });
  }
}, REFRESH_SIGNAL_HEARTBEAT_INTERVAL_MS).unref();

function createDefaultCreativeBrief() {
  return {
    activityName: "Get to Know Us",
    agencyName: "CLEARKAMO",
    owner: "Brand/Creative",
    audience: "Designers, writers, producers, editors",
    purpose: "What We're Making & Why It'll Work",
    projectName: "Get to Know Us Campaign",
    projectOverview: "Introduce the CLEARKAMO brand identity while preserving trust and continuity.",
    background:
      "Project CLEAR is transitioning to CLEARKAMO, signaling a broader strategic role while retaining the same trusted team.",
    singleMindedObjective: "Make audiences clearly understand who CLEARKAMO is and trust us as a strategic partner.",
    audienceWho: "Government ministries, development partners, NGOs, and private-sector social impact organizations.",
    audienceTension: "Audiences know Project CLEAR but are unsure what the transition to CLEARKAMO means in practice.",
    audienceDesiredChange: "Audiences see CLEARKAMO as the same trusted team, now stronger and more strategic.",
    keyProposition: "Powered by Real Human Understanding.",
    reasonsToBelieve: [
      "8+ years of strategic and behavior-change experience.",
      "Trusted by ministries and global development partners.",
      "Proven in co-design, community engagement, and measurable impact.",
    ].join("\n"),
    toneAndPersonality: "Human, confident, modern, Afrocentric, practical.",
    culturalCuesEmbrace: [
      "Swahili + English mix",
      "Warm visuals of communities",
      "African textures, patterns, and colours",
      "Real people, real voices, real stories",
    ].join("\n"),
    culturalCuesAvoid: [
      "Overly corporate tone",
      "Technical jargon without context",
      "Stock imagery unrelated to African settings",
    ].join("\n"),
    logoUsage: [
      "Use CLEARKAMO horizontal or stacked logo.",
      "Clear space equals the height of letter C.",
      "Never distort, recolour, rotate, or place on busy backgrounds.",
    ].join("\n"),
    colorsTypography: [
      "Colours: #a3a3a3 (Neutral Grey), #03a4fc (Clear Blue), #ffffff (Pure White).",
      "Typography: Montserrat (headlines), Inter/Open Sans (supporting copy).",
    ].join("\n"),
    legal: [
      "All testimonials must have consent.",
      "All footage requires signed release forms.",
      "Music must be licensed.",
    ].join("\n"),
    doExamples: [
      "Use human-centered footage.",
      "Keep visuals clean and minimal.",
      "Represent real Tanzanian environments.",
      "Use brand colours consistently.",
    ].join("\n"),
    dontExamples: [
      "Use stock photos unrelated to context.",
      "Add unnecessary effects or clutter.",
      "Misrepresent partner logos or hierarchy.",
    ].join("\n"),
    deliverables: [
      {
        id: "cb-deliverable-1",
        asset: "Reveal Video (Brand Reveal)",
        platform: "Social + Web",
        format: "MP4 (H.264)",
        dimensionsDuration: "1080x1080 + 1920x1080",
        copyLimits: "<=40 words",
        languages: "Sw/Eng",
        accessibility: "Subtitles",
      },
    ],
  };
}

function createDefaultTemplateSystem() {
  return {
    selectedTemplateId: "growth-loop",
    availableTemplates: [
      {
        id: "growth-loop",
        name: "Growth Loop",
        description: "Always-on acquisition, retention, and referral cycle.",
        recommendedChannels: ["Search", "Social", "WhatsApp", "Email"],
      },
      {
        id: "local-trust",
        name: "Local Trust Builder",
        description: "Community-led credibility campaigns with local ambassadors.",
        recommendedChannels: ["Radio", "Community Events", "WhatsApp", "PR"],
      },
      {
        id: "value-bundle",
        name: "Value Bundle Push",
        description: "Offer-led campaign with strong loyalty and repeat behavior.",
        recommendedChannels: ["Email", "SMS", "In-app", "Retail"],
      },
    ],
    localization: {
      market: "Tanzania",
      primaryLanguage: "English",
      secondaryLanguages: [],
      toneGuidance: "Respect local culture while staying direct and practical.",
      culturalMustInclude: [],
      culturalMustAvoid: [],
    },
  };
}

function createDefaultDigitalOps() {
  return {
    attributionModel: "weighted_multi_touch",
    channelSlaHours: [
      { channel: "WhatsApp", firstResponseHours: 1, followUpHours: 24 },
      { channel: "Email", firstResponseHours: 6, followUpHours: 48 },
      { channel: "Social", firstResponseHours: 4, followUpHours: 24 },
    ],
    channelMetrics: [],
  };
}

function createDefaultCrmLifecycle() {
  return {
    memberRetentionTarget: 0.6,
    segments: [
      {
        id: "crm-new",
        name: "New Prospects",
        lifecycleStage: "acquire",
        size: 0,
        priority: "high",
        nextAction: "Run onboarding sequence",
        dueAt: nowIso(),
        owner: "Growth Lead",
      },
      {
        id: "crm-active",
        name: "Active Customers",
        lifecycleStage: "retain",
        size: 0,
        priority: "medium",
        nextAction: "Promote repeat behavior offer",
        dueAt: nowIso(),
        owner: "CRM Manager",
      },
    ],
    automationRules: [
      {
        id: "rule-inactive-72h",
        trigger: "no_activity_72h",
        action: "send_reengagement_nudge",
        slaHours: 24,
        active: true,
      },
      {
        id: "rule-unresolved-24h",
        trigger: "unresolved_comment_24h",
        action: "notify_owner",
        slaHours: 12,
        active: true,
      },
    ],
  };
}

function createDefaultExperimentLab() {
  return {
    experiments: [],
    promoteWinnerConceptId: "",
  };
}

function createDefaultGovernancePolicy() {
  return {
    requiredApprovalRoles: ["strategy_lead", "creative_lead", "client_partner"],
    minApprovedCount: 2,
    requirePreflightPassForReady: true,
    requireNoCriticalIncidentsForReady: true,
  };
}

function createDefaultCampaignData(options = {}) {
  const now = new Date();
  const startDate = nowDate();
  const endDate = addMonths(now, 6).toISOString().slice(0, 10);
  const id = createCampaignId();

  return {
    campaign: {
      id,
      name: options.name || "Untitled Campaign",
      country: options.country || "Tanzania",
      languages: Array.isArray(options.languages) && options.languages.length > 0 ? options.languages : ["English"],
      startDate,
      endDate,
      status: "draft",
    },
    audiences: [],
    behavior: {
      behaviorStatement: "",
      currentBehavior: "",
      desiredBehavior: "",
      context: "",
    },
    insight: {
      insightText: "",
      evidenceSource: "",
      confidenceLevel: "medium",
    },
    driver: {
      driverTypes: [],
      driverText: "",
      whyNow: "",
      tension: "",
    },
    situation: "",
    problem: "",
    priorLearnings: "",
    businessObjective: "",
    communicationObjective: "",
    creativeBrief: createDefaultCreativeBrief(),
    channelRoles: [],
    mediaPlanRows: [],
    contentThemesAndCalendar: "",
    deliverablesNeeded: "",
    measurementAndLearningPlan: "",
    governanceRisksAndApprovals: "",
    timelineDetails: "",
    appendices: "",
    qaChecklist: [
      { id: "qa-1", label: "Audience defined", checked: false },
      { id: "qa-2", label: "Behavior objective clear", checked: false },
      { id: "qa-3", label: "Insight evidence captured", checked: false },
      { id: "qa-4", label: "Driver mapped", checked: false },
    ],
    ideas: [],
    concepts: [],
    collaboration: {
      members: ["Planner", "Designer", "Research Lead"],
      messages: [],
      presence: [],
    },
    workflow: {
      stage: "draft",
      stageUpdatedAt: nowIso(),
      wipLimit: 3,
    },
    evidenceItems: [],
    issues: [],
    reminders: [],
    portfolio: {
      scenarioPreset: "balanced",
      budgetCutPercent: 20,
      weights: {
        impact: 0.3,
        feasibility: 0.2,
        strategicFit: 0.25,
        culturalFit: 0.15,
        risk: 0.1,
      },
    },
    templateSystem: createDefaultTemplateSystem(),
    digitalOps: createDefaultDigitalOps(),
    crmLifecycle: createDefaultCrmLifecycle(),
    experimentLab: createDefaultExperimentLab(),
    governancePolicy: createDefaultGovernancePolicy(),
    snapshots: [],
    approvals: [],
    auditTrail: [],
  };
}

function ensureEnhancedCampaignDefaults(input) {
  const payload = clone(input);
  if (!payload.collaboration || typeof payload.collaboration !== "object") {
    payload.collaboration = { members: ["Planner", "Designer", "Research Lead"], messages: [] };
  }
  if (!Array.isArray(payload.collaboration.members)) {
    payload.collaboration.members = ["Planner", "Designer", "Research Lead"];
  }
  if (!Array.isArray(payload.collaboration.messages)) {
    payload.collaboration.messages = [];
  }
  if (!Array.isArray(payload.collaboration.presence)) {
    payload.collaboration.presence = [];
  }

  if (!payload.workflow || typeof payload.workflow !== "object") {
    payload.workflow = {
      stage: "draft",
      stageUpdatedAt: nowIso(),
      wipLimit: 3,
    };
  } else {
    const validStage = new Set(["draft", "review", "approved", "ready_to_launch"]);
    if (!validStage.has(payload.workflow.stage)) {
      payload.workflow.stage = "draft";
    }
    if (!payload.workflow.stageUpdatedAt || typeof payload.workflow.stageUpdatedAt !== "string") {
      payload.workflow.stageUpdatedAt = nowIso();
    }
    const parsedWip = Number(payload.workflow.wipLimit);
    payload.workflow.wipLimit = Number.isFinite(parsedWip)
      ? Math.max(1, Math.min(12, Math.round(parsedWip)))
      : 3;
  }

  payload.evidenceItems = Array.isArray(payload.evidenceItems) ? payload.evidenceItems : [];
  payload.issues = Array.isArray(payload.issues) ? payload.issues : [];
  payload.reminders = Array.isArray(payload.reminders) ? payload.reminders : [];

  if (!payload.portfolio || typeof payload.portfolio !== "object") {
    payload.portfolio = {
      scenarioPreset: "balanced",
      budgetCutPercent: 20,
      weights: {
        impact: 0.3,
        feasibility: 0.2,
        strategicFit: 0.25,
        culturalFit: 0.15,
        risk: 0.1,
      },
    };
  } else {
    const validPreset = new Set(["balanced", "growth", "efficiency", "risk_control"]);
    if (!validPreset.has(payload.portfolio.scenarioPreset)) {
      payload.portfolio.scenarioPreset = "balanced";
    }
    const budgetCutPercent = Number(payload.portfolio.budgetCutPercent);
    payload.portfolio.budgetCutPercent = Number.isFinite(budgetCutPercent)
      ? Math.max(0, Math.min(90, Math.round(budgetCutPercent)))
      : 20;

    const weights = payload.portfolio.weights && typeof payload.portfolio.weights === "object"
      ? payload.portfolio.weights
      : {};
    payload.portfolio.weights = {
      impact: Number.isFinite(Number(weights.impact)) ? Number(weights.impact) : 0.3,
      feasibility: Number.isFinite(Number(weights.feasibility)) ? Number(weights.feasibility) : 0.2,
      strategicFit: Number.isFinite(Number(weights.strategicFit)) ? Number(weights.strategicFit) : 0.25,
      culturalFit: Number.isFinite(Number(weights.culturalFit)) ? Number(weights.culturalFit) : 0.15,
      risk: Number.isFinite(Number(weights.risk)) ? Number(weights.risk) : 0.1,
    };
  }

  payload.snapshots = Array.isArray(payload.snapshots) ? payload.snapshots : [];
  payload.approvals = Array.isArray(payload.approvals) ? payload.approvals : [];
  payload.auditTrail = Array.isArray(payload.auditTrail) ? payload.auditTrail : [];

  payload.templateSystem =
    payload.templateSystem && typeof payload.templateSystem === "object"
      ? { ...createDefaultTemplateSystem(), ...payload.templateSystem }
      : createDefaultTemplateSystem();

  if (!payload.templateSystem.localization || typeof payload.templateSystem.localization !== "object") {
    payload.templateSystem.localization = createDefaultTemplateSystem().localization;
  } else {
    payload.templateSystem.localization = {
      ...createDefaultTemplateSystem().localization,
      ...payload.templateSystem.localization,
    };
  }

  payload.templateSystem.availableTemplates = Array.isArray(payload.templateSystem.availableTemplates)
    ? payload.templateSystem.availableTemplates
    : createDefaultTemplateSystem().availableTemplates;
  if (!hasText(payload.templateSystem.selectedTemplateId) && payload.templateSystem.availableTemplates[0]?.id) {
    payload.templateSystem.selectedTemplateId = payload.templateSystem.availableTemplates[0].id;
  }

  payload.digitalOps =
    payload.digitalOps && typeof payload.digitalOps === "object"
      ? { ...createDefaultDigitalOps(), ...payload.digitalOps }
      : createDefaultDigitalOps();
  payload.digitalOps.channelSlaHours = Array.isArray(payload.digitalOps.channelSlaHours)
    ? payload.digitalOps.channelSlaHours
    : createDefaultDigitalOps().channelSlaHours;
  payload.digitalOps.channelMetrics = Array.isArray(payload.digitalOps.channelMetrics)
    ? payload.digitalOps.channelMetrics
    : [];

  payload.crmLifecycle =
    payload.crmLifecycle && typeof payload.crmLifecycle === "object"
      ? { ...createDefaultCrmLifecycle(), ...payload.crmLifecycle }
      : createDefaultCrmLifecycle();
  payload.crmLifecycle.segments = Array.isArray(payload.crmLifecycle.segments)
    ? payload.crmLifecycle.segments
    : createDefaultCrmLifecycle().segments;
  payload.crmLifecycle.automationRules = Array.isArray(payload.crmLifecycle.automationRules)
    ? payload.crmLifecycle.automationRules
    : createDefaultCrmLifecycle().automationRules;
  const retentionTarget = Number(payload.crmLifecycle.memberRetentionTarget);
  payload.crmLifecycle.memberRetentionTarget = Number.isFinite(retentionTarget)
    ? Math.max(0, Math.min(1, retentionTarget))
    : createDefaultCrmLifecycle().memberRetentionTarget;

  payload.experimentLab =
    payload.experimentLab && typeof payload.experimentLab === "object"
      ? { ...createDefaultExperimentLab(), ...payload.experimentLab }
      : createDefaultExperimentLab();
  payload.experimentLab.experiments = Array.isArray(payload.experimentLab.experiments)
    ? payload.experimentLab.experiments
    : [];
  payload.experimentLab.promoteWinnerConceptId = hasText(payload.experimentLab.promoteWinnerConceptId)
    ? payload.experimentLab.promoteWinnerConceptId.trim()
    : "";

  payload.governancePolicy =
    payload.governancePolicy && typeof payload.governancePolicy === "object"
      ? { ...createDefaultGovernancePolicy(), ...payload.governancePolicy }
      : createDefaultGovernancePolicy();
  payload.governancePolicy.requiredApprovalRoles = Array.isArray(payload.governancePolicy.requiredApprovalRoles)
    ? payload.governancePolicy.requiredApprovalRoles.filter((entry) =>
        ["strategy_lead", "creative_lead", "client_partner", "compliance"].includes(entry),
      )
    : createDefaultGovernancePolicy().requiredApprovalRoles;
  if (payload.governancePolicy.requiredApprovalRoles.length === 0) {
    payload.governancePolicy.requiredApprovalRoles = createDefaultGovernancePolicy().requiredApprovalRoles;
  }
  const minApprovedCount = Number(payload.governancePolicy.minApprovedCount);
  payload.governancePolicy.minApprovedCount = Number.isFinite(minApprovedCount)
    ? Math.max(0, Math.min(10, Math.round(minApprovedCount)))
    : createDefaultGovernancePolicy().minApprovedCount;
  payload.governancePolicy.requirePreflightPassForReady =
    payload.governancePolicy.requirePreflightPassForReady !== false;
  payload.governancePolicy.requireNoCriticalIncidentsForReady =
    payload.governancePolicy.requireNoCriticalIncidentsForReady !== false;

  return payload;
}

function normalizeCampaign(data) {
  if (!data || typeof data !== "object" || !data.campaign || typeof data.campaign !== "object") {
    throw new Error("Invalid campaign payload");
  }

  if (typeof data.campaign.id !== "string" || data.campaign.id.trim() === "") {
    throw new Error("campaign.id is required");
  }

  if (!["draft", "in_review", "final"].includes(data.campaign.status)) {
    throw new Error("campaign.status must be draft, in_review, or final");
  }

  return ensureEnhancedCampaignDefaults(data);
}

function isMysqlConfigured() {
  return Boolean(MYSQL_URL || (MYSQL_HOST && MYSQL_DATABASE && MYSQL_USER));
}

function isMysqlStorageEnabled() {
  return STORAGE_MODE !== "file";
}

function isMysqlNormalizedCampaignStorageEnabled() {
  return isMysqlStorageEnabled() && MYSQL_NORMALIZED_CAMPAIGN_STORAGE;
}

function safeJsonParse(value, fallbackValue) {
  if (typeof value !== "string" || value.trim() === "") {
    return clone(fallbackValue);
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object") {
      return clone(fallbackValue);
    }
    return parsed;
  } catch {
    return clone(fallbackValue);
  }
}

function safeJsonParseArray(value, fallbackValue = []) {
  const parsed = safeJsonParse(value, fallbackValue);
  return Array.isArray(parsed) ? parsed : clone(fallbackValue);
}

function safeJsonStringify(value, fallbackValue) {
  try {
    return JSON.stringify(value ?? fallbackValue);
  } catch {
    return JSON.stringify(fallbackValue);
  }
}

function normalizeDateOnlyFromMysql(value, fallbackValue = "") {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return fallbackValue;
}

function normalizeIsoFromMysql(value, fallbackValue = nowIso()) {
  if (typeof value === "string" && value.trim()) {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const withZone = normalized.endsWith("Z") ? normalized : `${normalized}Z`;
    const parsed = Date.parse(withZone);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  return fallbackValue;
}

function normalizeDateTimeForMysql(value, fallbackValue = nowIso()) {
  const parsed = Date.parse(typeof value === "string" ? value : "");
  const source = Number.isFinite(parsed) ? new Date(parsed) : new Date(fallbackValue);
  if (!Number.isFinite(source.getTime())) {
    return null;
  }
  return source.toISOString().slice(0, 23).replace("T", " ");
}

function normalizeDateOnlyForMysql(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function isChunkedStateEnvelope(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const normalized = value;
  return (
    normalized.format === CHUNKED_STATE_FORMAT &&
    Number.isInteger(normalized.chunkCount) &&
    normalized.chunkCount > 0
  );
}

function splitBufferIntoChunks(buffer, chunkSize) {
  const chunks = [];
  for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
    const nextOffset = Math.min(offset + chunkSize, buffer.byteLength);
    chunks.push(buffer.subarray(offset, nextOffset));
  }
  return chunks;
}

async function getMysqlPool() {
  if (!isMysqlStorageEnabled()) {
    return null;
  }

  if (!isMysqlConfigured()) {
    throw new Error(
      "MySQL storage is enabled but connection settings are missing. Configure MYSQL_URL or MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER.",
    );
  }

  if (!mysqlPoolPromise) {
    mysqlPoolPromise = import("mysql2/promise")
      .then(({ createPool }) => {
        if (MYSQL_URL) {
          return createPool({
            uri: MYSQL_URL,
            waitForConnections: true,
            connectionLimit: MYSQL_CONNECTION_LIMIT,
          });
        }

        return createPool({
          host: MYSQL_HOST,
          port: MYSQL_PORT,
          user: MYSQL_USER,
          password: MYSQL_PASSWORD,
          database: MYSQL_DATABASE,
          waitForConnections: true,
          connectionLimit: MYSQL_CONNECTION_LIMIT,
        });
      })
      .catch((error) => {
        mysqlPoolPromise = null;
        const message = error instanceof Error ? error.message : "Unknown MySQL driver error.";
        throw new Error(`MySQL storage initialization failed: ${message}`);
      });
  }

  return mysqlPoolPromise;
}

async function ensureMysqlColumn(pool, tableName, columnName, definitionSql) {
  const [rows] = await pool.execute(
    `
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return;
  }
  await pool.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definitionSql}`);
}

async function ensureMysqlSchema() {
  if (!isMysqlStorageEnabled() || mysqlSchemaEnsured) {
    return;
  }

  const pool = await getMysqlPool();
  if (!pool) {
    return;
  }

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      migration_name VARCHAR(190) NOT NULL,
      checksum VARCHAR(128) NOT NULL DEFAULT '',
      details_json LONGTEXT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_migration_name (migration_name)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS platform_state (
      state_key VARCHAR(100) PRIMARY KEY,
      state_json LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS platform_state_chunks (
      state_key VARCHAR(100) NOT NULL,
      chunk_index INT NOT NULL,
      chunk_data LONGBLOB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (state_key, chunk_index)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS telemetry_incidents (
      id VARCHAR(120) NOT NULL,
      request_id VARCHAR(128) NOT NULL DEFAULT '',
      workspace_id VARCHAR(64) NOT NULL DEFAULT 'main',
      type VARCHAR(80) NOT NULL,
      message TEXT NOT NULL,
      stack LONGTEXT NULL,
      source VARCHAR(120) NOT NULL DEFAULT 'frontend',
      route VARCHAR(300) NOT NULL DEFAULT '',
      user_agent VARCHAR(300) NOT NULL DEFAULT '',
      meta_json LONGTEXT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_incident_workspace_created (workspace_id, created_at),
      KEY idx_incident_request_id (request_id),
      KEY idx_incident_type (type),
      KEY idx_incident_source (source)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaigns (
      workspace_id VARCHAR(64) NOT NULL DEFAULT 'main',
      campaign_id VARCHAR(120) NOT NULL,
      name VARCHAR(255) NOT NULL DEFAULT '',
      country VARCHAR(120) NOT NULL DEFAULT '',
      languages_json LONGTEXT NOT NULL,
      start_date DATE NULL,
      end_date DATE NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      workflow_stage VARCHAR(40) NOT NULL DEFAULT 'draft',
      workflow_stage_updated_at DATETIME(3) NULL,
      workflow_wip_limit INT NOT NULL DEFAULT 3,
      behavior_statement LONGTEXT NULL,
      behavior_current LONGTEXT NULL,
      behavior_desired LONGTEXT NULL,
      behavior_context LONGTEXT NULL,
      insight_text LONGTEXT NULL,
      insight_evidence_source LONGTEXT NULL,
      insight_confidence_level VARCHAR(20) NOT NULL DEFAULT 'medium',
      driver_types_json LONGTEXT NOT NULL,
      driver_text LONGTEXT NULL,
      driver_why_now LONGTEXT NULL,
      driver_tension LONGTEXT NULL,
      situation LONGTEXT NULL,
      problem LONGTEXT NULL,
      prior_learnings LONGTEXT NULL,
      business_objective LONGTEXT NULL,
      communication_objective LONGTEXT NULL,
      creative_brief_json LONGTEXT NOT NULL,
      content_themes_and_calendar LONGTEXT NULL,
      deliverables_needed LONGTEXT NULL,
      measurement_and_learning_plan LONGTEXT NULL,
      governance_risks_and_approvals LONGTEXT NULL,
      timeline_details LONGTEXT NULL,
      appendices LONGTEXT NULL,
      portfolio_json LONGTEXT NOT NULL,
      template_system_json LONGTEXT NOT NULL,
      digital_ops_json LONGTEXT NOT NULL,
      crm_lifecycle_json LONGTEXT NOT NULL,
      experiment_lab_json LONGTEXT NOT NULL,
      governance_policy_json LONGTEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, campaign_id),
      KEY idx_campaign_workspace_updated (workspace_id, updated_at),
      KEY idx_campaign_workspace_status (workspace_id, status),
      KEY idx_campaign_workspace_stage (workspace_id, workflow_stage)
    )
  `);

  await ensureMysqlColumn(pool, "campaigns", "template_system_json", "template_system_json LONGTEXT NULL");
  await ensureMysqlColumn(pool, "campaigns", "digital_ops_json", "digital_ops_json LONGTEXT NULL");
  await ensureMysqlColumn(pool, "campaigns", "crm_lifecycle_json", "crm_lifecycle_json LONGTEXT NULL");
  await ensureMysqlColumn(pool, "campaigns", "experiment_lab_json", "experiment_lab_json LONGTEXT NULL");
  await ensureMysqlColumn(pool, "campaigns", "governance_policy_json", "governance_policy_json LONGTEXT NULL");

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_audiences (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      audience_id VARCHAR(120) NOT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'primary',
      segment_name TEXT NULL,
      description_text LONGTEXT NULL,
      barriers LONGTEXT NULL,
      motivators LONGTEXT NULL,
      desired_action LONGTEXT NULL,
      key_message LONGTEXT NULL,
      support_rtb LONGTEXT NULL,
      cta LONGTEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_audience (workspace_id, campaign_id, audience_id),
      KEY idx_campaign_audience_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_channel_roles (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      role_id VARCHAR(120) NOT NULL,
      category VARCHAR(20) NOT NULL DEFAULT 'owned',
      channel TEXT NULL,
      role_text LONGTEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_channel_role (workspace_id, campaign_id, role_id),
      KEY idx_campaign_channel_role_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_media_plan_rows (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      row_id VARCHAR(120) NOT NULL,
      channel TEXT NULL,
      targeting LONGTEXT NULL,
      flighting LONGTEXT NULL,
      budget TEXT NULL,
      kpi LONGTEXT NULL,
      benchmark LONGTEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_media_plan_row (workspace_id, campaign_id, row_id),
      KEY idx_campaign_media_plan_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_qa_checklist (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      item_id VARCHAR(120) NOT NULL,
      label_text LONGTEXT NULL,
      checked_flag TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_qa_item (workspace_id, campaign_id, item_id),
      KEY idx_campaign_qa_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_ideas (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      idea_id VARCHAR(120) NOT NULL,
      method VARCHAR(40) NOT NULL DEFAULT 'Re-expression',
      title LONGTEXT NULL,
      description_text LONGTEXT NULL,
      link_to_insight LONGTEXT NULL,
      link_to_driver LONGTEXT NULL,
      feasibility_score DOUBLE NOT NULL DEFAULT 0,
      originality_score DOUBLE NOT NULL DEFAULT 0,
      strategic_fit_score DOUBLE NOT NULL DEFAULT 0,
      cultural_fit_score DOUBLE NOT NULL DEFAULT 0,
      selected_flag TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_idea (workspace_id, campaign_id, idea_id),
      KEY idx_campaign_idea_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_concepts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      concept_id VARCHAR(120) NOT NULL,
      name LONGTEXT NULL,
      big_idea LONGTEXT NULL,
      smp LONGTEXT NULL,
      key_promise LONGTEXT NULL,
      support_points_json LONGTEXT NOT NULL,
      tone LONGTEXT NULL,
      selected_idea_ids_json LONGTEXT NOT NULL,
      channels_json LONGTEXT NOT NULL,
      risks_json LONGTEXT NOT NULL,
      tagline LONGTEXT NULL,
      key_visual_description LONGTEXT NULL,
      execution_rationale LONGTEXT NULL,
      behavior_trigger LONGTEXT NULL,
      board_data_json LONGTEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_concept (workspace_id, campaign_id, concept_id),
      KEY idx_campaign_concept_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_collaboration_members (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      member_name VARCHAR(190) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_collab_member (workspace_id, campaign_id, member_name),
      KEY idx_campaign_collab_member_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_collaboration_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      message_id VARCHAR(120) NOT NULL,
      author VARCHAR(190) NOT NULL DEFAULT '',
      content LONGTEXT NULL,
      created_at DATETIME(3) NULL,
      mentions_json LONGTEXT NOT NULL,
      parent_id VARCHAR(120) NULL,
      resolved_flag TINYINT(1) NOT NULL DEFAULT 0,
      resolved_at DATETIME(3) NULL,
      resolved_by VARCHAR(190) NULL,
      field_key VARCHAR(190) NULL,
      anchor_label VARCHAR(255) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_collab_message (workspace_id, campaign_id, message_id),
      KEY idx_campaign_collab_message_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_collaboration_presence (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      member_name VARCHAR(190) NOT NULL,
      field_key VARCHAR(190) NULL,
      is_typing TINYINT(1) NOT NULL DEFAULT 0,
      last_seen_at DATETIME(3) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      KEY idx_campaign_collab_presence_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_evidence_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      evidence_id VARCHAR(120) NOT NULL,
      section_key VARCHAR(40) NOT NULL DEFAULT 'research',
      claim LONGTEXT NULL,
      source LONGTEXT NULL,
      source_quality VARCHAR(20) NOT NULL DEFAULT 'medium',
      confidence VARCHAR(20) NOT NULL DEFAULT 'medium',
      owner VARCHAR(190) NULL,
      url LONGTEXT NULL,
      created_at DATETIME(3) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_evidence_item (workspace_id, campaign_id, evidence_id),
      KEY idx_campaign_evidence_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_issues (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      issue_id VARCHAR(120) NOT NULL,
      title LONGTEXT NULL,
      description_text LONGTEXT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'medium',
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      owner VARCHAR(190) NOT NULL DEFAULT 'Unassigned',
      sla_hours INT NOT NULL DEFAULT 48,
      created_at DATETIME(3) NULL,
      updated_at DATETIME(3) NULL,
      resolved_at DATETIME(3) NULL,
      postmortem LONGTEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_issue (workspace_id, campaign_id, issue_id),
      KEY idx_campaign_issue_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_reminders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      reminder_id VARCHAR(120) NOT NULL,
      type_key VARCHAR(40) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      message LONGTEXT NULL,
      created_at DATETIME(3) NULL,
      due_at DATETIME(3) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_reminder (workspace_id, campaign_id, reminder_id),
      KEY idx_campaign_reminder_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_snapshots (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      snapshot_id VARCHAR(120) NOT NULL,
      label_text VARCHAR(255) NOT NULL DEFAULT 'Campaign snapshot',
      created_at DATETIME(3) NULL,
      created_by VARCHAR(190) NOT NULL DEFAULT 'System',
      summary LONGTEXT NULL,
      state_json LONGTEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_snapshot (workspace_id, campaign_id, snapshot_id),
      KEY idx_campaign_snapshot_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_approvals (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      approval_id VARCHAR(120) NOT NULL,
      role_key VARCHAR(40) NOT NULL DEFAULT 'strategy_lead',
      approver VARCHAR(190) NOT NULL DEFAULT '',
      signature LONGTEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      note LONGTEXT NULL,
      created_at DATETIME(3) NULL,
      updated_at DATETIME(3) NULL,
      approved_at DATETIME(3) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_approval (workspace_id, campaign_id, approval_id),
      KEY idx_campaign_approval_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS campaign_audit_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      workspace_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(120) NOT NULL,
      audit_id VARCHAR(120) NOT NULL,
      action_key VARCHAR(80) NOT NULL,
      actor VARCHAR(190) NOT NULL DEFAULT 'System',
      detail LONGTEXT NULL,
      created_at DATETIME(3) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_campaign_audit_event (workspace_id, campaign_id, audit_id),
      KEY idx_campaign_audit_lookup (workspace_id, campaign_id, sort_order)
    )
  `);

  mysqlSchemaEnsured = true;
}

async function readChunkedStateJson(pool, stateKey, chunkCount) {
  const [chunkRows] = await pool.execute(
    `
      SELECT chunk_index, chunk_data
      FROM platform_state_chunks
      WHERE state_key = ?
      ORDER BY chunk_index ASC
    `,
    [stateKey],
  );

  if (!Array.isArray(chunkRows) || chunkRows.length !== chunkCount) {
    throw new Error("Chunked state payload is incomplete.");
  }

  const buffers = [];
  for (let index = 0; index < chunkRows.length; index += 1) {
    const chunk = chunkRows[index];
    const chunkIndex = Number(chunk?.chunk_index);
    if (chunkIndex !== index) {
      throw new Error("Chunked state payload order is invalid.");
    }

    const rawChunk = chunk?.chunk_data;
    if (Buffer.isBuffer(rawChunk)) {
      buffers.push(rawChunk);
      continue;
    }
    if (rawChunk instanceof Uint8Array) {
      buffers.push(Buffer.from(rawChunk));
      continue;
    }
    if (typeof rawChunk === "string") {
      buffers.push(Buffer.from(rawChunk, "utf8"));
      continue;
    }
    throw new Error("Chunked state payload is invalid.");
  }

  return Buffer.concat(buffers).toString("utf8");
}

async function readJsonState(stateKey, fallbackFactory) {
  const fallback = fallbackFactory();

  if (!isMysqlStorageEnabled()) {
    return fallback;
  }

  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  if (!pool) {
    return fallback;
  }

  const [rows] = await pool.execute(
    "SELECT state_json FROM platform_state WHERE state_key = ? LIMIT 1",
    [stateKey],
  );

  if (!Array.isArray(rows) || rows.length === 0 || !rows[0]?.state_json) {
    await writeJsonState(stateKey, fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(String(rows[0].state_json));
    if (isChunkedStateEnvelope(parsed)) {
      const serialized = await readChunkedStateJson(pool, stateKey, parsed.chunkCount);
      const rebuiltPayload = JSON.parse(serialized);
      if (!rebuiltPayload || typeof rebuiltPayload !== "object") {
        throw new Error("Chunked state payload is malformed.");
      }
      return rebuiltPayload;
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid JSON store payload.");
    }
    return parsed;
  } catch {
    await writeJsonState(stateKey, fallback);
    return fallback;
  }
}

async function writeJsonState(stateKey, payload) {
  if (!isMysqlStorageEnabled()) {
    return payload;
  }

  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  if (!pool) {
    return payload;
  }

  const serialized = JSON.stringify(payload);
  const serializedBuffer = Buffer.from(serialized, "utf8");
  const shouldChunk = serializedBuffer.byteLength > MYSQL_STATE_INLINE_LIMIT_BYTES;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (shouldChunk) {
      const chunks = splitBufferIntoChunks(serializedBuffer, MYSQL_STATE_CHUNK_BYTES);
      const stateEnvelope = JSON.stringify({
        format: CHUNKED_STATE_FORMAT,
        chunkCount: chunks.length,
        byteLength: serializedBuffer.byteLength,
      });

      await connection.execute(
        `
          INSERT INTO platform_state (state_key, state_json)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE
            state_json = VALUES(state_json),
            updated_at = CURRENT_TIMESTAMP
        `,
        [stateKey, stateEnvelope],
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
    } else {
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
    }

    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors and rethrow the original write failure.
    }
    throw error;
  } finally {
    connection.release();
  }

  return payload;
}

function groupRowsByCampaignId(rows) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const campaignId = typeof row?.campaign_id === "string" ? row.campaign_id : "";
    if (!campaignId) {
      continue;
    }
    if (!grouped.has(campaignId)) {
      grouped.set(campaignId, []);
    }
    grouped.get(campaignId).push(row);
  }
  return grouped;
}

async function fetchCampaignChildRows(pool, tableName, workspaceId, campaignIds, orderBySql) {
  if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
    return [];
  }
  const placeholders = campaignIds.map(() => "?").join(",");
  const query = `
    SELECT *
    FROM \`${tableName}\`
    WHERE workspace_id = ?
      AND campaign_id IN (${placeholders})
    ORDER BY campaign_id ASC, ${orderBySql}
  `;
  const [rows] = await pool.query(query, [workspaceId, ...campaignIds]);
  return Array.isArray(rows) ? rows : [];
}

async function replaceCampaignChildRows(connection, tableName, columns, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const placeholders = `(${columns.map(() => "?").join(",")})`;
  const valueGroups = rows.map(() => placeholders).join(",");
  const sql = `INSERT INTO \`${tableName}\` (${columns.map((column) => `\`${column}\``).join(",")}) VALUES ${valueGroups}`;
  const values = [];
  for (const row of rows) {
    for (const column of columns) {
      values.push(row[column]);
    }
  }
  await connection.query(sql, values);
}

async function deleteCampaignChildrenByCampaign(connection, workspaceId, campaignId) {
  for (const tableName of CAMPAIGN_CHILD_TABLES) {
    await connection.execute(
      `DELETE FROM \`${tableName}\` WHERE workspace_id = ? AND campaign_id = ?`,
      [workspaceId, campaignId],
    );
  }
}

async function deleteCampaignChildrenByWorkspace(connection, workspaceId) {
  for (const tableName of CAMPAIGN_CHILD_TABLES) {
    await connection.execute(`DELETE FROM \`${tableName}\` WHERE workspace_id = ?`, [workspaceId]);
  }
}

function createDefaultPortfolioConfig() {
  return {
    scenarioPreset: "balanced",
    budgetCutPercent: 20,
    weights: {
      impact: 0.3,
      feasibility: 0.2,
      strategicFit: 0.25,
      culturalFit: 0.15,
      risk: 0.1,
    },
  };
}

function buildCampaignFromMysqlRow(baseRow, childrenByType) {
  const campaignId = typeof baseRow?.campaign_id === "string" ? baseRow.campaign_id : "";
  const audienceRows = childrenByType.audiences.get(campaignId) || [];
  const channelRoleRows = childrenByType.channelRoles.get(campaignId) || [];
  const mediaPlanRows = childrenByType.mediaPlanRows.get(campaignId) || [];
  const qaRows = childrenByType.qaChecklist.get(campaignId) || [];
  const ideaRows = childrenByType.ideas.get(campaignId) || [];
  const conceptRows = childrenByType.concepts.get(campaignId) || [];
  const collabMemberRows = childrenByType.collaborationMembers.get(campaignId) || [];
  const collabMessageRows = childrenByType.collaborationMessages.get(campaignId) || [];
  const collabPresenceRows = childrenByType.collaborationPresence.get(campaignId) || [];
  const evidenceRows = childrenByType.evidenceItems.get(campaignId) || [];
  const issueRows = childrenByType.issues.get(campaignId) || [];
  const reminderRows = childrenByType.reminders.get(campaignId) || [];
  const snapshotRows = childrenByType.snapshots.get(campaignId) || [];
  const approvalRows = childrenByType.approvals.get(campaignId) || [];
  const auditRows = childrenByType.auditEvents.get(campaignId) || [];

  const parsedLanguages = safeJsonParseArray(baseRow?.languages_json, [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  const parsedDriverTypes = safeJsonParseArray(baseRow?.driver_types_json, [])
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

  const payload = {
    campaign: {
      id: campaignId,
      name: hasText(baseRow?.name) ? String(baseRow.name) : "Untitled Campaign",
      country: hasText(baseRow?.country) ? String(baseRow.country) : "Tanzania",
      languages: parsedLanguages,
      startDate: normalizeDateOnlyFromMysql(baseRow?.start_date, nowDate()),
      endDate: normalizeDateOnlyFromMysql(baseRow?.end_date, nowDate()),
      status: ["draft", "in_review", "final"].includes(baseRow?.status) ? baseRow.status : "draft",
    },
    audiences: audienceRows.map((row) => ({
      id: String(row?.audience_id || ""),
      priority: row?.priority === "secondary" ? "secondary" : "primary",
      segmentName: String(row?.segment_name || ""),
      description: String(row?.description_text || ""),
      barriers: String(row?.barriers || ""),
      motivators: String(row?.motivators || ""),
      desiredAction: String(row?.desired_action || ""),
      keyMessage: String(row?.key_message || ""),
      supportRtb: String(row?.support_rtb || ""),
      cta: String(row?.cta || ""),
    })),
    behavior: {
      behaviorStatement: String(baseRow?.behavior_statement || ""),
      currentBehavior: String(baseRow?.behavior_current || ""),
      desiredBehavior: String(baseRow?.behavior_desired || ""),
      context: String(baseRow?.behavior_context || ""),
    },
    insight: {
      insightText: String(baseRow?.insight_text || ""),
      evidenceSource: String(baseRow?.insight_evidence_source || ""),
      confidenceLevel: ["low", "medium", "high"].includes(baseRow?.insight_confidence_level)
        ? baseRow.insight_confidence_level
        : "medium",
    },
    driver: {
      driverTypes: parsedDriverTypes,
      driverText: String(baseRow?.driver_text || ""),
      whyNow: String(baseRow?.driver_why_now || ""),
      tension: String(baseRow?.driver_tension || ""),
    },
    situation: String(baseRow?.situation || ""),
    problem: String(baseRow?.problem || ""),
    priorLearnings: String(baseRow?.prior_learnings || ""),
    businessObjective: String(baseRow?.business_objective || ""),
    communicationObjective: String(baseRow?.communication_objective || ""),
    creativeBrief: safeJsonParse(baseRow?.creative_brief_json, createDefaultCreativeBrief()),
    channelRoles: channelRoleRows.map((row) => ({
      id: String(row?.role_id || ""),
      category: ["paid", "owned", "earned"].includes(row?.category) ? row.category : "owned",
      channel: String(row?.channel || ""),
      role: String(row?.role_text || ""),
    })),
    mediaPlanRows: mediaPlanRows.map((row) => ({
      id: String(row?.row_id || ""),
      channel: String(row?.channel || ""),
      targeting: String(row?.targeting || ""),
      flighting: String(row?.flighting || ""),
      budget: String(row?.budget || ""),
      kpi: String(row?.kpi || ""),
      benchmark: String(row?.benchmark || ""),
    })),
    contentThemesAndCalendar: String(baseRow?.content_themes_and_calendar || ""),
    deliverablesNeeded: String(baseRow?.deliverables_needed || ""),
    measurementAndLearningPlan: String(baseRow?.measurement_and_learning_plan || ""),
    governanceRisksAndApprovals: String(baseRow?.governance_risks_and_approvals || ""),
    timelineDetails: String(baseRow?.timeline_details || ""),
    appendices: String(baseRow?.appendices || ""),
    qaChecklist: qaRows.map((row) => ({
      id: String(row?.item_id || ""),
      label: String(row?.label_text || ""),
      checked: Number(row?.checked_flag || 0) === 1,
    })),
    ideas: ideaRows.map((row) => ({
      id: String(row?.idea_id || ""),
      method: hasText(row?.method) ? String(row.method) : "Re-expression",
      title: String(row?.title || ""),
      description: String(row?.description_text || ""),
      linkToInsight: String(row?.link_to_insight || ""),
      linkToDriver: String(row?.link_to_driver || ""),
      feasibilityScore: Number(row?.feasibility_score || 0),
      originalityScore: Number(row?.originality_score || 0),
      strategicFitScore: Number(row?.strategic_fit_score || 0),
      culturalFitScore: Number(row?.cultural_fit_score || 0),
      selected: Number(row?.selected_flag || 0) === 1,
    })),
    concepts: conceptRows.map((row) => ({
      id: String(row?.concept_id || ""),
      name: String(row?.name || ""),
      bigIdea: String(row?.big_idea || ""),
      smp: String(row?.smp || ""),
      keyPromise: String(row?.key_promise || ""),
      supportPoints: safeJsonParseArray(row?.support_points_json, []).map((entry) => String(entry || "")),
      tone: String(row?.tone || ""),
      selectedIdeaIds: safeJsonParseArray(row?.selected_idea_ids_json, []).map((entry) => String(entry || "")),
      channels: safeJsonParseArray(row?.channels_json, []).map((entry) => String(entry || "")),
      risks: safeJsonParseArray(row?.risks_json, []).map((entry) => String(entry || "")),
      tagline: String(row?.tagline || ""),
      keyVisualDescription: String(row?.key_visual_description || ""),
      executionRationale: String(row?.execution_rationale || ""),
      behaviorTrigger: String(row?.behavior_trigger || ""),
      boardData: safeJsonParse(row?.board_data_json, {}),
      status: ["draft", "shortlisted", "final"].includes(row?.status) ? row.status : "draft",
    })),
    collaboration: {
      members: collabMemberRows.map((row) => String(row?.member_name || "")).filter(Boolean),
      messages: collabMessageRows.map((row) => ({
        id: String(row?.message_id || ""),
        author: String(row?.author || ""),
        content: String(row?.content || ""),
        createdAt: normalizeIsoFromMysql(row?.created_at),
        mentions: safeJsonParseArray(row?.mentions_json, []).map((entry) => String(entry || "")),
        parentId: hasText(row?.parent_id) ? String(row.parent_id) : undefined,
        resolved: Number(row?.resolved_flag || 0) === 1,
        resolvedAt: row?.resolved_at ? normalizeIsoFromMysql(row.resolved_at) : undefined,
        resolvedBy: hasText(row?.resolved_by) ? String(row.resolved_by) : undefined,
        fieldKey: hasText(row?.field_key) ? String(row.field_key) : undefined,
        anchorLabel: hasText(row?.anchor_label) ? String(row.anchor_label) : undefined,
      })),
      presence: collabPresenceRows.map((row) => ({
        member: String(row?.member_name || ""),
        fieldKey: hasText(row?.field_key) ? String(row.field_key) : undefined,
        isTyping: Number(row?.is_typing || 0) === 1,
        lastSeenAt: normalizeIsoFromMysql(row?.last_seen_at),
      })),
    },
    workflow: {
      stage: ["draft", "review", "approved", "ready_to_launch"].includes(baseRow?.workflow_stage)
        ? baseRow.workflow_stage
        : "draft",
      stageUpdatedAt: normalizeIsoFromMysql(baseRow?.workflow_stage_updated_at),
      wipLimit: Number.isFinite(Number(baseRow?.workflow_wip_limit))
        ? Math.max(1, Math.min(12, Math.round(Number(baseRow.workflow_wip_limit))))
        : 3,
    },
    evidenceItems: evidenceRows.map((row) => ({
      id: String(row?.evidence_id || ""),
      section: hasText(row?.section_key) ? String(row.section_key) : "research",
      claim: String(row?.claim || ""),
      source: String(row?.source || ""),
      sourceQuality: ["low", "medium", "high"].includes(row?.source_quality) ? row.source_quality : "medium",
      confidence: ["low", "medium", "high"].includes(row?.confidence) ? row.confidence : "medium",
      owner: hasText(row?.owner) ? String(row.owner) : "",
      url: hasText(row?.url) ? String(row.url) : "",
      createdAt: normalizeIsoFromMysql(row?.created_at),
    })),
    issues: issueRows.map((row) => ({
      id: String(row?.issue_id || ""),
      title: String(row?.title || ""),
      description: String(row?.description_text || ""),
      severity: ["low", "medium", "high", "critical"].includes(row?.severity) ? row.severity : "medium",
      status: ["open", "in_progress", "resolved"].includes(row?.status) ? row.status : "open",
      owner: String(row?.owner || "Unassigned"),
      slaHours: Number.isFinite(Number(row?.sla_hours)) ? Math.max(1, Number(row.sla_hours)) : 48,
      createdAt: normalizeIsoFromMysql(row?.created_at),
      updatedAt: normalizeIsoFromMysql(row?.updated_at),
      resolvedAt: row?.resolved_at ? normalizeIsoFromMysql(row.resolved_at) : undefined,
      postmortem: hasText(row?.postmortem) ? String(row.postmortem) : undefined,
    })),
    reminders: reminderRows.map((row) => ({
      id: String(row?.reminder_id || ""),
      type: hasText(row?.type_key) ? String(row.type_key) : "inactive_concept",
      severity: ["info", "warning", "critical"].includes(row?.severity) ? row.severity : "info",
      message: String(row?.message || ""),
      createdAt: normalizeIsoFromMysql(row?.created_at),
      dueAt: row?.due_at ? normalizeIsoFromMysql(row.due_at) : undefined,
    })),
    portfolio: safeJsonParse(baseRow?.portfolio_json, createDefaultPortfolioConfig()),
    templateSystem: safeJsonParse(baseRow?.template_system_json, createDefaultTemplateSystem()),
    digitalOps: safeJsonParse(baseRow?.digital_ops_json, createDefaultDigitalOps()),
    crmLifecycle: safeJsonParse(baseRow?.crm_lifecycle_json, createDefaultCrmLifecycle()),
    experimentLab: safeJsonParse(baseRow?.experiment_lab_json, createDefaultExperimentLab()),
    governancePolicy: safeJsonParse(baseRow?.governance_policy_json, createDefaultGovernancePolicy()),
    snapshots: snapshotRows.map((row) => ({
      id: String(row?.snapshot_id || ""),
      label: String(row?.label_text || ""),
      createdAt: normalizeIsoFromMysql(row?.created_at),
      createdBy: String(row?.created_by || "System"),
      summary: String(row?.summary || ""),
      state: safeJsonParse(row?.state_json, {}),
    })),
    approvals: approvalRows.map((row) => ({
      id: String(row?.approval_id || ""),
      role: hasText(row?.role_key) ? String(row.role_key) : "strategy_lead",
      approver: String(row?.approver || ""),
      signature: String(row?.signature || ""),
      status: ["pending", "approved", "rejected"].includes(row?.status) ? row.status : "pending",
      note: hasText(row?.note) ? String(row.note) : "",
      createdAt: normalizeIsoFromMysql(row?.created_at),
      updatedAt: normalizeIsoFromMysql(row?.updated_at),
      approvedAt: row?.approved_at ? normalizeIsoFromMysql(row.approved_at) : undefined,
    })),
    auditTrail: auditRows.map((row) => ({
      id: String(row?.audit_id || ""),
      action: String(row?.action_key || ""),
      actor: String(row?.actor || "System"),
      detail: String(row?.detail || ""),
      createdAt: normalizeIsoFromMysql(row?.created_at),
    })),
  };

  return ensureEnhancedCampaignDefaults(payload);
}

async function writeCampaignToMysqlConnection(connection, campaign, workspaceId = DEFAULT_WORKSPACE_ID) {
  const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
  const sanitized = normalizeCampaign(campaign);
  const campaignId = sanitized.campaign.id;
  const workflowStage = ["draft", "review", "approved", "ready_to_launch"].includes(sanitized?.workflow?.stage)
    ? sanitized.workflow.stage
    : "draft";
  const workflowWipLimit = Number.isFinite(Number(sanitized?.workflow?.wipLimit))
    ? Math.max(1, Math.min(12, Math.round(Number(sanitized.workflow.wipLimit))))
    : 3;

  await connection.execute(
    `
      INSERT INTO campaigns (
        workspace_id, campaign_id, name, country, languages_json, start_date, end_date, status,
        workflow_stage, workflow_stage_updated_at, workflow_wip_limit, behavior_statement, behavior_current,
        behavior_desired, behavior_context, insight_text, insight_evidence_source, insight_confidence_level,
        driver_types_json, driver_text, driver_why_now, driver_tension, situation, problem, prior_learnings,
        business_objective, communication_objective, creative_brief_json, content_themes_and_calendar,
        deliverables_needed, measurement_and_learning_plan, governance_risks_and_approvals, timeline_details,
        appendices, portfolio_json, template_system_json, digital_ops_json, crm_lifecycle_json,
        experiment_lab_json, governance_policy_json
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        country = VALUES(country),
        languages_json = VALUES(languages_json),
        start_date = VALUES(start_date),
        end_date = VALUES(end_date),
        status = VALUES(status),
        workflow_stage = VALUES(workflow_stage),
        workflow_stage_updated_at = VALUES(workflow_stage_updated_at),
        workflow_wip_limit = VALUES(workflow_wip_limit),
        behavior_statement = VALUES(behavior_statement),
        behavior_current = VALUES(behavior_current),
        behavior_desired = VALUES(behavior_desired),
        behavior_context = VALUES(behavior_context),
        insight_text = VALUES(insight_text),
        insight_evidence_source = VALUES(insight_evidence_source),
        insight_confidence_level = VALUES(insight_confidence_level),
        driver_types_json = VALUES(driver_types_json),
        driver_text = VALUES(driver_text),
        driver_why_now = VALUES(driver_why_now),
        driver_tension = VALUES(driver_tension),
        situation = VALUES(situation),
        problem = VALUES(problem),
        prior_learnings = VALUES(prior_learnings),
        business_objective = VALUES(business_objective),
        communication_objective = VALUES(communication_objective),
        creative_brief_json = VALUES(creative_brief_json),
        content_themes_and_calendar = VALUES(content_themes_and_calendar),
        deliverables_needed = VALUES(deliverables_needed),
        measurement_and_learning_plan = VALUES(measurement_and_learning_plan),
        governance_risks_and_approvals = VALUES(governance_risks_and_approvals),
        timeline_details = VALUES(timeline_details),
        appendices = VALUES(appendices),
        portfolio_json = VALUES(portfolio_json),
        template_system_json = VALUES(template_system_json),
        digital_ops_json = VALUES(digital_ops_json),
        crm_lifecycle_json = VALUES(crm_lifecycle_json),
        experiment_lab_json = VALUES(experiment_lab_json),
        governance_policy_json = VALUES(governance_policy_json),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      normalizedWorkspace,
      campaignId,
      sanitized.campaign.name || "Untitled Campaign",
      sanitized.campaign.country || "Tanzania",
      safeJsonStringify(
        Array.isArray(sanitized.campaign.languages) ? sanitized.campaign.languages : [],
        [],
      ),
      normalizeDateOnlyForMysql(sanitized.campaign.startDate),
      normalizeDateOnlyForMysql(sanitized.campaign.endDate),
      ["draft", "in_review", "final"].includes(sanitized.campaign.status) ? sanitized.campaign.status : "draft",
      workflowStage,
      normalizeDateTimeForMysql(sanitized?.workflow?.stageUpdatedAt),
      workflowWipLimit,
      sanitized?.behavior?.behaviorStatement || "",
      sanitized?.behavior?.currentBehavior || "",
      sanitized?.behavior?.desiredBehavior || "",
      sanitized?.behavior?.context || "",
      sanitized?.insight?.insightText || "",
      sanitized?.insight?.evidenceSource || "",
      ["low", "medium", "high"].includes(sanitized?.insight?.confidenceLevel)
        ? sanitized.insight.confidenceLevel
        : "medium",
      safeJsonStringify(Array.isArray(sanitized?.driver?.driverTypes) ? sanitized.driver.driverTypes : [], []),
      sanitized?.driver?.driverText || "",
      sanitized?.driver?.whyNow || "",
      sanitized?.driver?.tension || "",
      sanitized.situation || "",
      sanitized.problem || "",
      sanitized.priorLearnings || "",
      sanitized.businessObjective || "",
      sanitized.communicationObjective || "",
      safeJsonStringify(sanitized.creativeBrief || createDefaultCreativeBrief(), createDefaultCreativeBrief()),
      sanitized.contentThemesAndCalendar || "",
      sanitized.deliverablesNeeded || "",
      sanitized.measurementAndLearningPlan || "",
      sanitized.governanceRisksAndApprovals || "",
      sanitized.timelineDetails || "",
      sanitized.appendices || "",
      safeJsonStringify(sanitized.portfolio || createDefaultPortfolioConfig(), createDefaultPortfolioConfig()),
      safeJsonStringify(sanitized.templateSystem || createDefaultTemplateSystem(), createDefaultTemplateSystem()),
      safeJsonStringify(sanitized.digitalOps || createDefaultDigitalOps(), createDefaultDigitalOps()),
      safeJsonStringify(sanitized.crmLifecycle || createDefaultCrmLifecycle(), createDefaultCrmLifecycle()),
      safeJsonStringify(sanitized.experimentLab || createDefaultExperimentLab(), createDefaultExperimentLab()),
      safeJsonStringify(
        sanitized.governancePolicy || createDefaultGovernancePolicy(),
        createDefaultGovernancePolicy(),
      ),
    ],
  );

  await deleteCampaignChildrenByCampaign(connection, normalizedWorkspace, campaignId);

  await replaceCampaignChildRows(
    connection,
    "campaign_audiences",
    [
      "workspace_id",
      "campaign_id",
      "audience_id",
      "priority",
      "segment_name",
      "description_text",
      "barriers",
      "motivators",
      "desired_action",
      "key_message",
      "support_rtb",
      "cta",
      "sort_order",
    ],
    (Array.isArray(sanitized.audiences) ? sanitized.audiences : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      audience_id: hasText(entry?.id) ? String(entry.id) : `aud-${index + 1}`,
      priority: entry?.priority === "secondary" ? "secondary" : "primary",
      segment_name: entry?.segmentName || "",
      description_text: entry?.description || "",
      barriers: entry?.barriers || "",
      motivators: entry?.motivators || "",
      desired_action: entry?.desiredAction || "",
      key_message: entry?.keyMessage || "",
      support_rtb: entry?.supportRtb || "",
      cta: entry?.cta || "",
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_channel_roles",
    ["workspace_id", "campaign_id", "role_id", "category", "channel", "role_text", "sort_order"],
    (Array.isArray(sanitized.channelRoles) ? sanitized.channelRoles : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      role_id: hasText(entry?.id) ? String(entry.id) : `channel-role-${index + 1}`,
      category: ["paid", "owned", "earned"].includes(entry?.category) ? entry.category : "owned",
      channel: entry?.channel || "",
      role_text: entry?.role || "",
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_media_plan_rows",
    ["workspace_id", "campaign_id", "row_id", "channel", "targeting", "flighting", "budget", "kpi", "benchmark", "sort_order"],
    (Array.isArray(sanitized.mediaPlanRows) ? sanitized.mediaPlanRows : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      row_id: hasText(entry?.id) ? String(entry.id) : `media-row-${index + 1}`,
      channel: entry?.channel || "",
      targeting: entry?.targeting || "",
      flighting: entry?.flighting || "",
      budget: entry?.budget || "",
      kpi: entry?.kpi || "",
      benchmark: entry?.benchmark || "",
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_qa_checklist",
    ["workspace_id", "campaign_id", "item_id", "label_text", "checked_flag", "sort_order"],
    (Array.isArray(sanitized.qaChecklist) ? sanitized.qaChecklist : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      item_id: hasText(entry?.id) ? String(entry.id) : `qa-${index + 1}`,
      label_text: entry?.label || "",
      checked_flag: entry?.checked ? 1 : 0,
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_ideas",
    [
      "workspace_id",
      "campaign_id",
      "idea_id",
      "method",
      "title",
      "description_text",
      "link_to_insight",
      "link_to_driver",
      "feasibility_score",
      "originality_score",
      "strategic_fit_score",
      "cultural_fit_score",
      "selected_flag",
      "sort_order",
    ],
    (Array.isArray(sanitized.ideas) ? sanitized.ideas : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      idea_id: hasText(entry?.id) ? String(entry.id) : `idea-${index + 1}`,
      method: entry?.method || "Re-expression",
      title: entry?.title || "",
      description_text: entry?.description || "",
      link_to_insight: entry?.linkToInsight || "",
      link_to_driver: entry?.linkToDriver || "",
      feasibility_score: Number(entry?.feasibilityScore || 0),
      originality_score: Number(entry?.originalityScore || 0),
      strategic_fit_score: Number(entry?.strategicFitScore || 0),
      cultural_fit_score: Number(entry?.culturalFitScore || 0),
      selected_flag: entry?.selected ? 1 : 0,
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_concepts",
    [
      "workspace_id",
      "campaign_id",
      "concept_id",
      "name",
      "big_idea",
      "smp",
      "key_promise",
      "support_points_json",
      "tone",
      "selected_idea_ids_json",
      "channels_json",
      "risks_json",
      "tagline",
      "key_visual_description",
      "execution_rationale",
      "behavior_trigger",
      "board_data_json",
      "status",
      "sort_order",
    ],
    (Array.isArray(sanitized.concepts) ? sanitized.concepts : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      concept_id: hasText(entry?.id) ? String(entry.id) : `concept-${index + 1}`,
      name: entry?.name || "",
      big_idea: entry?.bigIdea || "",
      smp: entry?.smp || "",
      key_promise: entry?.keyPromise || "",
      support_points_json: safeJsonStringify(Array.isArray(entry?.supportPoints) ? entry.supportPoints : [], []),
      tone: entry?.tone || "",
      selected_idea_ids_json: safeJsonStringify(Array.isArray(entry?.selectedIdeaIds) ? entry.selectedIdeaIds : [], []),
      channels_json: safeJsonStringify(Array.isArray(entry?.channels) ? entry.channels : [], []),
      risks_json: safeJsonStringify(Array.isArray(entry?.risks) ? entry.risks : [], []),
      tagline: entry?.tagline || "",
      key_visual_description: entry?.keyVisualDescription || "",
      execution_rationale: entry?.executionRationale || "",
      behavior_trigger: entry?.behaviorTrigger || "",
      board_data_json: safeJsonStringify(entry?.boardData || {}, {}),
      status: ["draft", "shortlisted", "final"].includes(entry?.status) ? entry.status : "draft",
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_collaboration_members",
    ["workspace_id", "campaign_id", "member_name", "sort_order"],
    (Array.isArray(sanitized?.collaboration?.members) ? sanitized.collaboration.members : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      member_name: String(entry || "").trim(),
      sort_order: index,
    })).filter((entry) => entry.member_name),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_collaboration_messages",
    [
      "workspace_id",
      "campaign_id",
      "message_id",
      "author",
      "content",
      "created_at",
      "mentions_json",
      "parent_id",
      "resolved_flag",
      "resolved_at",
      "resolved_by",
      "field_key",
      "anchor_label",
      "sort_order",
    ],
    (Array.isArray(sanitized?.collaboration?.messages) ? sanitized.collaboration.messages : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      message_id: hasText(entry?.id) ? String(entry.id) : `msg-${index + 1}`,
      author: entry?.author || "",
      content: entry?.content || "",
      created_at: normalizeDateTimeForMysql(entry?.createdAt),
      mentions_json: safeJsonStringify(Array.isArray(entry?.mentions) ? entry.mentions : [], []),
      parent_id: hasText(entry?.parentId) ? String(entry.parentId) : null,
      resolved_flag: entry?.resolved ? 1 : 0,
      resolved_at: entry?.resolvedAt ? normalizeDateTimeForMysql(entry.resolvedAt) : null,
      resolved_by: hasText(entry?.resolvedBy) ? String(entry.resolvedBy) : null,
      field_key: hasText(entry?.fieldKey) ? String(entry.fieldKey) : null,
      anchor_label: hasText(entry?.anchorLabel) ? String(entry.anchorLabel) : null,
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_collaboration_presence",
    ["workspace_id", "campaign_id", "member_name", "field_key", "is_typing", "last_seen_at", "sort_order"],
    (Array.isArray(sanitized?.collaboration?.presence) ? sanitized.collaboration.presence : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      member_name: String(entry?.member || "").trim(),
      field_key: hasText(entry?.fieldKey) ? String(entry.fieldKey) : null,
      is_typing: entry?.isTyping ? 1 : 0,
      last_seen_at: normalizeDateTimeForMysql(entry?.lastSeenAt),
      sort_order: index,
    })).filter((entry) => entry.member_name),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_evidence_items",
    [
      "workspace_id",
      "campaign_id",
      "evidence_id",
      "section_key",
      "claim",
      "source",
      "source_quality",
      "confidence",
      "owner",
      "url",
      "created_at",
      "sort_order",
    ],
    (Array.isArray(sanitized.evidenceItems) ? sanitized.evidenceItems : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      evidence_id: hasText(entry?.id) ? String(entry.id) : `evidence-${index + 1}`,
      section_key: entry?.section || "research",
      claim: entry?.claim || "",
      source: entry?.source || "",
      source_quality: ["low", "medium", "high"].includes(entry?.sourceQuality) ? entry.sourceQuality : "medium",
      confidence: ["low", "medium", "high"].includes(entry?.confidence) ? entry.confidence : "medium",
      owner: hasText(entry?.owner) ? String(entry.owner) : null,
      url: hasText(entry?.url) ? String(entry.url) : null,
      created_at: normalizeDateTimeForMysql(entry?.createdAt),
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_issues",
    [
      "workspace_id",
      "campaign_id",
      "issue_id",
      "title",
      "description_text",
      "severity",
      "status",
      "owner",
      "sla_hours",
      "created_at",
      "updated_at",
      "resolved_at",
      "postmortem",
      "sort_order",
    ],
    (Array.isArray(sanitized.issues) ? sanitized.issues : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      issue_id: hasText(entry?.id) ? String(entry.id) : `issue-${index + 1}`,
      title: entry?.title || "",
      description_text: entry?.description || "",
      severity: ["low", "medium", "high", "critical"].includes(entry?.severity) ? entry.severity : "medium",
      status: ["open", "in_progress", "resolved"].includes(entry?.status) ? entry.status : "open",
      owner: hasText(entry?.owner) ? String(entry.owner) : "Unassigned",
      sla_hours: Number.isFinite(Number(entry?.slaHours)) ? Math.max(1, Number(entry.slaHours)) : 48,
      created_at: normalizeDateTimeForMysql(entry?.createdAt),
      updated_at: normalizeDateTimeForMysql(entry?.updatedAt),
      resolved_at: entry?.resolvedAt ? normalizeDateTimeForMysql(entry.resolvedAt) : null,
      postmortem: hasText(entry?.postmortem) ? String(entry.postmortem) : null,
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_reminders",
    ["workspace_id", "campaign_id", "reminder_id", "type_key", "severity", "message", "created_at", "due_at", "sort_order"],
    (Array.isArray(sanitized.reminders) ? sanitized.reminders : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      reminder_id: hasText(entry?.id) ? String(entry.id) : `reminder-${index + 1}`,
      type_key: entry?.type || "inactive_concept",
      severity: ["info", "warning", "critical"].includes(entry?.severity) ? entry.severity : "info",
      message: entry?.message || "",
      created_at: normalizeDateTimeForMysql(entry?.createdAt),
      due_at: entry?.dueAt ? normalizeDateTimeForMysql(entry.dueAt) : null,
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_snapshots",
    ["workspace_id", "campaign_id", "snapshot_id", "label_text", "created_at", "created_by", "summary", "state_json", "sort_order"],
    (Array.isArray(sanitized.snapshots) ? sanitized.snapshots : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      snapshot_id: hasText(entry?.id) ? String(entry.id) : `snapshot-${index + 1}`,
      label_text: hasText(entry?.label) ? String(entry.label) : "Campaign snapshot",
      created_at: normalizeDateTimeForMysql(entry?.createdAt),
      created_by: hasText(entry?.createdBy) ? String(entry.createdBy) : "System",
      summary: entry?.summary || "",
      state_json: safeJsonStringify(entry?.state || {}, {}),
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_approvals",
    [
      "workspace_id",
      "campaign_id",
      "approval_id",
      "role_key",
      "approver",
      "signature",
      "status",
      "note",
      "created_at",
      "updated_at",
      "approved_at",
      "sort_order",
    ],
    (Array.isArray(sanitized.approvals) ? sanitized.approvals : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      approval_id: hasText(entry?.id) ? String(entry.id) : `approval-${index + 1}`,
      role_key: entry?.role || "strategy_lead",
      approver: entry?.approver || "",
      signature: entry?.signature || "",
      status: ["pending", "approved", "rejected"].includes(entry?.status) ? entry.status : "pending",
      note: hasText(entry?.note) ? String(entry.note) : null,
      created_at: normalizeDateTimeForMysql(entry?.createdAt),
      updated_at: normalizeDateTimeForMysql(entry?.updatedAt),
      approved_at: entry?.approvedAt ? normalizeDateTimeForMysql(entry.approvedAt) : null,
      sort_order: index,
    })),
  );

  await replaceCampaignChildRows(
    connection,
    "campaign_audit_events",
    ["workspace_id", "campaign_id", "audit_id", "action_key", "actor", "detail", "created_at", "sort_order"],
    (Array.isArray(sanitized.auditTrail) ? sanitized.auditTrail : []).map((entry, index) => ({
      workspace_id: normalizedWorkspace,
      campaign_id: campaignId,
      audit_id: hasText(entry?.id) ? String(entry.id) : `audit-${index + 1}`,
      action_key: entry?.action || "",
      actor: hasText(entry?.actor) ? String(entry.actor) : "System",
      detail: entry?.detail || "",
      created_at: normalizeDateTimeForMysql(entry?.createdAt),
      sort_order: index,
    })),
  );
}

async function migrateLegacyCampaignStateToMysqlNormalizedIfNeeded(workspaceId, pool) {
  const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
  if (normalizedCampaignMigrationChecked.has(normalizedWorkspace)) {
    return;
  }

  const [countRows] = await pool.execute(
    "SELECT COUNT(*) AS total FROM campaigns WHERE workspace_id = ?",
    [normalizedWorkspace],
  );
  const total = Number(Array.isArray(countRows) && countRows[0] ? countRows[0].total : 0);
  if (total > 0) {
    normalizedCampaignMigrationChecked.add(normalizedWorkspace);
    return;
  }

  const legacyStore = await readJsonState(toWorkspaceStateKey(STORE_KEY_CAMPAIGNS, normalizedWorkspace), () => ({
    ...readStoreFromFile(normalizedWorkspace),
  }));
  const legacyCampaigns = Array.isArray(legacyStore?.campaigns) ? legacyStore.campaigns : [];
  if (legacyCampaigns.length === 0) {
    normalizedCampaignMigrationChecked.add(normalizedWorkspace);
    return;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    for (const candidate of legacyCampaigns) {
      try {
        await writeCampaignToMysqlConnection(connection, normalizeCampaign(candidate), normalizedWorkspace);
      } catch {
        // Skip malformed legacy records and continue migration for valid entries.
      }
    }
    await connection.commit();
    normalizedCampaignMigrationChecked.add(normalizedWorkspace);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors and rethrow original migration failure.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function listCampaignsFromMysqlNormalized(workspaceId = DEFAULT_WORKSPACE_ID) {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  if (!pool) {
    return [];
  }
  const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
  await migrateLegacyCampaignStateToMysqlNormalizedIfNeeded(normalizedWorkspace, pool);

  const [campaignRowsRaw] = await pool.execute(
    "SELECT * FROM campaigns WHERE workspace_id = ? ORDER BY updated_at DESC",
    [normalizedWorkspace],
  );
  const campaignRows = Array.isArray(campaignRowsRaw) ? campaignRowsRaw : [];
  if (campaignRows.length === 0) {
    return [];
  }

  const campaignIds = campaignRows.map((row) => String(row.campaign_id || "")).filter(Boolean);
  const [
    audiences,
    channelRoles,
    mediaPlanRows,
    qaChecklist,
    ideas,
    concepts,
    collaborationMembers,
    collaborationMessages,
    collaborationPresence,
    evidenceItems,
    issues,
    reminders,
    snapshots,
    approvals,
    auditEvents,
  ] = await Promise.all([
    fetchCampaignChildRows(pool, "campaign_audiences", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_channel_roles", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_media_plan_rows", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_qa_checklist", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_ideas", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_concepts", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_collaboration_members", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_collaboration_messages", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_collaboration_presence", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_evidence_items", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_issues", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_reminders", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_snapshots", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_approvals", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
    fetchCampaignChildRows(pool, "campaign_audit_events", normalizedWorkspace, campaignIds, "sort_order ASC, id ASC"),
  ]);

  const grouped = {
    audiences: groupRowsByCampaignId(audiences),
    channelRoles: groupRowsByCampaignId(channelRoles),
    mediaPlanRows: groupRowsByCampaignId(mediaPlanRows),
    qaChecklist: groupRowsByCampaignId(qaChecklist),
    ideas: groupRowsByCampaignId(ideas),
    concepts: groupRowsByCampaignId(concepts),
    collaborationMembers: groupRowsByCampaignId(collaborationMembers),
    collaborationMessages: groupRowsByCampaignId(collaborationMessages),
    collaborationPresence: groupRowsByCampaignId(collaborationPresence),
    evidenceItems: groupRowsByCampaignId(evidenceItems),
    issues: groupRowsByCampaignId(issues),
    reminders: groupRowsByCampaignId(reminders),
    snapshots: groupRowsByCampaignId(snapshots),
    approvals: groupRowsByCampaignId(approvals),
    auditEvents: groupRowsByCampaignId(auditEvents),
  };

  return campaignRows.map((row) => buildCampaignFromMysqlRow(row, grouped));
}

async function upsertCampaignInMysqlNormalized(campaign, workspaceId = DEFAULT_WORKSPACE_ID) {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  if (!pool) {
    return normalizeCampaign(campaign);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await writeCampaignToMysqlConnection(connection, campaign, workspaceId);
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors and rethrow original upsert failure.
    }
    throw error;
  } finally {
    connection.release();
  }
  return normalizeCampaign(campaign);
}

async function deleteCampaignInMysqlNormalized(campaignId, workspaceId = DEFAULT_WORKSPACE_ID) {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  if (!pool) {
    return false;
  }

  const normalizedWorkspace = normalizeWorkspaceId(workspaceId);
  const normalizedCampaignId = String(campaignId || "").trim();
  if (!normalizedCampaignId) {
    return false;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await deleteCampaignChildrenByCampaign(connection, normalizedWorkspace, normalizedCampaignId);
    const [result] = await connection.execute(
      "DELETE FROM campaigns WHERE workspace_id = ? AND campaign_id = ?",
      [normalizedWorkspace, normalizedCampaignId],
    );
    await connection.commit();
    return Number(result?.affectedRows || 0) > 0;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors and rethrow original delete failure.
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function replaceWorkspaceCampaignsInMysqlNormalized(campaigns, workspaceId = DEFAULT_WORKSPACE_ID) {
  await ensureMysqlSchema();
  const pool = await getMysqlPool();
  if (!pool) {
    return;
  }
  const normalizedWorkspace = normalizeWorkspaceId(workspaceId);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await deleteCampaignChildrenByWorkspace(connection, normalizedWorkspace);
    await connection.execute("DELETE FROM campaigns WHERE workspace_id = ?", [normalizedWorkspace]);
    for (const campaign of Array.isArray(campaigns) ? campaigns : []) {
      await writeCampaignToMysqlConnection(connection, campaign, normalizedWorkspace);
    }
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Ignore rollback errors and rethrow original replacement failure.
    }
    throw error;
  } finally {
    connection.release();
  }
}

function readStoreFromFile(workspaceId = DEFAULT_WORKSPACE_ID) {
  const workspaceStorePath = getWorkspaceStorePath(workspaceId);
  try {
    const raw = readFileSync(workspaceStorePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.campaigns)) {
      throw new Error("Malformed data store");
    }
    return parsed;
  } catch {
    return { version: 1, updatedAt: nowIso(), campaigns: [] };
  }
}

function writeStoreToFile(store, workspaceId = DEFAULT_WORKSPACE_ID) {
  const workspaceStorePath = getWorkspaceStorePath(workspaceId);
  mkdirSync(dirname(workspaceStorePath), { recursive: true });
  const next = {
    version: 1,
    updatedAt: nowIso(),
    campaigns: Array.isArray(store.campaigns) ? store.campaigns : [],
  };
  writeFileSync(workspaceStorePath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function readStore(workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!isMysqlStorageEnabled()) {
    return readStoreFromFile(workspaceId);
  }

  const parsed = await readJsonState(toWorkspaceStateKey(STORE_KEY_CAMPAIGNS, workspaceId), () => ({
    ...readStoreFromFile(workspaceId),
  }));

  if (!Array.isArray(parsed.campaigns)) {
    return { version: 1, updatedAt: nowIso(), campaigns: [] };
  }

  return {
    version: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    campaigns: parsed.campaigns,
  };
}

async function writeStore(store, workspaceId = DEFAULT_WORKSPACE_ID) {
  const next = {
    version: 1,
    updatedAt: nowIso(),
    campaigns: Array.isArray(store.campaigns) ? store.campaigns : [],
  };

  if (!isMysqlStorageEnabled()) {
    return writeStoreToFile(next, workspaceId);
  }

  await writeJsonState(toWorkspaceStateKey(STORE_KEY_CAMPAIGNS, workspaceId), next);
  return next;
}

async function listCampaigns(workspaceId = DEFAULT_WORKSPACE_ID) {
  if (isMysqlNormalizedCampaignStorageEnabled()) {
    return listCampaignsFromMysqlNormalized(workspaceId);
  }
  return (await readStore(workspaceId)).campaigns.map(clone);
}

async function getCampaignById(id, workspaceId = DEFAULT_WORKSPACE_ID) {
  return (await listCampaigns(workspaceId)).find((campaign) => campaign.campaign.id === id) || null;
}

async function upsertCampaign(campaign, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (isMysqlNormalizedCampaignStorageEnabled()) {
    const sanitized = normalizeCampaign(campaign);
    const id = sanitized.campaign.id;
    const existing = await getCampaignById(id, workspaceId);
    await upsertCampaignInMysqlNormalized(sanitized, workspaceId);
    broadcastRealtimeEvent(workspaceId, {
      entity: "campaign",
      action: existing ? "updated" : "created",
      campaignId: id,
      timestamp: nowIso(),
    });
    await rebuildWorkspaceNotifications(workspaceId);
    return sanitized;
  }

  const sanitized = normalizeCampaign(campaign);
  const store = await readStore(workspaceId);
  const id = sanitized.campaign.id;
  const index = store.campaigns.findIndex((entry) => entry.campaign.id === id);

  if (index === -1) {
    store.campaigns.push(sanitized);
  } else {
    store.campaigns[index] = sanitized;
  }

  await writeStore(store, workspaceId);
  broadcastRealtimeEvent(workspaceId, {
    entity: "campaign",
    action: index === -1 ? "created" : "updated",
    campaignId: id,
    timestamp: nowIso(),
  });
  await rebuildWorkspaceNotifications(workspaceId);
  return sanitized;
}

async function deleteCampaign(id, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (isMysqlNormalizedCampaignStorageEnabled()) {
    const deleted = await deleteCampaignInMysqlNormalized(id, workspaceId);
    if (deleted) {
      broadcastRealtimeEvent(workspaceId, {
        entity: "campaign",
        action: "deleted",
        campaignId: id,
        timestamp: nowIso(),
      });
      await rebuildWorkspaceNotifications(workspaceId);
    }
    return deleted;
  }

  const store = await readStore(workspaceId);
  const before = store.campaigns.length;
  store.campaigns = store.campaigns.filter((campaign) => campaign.campaign.id !== id);
  await writeStore(store, workspaceId);
  const deleted = store.campaigns.length < before;
  if (deleted) {
    broadcastRealtimeEvent(workspaceId, {
      entity: "campaign",
      action: "deleted",
      campaignId: id,
      timestamp: nowIso(),
    });
    await rebuildWorkspaceNotifications(workspaceId);
  }
  return deleted;
}

async function duplicateCampaign(id, workspaceId = DEFAULT_WORKSPACE_ID) {
  const source = await getCampaignById(id, workspaceId);
  if (!source) {
    return null;
  }

  const duplicated = clone(source);
  duplicated.campaign.id = createCampaignId();
  duplicated.campaign.name = `${source.campaign.name} (Copy)`;
  duplicated.campaign.status = "draft";
  duplicated.concepts = (duplicated.concepts || []).map((concept) => ({
    ...concept,
    id: createConceptId(),
    status: "draft",
  }));

  return upsertCampaign(duplicated, workspaceId);
}

async function getStorageStats(workspaceId = DEFAULT_WORKSPACE_ID) {
  const campaigns = await listCampaigns(workspaceId);
  const byStatus = { draft: 0, in_review: 0, final: 0 };

  for (const entry of campaigns) {
    if (entry?.campaign?.status in byStatus) {
      byStatus[entry.campaign.status] += 1;
    }
  }

  return { total: campaigns.length, byStatus };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function computeCampaignCompletionPercent(campaign) {
  const checkpoints = [
    hasText(campaign?.businessObjective),
    hasText(campaign?.communicationObjective),
    Array.isArray(campaign?.audiences) && campaign.audiences.length > 0,
    Array.isArray(campaign?.audiences) &&
      campaign.audiences.some((entry) => hasText(entry?.keyMessage) && hasText(entry?.cta)),
    Array.isArray(campaign?.ideas) && campaign.ideas.length >= 8,
    Array.isArray(campaign?.concepts) && campaign.concepts.length > 0,
    Array.isArray(campaign?.concepts) &&
      campaign.concepts.some((entry) => entry && (entry.status === "shortlisted" || entry.status === "final")),
    Array.isArray(campaign?.evidenceItems) && campaign.evidenceItems.length > 0,
    Array.isArray(campaign?.approvals) &&
      campaign.approvals.some((entry) => entry && entry.status === "approved"),
  ];
  const passed = checkpoints.filter(Boolean).length;
  return clamp((passed / Math.max(1, checkpoints.length)) * 100);
}

function getUnresolvedCommentCount(campaign) {
  const messages = Array.isArray(campaign?.collaboration?.messages)
    ? campaign.collaboration.messages
    : [];
  return messages.filter((message) => !message?.parentId && !message?.resolved).length;
}

function normalizeNotificationCreatedAt(value) {
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) {
    return nowIso();
  }
  return new Date(parsed).toISOString();
}

function computeCollaborationNotifications(campaign) {
  const campaignId = campaign?.campaign?.id || "campaign";
  const campaignTitle = campaign?.campaign?.name || "Campaign";
  const messages = Array.isArray(campaign?.collaboration?.messages)
    ? campaign.collaboration.messages
    : [];

  const sorted = [...messages]
    .filter((entry) => entry && hasText(entry.id) && hasText(entry.content))
    .sort((a, b) => {
      const aMs = Date.parse(a.createdAt || "");
      const bMs = Date.parse(b.createdAt || "");
      if (!Number.isFinite(aMs) && !Number.isFinite(bMs)) {
        return 0;
      }
      if (!Number.isFinite(aMs)) {
        return 1;
      }
      if (!Number.isFinite(bMs)) {
        return -1;
      }
      return bMs - aMs;
    });

  return sorted.slice(0, 8).map((entry) => {
    const mentions = Array.isArray(entry.mentions)
      ? entry.mentions.map((name) => String(name || "").trim()).filter(Boolean)
      : [];
    const mentionSuffix =
      mentions.length > 0 ? ` Mentions: ${mentions.slice(0, 3).join(", ")}.` : "";
    const isReply = hasText(entry.parentId);
    const isOpenThread = !isReply && !entry.resolved;
    const actor = hasText(entry.author) ? String(entry.author) : "Team member";
    const headline = isReply ? "Reply" : "Comment";

    return {
      id: `${campaignId}:collab-${entry.id}`,
      campaignId,
      title: campaignTitle,
      message: `${headline} by ${actor}: ${compactText(entry.content, 120)}${
        isOpenThread ? " Open thread." : ""
      }${mentionSuffix}`,
      severity: mentions.length > 0 || isOpenThread ? "warning" : "info",
      createdAt: normalizeNotificationCreatedAt(entry.createdAt),
    };
  });
}

function getOverdueIssueCount(campaign) {
  const issues = Array.isArray(campaign?.issues) ? campaign.issues : [];
  const nowMs = Date.now();
  return issues.filter((issue) => {
    if (!issue || issue.status === "resolved") {
      return false;
    }
    const createdAtMs = Date.parse(issue.createdAt || "");
    if (!Number.isFinite(createdAtMs)) {
      return false;
    }
    const slaHours = Number(issue.slaHours);
    const slaMs = (Number.isFinite(slaHours) ? slaHours : 48) * 60 * 60 * 1000;
    return createdAtMs + slaMs < nowMs;
  }).length;
}

function scoreConceptQuality(concept) {
  if (!concept || typeof concept !== "object") {
    return 0;
  }
  let score = 25;
  if (hasText(concept.bigIdea)) score += 18;
  if (hasText(concept.smp)) score += 12;
  if (hasText(concept.keyPromise)) score += 14;
  if (Array.isArray(concept.supportPoints) && concept.supportPoints.length >= 2) score += 10;
  if (Array.isArray(concept.channels) && concept.channels.length >= 2) score += 8;
  if (hasText(concept.tagline)) score += 6;
  if (hasText(concept.behaviorTrigger)) score += 7;
  if (hasText(concept.executionRationale)) score += 6;
  if (Array.isArray(concept.risks) && concept.risks.length > 3) score -= 8;
  return clamp(score);
}

function computeConceptQualityTrend(campaign) {
  const concepts = Array.isArray(campaign?.concepts) ? campaign.concepts : [];
  if (concepts.length === 0) {
    return [{ label: "No concepts", score: 0 }];
  }
  return concepts.slice(0, 8).map((concept, index) => ({
    label: hasText(concept?.name) ? concept.name : `Concept ${index + 1}`,
    score: scoreConceptQuality(concept),
  }));
}

function computeRiskHeatmap(campaign) {
  const unresolvedComments = getUnresolvedCommentCount(campaign);
  const overdueIssues = getOverdueIssueCount(campaign);
  const approvals = Array.isArray(campaign?.approvals) ? campaign.approvals : [];
  const pendingApprovals = approvals.filter((entry) => entry?.status !== "approved").length;
  const evidenceItems = Array.isArray(campaign?.evidenceItems) ? campaign.evidenceItems : [];
  const lowConfidenceEvidence = evidenceItems.filter((entry) => entry?.confidence === "low").length;

  return [
    { label: "Collaboration", score: clamp(unresolvedComments * 18) },
    { label: "Delivery", score: clamp(overdueIssues * 24) },
    { label: "Compliance", score: clamp(pendingApprovals * 20) },
    { label: "Evidence", score: clamp(lowConfidenceEvidence * 16) },
  ];
}

function getApprovedApprovals(campaign) {
  return Array.isArray(campaign?.approvals)
    ? campaign.approvals.filter((entry) => entry?.status === "approved")
    : [];
}

function evaluateGovernanceApprovalGate(campaign) {
  const defaultPolicy = createDefaultGovernancePolicy();
  const policy =
    campaign?.governancePolicy && typeof campaign.governancePolicy === "object"
      ? { ...defaultPolicy, ...campaign.governancePolicy }
      : defaultPolicy;
  const validRoles = new Set(["strategy_lead", "creative_lead", "client_partner", "compliance"]);
  const requiredApprovalRoles = Array.isArray(policy.requiredApprovalRoles)
    ? policy.requiredApprovalRoles.filter((role) => validRoles.has(role))
    : defaultPolicy.requiredApprovalRoles;
  const requiredRoles = requiredApprovalRoles.length > 0
    ? requiredApprovalRoles
    : defaultPolicy.requiredApprovalRoles;
  const minApprovedCountRaw = Number(policy.minApprovedCount);
  const minApprovedCount = Number.isFinite(minApprovedCountRaw)
    ? Math.max(0, Math.min(10, Math.round(minApprovedCountRaw)))
    : defaultPolicy.minApprovedCount;
  const approved = getApprovedApprovals(campaign);
  const approvedRoles = new Set(
    approved
      .map((entry) => (hasText(entry?.role) ? String(entry.role).trim() : ""))
      .filter((role) => validRoles.has(role)),
  );
  const missingRoles = requiredRoles.filter((role) => !approvedRoles.has(role));
  const passed = approved.length >= minApprovedCount && missingRoles.length === 0;

  return {
    policy,
    requiredRoles,
    minApprovedCount,
    approvedCount: approved.length,
    missingRoles,
    passed,
  };
}

function computePreflightChecks(campaign) {
  const approvalGate = evaluateGovernanceApprovalGate(campaign);
  const approvalRecommendation =
    approvalGate.missingRoles.length > 0
      ? `Capture approved signatures for roles: ${approvalGate.missingRoles.join(", ")}.`
      : `Capture at least ${approvalGate.minApprovedCount} approved signature(s).`;
  const checks = [
    {
      id: "objective_defined",
      label: "Business + communication objectives set",
      passed: hasText(campaign?.businessObjective) && hasText(campaign?.communicationObjective),
      severity: "critical",
      recommendation: "Complete both objective fields.",
    },
    {
      id: "audience_message_map",
      label: "Audience message map includes CTA",
      passed:
        Array.isArray(campaign?.audiences) &&
        campaign.audiences.some((entry) => hasText(entry?.keyMessage) && hasText(entry?.cta)),
      severity: "critical",
      recommendation: "Add key message and CTA for at least one audience.",
    },
    {
      id: "ideation_pool",
      label: "Ideation pool has sufficient options",
      passed: Array.isArray(campaign?.ideas) && campaign.ideas.length >= 8,
      severity: "warning",
      recommendation: "Generate additional 4Rs ideas.",
    },
    {
      id: "concept_shortlisted",
      label: "At least one concept is shortlisted/final",
      passed:
        Array.isArray(campaign?.concepts) &&
        campaign.concepts.some((entry) => entry?.status === "shortlisted" || entry?.status === "final"),
      severity: "critical",
      recommendation: "Shortlist one concept for client presentation.",
    },
    {
      id: "evidence_registry",
      label: "Evidence registry linked to claims",
      passed: Array.isArray(campaign?.evidenceItems) && campaign.evidenceItems.length > 0,
      severity: "warning",
      recommendation: "Add source-backed evidence entries.",
    },
    {
      id: "approval_signed",
      label: "Role-based approval signature captured",
      passed: approvalGate.passed,
      severity: "critical",
      recommendation: approvalRecommendation,
    },
    {
      id: "critical_incidents",
      label: "No unresolved critical incidents",
      passed:
        !Array.isArray(campaign?.issues) ||
        !campaign.issues.some((entry) => entry?.severity === "critical" && entry?.status !== "resolved"),
      severity: "critical",
      recommendation: "Resolve critical incidents before submission.",
    },
  ];

  const weights = { critical: 16, warning: 11, info: 8 };
  const weightedScore = checks.reduce(
    (sum, check) => sum + (check.passed ? weights[check.severity] : 0),
    0,
  );
  const maxScore = checks.reduce((sum, check) => sum + weights[check.severity], 0);
  const score = clamp((weightedScore / Math.max(1, maxScore)) * 100);
  const passThreshold = 72;

  return {
    score,
    passThreshold,
    passed: score >= passThreshold,
    checks,
  };
}

function buildCampaignHealth(campaign) {
  const preflight = computePreflightChecks(campaign);
  return {
    campaignId: campaign?.campaign?.id || "",
    completionPercent: computeCampaignCompletionPercent(campaign),
    unresolvedComments: getUnresolvedCommentCount(campaign),
    overdueIssues: getOverdueIssueCount(campaign),
    preflightScore: preflight.score,
    currentStage: campaign?.workflow?.stage || "draft",
    riskHeatmap: computeRiskHeatmap(campaign),
    conceptQualityTrend: computeConceptQualityTrend(campaign),
  };
}

function computeCampaignReminders(campaign) {
  const reminders = [];
  const nowMs = Date.now();
  const automationRules = Array.isArray(campaign?.crmLifecycle?.automationRules)
    ? campaign.crmLifecycle.automationRules
    : [];
  const rulesByTrigger = new Map();
  for (const rule of automationRules) {
    const trigger = hasText(rule?.trigger) ? String(rule.trigger).trim() : "";
    if (!trigger || rulesByTrigger.has(trigger)) {
      continue;
    }
    rulesByTrigger.set(trigger, rule);
  }

  const inactivityRule = rulesByTrigger.get("no_activity_72h");
  const unresolvedMentionRule = rulesByTrigger.get("unresolved_comment_24h");
  const conceptInactivityEnabled = inactivityRule ? inactivityRule.active !== false : true;
  const unresolvedMentionEnabled = unresolvedMentionRule ? unresolvedMentionRule.active !== false : true;

  const concepts = Array.isArray(campaign?.concepts) ? campaign.concepts : [];
  if (conceptInactivityEnabled) {
    for (const concept of concepts) {
      const lastTouch = concept?.boardData?.updatedAt || campaign?.workflow?.stageUpdatedAt || campaign?.campaign?.startDate;
      const touchedAtMs = Date.parse(lastTouch || "");
      if (!Number.isFinite(touchedAtMs)) {
        continue;
      }
      if (nowMs - touchedAtMs > 72 * 60 * 60 * 1000) {
        reminders.push({
          id: `rem-${concept.id}-inactive`,
          type: "inactive_concept",
          severity: "warning",
          message: `Concept "${concept.name || concept.id}" has been inactive for over 72 hours.`,
          createdAt: nowIso(),
          dueAt: new Date(
            touchedAtMs + Math.max(1, Number(inactivityRule?.slaHours) || 24) * 60 * 60 * 1000,
          ).toISOString(),
        });
      }
    }
  }

  const messages = Array.isArray(campaign?.collaboration?.messages)
    ? campaign.collaboration.messages
    : [];
  if (unresolvedMentionEnabled) {
    for (const message of messages) {
      if (message?.parentId || message?.resolved) {
        continue;
      }
      const createdAtMs = Date.parse(message.createdAt || "");
      if (!Number.isFinite(createdAtMs)) {
        continue;
      }
      if (nowMs - createdAtMs > 24 * 60 * 60 * 1000) {
        reminders.push({
          id: `rem-${message.id}-mention`,
          type: "unresolved_mention",
          severity: "warning",
          message: `Unresolved team thread by ${message.author} is older than 24 hours.`,
          createdAt: nowIso(),
          dueAt: new Date(
            createdAtMs + Math.max(1, Number(unresolvedMentionRule?.slaHours) || 12) * 60 * 60 * 1000,
          ).toISOString(),
        });
      }
    }
  }

  const crmSegments = Array.isArray(campaign?.crmLifecycle?.segments)
    ? campaign.crmLifecycle.segments
    : [];
  for (let index = 0; index < crmSegments.length; index += 1) {
    const segment = crmSegments[index];
    const dueAtMs = Date.parse(segment?.dueAt || "");
    if (!Number.isFinite(dueAtMs) || dueAtMs > nowMs || !hasText(segment?.nextAction)) {
      continue;
    }
    const priority = hasText(segment?.priority) ? String(segment.priority).trim().toLowerCase() : "medium";
    reminders.push({
      id: `rem-crm-${hasText(segment?.id) ? segment.id : `seg-${index + 1}`}-due`,
      type: "segment_due_action",
      severity: priority === "high" ? "warning" : "info",
      message: `CRM segment "${segment?.name || `Segment ${index + 1}`}" is overdue: ${segment.nextAction}.`,
      createdAt: nowIso(),
      dueAt: new Date(dueAtMs).toISOString(),
    });
  }

  const issues = Array.isArray(campaign?.issues) ? campaign.issues : [];
  for (const issue of issues) {
    if (!issue || issue.status === "resolved") {
      continue;
    }
    const createdAtMs = Date.parse(issue.createdAt || "");
    if (!Number.isFinite(createdAtMs)) {
      continue;
    }
    const slaHours = Number(issue.slaHours);
    const dueMs = createdAtMs + (Number.isFinite(slaHours) ? slaHours : 48) * 60 * 60 * 1000;
    if (nowMs > dueMs) {
      reminders.push({
        id: `rem-${issue.id}-overdue`,
        type: "overdue_issue",
        severity: issue.severity === "critical" ? "critical" : "warning",
        message: `Issue "${issue.title}" is overdue its SLA.`,
        createdAt: nowIso(),
        dueAt: new Date(dueMs).toISOString(),
      });
    }
  }

  const approvals = Array.isArray(campaign?.approvals) ? campaign.approvals : [];
  const pendingApprovals = approvals.filter((entry) => entry?.status !== "approved");
  if (pendingApprovals.length > 0) {
    reminders.push({
      id: `rem-approval-${campaign?.campaign?.id || "campaign"}`,
      type: "approval_pending",
      severity: "info",
      message: `${pendingApprovals.length} approval signature(s) still pending.`,
      createdAt: nowIso(),
    });
  }

  const byId = new Map();
  for (const reminder of reminders) {
    byId.set(reminder.id, reminder);
  }
  return [...byId.values()];
}

function normalizeWorkflowStage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "draft" || normalized === "review" || normalized === "approved" || normalized === "ready_to_launch") {
    return normalized;
  }
  return "draft";
}

function appendCampaignAuditEvent(campaign, action, actor, detail) {
  const nextAudit = Array.isArray(campaign.auditTrail) ? campaign.auditTrail.slice() : [];
  nextAudit.push({
    id: `audit-${randomUUID()}`,
    action,
    actor: hasText(actor) ? actor : "System",
    detail: hasText(detail) ? detail : action,
    createdAt: nowIso(),
  });
  campaign.auditTrail = nextAudit.slice(-300);
}

function summarizeCampaignForSnapshot(campaign) {
  const concepts = Array.isArray(campaign?.concepts) ? campaign.concepts.length : 0;
  const ideas = Array.isArray(campaign?.ideas) ? campaign.ideas.length : 0;
  const unresolved = getUnresolvedCommentCount(campaign);
  return `Ideas: ${ideas}, Concepts: ${concepts}, Open threads: ${unresolved}`;
}

function stripCampaignSnapshotState(campaign) {
  const cloned = clone(campaign);
  if (Array.isArray(cloned.snapshots)) {
    cloned.snapshots = [];
  }
  return cloned;
}

function flattenSnapshotSummary(snapshot) {
  const state = snapshot?.state && typeof snapshot.state === "object" ? snapshot.state : {};
  return {
    name: state?.campaign?.name || "",
    status: state?.campaign?.status || "",
    stage: state?.workflow?.stage || "",
    ideas: Array.isArray(state?.ideas) ? state.ideas.length : 0,
    concepts: Array.isArray(state?.concepts) ? state.concepts.length : 0,
    approvals: Array.isArray(state?.approvals)
      ? state.approvals.filter((entry) => entry?.status === "approved").length
      : 0,
    unresolvedComments: Array.isArray(state?.collaboration?.messages)
      ? state.collaboration.messages.filter((entry) => !entry?.parentId && !entry?.resolved).length
      : 0,
  };
}

function compareSnapshots(baseSnapshot, targetSnapshot) {
  const base = flattenSnapshotSummary(baseSnapshot);
  const target = flattenSnapshotSummary(targetSnapshot);
  const changes = [];
  for (const key of Object.keys(base)) {
    const before = String(base[key] ?? "");
    const after = String(target[key] ?? "");
    if (before === after) {
      continue;
    }
    changes.push({ key, before, after });
  }
  return {
    baseId: baseSnapshot.id,
    targetId: targetSnapshot.id,
    summary:
      changes.length === 0
        ? "No summary-level changes between selected snapshots."
        : `${changes.length} summary change(s) detected.`,
    changes,
  };
}

async function rebuildWorkspaceNotifications(workspaceId = DEFAULT_WORKSPACE_ID) {
  const campaigns = await listCampaigns(workspaceId);
  const items = [];
  for (const campaign of campaigns) {
    const reminders = computeCampaignReminders(campaign).slice(0, 20);
    for (const reminder of reminders) {
      items.push({
        id: `${campaign?.campaign?.id || "campaign"}:${reminder.id}`,
        campaignId: campaign?.campaign?.id || "",
        title: campaign?.campaign?.name || "Campaign reminder",
        message: reminder.message,
        severity: reminder.severity,
        createdAt: reminder.createdAt || nowIso(),
      });
    }

    const collaborationItems = computeCollaborationNotifications(campaign).slice(0, 8);
    for (const entry of collaborationItems) {
      items.push(entry);
    }
  }
  const deduped = new Map();
  for (const item of items) {
    deduped.set(item.id, item);
  }
  const normalizedItems = [...deduped.values()];
  normalizedItems.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  workspaceNotifications.set(normalizeWorkspaceId(workspaceId), normalizedItems.slice(0, 200));
  return workspaceNotifications.get(normalizeWorkspaceId(workspaceId)) || [];
}

async function rebuildAllWorkspaceNotifications() {
  for (const workspaceId of knownWorkspaceIds.values()) {
    try {
      const previous = workspaceNotifications.get(workspaceId) || [];
      const next = await rebuildWorkspaceNotifications(workspaceId);
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        broadcastRealtimeEvent(workspaceId, {
          entity: "notification",
          action: "refreshed",
          timestamp: nowIso(),
        });
      }
    } catch {
      // no-op
    }
  }
}

async function exportCampaigns(workspaceId = DEFAULT_WORKSPACE_ID) {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: nowIso(),
      campaigns: await listCampaigns(workspaceId),
    },
    null,
    2,
  );
}

async function importCampaigns(raw, mode = "merge", workspaceId = DEFAULT_WORKSPACE_ID) {
  const parsed = JSON.parse(raw);
  const fromBundle =
    parsed && typeof parsed === "object" && "campaigns" in parsed ? parsed.campaigns : parsed;
  const candidates = Array.isArray(fromBundle) ? fromBundle : [];
  const valid = [];
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      valid.push(normalizeCampaign(candidate));
    } catch {
      skipped += 1;
    }
  }

  if (isMysqlNormalizedCampaignStorageEnabled()) {
    if (mode === "replace") {
      await replaceWorkspaceCampaignsInMysqlNormalized(valid, workspaceId);
      await rebuildWorkspaceNotifications(workspaceId);
      return { imported: valid.length, skipped, mode };
    }
    for (const item of valid) {
      await upsertCampaignInMysqlNormalized(item, workspaceId);
    }
    await rebuildWorkspaceNotifications(workspaceId);
    return { imported: valid.length, skipped, mode };
  }

  if (mode === "replace") {
    await writeStore({ campaigns: valid }, workspaceId);
    return { imported: valid.length, skipped, mode };
  }

  const existing = (await readStore(workspaceId)).campaigns;
  const byId = new Map(existing.map((entry) => [entry.campaign.id, entry]));
  for (const item of valid) {
    byId.set(item.campaign.id, item);
  }
  await writeStore({ campaigns: [...byId.values()] }, workspaceId);
  return { imported: valid.length, skipped, mode };
}

async function resetCampaigns(workspaceId = DEFAULT_WORKSPACE_ID) {
  const sample = createDefaultCampaignData({ name: "Default Campaign" });
  if (isMysqlNormalizedCampaignStorageEnabled()) {
    await replaceWorkspaceCampaignsInMysqlNormalized([sample], workspaceId);
    await rebuildWorkspaceNotifications(workspaceId);
    return [sample];
  }
  await writeStore({ campaigns: [sample] }, workspaceId);
  return [sample];
}

function normalizeName(name) {
  return typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
}

function parseNullableFolderId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeAiProvider(value) {
  return String(value || "").trim().toLowerCase() === "gemini" ? "gemini" : "openrouter";
}

function createEmptyDriveStore() {
  return {
    version: 1,
    updatedAt: nowIso(),
    folders: [],
    files: [],
  };
}

function readDriveStoreFromFile(workspaceId = DEFAULT_WORKSPACE_ID) {
  const workspaceStorePath = getWorkspaceDriveStorePath(workspaceId);
  try {
    const raw = readFileSync(workspaceStorePath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.folders) ||
      !Array.isArray(parsed.files)
    ) {
      throw new Error("Malformed drive store");
    }
    return parsed;
  } catch {
    return createEmptyDriveStore();
  }
}

function writeDriveStoreToFile(store, workspaceId = DEFAULT_WORKSPACE_ID) {
  const workspaceStorePath = getWorkspaceDriveStorePath(workspaceId);
  mkdirSync(dirname(workspaceStorePath), { recursive: true });
  const next = {
    version: 1,
    updatedAt: nowIso(),
    folders: Array.isArray(store.folders) ? store.folders : [],
    files: Array.isArray(store.files) ? store.files : [],
  };
  writeFileSync(workspaceStorePath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function readDriveStore(workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!isMysqlStorageEnabled()) {
    return readDriveStoreFromFile(workspaceId);
  }

  const parsed = await readJsonState(
    toWorkspaceStateKey(STORE_KEY_DRIVE, workspaceId),
    () => readDriveStoreFromFile(workspaceId),
  );
  return {
    version: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    files: Array.isArray(parsed.files) ? parsed.files : [],
  };
}

async function writeDriveStore(store, workspaceId = DEFAULT_WORKSPACE_ID) {
  const next = {
    version: 1,
    updatedAt: nowIso(),
    folders: Array.isArray(store.folders) ? store.folders : [],
    files: Array.isArray(store.files) ? store.files : [],
  };

  if (!isMysqlStorageEnabled()) {
    return writeDriveStoreToFile(next, workspaceId);
  }

  await writeJsonState(toWorkspaceStateKey(STORE_KEY_DRIVE, workspaceId), next);
  return next;
}

function normalizeDriveCampaignId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeDriveStore(store) {
  return {
    ...store,
    folders: store.folders.map((folder) => ({
      ...folder,
      campaignId: normalizeDriveCampaignId(folder.campaignId),
      parentId: parseNullableFolderId(folder.parentId),
    })),
    files: store.files.map((file) => ({
      ...file,
      campaignId: normalizeDriveCampaignId(file.campaignId),
      folderId: parseNullableFolderId(file.folderId),
    })),
  };
}

function sortByName(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function sanitizeDriveFileForClient(file) {
  if (!file || typeof file !== "object") {
    return file;
  }
  const {
    contentBase64: _ignoredContentBase64,
    contentEncoding: _ignoredContentEncoding,
    ...rest
  } = file;
  return rest;
}

function sanitizeDriveEntryForClient(entry) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }
  if (entry.type === "file") {
    return sanitizeDriveFileForClient(entry);
  }
  return entry;
}

async function listDriveEntries(
  folderId = null,
  searchQuery = "",
  campaignId = null,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  const query = searchQuery.trim().toLowerCase();
  const folders = store.folders.filter(
    (folder) => folder.parentId === folderId && folder.campaignId === scopeCampaignId,
  );
  const files = store.files.filter(
    (file) => file.folderId === folderId && file.campaignId === scopeCampaignId,
  );
  const entries = [...sortByName(folders), ...sortByName(files)];

  const filteredEntries = !query
    ? entries
    : entries.filter((entry) => {
    const tags = entry.type === "file" ? entry.tags.join(" ") : "";
    const extracted = entry.type === "file" ? entry.extractedText : "";
    return `${entry.name} ${tags} ${extracted}`.toLowerCase().includes(query);
  });

  return filteredEntries.map((entry) => sanitizeDriveEntryForClient(entry));
}

async function listDriveFolders(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  return sortByName(store.folders.filter((folder) => folder.campaignId === scopeCampaignId));
}

async function getDriveBreadcrumbs(folderId, campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!folderId) {
    return [];
  }

  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  const byId = new Map(
    store.folders
      .filter((folder) => folder.campaignId === scopeCampaignId)
      .map((folder) => [folder.id, folder]),
  );
  const chain = [];
  let cursor = folderId;

  while (cursor) {
    const folder = byId.get(cursor);
    if (!folder) {
      break;
    }
    chain.unshift(folder);
    cursor = folder.parentId;
  }

  return chain;
}

function extractTextFromUpload(input) {
  const name = String(input.name || "");
  const mimeType = String(input.mimeType || "").toLowerCase();
  const content = String(input.content || "");
  const loweredName = name.toLowerCase();
  const isTextLike =
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("csv") ||
    loweredName.endsWith(".txt") ||
    loweredName.endsWith(".csv") ||
    loweredName.endsWith(".json") ||
    loweredName.endsWith(".md");
  const contentBase64 =
    typeof input.contentBase64 === "string" && input.contentBase64.trim()
      ? input.contentBase64.trim()
      : "";
  const looksLikePdf = loweredName.endsWith(".pdf") || mimeType.includes("pdf");
  const looksLikeDocx =
    loweredName.endsWith(".docx") ||
    mimeType.includes("wordprocessingml.document") ||
    mimeType.includes("officedocument.wordprocessingml");
  const looksLikeLegacyDoc = loweredName.endsWith(".doc") || mimeType.includes("msword");
  const looksLikeXlsx =
    loweredName.endsWith(".xlsx") ||
    mimeType.includes("spreadsheetml.sheet") ||
    mimeType.includes("officedocument.spreadsheetml");
  const looksLikeLegacyXls = loweredName.endsWith(".xls") || mimeType.includes("ms-excel");

  if (isTextLike) {
    if (content) {
      return normalizeExtractedText(content, 120000);
    }
    const textBuffer = decodeBase64Buffer(contentBase64);
    if (textBuffer) {
      return normalizeExtractedText(textBuffer.toString("utf8"), 120000);
    }
    return "";
  }

  const binaryBuffer = decodeBase64Buffer(contentBase64);
  if (binaryBuffer) {
    if (looksLikeDocx) {
      const docxText = extractTextFromDocxBuffer(binaryBuffer);
      if (docxText) {
        return docxText;
      }
    }

    if (looksLikeXlsx) {
      const xlsxText = extractTextFromXlsxBuffer(binaryBuffer);
      if (xlsxText) {
        return xlsxText;
      }
    }

    if (looksLikePdf) {
      const pdfText = extractTextFromPdfBuffer(binaryBuffer);
      if (pdfText) {
        return pdfText;
      }
    }

    if (looksLikeLegacyDoc || looksLikeLegacyXls || looksLikePdf || mimeType.includes("word") || mimeType.includes("excel")) {
      const binaryText = extractReadableStringsFromBinary(binaryBuffer);
      if (binaryText) {
        return binaryText;
      }
    }
  }

  return `Binary file uploaded: ${name}`;
}

function decodeBase64Buffer(value) {
  if (!value) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function normalizeExtractedText(value, maxLength = 120000) {
  const normalized = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function decodeXmlEntities(value) {
  return String(value ?? "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    const lowered = String(entity).toLowerCase();
    if (lowered === "amp") return "&";
    if (lowered === "lt") return "<";
    if (lowered === "gt") return ">";
    if (lowered === "quot") return '"';
    if (lowered === "apos") return "'";
    if (lowered === "nbsp") return " ";

    if (lowered.startsWith("#x")) {
      const code = Number.parseInt(lowered.slice(2), 16);
      if (Number.isFinite(code)) {
        return String.fromCodePoint(code);
      }
      return match;
    }

    if (lowered.startsWith("#")) {
      const code = Number.parseInt(lowered.slice(1), 10);
      if (Number.isFinite(code)) {
        return String.fromCodePoint(code);
      }
      return match;
    }

    return match;
  });
}

function findZipEocdOffset(buffer) {
  const signature = 0x06054b50;
  const minOffset = Math.max(0, buffer.length - 0x10000 - 22);
  for (let index = buffer.length - 22; index >= minOffset; index -= 1) {
    if (buffer.readUInt32LE(index) === signature) {
      return index;
    }
  }
  return -1;
}

function listZipEntries(buffer) {
  const eocdOffset = findZipEocdOffset(buffer);
  if (eocdOffset < 0) {
    return [];
  }

  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  if (
    centralDirectoryOffset < 0 ||
    centralDirectoryOffset >= buffer.length ||
    centralDirectoryEnd > buffer.length
  ) {
    return [];
  }

  const entries = [];
  let cursor = centralDirectoryOffset;
  while (cursor + 46 <= centralDirectoryEnd && cursor + 46 <= buffer.length) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      break;
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;

    if (nameEnd > buffer.length) {
      break;
    }

    const fileName = buffer.toString("utf8", nameStart, nameEnd);
    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    cursor = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipEntryData(buffer, entry) {
  const localHeaderOffset = entry.localHeaderOffset;
  if (localHeaderOffset + 30 > buffer.length) {
    return null;
  }
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    return null;
  }

  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;

  if (dataStart < 0 || dataEnd > buffer.length || dataStart > dataEnd) {
    return null;
  }

  const compressed = buffer.subarray(dataStart, dataEnd);
  try {
    if (entry.compressionMethod === 0) {
      return compressed;
    }
    if (entry.compressionMethod === 8) {
      return inflateRawSync(compressed);
    }
  } catch {
    return null;
  }

  return null;
}

function extractTextFromDocxXml(xml) {
  const text = String(xml ?? "")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, " ");

  return normalizeExtractedText(decodeXmlEntities(text), 200000);
}

function extractTextFromDocxBuffer(buffer) {
  const priority = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/footer1.xml",
    "word/footer2.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
  ];

  const entries = listZipEntries(buffer)
    .filter((entry) => entry.fileName.startsWith("word/") && entry.fileName.endsWith(".xml"))
    .sort((left, right) => {
      const leftIndex = priority.indexOf(left.fileName);
      const rightIndex = priority.indexOf(right.fileName);
      const normalizedLeft = leftIndex === -1 ? 999 : leftIndex;
      const normalizedRight = rightIndex === -1 ? 999 : rightIndex;
      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }
      return left.fileName.localeCompare(right.fileName);
    });

  const fragments = [];
  let lengthBudget = 0;
  for (const entry of entries) {
    const decompressed = readZipEntryData(buffer, entry);
    if (!decompressed) {
      continue;
    }
    const xmlText = decompressed.toString("utf8");
    const extracted = extractTextFromDocxXml(xmlText);
    if (!extracted) {
      continue;
    }
    fragments.push(extracted);
    lengthBudget += extracted.length;
    if (lengthBudget >= 140000) {
      break;
    }
  }

  return normalizeExtractedText(fragments.join("\n\n"), 120000);
}

function extractSharedStringsFromXlsxXml(xml) {
  const items = [];
  const stringItemRegex = /<si[\s\S]*?<\/si>/g;
  let stringItem = stringItemRegex.exec(xml);
  while (stringItem) {
    const textParts = [];
    const textRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let textMatch = textRegex.exec(stringItem[0]);
    while (textMatch) {
      textParts.push(decodeXmlEntities(textMatch[1]));
      textMatch = textRegex.exec(stringItem[0]);
    }
    const value = normalizeExtractedText(textParts.join(""), 800);
    items.push(value);
    stringItem = stringItemRegex.exec(xml);
  }
  return items;
}

function extractRowsFromWorksheetXml(xml, sharedStrings) {
  const lines = [];
  const rowRegex = /<row[\s\S]*?<\/row>/g;
  let rowMatch = rowRegex.exec(xml);
  while (rowMatch) {
    const row = rowMatch[0];
    const values = [];
    const cellRegex = /<c([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch = cellRegex.exec(row);
    while (cellMatch) {
      const attributes = cellMatch[1] || "";
      const content = cellMatch[2] || "";
      const typeMatch = attributes.match(/\st="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : "";
      let cellValue = "";

      if (type === "inlineStr") {
        const inlineParts = content.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g) || [];
        cellValue = inlineParts
          .map((part) => part.replace(/^<t(?:\s[^>]*)?>|<\/t>$/g, ""))
          .map((part) => decodeXmlEntities(part))
          .join(" ");
      } else {
        const valueMatch = content.match(/<v>([\s\S]*?)<\/v>/);
        const raw = valueMatch ? decodeXmlEntities(valueMatch[1]) : "";
        if (type === "s") {
          const index = Number.parseInt(raw, 10);
          if (Number.isFinite(index) && index >= 0 && index < sharedStrings.length) {
            cellValue = sharedStrings[index];
          } else {
            cellValue = raw;
          }
        } else {
          cellValue = raw;
        }
      }

      const normalized = normalizeExtractedText(cellValue, 300);
      if (normalized) {
        values.push(normalized);
      }
      cellMatch = cellRegex.exec(row);
    }

    if (values.length > 0) {
      lines.push(values.join(" | "));
    }
    rowMatch = rowRegex.exec(xml);
  }

  if (lines.length > 0) {
    return lines;
  }

  const textValues = [];
  const genericTextRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
  let textMatch = genericTextRegex.exec(xml);
  while (textMatch) {
    const value = normalizeExtractedText(decodeXmlEntities(textMatch[1]), 240);
    if (value) {
      textValues.push(value);
    }
    textMatch = genericTextRegex.exec(xml);
  }
  return textValues;
}

function extractTextFromXlsxBuffer(buffer) {
  const entries = listZipEntries(buffer);
  const sharedStringsEntry = entries.find((entry) => entry.fileName === "xl/sharedStrings.xml");
  const worksheetEntries = entries
    .filter((entry) => entry.fileName.startsWith("xl/worksheets/") && entry.fileName.endsWith(".xml"))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));

  const sharedStrings = [];
  if (sharedStringsEntry) {
    const sharedBuffer = readZipEntryData(buffer, sharedStringsEntry);
    if (sharedBuffer) {
      sharedStrings.push(...extractSharedStringsFromXlsxXml(sharedBuffer.toString("utf8")));
    }
  }

  const lines = [];
  for (const entry of worksheetEntries) {
    const sheetBuffer = readZipEntryData(buffer, entry);
    if (!sheetBuffer) {
      continue;
    }
    const sheetXml = sheetBuffer.toString("utf8");
    const sheetRows = extractRowsFromWorksheetXml(sheetXml, sharedStrings);
    lines.push(...sheetRows);
    if (lines.join("\n").length >= 120000) {
      break;
    }
  }

  return normalizeExtractedText(lines.join("\n"), 120000);
}

function extractReadableStringsFromBinary(buffer) {
  const snippets = [];
  const latinText = buffer.toString("latin1");
  const asciiMatches = latinText.match(/[\x20-\x7E]{6,}/g) || [];
  for (const match of asciiMatches) {
    const normalized = normalizeExtractedText(match, 240);
    if (normalized && /[A-Za-z]/.test(normalized)) {
      snippets.push(normalized);
    }
    if (snippets.join("\n").length >= 90000) {
      break;
    }
  }

  const utf16Chars = [];
  for (let index = 0; index + 1 < buffer.length; index += 2) {
    const codePoint = buffer.readUInt16LE(index);
    if (codePoint === 0) {
      utf16Chars.push("\n");
      continue;
    }
    if (codePoint >= 32 && codePoint <= 126) {
      utf16Chars.push(String.fromCharCode(codePoint));
    } else if (codePoint === 9 || codePoint === 10 || codePoint === 13) {
      utf16Chars.push("\n");
    } else {
      utf16Chars.push(" ");
    }
  }

  const utf16Text = utf16Chars.join("");
  const utf16Matches = utf16Text.match(/[A-Za-z0-9][A-Za-z0-9 ,.;:()'"!?/\-_]{5,}/g) || [];
  for (const match of utf16Matches) {
    const normalized = normalizeExtractedText(match, 240);
    if (normalized && /[A-Za-z]/.test(normalized)) {
      snippets.push(normalized);
    }
    if (snippets.join("\n").length >= 120000) {
      break;
    }
  }

  const unique = [];
  const seen = new Set();
  for (const snippet of snippets) {
    if (seen.has(snippet)) {
      continue;
    }
    seen.add(snippet);
    unique.push(snippet);
    if (unique.join("\n").length >= 120000) {
      break;
    }
  }

  return normalizeExtractedText(unique.join("\n"), 120000);
}

function decodePdfEscapedText(value) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\\") {
      output += char;
      continue;
    }

    const next = value[index + 1];
    if (next === undefined) {
      break;
    }

    if (/[0-7]/.test(next)) {
      let octal = next;
      let consumed = 1;
      while (
        consumed < 3 &&
        index + consumed + 1 < value.length &&
        /[0-7]/.test(value[index + consumed + 1])
      ) {
        octal += value[index + consumed + 1];
        consumed += 1;
      }
      output += String.fromCharCode(Number.parseInt(octal, 8));
      index += consumed;
      continue;
    }

    if (next === "n") output += "\n";
    else if (next === "r") output += "\r";
    else if (next === "t") output += "\t";
    else if (next === "b") output += "\b";
    else if (next === "f") output += "\f";
    else output += next;

    index += 1;
  }

  return output;
}

function extractPdfSnippetsFromSource(source) {
  const snippets = [];

  const singleTextOperator = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let singleMatch = singleTextOperator.exec(source);
  while (singleMatch) {
    snippets.push(decodePdfEscapedText(singleMatch[1]));
    singleMatch = singleTextOperator.exec(source);
  }

  const arrayTextOperator = /\[((?:.|\n|\r)*?)\]\s*TJ/g;
  let arrayMatch = arrayTextOperator.exec(source);
  while (arrayMatch) {
    const parts = arrayMatch[1].match(/\((?:\\.|[^\\()])*\)/g) || [];
    for (const part of parts) {
      snippets.push(decodePdfEscapedText(part.slice(1, -1)));
    }
    arrayMatch = arrayTextOperator.exec(source);
  }

  const metadata = /\/(?:Title|Subject|Author)\s*\(([^)]{4,240})\)/g;
  let metaMatch = metadata.exec(source);
  while (metaMatch) {
    snippets.push(decodePdfEscapedText(metaMatch[1]));
    metaMatch = metadata.exec(source);
  }

  return snippets;
}

function extractTextFromPdfBuffer(buffer) {
  const source = buffer.toString("latin1");
  const snippets = extractPdfSnippetsFromSource(source);

  const streamRegex = /(<<[\s\S]*?>>)\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch = streamRegex.exec(source);
  let inspectedStreams = 0;
  while (streamMatch && inspectedStreams < 120) {
    inspectedStreams += 1;
    const dictionary = streamMatch[1];
    const rawStream = Buffer.from(streamMatch[2], "latin1");
    let decoded = "";

    if (/\/FlateDecode/.test(dictionary)) {
      try {
        decoded = inflateSync(rawStream).toString("latin1");
      } catch {
        try {
          decoded = inflateRawSync(rawStream).toString("latin1");
        } catch {
          decoded = "";
        }
      }
    } else {
      decoded = streamMatch[2];
    }

    if (decoded) {
      snippets.push(...extractPdfSnippetsFromSource(decoded));
    }

    streamMatch = streamRegex.exec(source);
  }

  const unique = [];
  const seen = new Set();
  for (const snippet of snippets) {
    const normalized = normalizeExtractedText(decodeXmlEntities(snippet), 400);
    if (normalized.length < 4 || !/[A-Za-z]/.test(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
    if (unique.join("\n").length >= 120000) {
      break;
    }
  }

  return normalizeExtractedText(unique.join("\n"), 120000);
}

async function createDriveFolder(
  name,
  parentId = null,
  campaignId = null,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const normalized = normalizeName(name);
  if (!normalized) {
    throw new Error("Folder name cannot be empty.");
  }

  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  if (parentId) {
    const parentFolder = store.folders.find(
      (folder) => folder.id === parentId && folder.campaignId === scopeCampaignId,
    );
    if (!parentFolder) {
      throw new Error("Parent folder not found in selected campaign scope.");
    }
  }

  const conflict = store.folders.some(
    (folder) =>
      folder.campaignId === scopeCampaignId &&
      folder.parentId === parentId &&
      folder.name.toLowerCase() === normalized.toLowerCase(),
  );
  if (conflict) {
    throw new Error("A folder with this name already exists in the selected location.");
  }

  const timestamp = nowIso();
  const folder = {
    id: createDriveEntryId("drive-folder"),
    type: "folder",
    name: normalized,
    parentId,
    campaignId: scopeCampaignId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.folders.push(folder);
  await writeDriveStore(store, workspaceId);
  return folder;
}

async function uploadDriveFile(
  input,
  folderId = null,
  campaignId = null,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const normalized = normalizeName(input?.name);
  if (!normalized) {
    throw new Error("File name cannot be empty.");
  }

  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  if (folderId) {
    const folder = store.folders.find(
      (entry) => entry.id === folderId && entry.campaignId === scopeCampaignId,
    );
    if (!folder) {
      throw new Error("Target folder not found in selected campaign scope.");
    }
  }

  const timestamp = nowIso();
  const size = Number(input?.size || 0);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error("File size is invalid.");
  }
  if (size > DRIVE_UPLOAD_MAX_BYTES) {
    throw new Error(`File exceeds maximum supported size of ${Math.floor(DRIVE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.`);
  }

  const tags = Array.isArray(input?.tags)
    ? Array.from(new Set(input.tags.map((tag) => String(tag).trim()).filter(Boolean)))
    : [];
  const contentBase64 =
    typeof input?.contentBase64 === "string" && input.contentBase64.trim()
      ? input.contentBase64.trim()
      : "";

  const file = {
    id: createDriveEntryId("drive-file"),
    type: "file",
    name: normalized,
    mimeType: String(input?.mimeType || "application/octet-stream"),
    size,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags,
    extractedText: extractTextFromUpload(input ?? {}),
    contentBase64: contentBase64 || undefined,
    contentEncoding: contentBase64 ? "base64" : undefined,
    folderId,
    campaignId: scopeCampaignId,
  };

  store.files.push(file);
  await writeDriveStore(store, workspaceId);
  return sanitizeDriveFileForClient(file);
}

function collectDriveFolderTreeIds(folders, rootId) {
  const ids = new Set([rootId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        expanded = true;
      }
    }
  }
  return ids;
}

function isDriveDescendant(folders, sourceId, targetId) {
  if (!targetId) {
    return false;
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let cursor = targetId;
  while (cursor) {
    if (cursor === sourceId) {
      return true;
    }
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

async function renameDriveEntry(
  id,
  nextName,
  campaignId = null,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const normalized = normalizeName(nextName);
  if (!normalized) {
    throw new Error("Name cannot be empty.");
  }

  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  const timestamp = nowIso();
  const folderIndex = store.folders.findIndex(
    (folder) => folder.id === id && folder.campaignId === scopeCampaignId,
  );
  if (folderIndex >= 0) {
    store.folders[folderIndex] = { ...store.folders[folderIndex], name: normalized, updatedAt: timestamp };
    await writeDriveStore(store, workspaceId);
    return store.folders[folderIndex];
  }

  const fileIndex = store.files.findIndex(
    (file) => file.id === id && file.campaignId === scopeCampaignId,
  );
  if (fileIndex >= 0) {
    store.files[fileIndex] = { ...store.files[fileIndex], name: normalized, updatedAt: timestamp };
    await writeDriveStore(store, workspaceId);
    return sanitizeDriveFileForClient(store.files[fileIndex]);
  }

  return null;
}

async function moveDriveEntry(
  id,
  destinationFolderId,
  campaignId = null,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  const timestamp = nowIso();
  const foldersInScope = store.folders.filter((folder) => folder.campaignId === scopeCampaignId);

  if (destinationFolderId) {
    const destinationFolder = foldersInScope.find((folder) => folder.id === destinationFolderId);
    if (!destinationFolder) {
      throw new Error("Destination folder not found in selected campaign scope.");
    }
  }

  const folderIndex = store.folders.findIndex(
    (folder) => folder.id === id && folder.campaignId === scopeCampaignId,
  );
  if (folderIndex >= 0) {
    if (id === destinationFolderId) {
      throw new Error("Folder cannot be moved into itself.");
    }
    if (isDriveDescendant(foldersInScope, id, destinationFolderId)) {
      throw new Error("Folder cannot be moved into its descendant.");
    }
    store.folders[folderIndex] = {
      ...store.folders[folderIndex],
      parentId: destinationFolderId,
      updatedAt: timestamp,
    };
    await writeDriveStore(store, workspaceId);
    return store.folders[folderIndex];
  }

  const fileIndex = store.files.findIndex(
    (file) => file.id === id && file.campaignId === scopeCampaignId,
  );
  if (fileIndex >= 0) {
    store.files[fileIndex] = {
      ...store.files[fileIndex],
      folderId: destinationFolderId,
      updatedAt: timestamp,
    };
    await writeDriveStore(store, workspaceId);
    return sanitizeDriveFileForClient(store.files[fileIndex]);
  }

  return null;
}

async function deleteDriveEntry(id, campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  const foldersInScope = store.folders.filter((folder) => folder.campaignId === scopeCampaignId);
  const folder = foldersInScope.find((entry) => entry.id === id);
  if (folder) {
    const folderIds = collectDriveFolderTreeIds(foldersInScope, folder.id);
    store.folders = store.folders.filter(
      (entry) => entry.campaignId !== scopeCampaignId || !folderIds.has(entry.id),
    );
    store.files = store.files.filter(
      (file) => file.campaignId !== scopeCampaignId || !folderIds.has(file.folderId ?? ""),
    );
    await writeDriveStore(store, workspaceId);
    return true;
  }

  const before = store.files.length;
  store.files = store.files.filter(
    (file) => !(file.id === id && file.campaignId === scopeCampaignId),
  );
  if (store.files.length !== before) {
    await writeDriveStore(store, workspaceId);
    return true;
  }
  return false;
}

async function listDriveFiles(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const scopeCampaignId = normalizeDriveCampaignId(campaignId);
  const store = normalizeDriveStore(await readDriveStore(workspaceId));
  return sortByName(store.files.filter((file) => file.campaignId === scopeCampaignId)).map((file) =>
    sanitizeDriveFileForClient(file),
  );
}

function createEmptyChatStore() {
  return {
    version: 1,
    updatedAt: nowIso(),
    threads: [],
    memories: [],
  };
}

function readChatStoreFromFile(workspaceId = DEFAULT_WORKSPACE_ID) {
  const workspaceStorePath = getWorkspaceChatStorePath(workspaceId);
  try {
    const raw = readFileSync(workspaceStorePath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.threads) ||
      (parsed.memories != null && !Array.isArray(parsed.memories))
    ) {
      throw new Error("Malformed chat store");
    }
    return parsed;
  } catch {
    return createEmptyChatStore();
  }
}

function writeChatStoreToFile(store, workspaceId = DEFAULT_WORKSPACE_ID) {
  const workspaceStorePath = getWorkspaceChatStorePath(workspaceId);
  mkdirSync(dirname(workspaceStorePath), { recursive: true });
  const next = {
    version: 1,
    updatedAt: nowIso(),
    threads: Array.isArray(store.threads) ? store.threads : [],
    memories: Array.isArray(store.memories) ? store.memories : [],
  };
  writeFileSync(workspaceStorePath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function readChatStore(workspaceId = DEFAULT_WORKSPACE_ID) {
  if (!isMysqlStorageEnabled()) {
    return readChatStoreFromFile(workspaceId);
  }

  const parsed = await readJsonState(
    toWorkspaceStateKey(STORE_KEY_CHAT, workspaceId),
    () => readChatStoreFromFile(workspaceId),
  );
  return {
    version: 1,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
    threads: Array.isArray(parsed.threads) ? parsed.threads : [],
    memories: Array.isArray(parsed.memories) ? parsed.memories : [],
  };
}

async function writeChatStore(store, workspaceId = DEFAULT_WORKSPACE_ID) {
  const next = {
    version: 1,
    updatedAt: nowIso(),
    threads: Array.isArray(store.threads) ? store.threads : [],
    memories: Array.isArray(store.memories) ? store.memories : [],
  };

  if (!isMysqlStorageEnabled()) {
    return writeChatStoreToFile(next, workspaceId);
  }

  await writeJsonState(toWorkspaceStateKey(STORE_KEY_CHAT, workspaceId), next);
  return next;
}

function getChatThread(store, campaignId) {
  const key = campaignId ?? "__global__";
  let thread = store.threads.find((entry) => entry.campaignId === key);
  if (!thread) {
    thread = { campaignId: key, messages: [] };
    store.threads.push(thread);
  }
  return thread;
}

function createEmptyChatMemory(campaignId = null) {
  return {
    campaignId: campaignId ?? "__global__",
    profile: {
      displayName: "",
      role: "",
      organization: "",
    },
    preferences: [],
    styleHints: [],
    goals: [],
    facts: [],
    updatedAt: nowIso(),
  };
}

function normalizeMemoryText(value, max = 140) {
  return compactText(String(value || "").replace(/\s+/g, " ").trim(), max);
}

function normalizeMemoryName(value) {
  const cleaned = normalizeMemoryText(value, 80)
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return "";
  }
  return cleaned
    .split(" ")
    .slice(0, 3)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function pushUniqueMemoryItem(list, value, maxItems = 12) {
  const normalized = normalizeMemoryText(value, 180);
  if (!normalized) {
    return false;
  }
  const exists = list.some((entry) => entry.toLowerCase() === normalized.toLowerCase());
  if (exists) {
    return false;
  }
  list.unshift(normalized);
  if (list.length > maxItems) {
    list.length = maxItems;
  }
  return true;
}

function getChatMemory(store, campaignId = null) {
  const key = campaignId ?? "__global__";
  if (!Array.isArray(store.memories)) {
    store.memories = [];
  }
  let memory = store.memories.find((entry) => entry.campaignId === key);
  if (!memory) {
    memory = createEmptyChatMemory(key);
    store.memories.push(memory);
  }

  if (!memory.profile || typeof memory.profile !== "object") {
    memory.profile = createEmptyChatMemory(key).profile;
  }
  if (!Array.isArray(memory.preferences)) {
    memory.preferences = [];
  }
  if (!Array.isArray(memory.styleHints)) {
    memory.styleHints = [];
  }
  if (!Array.isArray(memory.goals)) {
    memory.goals = [];
  }
  if (!Array.isArray(memory.facts)) {
    memory.facts = [];
  }
  if (typeof memory.updatedAt !== "string") {
    memory.updatedAt = nowIso();
  }
  return memory;
}

async function getChatMessages(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const key = campaignId ?? "__global__";
  const store = await readChatStore(workspaceId);
  return store.threads.find((thread) => thread.campaignId === key)?.messages ?? [];
}

async function appendChatMessage(campaignId, message, workspaceId = DEFAULT_WORKSPACE_ID) {
  const store = await readChatStore(workspaceId);
  const thread = getChatThread(store, campaignId);
  thread.messages.push(message);
  await writeChatStore(store, workspaceId);
  broadcastRealtimeEvent(workspaceId, {
    entity: "chat",
    action: "message_appended",
    campaignId: campaignId ?? null,
    message: {
      id: message.id,
      role: message.role,
      createdAt: message.createdAt,
    },
    timestamp: nowIso(),
  });
  return message;
}

async function clearChatMessages(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const key = campaignId ?? "__global__";
  const store = await readChatStore(workspaceId);
  const target = store.threads.find((thread) => thread.campaignId === key);
  if (target) {
    target.messages = [];
    await writeChatStore(store, workspaceId);
  }
  broadcastRealtimeEvent(workspaceId, {
    entity: "chat",
    action: "messages_cleared",
    campaignId: campaignId ?? null,
    timestamp: nowIso(),
  });
  return [];
}

async function inferDisplayNameFromChatHistory(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const messages = await getChatMessages(campaignId, workspaceId);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    const inferred = extractDisplayNameFromPrompt(message.content || "");
    if (inferred) {
      return inferred;
    }
  }
  return "";
}

async function persistDisplayNameToMemory(
  campaignId = null,
  value = "",
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const normalized = normalizeMemoryName(value);
  if (!normalized) {
    return "";
  }
  const store = await readChatStore(workspaceId);
  const memory = getChatMemory(store, campaignId);
  if (memory.profile.displayName !== normalized) {
    memory.profile.displayName = normalized;
    memory.updatedAt = nowIso();
    await writeChatStore(store, workspaceId);
  }
  return normalized;
}

function extractDisplayNameFromPrompt(prompt) {
  const normalized = String(prompt || "").trim();
  if (!normalized) {
    return "";
  }

  const patterns = [
    /\bmy name is\s+([A-Za-z][A-Za-z\s'-]{1,50})\b/i,
    /\bcall me\s+([A-Za-z][A-Za-z\s'-]{1,50})\b/i,
    /\bthis is\s+([A-Za-z][A-Za-z\s'-]{1,50})\b/i,
    /\bi(?:\s+am|'m)\s+([A-Za-z][A-Za-z\s'-]{1,50})\b/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match || !match[1]) {
      continue;
    }
    const candidate = normalizeMemoryName(match[1]);
    const ignored = new Set([
      "Fine",
      "Okay",
      "Good",
      "Great",
      "Here",
      "Ready",
      "Interested",
      "Curious",
      "Happy",
      "Excited",
      "Available",
      "New",
    ]);
    if (!candidate || ignored.has(candidate)) {
      continue;
    }
    return candidate;
  }

  return "";
}

function isNameRecallPrompt(prompt) {
  const normalized = normalizePromptForIntent(prompt).toLowerCase();
  if (!normalized) {
    return false;
  }
  const trimmed = normalized.trim();

  const explicitPatterns = [
    /\bwhat(?:'s| is)?\s+my\s+name\b/,
    /\btell me(?:\s+what)?\s+my\s+name\b/,
    /\bsay\s+my\s+name\b/,
    /\brepeat\s+my\s+name\b/,
    /\brecall\s+my\s+name\b/,
    /\bremember\s+my\s+name\b/,
    /\bcan you\b.*\bmy\s+name\b/,
    /\bdo you remember\b.*\bmy\s+name\b/,
    /\bwho am i\b/,
  ];
  if (explicitPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (/^(name\??|my name\??|who am i\??)$/.test(trimmed)) {
    return true;
  }

  if (/\bmy\s+name\b/.test(normalized)) {
    return /\b(do you remember|remember|what is|what's|whats|tell me|say|repeat|recall)\b/.test(normalized);
  }

  return false;
}

function isMemoryCapabilityPrompt(prompt) {
  const normalized = normalizePromptForIntent(prompt).toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    /\b(can you remember|do you remember|remember previous|long[- ]term memory|save memory|store information)\b/.test(
      normalized,
    ) &&
    /\b(memory|chat|conversation|conversations|details|information|preference|preferences)\b/.test(normalized)
  );
}

function extractPreferenceFromPrompt(prompt) {
  const normalized = String(prompt || "").trim();
  if (!normalized) {
    return "";
  }
  const patterns = [
    /\bi prefer\s+(.+?)(?:[.!?]|$)/i,
    /\bi like\s+(.+?)(?:[.!?]|$)/i,
    /\bplease\s+(always|try to)\s+(.+?)(?:[.!?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }
    const candidate = normalizeMemoryText(match[2] || match[1] || "", 160);
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

function extractGoalFromPrompt(prompt) {
  const normalized = String(prompt || "").trim();
  if (!normalized) {
    return "";
  }
  const patterns = [
    /\bi need\s+(.+?)(?:[.!?]|$)/i,
    /\bi want\s+(.+?)(?:[.!?]|$)/i,
    /\bour goal is to\s+(.+?)(?:[.!?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match || !match[1]) {
      continue;
    }
    const candidate = normalizeMemoryText(match[1], 180);
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

function extractRoleOrOrgFact(prompt) {
  const normalized = String(prompt || "").trim();
  if (!normalized) {
    return "";
  }
  const patterns = [
    /\bi work (?:as|at)\s+(.+?)(?:[.!?]|$)/i,
    /\bi am (?:a|an)\s+(.+?)(?:[.!?]|$)/i,
    /\bwe are\s+(.+?)(?:[.!?]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match || !match[1]) {
      continue;
    }
    const candidate = normalizeMemoryText(match[1], 180);
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

function inferStyleHints(prompt) {
  const normalized = normalizePromptForIntent(prompt).toLowerCase();
  const hints = [];
  if (!normalized) {
    return hints;
  }

  if (/\b(quick|faster|fast|short response|respond quickly)\b/.test(normalized)) {
    hints.push("Prefers fast responses");
  }
  if (/\b(concise|brief|short)\b/.test(normalized)) {
    hints.push("Prefers concise output");
  }
  if (/\b(detailed|in depth|comprehensive)\b/.test(normalized)) {
    hints.push("Prefers detailed explanations when needed");
  }
  if (/\b(creative|unexpected|innovative)\b/.test(normalized)) {
    hints.push("Prefers creative options");
  }
  if (/\b(logic|logical|reasoning)\b/.test(normalized)) {
    hints.push("Prefers logical and structured reasoning");
  }
  if (/\b(step by step|checklist)\b/.test(normalized)) {
    hints.push("Prefers step-by-step guidance");
  }
  return hints;
}

function applyMemorySignals(memory, prompt) {
  let changed = false;
  const name = extractDisplayNameFromPrompt(prompt);
  if (name && memory.profile.displayName !== name) {
    memory.profile.displayName = name;
    changed = true;
  }

  const preference = extractPreferenceFromPrompt(prompt);
  if (preference && pushUniqueMemoryItem(memory.preferences, preference, 12)) {
    changed = true;
  }

  const goal = extractGoalFromPrompt(prompt);
  if (goal && pushUniqueMemoryItem(memory.goals, goal, 12)) {
    changed = true;
  }

  const fact = extractRoleOrOrgFact(prompt);
  if (fact && pushUniqueMemoryItem(memory.facts, fact, 12)) {
    changed = true;
  }

  for (const hint of inferStyleHints(prompt)) {
    if (pushUniqueMemoryItem(memory.styleHints, hint, 12)) {
      changed = true;
    }
  }

  if (changed) {
    memory.updatedAt = nowIso();
  }
  return changed;
}

function mergeChatMemory(globalMemory, campaignMemory) {
  const merged = createEmptyChatMemory("__merged__");
  merged.profile.displayName =
    campaignMemory?.profile?.displayName || globalMemory?.profile?.displayName || "";
  merged.profile.role = campaignMemory?.profile?.role || globalMemory?.profile?.role || "";
  merged.profile.organization =
    campaignMemory?.profile?.organization || globalMemory?.profile?.organization || "";

  const mergeList = (a = [], b = [], max = 14) => {
    const next = [];
    for (const item of [...a, ...b]) {
      pushUniqueMemoryItem(next, item, max);
    }
    return next;
  };

  merged.preferences = mergeList(campaignMemory?.preferences, globalMemory?.preferences);
  merged.styleHints = mergeList(campaignMemory?.styleHints, globalMemory?.styleHints);
  merged.goals = mergeList(campaignMemory?.goals, globalMemory?.goals);
  merged.facts = mergeList(campaignMemory?.facts, globalMemory?.facts);
  merged.updatedAt = nowIso();
  return merged;
}

function buildMemorySummary(memory) {
  if (!memory) {
    return "No persistent user memory recorded yet.";
  }

  const lines = [];
  if (memory.profile.displayName) {
    lines.push(`Name: ${memory.profile.displayName}`);
  }
  if (memory.profile.role) {
    lines.push(`Role: ${memory.profile.role}`);
  }
  if (memory.profile.organization) {
    lines.push(`Organization: ${memory.profile.organization}`);
  }
  if (memory.preferences.length > 0) {
    lines.push(`Preferences: ${memory.preferences.slice(0, 4).join("; ")}`);
  }
  if (memory.styleHints.length > 0) {
    lines.push(`Style hints: ${memory.styleHints.slice(0, 4).join("; ")}`);
  }
  if (memory.goals.length > 0) {
    lines.push(`Goals: ${memory.goals.slice(0, 4).join("; ")}`);
  }
  if (memory.facts.length > 0) {
    lines.push(`Known facts: ${memory.facts.slice(0, 4).join("; ")}`);
  }

  return lines.length > 0 ? lines.join(" | ") : "No persistent user memory recorded yet.";
}

async function getMergedUserMemory(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const store = await readChatStore(workspaceId);
  const globalMemory = getChatMemory(store, null);
  const scopedMemory = campaignId ? getChatMemory(store, campaignId) : null;
  return mergeChatMemory(globalMemory, scopedMemory);
}

async function updateChatMemoryFromUserPrompt(
  campaignId,
  prompt,
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const normalized = normalizePromptForIntent(prompt);
  if (!normalized) {
    return null;
  }

  const store = await readChatStore(workspaceId);
  const globalMemory = getChatMemory(store, null);
  let changed = applyMemorySignals(globalMemory, normalized);

  if (campaignId) {
    const scopedMemory = getChatMemory(store, campaignId);
    changed = applyMemorySignals(scopedMemory, normalized) || changed;
  }

  if (changed) {
    await writeChatStore(store, workspaceId);
  }

  const nextGlobalMemory = getChatMemory(store, null);
  const nextScopedMemory = campaignId ? getChatMemory(store, campaignId) : null;
  return mergeChatMemory(nextGlobalMemory, nextScopedMemory);
}

async function getChatMemorySnapshot(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  return getMergedUserMemory(campaignId, workspaceId);
}

async function clearChatMemory(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const store = await readChatStore(workspaceId);
  if (!Array.isArray(store.memories)) {
    store.memories = [];
  }

  if (!campaignId) {
    store.memories = [createEmptyChatMemory("__global__")];
    await writeChatStore(store, workspaceId);
    return getChatMemory(store, null);
  }

  store.memories = store.memories.filter((entry) => entry.campaignId !== campaignId);
  await writeChatStore(store, workspaceId);
  return mergeChatMemory(getChatMemory(store, null), null);
}

function compactText(value, max = 220) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

const GENERIC_CITATION_EXCERPT_PATTERNS = [
  /\bbinary file uploaded\b/i,
  /\bno extracted text available\b/i,
  /\bextracted text unavailable\b/i,
  /^\s*$/,
];

function normalizePromptForIntent(prompt) {
  return String(prompt || "")
    .replace(/^(prompt focus:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyChatIntent(prompt) {
  const normalized = normalizePromptForIntent(prompt);
  const lower = normalized.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  const greetingPattern =
    /^(hi|hello|hey|yo|hola|good morning|good afternoon|good evening|how are you|whats up|what's up)\b/;
  const smallTalkPattern =
    /^(thanks|thank you|ok|okay|cool|nice|great|perfect|awesome)\b/;

  if ((greetingPattern.test(lower) || smallTalkPattern.test(lower)) && words.length <= 10) {
    return "chat";
  }

  if (words.length <= 3 && (lower === "hello" || lower === "hi" || lower === "hey")) {
    return "chat";
  }

  if (
    /\b(friend|friends|become friends|can we be friends|who are you|tell me about yourself|introduce yourself|your name)\b/.test(
      lower,
    ) ||
    /\b(get to know each other|know each other|let us know each other|let's know each other)\b/.test(lower)
  ) {
    return "chat";
  }

  return "task";
}

function isCampaignTaskPrompt(prompt) {
  const normalized = normalizePromptForIntent(prompt).toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /\b(campaign|brief|communication brief|creative brief|ideation|idea|concept|audience|behavior|behaviour|driver|motive|insight|sbcc|message|messaging|channel|kpi|cta)\b/.test(
      normalized,
    ) ||
    /\b(behavior change|behaviour change|target audience|target behavior|desired behavior)\b/.test(normalized)
  );
}

function shouldUseLocalSocialReply(prompt) {
  const normalized = normalizePromptForIntent(prompt).toLowerCase();
  if (!normalized) {
    return true;
  }
  if (/^(hi|hello|hey|thanks|thank you|ok|okay)\b/.test(normalized) && normalized.split(/\s+/).length <= 3) {
    return true;
  }
  return false;
}

function shouldUseDocumentContext(prompt, taggedDocumentIds = []) {
  if (Array.isArray(taggedDocumentIds) && taggedDocumentIds.length > 0) {
    return true;
  }

  const normalized = normalizePromptForIntent(prompt).toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /\b(report|reports|document|documents|file|files|pdf|docx?|acknowledg|source|citation|references)\b/.test(
      normalized,
    ) ||
    /\b(extract|summar|analy|analysis|evidence|according to|based on|from the report)\b/.test(
      normalized,
    ) ||
    /\b(mvomero|mpwapwa|cvca)\b/.test(normalized)
  );
}

function requiresEvidenceGrounding(prompt) {
  const normalized = normalizePromptForIntent(prompt).toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /\b(who|what|when|where|which|how many|list|specific|exact|prepared|acknowledg)\b/.test(normalized) ||
    /\b(search|google|external|source|citation|reference|latest|news|according to|based on)\b/.test(normalized)
  );
}

function buildFastSocialReply(prompt) {
  const normalized = normalizePromptForIntent(prompt).toLowerCase();

  if (/\bhow are you\b/.test(normalized)) {
    return "I’m doing well, thanks. What would you like to work on?";
  }

  if (/\b(can we be friends|become friends|friends?)\b/.test(normalized)) {
    return "Absolutely. I’m here as your reliable AI teammate, anytime you need help.";
  }

  if (/^(thanks|thank you)\b/.test(normalized)) {
    return "You’re welcome. Ready for the next task whenever you are.";
  }

  return "Hello! I’m here and ready to help. What would you like to do?";
}

function sanitizeCitationExcerpt(text) {
  const normalized = compactText(text || "", 200);
  const isGeneric = GENERIC_CITATION_EXCERPT_PATTERNS.some((pattern) => pattern.test(normalized));
  if (isGeneric) {
    return "Document uploaded. Text extraction is limited for this file.";
  }
  return normalized;
}

function normalizeTaggedDocumentIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const id = parseNullableFolderId(entry);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= 12) {
      break;
    }
  }

  return normalized;
}

async function listChatRelevantDriveFiles(campaignId = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const scoped = await listDriveFiles(campaignId, workspaceId);
  if (!campaignId) {
    return scoped;
  }

  const globalFiles = await listDriveFiles(null, workspaceId);
  const byId = new Map();
  for (const file of [...scoped, ...globalFiles]) {
    if (!byId.has(file.id)) {
      byId.set(file.id, file);
    }
  }

  return [...byId.values()];
}

async function buildChatCitations(
  prompt,
  campaignId = null,
  taggedDocumentIds = [],
  workspaceId = DEFAULT_WORKSPACE_ID,
) {
  const files = await listChatRelevantDriveFiles(campaignId, workspaceId);
  const normalizedTaggedIds = normalizeTaggedDocumentIds(taggedDocumentIds);
  const byId = new Map(files.map((file) => [file.id, file]));
  const taggedFiles = normalizedTaggedIds
    .map((id) => byId.get(id))
    .filter(Boolean);
  const taggedIds = new Set(taggedFiles.map((file) => file.id));
  const query = String(prompt || "").toLowerCase().trim();
  const ranked = files
    .filter((file) => !taggedIds.has(file.id))
    .map((file) => {
      const haystack = `${file.name} ${file.tags.join(" ")} ${file.extractedText}`.toLowerCase();
      let score = 0;
      if (query && haystack.includes(query)) {
        score += 5;
      }
      for (const part of query.split(/\s+/).filter(Boolean)) {
        if (haystack.includes(part)) {
          score += 1;
        }
      }
      return { file, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.file);

  const citationLimit = normalizedTaggedIds.length > 0
    ? Math.max(4, Math.min(8, normalizedTaggedIds.length))
    : 4;
  const selectedFiles = [...taggedFiles, ...ranked].slice(0, citationLimit);
  const citations = selectedFiles.map((file) => ({
    id: file.id,
    label: file.name,
    excerpt: sanitizeCitationExcerpt(file.extractedText || ""),
  }));

  return {
    citations,
    taggedCitations: citations.filter((citation) => normalizedTaggedIds.includes(citation.id)),
  };
}

function waitMs(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sanitizeModelText(value) {
  return String(value ?? "")
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

function extractOpenRouterText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstMessage = choices[0]?.message?.content;
  if (typeof firstMessage === "string") {
    return sanitizeModelText(firstMessage);
  }

  if (Array.isArray(firstMessage)) {
    const joined = firstMessage
      .map((entry) => (entry && typeof entry.text === "string" ? entry.text : ""))
      .filter(Boolean)
      .join("\n");
    return sanitizeModelText(joined);
  }

  return "";
}

function extractGeminiText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const joined = parts
      .map((entry) => (entry && typeof entry.text === "string" ? entry.text : ""))
      .filter(Boolean)
      .join("\n");
    if (joined) {
      return sanitizeModelText(joined);
    }
  }

  return "";
}

function normalizeExternalSearchProvider(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "serper" || normalized === "google") {
    return "serper";
  }
  if (normalized === "brave") {
    return "brave";
  }
  if (normalized === "duckduckgo" || normalized === "ddg") {
    return "duckduckgo";
  }
  return "auto";
}

function sanitizeSearchSnippet(value) {
  return compactText(
    String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    280,
  );
}

function normalizeSearchQuery(query) {
  const raw = normalizePromptForIntent(query)
    .replace(/\b(use|do|please|just|kindly)\s+(an?\s+)?(external|web|google)\s+search\b/gi, " ")
    .replace(/\b(search (for|about))\b/gi, " ")
    .replace(/\b(from other sources|from google|online)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return compactText(raw || normalizePromptForIntent(query), 280);
}

function sanitizeSearchUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    return parsed.toString();
  } catch {
    return "";
  }
}

function dedupeSearchResults(results) {
  if (!Array.isArray(results)) {
    return [];
  }
  const deduped = [];
  const seenUrls = new Set();
  for (const result of results) {
    if (!result || typeof result !== "object") {
      continue;
    }
    const title = compactText(String(result.title || "").trim(), 140);
    const url = sanitizeSearchUrl(result.url);
    const snippet = sanitizeSearchSnippet(result.snippet);
    if (!title || !url || seenUrls.has(url)) {
      continue;
    }
    seenUrls.add(url);
    deduped.push({
      title,
      url,
      snippet: snippet || "No summary provided by search source.",
      source: String(result.source || "web"),
    });
    if (deduped.length >= EXTERNAL_SEARCH_MAX_RESULTS) {
      break;
    }
  }
  return deduped;
}

function extractSerperResults(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const results = [];
  const organic = Array.isArray(payload.organic) ? payload.organic : [];
  for (const item of organic) {
    if (!item || typeof item !== "object") {
      continue;
    }
    results.push({
      title: item.title,
      url: item.link,
      snippet: item.snippet || item.description || "",
      source: "serper",
    });
  }

  const answerBox = payload.answerBox && typeof payload.answerBox === "object" ? payload.answerBox : null;
  if (answerBox && results.length < EXTERNAL_SEARCH_MAX_RESULTS) {
    results.unshift({
      title: answerBox.title || "Google answer",
      url: answerBox.link || answerBox.url || "",
      snippet: answerBox.answer || answerBox.snippet || "",
      source: "serper",
    });
  }

  return dedupeSearchResults(results);
}

function extractBraveResults(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const webResults = Array.isArray(payload?.web?.results) ? payload.web.results : [];
  return dedupeSearchResults(
    webResults.map((item) => ({
      title: item?.title,
      url: item?.url,
      snippet: item?.description || item?.extra_snippets?.join(" ") || "",
      source: "brave",
    })),
  );
}

function flattenDuckDuckGoTopics(topics) {
  if (!Array.isArray(topics)) {
    return [];
  }

  const flattened = [];
  for (const topic of topics) {
    if (topic && Array.isArray(topic.Topics)) {
      flattened.push(...flattenDuckDuckGoTopics(topic.Topics));
      continue;
    }
    flattened.push(topic);
  }
  return flattened;
}

function extractDuckDuckGoResults(payload) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const results = [];
  if (payload.AbstractURL || payload.AbstractText) {
    results.push({
      title: payload.Heading || "DuckDuckGo result",
      url: payload.AbstractURL,
      snippet: payload.AbstractText || "",
      source: "duckduckgo",
    });
  }

  const topics = flattenDuckDuckGoTopics(payload.RelatedTopics);
  for (const topic of topics) {
    if (!topic || typeof topic !== "object") {
      continue;
    }
    results.push({
      title: topic.Text || "DuckDuckGo result",
      url: topic.FirstURL,
      snippet: topic.Text || "",
      source: "duckduckgo",
    });
  }

  return dedupeSearchResults(results);
}

async function requestSerperSearch(query) {
  if (!SERPER_API_KEY) {
    return [];
  }

  let attempt = 0;
  while (attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
    attempt += 1;
    try {
      const response = await fetchWithTimeout(
        SERPER_ENDPOINT,
        {
          method: "POST",
          headers: {
            "X-API-KEY": SERPER_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            q: query,
            num: EXTERNAL_SEARCH_MAX_RESULTS,
            autocorrect: true,
          }),
        },
        EXTERNAL_SEARCH_TIMEOUT_MS,
      );

      const payload = await response.json().catch(() => ({}));
      if (response.status === 429 && attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
        await waitMs(attempt * 600);
        continue;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
          await waitMs(attempt * 450);
          continue;
        }
        return [];
      }

      return extractSerperResults(payload);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
        await waitMs(attempt * 500);
        continue;
      }
      if (attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
        await waitMs(attempt * 450);
        continue;
      }
      return [];
    }
  }
  return [];
}

async function requestBraveSearch(query) {
  if (!BRAVE_SEARCH_API_KEY) {
    return [];
  }

  let attempt = 0;
  while (attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
    attempt += 1;
    try {
      const url = `${BRAVE_SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&count=${encodeURIComponent(
        String(EXTERNAL_SEARCH_MAX_RESULTS),
      )}`;
      const response = await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
          },
        },
        EXTERNAL_SEARCH_TIMEOUT_MS,
      );

      const payload = await response.json().catch(() => ({}));
      if (response.status === 429 && attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
        await waitMs(attempt * 600);
        continue;
      }
      if (!response.ok) {
        if (response.status >= 500 && attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
          await waitMs(attempt * 450);
          continue;
        }
        return [];
      }

      return extractBraveResults(payload);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
        await waitMs(attempt * 500);
        continue;
      }
      if (attempt < EXTERNAL_SEARCH_MAX_RETRIES) {
        await waitMs(attempt * 450);
        continue;
      }
      return [];
    }
  }
  return [];
}

async function requestDuckDuckGoSearch(query) {
  if (!query) {
    return [];
  }

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query,
    )}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
      EXTERNAL_SEARCH_TIMEOUT_MS,
    );
    if (!response.ok) {
      return [];
    }
    const payload = await response.json().catch(() => ({}));
    return extractDuckDuckGoResults(payload);
  } catch {
    return [];
  }
}

function buildExternalEvidenceSummary(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return "No external web evidence retrieved.";
  }

  return results
    .slice(0, EXTERNAL_SEARCH_MAX_RESULTS)
    .map((entry, index) => `${index + 1}. ${entry.title} (${entry.url}) - ${entry.snippet}`)
    .join("\n");
}

function buildExternalCitationId(url, index) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    return `web-${index + 1}`;
  }
  return `web-${index + 1}-${Buffer.from(normalized).toString("base64url").slice(0, 14)}`;
}

function buildExternalCitations(results) {
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  return results.slice(0, EXTERNAL_SEARCH_MAX_RESULTS).map((entry, index) => ({
    id: buildExternalCitationId(entry.url, index),
    label: `${entry.title} [web]`,
    excerpt: `${entry.snippet} (${entry.url})`,
  }));
}

async function runExternalSearch(query) {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const cacheKey = `${normalizeExternalSearchProvider(EXTERNAL_SEARCH_PROVIDER)}::${normalizedQuery.toLowerCase()}`;
  const cached = externalSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inFlight = externalSearchInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const pending = (async () => {
    const provider = normalizeExternalSearchProvider(EXTERNAL_SEARCH_PROVIDER);
    const searchOrder =
      provider === "serper"
        ? ["serper", "brave", "duckduckgo"]
        : provider === "brave"
          ? ["brave", "serper", "duckduckgo"]
          : provider === "duckduckgo"
            ? ["duckduckgo", "serper", "brave"]
            : SERPER_API_KEY
              ? ["serper", "brave", "duckduckgo"]
              : BRAVE_SEARCH_API_KEY
                ? ["brave", "serper", "duckduckgo"]
                : ["duckduckgo", "serper", "brave"];

    for (const engine of searchOrder) {
      const results =
        engine === "serper"
          ? await requestSerperSearch(normalizedQuery)
          : engine === "brave"
            ? await requestBraveSearch(normalizedQuery)
            : await requestDuckDuckGoSearch(normalizedQuery);

      if (Array.isArray(results) && results.length > 0) {
        externalSearchCache.set(cacheKey, {
          value: results,
          expiresAt: Date.now() + EXTERNAL_SEARCH_CACHE_TTL_MS,
        });
        return results;
      }
    }

    externalSearchCache.set(cacheKey, {
      value: [],
      expiresAt: Date.now() + 15_000,
    });
    return [];
  })().finally(() => {
    externalSearchInFlight.delete(cacheKey);
  });

  externalSearchInFlight.set(cacheKey, pending);
  return pending;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildCampaignSummary(campaign) {
  if (!campaign || typeof campaign !== "object") {
    return "No campaign selected.";
  }

  const audience =
    Array.isArray(campaign.audiences) && campaign.audiences.length > 0
      ? campaign.audiences.map((entry) => entry.segmentName).filter(Boolean).slice(0, 2).join(", ")
      : "not specified";

  return [
    `${campaign.campaign?.name || "Campaign"} in ${campaign.campaign?.country || "N/A"}`,
    `Desired behavior: ${campaign.behavior?.desiredBehavior || "N/A"}`,
    `Insight: ${compactText(campaign.insight?.insightText || "N/A", 180)}`,
    `Audience: ${audience}`,
    `Driver: ${compactText(campaign.driver?.driverText || "N/A", 120)}`,
  ].join(" | ");
}

async function buildRecentThreadSummary(campaignId, limit = 6, workspaceId = DEFAULT_WORKSPACE_ID) {
  const recent = (await getChatMessages(campaignId, workspaceId))
    .slice(-limit)
    .map((entry) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${compactText(entry.content, 240)}`);

  if (recent.length === 0) {
    return "No prior messages.";
  }
  return recent.join("\n");
}

function buildEvidenceSummary(citations) {
  if (!Array.isArray(citations) || citations.length === 0) {
    return "No document evidence available.";
  }
  const informative = citations.filter(
    (citation) =>
      citation?.excerpt &&
      !/text extraction is limited/i.test(String(citation.excerpt)) &&
      !/no extracted text available/i.test(String(citation.excerpt)),
  );
  if (informative.length === 0) {
    return "Documents are available, but extracted text is limited. Use explicit user questions and file titles for guidance.";
  }
  return informative
    .map((citation, index) => `${index + 1}. ${citation.label}: ${citation.excerpt}`)
    .join("\n");
}

function buildTaggedEvidenceSummary(taggedCitations) {
  if (!Array.isArray(taggedCitations) || taggedCitations.length === 0) {
    return "No tagged documents were selected for this request.";
  }
  return taggedCitations
    .filter((citation) => citation?.excerpt)
    .map((citation, index) => `${index + 1}. ${citation.label}: ${citation.excerpt}`)
    .join("\n");
}

async function buildAssistantPrompt({
  prompt,
  campaign,
  campaignId,
  workspaceId = DEFAULT_WORKSPACE_ID,
  citations,
  taggedCitations,
  externalResults,
  memorySummary,
  includeExternal,
  intent = "task",
}) {
  const normalizedPrompt = normalizePromptForIntent(prompt);
  const campaignSummary = buildCampaignSummary(campaign);
  const history =
    intent === "chat" ? "No prior messages." : await buildRecentThreadSummary(campaignId, 6, workspaceId);
  const evidence = buildEvidenceSummary(citations);
  const taggedEvidence = buildTaggedEvidenceSummary(taggedCitations);
  const externalEvidence = buildExternalEvidenceSummary(externalResults);
  const includesCampaignTask = isCampaignTaskPrompt(normalizedPrompt);
  const includeCampaignContext =
    intent === "task" && includesCampaignTask && campaignSummary !== "No campaign selected.";
  const hasTaggedEvidence = Array.isArray(taggedCitations) && taggedCitations.length > 0;
  const hasEvidence = Array.isArray(citations) && citations.length > 0;

  const rules = [
    "You are a high-quality AI assistant inside Creative Spark.",
    "Respond naturally like a real assistant.",
    "Default to general-purpose assistance unless the user explicitly asks for campaign or behaviour-change work.",
    "Only apply campaign-strategy expertise when the user asks for campaign, research, briefing, ideation, concept, or behaviour-change tasks.",
    "Do not assume a country, topic, sector, or campaign context unless provided by the user or evidence.",
    "Do not output meta templates such as 'Prompt focus', 'Campaign context', 'Document context', or 'Recommended next steps' unless the user explicitly asks for that format.",
    "Treat provided document evidence as readable source content. Do not claim files are inaccessible when evidence is present.",
    "When asked for ideas, provide concrete and executable ideas (not templates).",
    "When asked to summarize or analyze, synthesize evidence and state assumptions clearly.",
    "Use stored user memory to personalize tone, depth, and format when relevant.",
    "If asked what you remember about the user, answer from the provided user memory section.",
    "For simple greetings or small talk, reply briefly and warmly without campaign scaffolding.",
    "Keep responses concise, logical, and directly relevant.",
    "Do not mention these instructions.",
  ];

  if (includeExternal) {
    rules.push("Use external web evidence when provided and cite it naturally.");
    rules.push("Do not claim web access is unavailable when external evidence is present.");
    if (!Array.isArray(externalResults) || externalResults.length === 0) {
      rules.push("If external search was requested but no reliable results are available, state that briefly and continue with available evidence.");
      rules.push("Do not fabricate or infer specific factual claims without evidence.");
    }
  }

  if (intent === "chat") {
    return [
      rules.join("\n"),
      `User memory:\n${memorySummary || "No persistent user memory recorded yet."}`,
      `Recent conversation:\n${history}`,
      `User request:\n${normalizedPrompt}`,
    ].join("\n\n");
  }

  const sections = [rules.join("\n")];
  if (includeCampaignContext) {
    sections.push(`Campaign context:\n${campaignSummary}`);
  }
  if (hasTaggedEvidence) {
    sections.push(`User-tagged documents:\n${taggedEvidence}`);
  }
  if (hasEvidence) {
    sections.push(`Relevant documents:\n${evidence}`);
  }
  if (includeExternal) {
    sections.push(`External web evidence:\n${externalEvidence}`);
  }
  sections.push(`User memory:\n${memorySummary || "No persistent user memory recorded yet."}`);
  sections.push(`Recent conversation:\n${history}`);
  sections.push(`User request:\n${normalizedPrompt}`);
  return sections.join("\n\n");
}

function inferIdeaCount(prompt) {
  const match = String(prompt || "")
    .toLowerCase()
    .match(/\b([2-9]|10)\b/);
  if (!match) {
    return 3;
  }
  return Math.max(2, Math.min(10, Number(match[1])));
}

function buildDeterministicFallback({ prompt, campaign, citations, includeExternal, externalResults = [] }) {
  const normalizedPrompt = normalizePromptForIntent(prompt);
  const intent = classifyChatIntent(normalizedPrompt);
  const lower = normalizedPrompt.toLowerCase();
  const campaignTask = isCampaignTaskPrompt(normalizedPrompt);
  const audience =
    campaign?.audiences?.[0]?.segmentName ||
    campaign?.driver?.driverText ||
    "the primary target audience";
  const behavior = campaign?.behavior?.desiredBehavior || "the target behavior";
  const evidenceCue = citations[0]?.excerpt || "limited documented evidence available";
  const evidenceSummary = citations.length > 0
    ? citations.map((citation, index) => `${index + 1}. ${citation.excerpt}`).join(" ")
    : evidenceCue;
  const externalSummary = buildExternalEvidenceSummary(externalResults);
  const hasExternalEvidence = Array.isArray(externalResults) && externalResults.length > 0;

  if (intent === "chat") {
    return buildFastSocialReply(normalizedPrompt);
  }

  if (
    lower.includes("problem") ||
    lower.includes("challenge") ||
    lower.includes("issue") ||
    lower.includes("barrier")
  ) {
    if (!campaignTask) {
      return [
        `The core problem appears to be ${compactText(evidenceSummary, 240)}.`,
        "I can give a more specific diagnosis if you share the exact context, audience, and desired outcome.",
        includeExternal
          ? hasExternalEvidence
            ? `External evidence: ${compactText(externalSummary, 220)}.`
            : "External web search was requested but no reliable results were retrieved in this attempt."
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      `The core problem appears to be ${compactText(evidenceSummary, 240)}.`,
      `This mainly affects ${audience} and lowers adoption of ${behavior}.`,
      "The practical implication is a trust and confidence gap, not just an information gap.",
      includeExternal
        ? hasExternalEvidence
          ? `External evidence: ${compactText(externalSummary, 220)}.`
          : "External web search was requested but no reliable results were retrieved in this attempt."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (lower.includes("summar")) {
    if (!campaignTask) {
      return [
        `Here is a concise summary based on current context: ${compactText(evidenceSummary, 240)}.`,
        "Share the exact output format you want (bullet summary, executive brief, or action plan) and I will tailor it.",
        includeExternal
          ? hasExternalEvidence
            ? `External evidence: ${compactText(externalSummary, 220)}.`
            : "External web search was requested but no reliable results were retrieved in this attempt."
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      `Here is a concise summary: the core audience is ${audience}, and the target behavior is ${behavior}.`,
      `Key evidence points to ${compactText(evidenceCue, 160)}.`,
      "The strongest communication angle is trust plus visible proof from credible local messengers.",
      includeExternal
        ? hasExternalEvidence
          ? `External evidence: ${compactText(externalSummary, 220)}.`
          : "External web search was requested but no reliable results were retrieved in this attempt."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (lower.includes("analys") || lower.includes("analyz")) {
    if (!campaignTask) {
      return [
        `Quick analysis: ${compactText(evidenceSummary, 220)}.`,
        "To make this precise, share your decision goal and constraints and I will return a focused recommendation.",
        includeExternal
          ? hasExternalEvidence
            ? `External evidence: ${compactText(externalSummary, 220)}.`
            : "External web search was requested but no reliable results were retrieved in this attempt."
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    return [
      `Quick analysis: there is a confidence gap around ${behavior}.`,
      "Use trusted messengers and visible proof of success to reduce perceived risk.",
      "Run two rapid variants (surprise-led vs identity-led), measure completion, then scale the winner.",
      `Evidence anchor: ${compactText(evidenceCue, 150)}.`,
    ].join(" ");
  }

  if (lower.includes("idea")) {
    const requested = inferIdeaCount(prompt);
    if (!campaignTask) {
      const generalIdeas = [
        "Flip the assumption: list the accepted rule, then design one safe opposite experiment and test it in 48 hours.",
        "Borrow from another domain: copy a proven mechanic from gaming, retail, or education and adapt it to this challenge.",
        "Prototype in public: publish two lightweight options and let real users vote with behavior, not opinion.",
        "Constraint-first ideation: design the strongest solution assuming half the budget and half the time.",
        "Reverse journey mapping: start from the desired end state and map the minimum irreversible steps backward.",
      ];
      return generalIdeas
        .slice(0, requested)
        .map((idea, index) => `${index + 1}. ${idea}`)
        .join("\n");
    }

    const baseIdeas = [
      `Turn trusted elders into public advocates: record 30-second endorsements from grandmothers who already adopted ${behavior}, then play them before clinic sessions.`,
      `Use a "proof-first passport": each completed step of ${behavior} unlocks a visible stamp and a small social recognition moment in local groups.`,
      `Run myth-to-proof market pop-ups: health workers answer one myth live, then demonstrate one immediate action mothers can take the same day.`,
      `Create a neighbor challenge: mothers commit in pairs and get reminder prompts tied to local event days to reduce drop-off.`,
      `Swap fear messaging for pride cues: frame ${behavior} as a mark of responsible leadership in the household.`,
    ];

    return baseIdeas
      .slice(0, requested)
      .map((idea, index) => `${index + 1}. ${idea}`)
      .join("\n");
  }

  if (!campaignTask) {
    return [
      "I can help with that.",
      "Share the exact outcome you want (direct answer, analysis, summary, plan, rewrite, or ideas), and I will respond directly.",
      citations.length > 0 ? `Available evidence anchor: ${compactText(evidenceSummary, 200)}.` : "",
      includeExternal && hasExternalEvidence ? `External evidence: ${compactText(externalSummary, 220)}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Practical next step: define one explicit action for ${audience} and test it against ${behavior}.`,
    `Current evidence anchor: ${compactText(evidenceSummary, 200)}.`,
    includeExternal
      ? hasExternalEvidence
        ? `External evidence: ${compactText(externalSummary, 220)}.`
        : "External web search was requested but no reliable results were retrieved in this attempt."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function requestOpenRouterCompletion(modelPrompt) {
  const normalizedPrompt = compactText(String(modelPrompt || "").trim(), CHAT_PROMPT_LIMIT);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!normalizedPrompt || !apiKey) {
    return null;
  }
  const cacheKey = `openrouter::${normalizedPrompt}`;

  const cached = chatResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inFlight = chatInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const pending = (async () => {
    let attempt = 0;
    while (attempt < OPENROUTER_MAX_RETRIES) {
      attempt += 1;
      try {
        const response = await fetchWithTimeout(
          OPENROUTER_ENDPOINT,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": OPENROUTER_APP_URL,
              "X-Title": OPENROUTER_APP_NAME,
            },
            body: JSON.stringify({
              model: OPENROUTER_MODEL,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a helpful, accurate AI assistant. Respond clearly and directly. Use campaign-strategy expertise only when the user explicitly asks for campaign or behaviour-change work.",
                },
                {
                  role: "user",
                  content: normalizedPrompt,
                },
              ],
              temperature: 0.7,
              max_tokens: OPENROUTER_MAX_TOKENS,
            }),
          },
          OPENROUTER_TIMEOUT_MS,
        );

        const payload = await response.json().catch(() => ({}));

        if (response.status === 429 && attempt < OPENROUTER_MAX_RETRIES) {
          await waitMs(attempt * 1_200);
          continue;
        }

        if (!response.ok) {
          if (response.status >= 500 && attempt < OPENROUTER_MAX_RETRIES) {
            await waitMs(attempt * 700);
            continue;
          }
          return null;
        }

        const generatedText = extractOpenRouterText(payload);
        if (!generatedText) {
          if (attempt < OPENROUTER_MAX_RETRIES) {
            await waitMs(attempt * 600);
            continue;
          }
          return null;
        }

        chatResponseCache.set(cacheKey, {
          value: generatedText,
          expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
        });
        return generatedText;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError" && attempt < OPENROUTER_MAX_RETRIES) {
          await waitMs(attempt * 900);
          continue;
        }
        if (attempt < OPENROUTER_MAX_RETRIES) {
          await waitMs(attempt * 700);
          continue;
        }
        return null;
      }
    }
    return null;
  })().finally(() => {
    chatInFlight.delete(cacheKey);
  });

  chatInFlight.set(cacheKey, pending);
  return pending;
}

async function requestGeminiCompletion(modelPrompt) {
  const normalizedPrompt = compactText(String(modelPrompt || "").trim(), CHAT_PROMPT_LIMIT);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!normalizedPrompt || !apiKey) {
    return null;
  }
  const cacheKey = `gemini::${normalizedPrompt}`;

  const cached = chatResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const inFlight = chatInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const pending = (async () => {
    let attempt = 0;
    while (attempt < GEMINI_MAX_RETRIES) {
      attempt += 1;
      try {
        const endpoint = `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(
          GEMINI_MODEL,
        )}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const response = await fetchWithTimeout(
          endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: normalizedPrompt }],
                },
              ],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
              },
            }),
          },
          GEMINI_TIMEOUT_MS,
        );

        const payload = await response.json().catch(() => ({}));

        if (response.status === 429 && attempt < GEMINI_MAX_RETRIES) {
          await waitMs(attempt * 1_200);
          continue;
        }

        if (!response.ok) {
          if (response.status >= 500 && attempt < GEMINI_MAX_RETRIES) {
            await waitMs(attempt * 700);
            continue;
          }
          return null;
        }

        const generatedText = extractGeminiText(payload);
        if (!generatedText) {
          if (attempt < GEMINI_MAX_RETRIES) {
            await waitMs(attempt * 600);
            continue;
          }
          return null;
        }

        chatResponseCache.set(cacheKey, {
          value: generatedText,
          expiresAt: Date.now() + CHAT_CACHE_TTL_MS,
        });
        return generatedText;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError" && attempt < GEMINI_MAX_RETRIES) {
          await waitMs(attempt * 900);
          continue;
        }
        if (attempt < GEMINI_MAX_RETRIES) {
          await waitMs(attempt * 700);
          continue;
        }
        return null;
      }
    }
    return null;
  })().finally(() => {
    chatInFlight.delete(cacheKey);
  });

  chatInFlight.set(cacheKey, pending);
  return pending;
}

async function requestProviderCompletion(provider, modelPrompt) {
  const primary = normalizeAiProvider(provider);
  const secondary = primary === "gemini" ? "openrouter" : "gemini";

  const primaryResult =
    primary === "gemini"
      ? await requestGeminiCompletion(modelPrompt)
      : await requestOpenRouterCompletion(modelPrompt);

  if (primaryResult) {
    return {
      content: primaryResult,
      providerUsed: primary,
    };
  }

  const secondaryResult =
    secondary === "gemini"
      ? await requestGeminiCompletion(modelPrompt)
      : await requestOpenRouterCompletion(modelPrompt);

  if (secondaryResult) {
    return {
      content: secondaryResult,
      providerUsed: secondary,
    };
  }

  return {
    content: null,
    providerUsed: primary,
  };
}

async function buildChatResponse({
  prompt,
  campaign,
  campaignId,
  includeExternal,
  provider,
  taggedDocumentIds,
  workspaceId = DEFAULT_WORKSPACE_ID,
}) {
  const mergedMemory = await getMergedUserMemory(campaignId, workspaceId);
  const memorySummary = buildMemorySummary(mergedMemory);

  if (isNameRecallPrompt(prompt)) {
    let knownName = mergedMemory?.profile?.displayName || "";
    if (!knownName) {
      const inferredFromHistory = await inferDisplayNameFromChatHistory(campaignId, workspaceId);
      if (inferredFromHistory) {
        knownName =
          (await persistDisplayNameToMemory(campaignId, inferredFromHistory, workspaceId)) ||
          inferredFromHistory;
      }
    }
    if (knownName) {
      return {
        content: `Yes. I remember your name as ${knownName}.`,
        citations: [],
        providerUsed: "memory",
      };
    }
    return {
      content: "I don’t have your name saved yet. Tell me \"My name is ...\" and I’ll remember it for future chats.",
      citations: [],
      providerUsed: "memory",
    };
  }

  if (isMemoryCapabilityPrompt(prompt)) {
    return {
      content:
        "Yes. I keep persistent chat memory for your preferences and key details so I can adapt responses across sessions. You can tell me updates at any time and I will use them in future replies.",
      citations: [],
      providerUsed: "memory",
    };
  }

  const intent = classifyChatIntent(prompt);
  if (intent === "chat") {
    if (shouldUseLocalSocialReply(prompt)) {
      return {
        content: buildFastSocialReply(prompt),
        citations: [],
        providerUsed: "local",
      };
    }

    const assistantPrompt = await buildAssistantPrompt({
      prompt,
      campaign: null,
      campaignId,
      workspaceId,
      citations: [],
      taggedCitations: [],
      externalResults: [],
      memorySummary,
      includeExternal: false,
      intent,
    });
    const providerResult = await requestProviderCompletion(provider, assistantPrompt);
    return {
      content: providerResult.content || buildFastSocialReply(prompt),
      citations: [],
      providerUsed: providerResult.content ? providerResult.providerUsed : "local",
    };
  }

  const includeDocumentContext = shouldUseDocumentContext(prompt, taggedDocumentIds);
  const citationsPromise = includeDocumentContext
    ? buildChatCitations(prompt, campaignId, taggedDocumentIds, workspaceId)
    : Promise.resolve({ citations: [], taggedCitations: [] });
  const externalSearchPromise = includeExternal ? runExternalSearch(prompt) : Promise.resolve([]);
  const [{ citations, taggedCitations }, externalResults] = await Promise.all([
    citationsPromise,
    externalSearchPromise,
  ]);

  const assistantPrompt = await buildAssistantPrompt({
    prompt,
    campaign,
    campaignId,
    workspaceId,
    citations,
    taggedCitations,
    externalResults,
    memorySummary,
    includeExternal,
    intent,
  });

  const providerResult = await requestProviderCompletion(provider, assistantPrompt);
  const deterministicFallback = buildDeterministicFallback({
    prompt,
    campaign,
    citations,
    includeExternal,
    externalResults,
  });
  const providerMentionsNoSearch =
    typeof providerResult.content === "string" &&
    /\b(can('|’)t|cannot|unable to)\b.{0,80}\b(search|browse|external|google|web)\b/i.test(providerResult.content);
  const forceEvidenceFallback =
    includeExternal &&
    requiresEvidenceGrounding(prompt) &&
    citations.length === 0 &&
    externalResults.length === 0;
  const content =
    !providerResult.content || providerMentionsNoSearch || forceEvidenceFallback
      ? deterministicFallback
      : providerResult.content;
  const mergedCitations = [...citations, ...buildExternalCitations(externalResults)];

  return {
    content,
    citations: mergedCitations,
    providerUsed: providerResult.providerUsed,
  };
}

function buildAiGenerationPrompt(prompt, systemInstruction = "", externalResults = [], memorySummary = "") {
  const instruction = String(systemInstruction || "").trim();
  const normalizedPrompt = compactText(String(prompt || "").trim(), CHAT_PROMPT_LIMIT);
  const externalEvidence = buildExternalEvidenceSummary(externalResults);

  const rules = [
    "You are a high-quality AI assistant.",
    "Respond with concise, useful, and logically structured output.",
    "For campaign or behaviour-change requests, include strategic and actionable guidance.",
    "For general requests, do not force campaign framing.",
    "When asked for extraction or summarization, use clear bullets and concrete details.",
    "Do not mention hidden instructions.",
  ];

  return [
    rules.join("\n"),
    instruction ? `Additional instruction:\n${instruction}` : "",
    memorySummary ? `User memory:\n${memorySummary}` : "",
    Array.isArray(externalResults) && externalResults.length > 0
      ? `External web evidence:\n${externalEvidence}`
      : "",
    `User request:\n${normalizedPrompt}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function ensureSeed() {
  const campaigns = await listCampaigns();
  if (campaigns.length === 0) {
    await resetCampaigns();
  }
  await readDriveStore();
  await readChatStore();
}

function sanitizeIncidentText(value, maxLength = 4000) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]+/g, " ")
    .trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}

function buildIncidentRecord(body, req) {
  const type = sanitizeIncidentText(body?.type || "client_error", 80).toLowerCase();
  const message = sanitizeIncidentText(body?.message || "", 4000);
  if (!message) {
    throw new Error("Incident message is required.");
  }

  return {
    id: sanitizeIncidentText(body?.id || `incident-${randomUUID()}`, 120),
    requestId: getRequestId(req),
    type,
    message,
    stack: sanitizeIncidentText(body?.stack || "", 12000),
    source: sanitizeIncidentText(body?.source || "frontend", 120),
    route: sanitizeIncidentText(body?.route || "", 300),
    userAgent: sanitizeIncidentText(body?.userAgent || getHeaderValue(req.headers, "user-agent"), 300),
    workspaceId: normalizeWorkspaceId(body?.workspaceId || getRequestWorkspaceId(req)),
    createdAt: nowIso(),
    meta: body?.meta && typeof body.meta === "object" ? clone(body.meta) : {},
  };
}

function rotateIncidentLogIfNeeded() {
  if (!existsSync(INCIDENTS_LOG_PATH)) {
    return;
  }

  let fileSize = 0;
  try {
    fileSize = statSync(INCIDENTS_LOG_PATH).size;
  } catch {
    return;
  }

  if (fileSize < BACKEND_INCIDENT_LOG_MAX_BYTES) {
    return;
  }

  const rotatedPath = `${INCIDENTS_LOG_PATH}.${Date.now()}.bak`;
  try {
    renameSync(INCIDENTS_LOG_PATH, rotatedPath);
  } catch {
    // noop
  }
}

function normalizeIncidentCreatedAtForMysql(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) {
    return nowIso().slice(0, 23).replace("T", " ");
  }
  return parsed.toISOString().slice(0, 23).replace("T", " ");
}

async function persistIncidentRecord(record, workspaceId = DEFAULT_WORKSPACE_ID) {
  const normalizedWorkspaceId = normalizeWorkspaceId(record?.workspaceId || workspaceId);
  const incident = {
    ...(record || {}),
    workspaceId: normalizedWorkspaceId,
  };

  if (isMysqlStorageEnabled()) {
    try {
      await ensureMysqlSchema();
      const pool = await getMysqlPool();
      if (pool) {
        const metaJson =
          incident.meta && typeof incident.meta === "object"
            ? JSON.stringify(incident.meta)
            : null;
        await pool.execute(
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
            String(incident.id || `incident-${randomUUID()}`).slice(0, 120),
            String(incident.requestId || "").slice(0, 128),
            normalizedWorkspaceId,
            String(incident.type || "client_error").slice(0, 80),
            String(incident.message || "").slice(0, 4000),
            String(incident.stack || ""),
            String(incident.source || "frontend").slice(0, 120),
            String(incident.route || "").slice(0, 300),
            String(incident.userAgent || "").slice(0, 300),
            metaJson,
            normalizeIncidentCreatedAtForMysql(incident.createdAt),
          ],
        );
        return;
      }
    } catch {
      // Fallback to file persistence when MySQL is unavailable.
    }
  }

  if (!BACKEND_INCIDENT_LOG_ENABLED) {
    return;
  }

  mkdirSync(dirname(INCIDENTS_LOG_PATH), { recursive: true });
  rotateIncidentLogIfNeeded();
  appendFileSync(INCIDENTS_LOG_PATH, `${JSON.stringify(incident)}\n`, "utf8");
}

function parsePositiveInteger(value, fallbackValue, maxValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return Math.min(Math.floor(parsed), maxValue);
}

function parseNonNegativeInteger(value, fallbackValue, maxValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallbackValue;
  }
  return Math.min(Math.floor(parsed), maxValue);
}

function normalizeFilterText(value, maxLength = 160) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, maxLength);
}

function statusMatchesClass(statusCode, statusClass) {
  if (!Number.isFinite(statusCode)) {
    return false;
  }

  if (statusClass === "2xx") {
    return statusCode >= 200 && statusCode < 300;
  }
  if (statusClass === "4xx") {
    return statusCode >= 400 && statusCode < 500;
  }
  if (statusClass === "5xx") {
    return statusCode >= 500 && statusCode < 600;
  }
  return true;
}

async function readRecentIncidents(options = {}) {
  const limit = parsePositiveInteger(
    options.limit,
    TELEMETRY_INCIDENT_DEFAULT_LIMIT,
    TELEMETRY_INCIDENT_MAX_LIMIT,
  );
  const offset = parseNonNegativeInteger(options.offset, 0, 1_000_000);
  const query = normalizeFilterText(options.query, 300);
  const type = normalizeFilterText(options.type, 80);
  const source = normalizeFilterText(options.source, 120);
  const requestId = normalizeFilterText(options.requestId, 120);
  const route = normalizeFilterText(options.route, 220);
  const workspaceId = normalizeFilterText(options.workspaceId, 64) || DEFAULT_WORKSPACE_ID;

  if (isMysqlStorageEnabled()) {
    try {
      await ensureMysqlSchema();
      const pool = await getMysqlPool();
      if (pool) {
        const where = ["workspace_id = ?"];
        const params = [workspaceId];

        if (type) {
          where.push("LOWER(type) = ?");
          params.push(type);
        }
        if (source) {
          where.push("LOWER(source) = ?");
          params.push(source);
        }
        if (requestId) {
          where.push("LOWER(request_id) = ?");
          params.push(requestId);
        }
        if (route) {
          where.push("LOWER(route) LIKE ?");
          params.push(`%${route}%`);
        }
        if (query) {
          where.push(
            "LOWER(CONCAT(id, ' ', request_id, ' ', message, ' ', route, ' ', type, ' ', source)) LIKE ?",
          );
          params.push(`%${query}%`);
        }

        const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
        const [countRows] = await pool.execute(
          `SELECT COUNT(*) AS total FROM telemetry_incidents ${whereSql}`,
          params,
        );
        const total = Array.isArray(countRows) && countRows.length > 0 ? Number(countRows[0].total || 0) : 0;

        const [rows] = await pool.execute(
          `
            SELECT
              id,
              request_id,
              workspace_id,
              type,
              message,
              stack,
              source,
              route,
              user_agent,
              meta_json,
              created_at
            FROM telemetry_incidents
            ${whereSql}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
          `,
          [...params, limit, offset],
        );

        const items = Array.isArray(rows)
          ? rows.map((row) => {
              let parsedMeta = {};
              if (typeof row.meta_json === "string" && row.meta_json.trim()) {
                try {
                  parsedMeta = JSON.parse(row.meta_json);
                } catch {
                  parsedMeta = {};
                }
              }
              const createdAtValue =
                row.created_at instanceof Date
                  ? row.created_at.toISOString()
                  : String(row.created_at || "");
              return {
                id: String(row.id || ""),
                requestId: String(row.request_id || ""),
                workspaceId: String(row.workspace_id || DEFAULT_WORKSPACE_ID),
                type: String(row.type || ""),
                message: String(row.message || ""),
                stack: String(row.stack || ""),
                source: String(row.source || ""),
                route: String(row.route || ""),
                userAgent: String(row.user_agent || ""),
                meta: parsedMeta,
                createdAt: createdAtValue,
              };
            })
          : [];

        return {
          items,
          total,
          offset,
          limit,
          hasMore: offset + items.length < total,
        };
      }
    } catch {
      // Fallback to file-backed incidents when MySQL query fails.
    }
  }

  if (!existsSync(INCIDENTS_LOG_PATH)) {
    return { items: [], total: 0 };
  }

  const raw = readFileSync(INCIDENTS_LOG_PATH, "utf8");
  if (!raw.trim()) {
    return { items: [], total: 0 };
  }

  const parsed = raw
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
    .filter(Boolean)
    .filter((incident) => {
      const incidentType = normalizeFilterText(incident?.type, 80);
      const incidentSource = normalizeFilterText(incident?.source, 120);
      const incidentRequestId = normalizeFilterText(incident?.requestId, 120);
      const incidentRoute = normalizeFilterText(incident?.route, 220);
      const incidentWorkspaceId =
        normalizeFilterText(incident?.workspaceId, 64) || DEFAULT_WORKSPACE_ID;

      if (incidentWorkspaceId !== workspaceId) {
        return false;
      }
      if (type && incidentType !== type) {
        return false;
      }
      if (source && incidentSource !== source) {
        return false;
      }
      if (requestId && incidentRequestId !== requestId) {
        return false;
      }
      if (route && !incidentRoute.includes(route)) {
        return false;
      }
      if (query) {
        const haystack = normalizeFilterText(
          `${incident?.id || ""} ${incidentRequestId} ${incident?.message || ""} ${incidentRoute} ${incidentType} ${incidentSource}`,
          8000,
        );
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });

  const ordered = parsed.slice().reverse();
  const items = ordered.slice(offset, offset + limit);

  return {
    items,
    total: parsed.length,
    offset,
    limit,
    hasMore: offset + items.length < parsed.length,
  };
}

function listRecentRequestEvents(options = {}) {
  const limit = parsePositiveInteger(
    options.limit,
    TELEMETRY_INCIDENT_DEFAULT_LIMIT,
    TELEMETRY_REQUEST_EVENTS_LIMIT,
  );
  const offset = parseNonNegativeInteger(options.offset, 0, 1_000_000);
  const query = normalizeFilterText(options.query, 300);
  const event = normalizeFilterText(options.event, 80);
  const method = normalizeFilterText(options.method, 12);
  const path = normalizeFilterText(options.path, 220);
  const requestId = normalizeFilterText(options.requestId, 120);
  const statusClass = normalizeFilterText(options.statusClass, 8);

  const filtered = recentRequestEvents.filter((item) => {
    const itemEvent = normalizeFilterText(item?.event, 80);
    const itemMethod = normalizeFilterText(item?.method, 12);
    const itemPath = normalizeFilterText(item?.path, 400);
    const itemRequestId = normalizeFilterText(item?.requestId, 120);
    const itemStatus = Number(item?.statusCode);

    if (event && itemEvent !== event) {
      return false;
    }
    if (method && itemMethod !== method) {
      return false;
    }
    if (requestId && itemRequestId !== requestId) {
      return false;
    }
    if (path && !itemPath.includes(path)) {
      return false;
    }
    if (statusClass && statusClass !== "all" && !statusMatchesClass(itemStatus, statusClass)) {
      return false;
    }
    if (query) {
      const haystack = normalizeFilterText(
        `${itemRequestId} ${itemMethod} ${itemPath} ${itemEvent} ${item?.error || ""} ${itemStatus || ""}`,
        2000,
      );
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });

  const ordered = filtered.slice().reverse();
  const items = ordered.slice(offset, offset + limit);

  return {
    items,
    total: filtered.length,
    offset,
    limit,
    hasMore: offset + items.length < filtered.length,
  };
}

function sendJson(req, res, status, payload) {
  const origin = getRequestOrigin(req);
  const requestId = getRequestId(req);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": buildCorsAllowHeaders(req),
    "Access-Control-Expose-Headers": "X-Request-Id",
    Vary: "Origin",
    "X-Request-Id": requestId,
  };

  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
  logRequestComplete(req, status);
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

const server = createServer(async (req, res) => {
  req.__requestContext = createRequestContext(req);
  logRequestStart(req);

  if (!req.url || !req.method) {
    sendJson(req, res, 400, { error: "Bad request" });
    return;
  }

  const requestOrigin = getRequestOrigin(req);
  if (!isOriginAllowed(requestOrigin)) {
    sendJson(req, res, 403, { error: "Origin not allowed" });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(req, res, 200, { ok: true });
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    sendJson(req, res, 400, { error: "Invalid request URL" });
    return;
  }
  const pathname = url.pathname;
  req.__requestContext.path = pathname;
  const isApiPath = pathname.startsWith("/api/");
  const isRealtimeStreamPath = pathname === "/api/realtime/stream";

  if (isApiPath && !checkRateLimit(req)) {
    sendJson(req, res, 429, { error: "Rate limit exceeded. Please retry shortly." });
    return;
  }

  if (isApiPath && !(isRealtimeStreamPath ? isAuthorizedRealtimeRequest(req, url) : isAuthorizedRequest(req))) {
    sendJson(req, res, 401, { error: "Unauthorized" });
    return;
  }

  try {
    if (req.method === "GET" && pathname === "/health") {
      sendJson(req, res, 200, { ok: true, service: "campaign-backend", timestamp: nowIso() });
      return;
    }

    if (req.method === "POST" && pathname === "/api/system/refresh-signal") {
      const body = await readRequestJson(req);
      const reason = hasText(body?.reason) ? String(body.reason).trim() : "System requested refresh";
      const source = hasText(body?.source) ? String(body.source).trim() : "system";
      const delayMs = body?.delayMs;
      const result = broadcastRefreshSignal(reason, source, delayMs);
      sendJson(req, res, 200, {
        success: true,
        connectedClients: result.connected,
        deliveredClients: result.sent,
        signal: result.payload,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/realtime/stream") {
      openRealtimeStream(req, res, url);
      return;
    }

    if (req.method === "GET" && pathname === "/api/drive/entries") {
      const workspaceId = getRequestWorkspaceId(req);
      const folderId = parseNullableFolderId(url.searchParams.get("folderId"));
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      const query = url.searchParams.get("query") ?? "";
      sendJson(req, res, 200, await listDriveEntries(folderId, query, campaignId, workspaceId));
      return;
    }

    if (req.method === "GET" && pathname === "/api/drive/folders") {
      const workspaceId = getRequestWorkspaceId(req);
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      sendJson(req, res, 200, await listDriveFolders(campaignId, workspaceId));
      return;
    }

    if (req.method === "GET" && pathname === "/api/drive/breadcrumbs") {
      const workspaceId = getRequestWorkspaceId(req);
      const folderId = parseNullableFolderId(url.searchParams.get("folderId"));
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      sendJson(req, res, 200, await getDriveBreadcrumbs(folderId, campaignId, workspaceId));
      return;
    }

    if (req.method === "GET" && pathname === "/api/drive/files") {
      const workspaceId = getRequestWorkspaceId(req);
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      sendJson(req, res, 200, await listDriveFiles(campaignId, workspaceId));
      return;
    }

    if (req.method === "POST" && pathname === "/api/ai/generate") {
      const body = await readRequestJson(req);
      const prompt = String(body?.prompt ?? "").trim();
      if (!prompt) {
        sendJson(req, res, 400, { success: false, result: "Missing field: prompt." });
        return;
      }

      const campaignId = parseNullableFolderId(body?.campaignId);
      const workspaceId = getRequestWorkspaceId(req);
      await updateChatMemoryFromUserPrompt(campaignId, prompt, workspaceId);
      const mergedMemory = await getMergedUserMemory(campaignId, workspaceId);
      if (isNameRecallPrompt(prompt)) {
        let knownName = mergedMemory?.profile?.displayName || "";
        if (!knownName) {
          const inferredFromHistory = await inferDisplayNameFromChatHistory(campaignId, workspaceId);
          if (inferredFromHistory) {
            knownName =
              (await persistDisplayNameToMemory(campaignId, inferredFromHistory, workspaceId)) ||
              inferredFromHistory;
          }
        }
        sendJson(req, res, 200, {
          success: true,
          result: knownName
            ? `Yes. I remember your name as ${knownName}.`
            : "I don’t have your name saved yet. Tell me \"My name is ...\" and I’ll remember it for future chats.",
          provider: "memory",
          fallback: false,
        });
        return;
      }
      if (isMemoryCapabilityPrompt(prompt)) {
        sendJson(req, res, 200, {
          success: true,
          result:
            "Yes. I keep persistent chat memory for your preferences and key details so I can adapt responses across sessions. You can tell me updates at any time and I will use them in future replies.",
          provider: "memory",
          fallback: false,
        });
        return;
      }

      const provider = normalizeAiProvider(body?.provider || AI_PROVIDER_DEFAULT);
      const systemInstruction = typeof body?.systemInstruction === "string" ? body.systemInstruction : "";
      const includeExternal = Boolean(body?.includeExternal);
      const externalResults = includeExternal ? await runExternalSearch(prompt) : [];
      const memorySummary = buildMemorySummary(mergedMemory);
      const modelPrompt = buildAiGenerationPrompt(prompt, systemInstruction, externalResults, memorySummary);

      let providerResult;
      try {
        providerResult = await requestProviderCompletion(provider, modelPrompt);
      } catch {
        providerResult = { content: null, providerUsed: provider };
      }

      const fallbackResult = buildDeterministicFallback({
        prompt,
        campaign: null,
        citations: [],
        includeExternal: false,
        externalResults: [],
      });

      sendJson(req, res, 200, {
        success: true,
        result: providerResult.content || fallbackResult,
        provider: providerResult.providerUsed || provider,
        fallback: !providerResult.content,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/drive/folders") {
      const workspaceId = getRequestWorkspaceId(req);
      const body = await readRequestJson(req);
      const folder = await createDriveFolder(
        body?.name,
        parseNullableFolderId(body?.parentId),
        parseNullableFolderId(body?.campaignId),
        workspaceId,
      );
      sendJson(req, res, 201, folder);
      return;
    }

    if (req.method === "POST" && pathname === "/api/drive/files") {
      const workspaceId = getRequestWorkspaceId(req);
      const body = await readRequestJson(req);
      const file = await uploadDriveFile(
        body,
        parseNullableFolderId(body?.folderId),
        parseNullableFolderId(body?.campaignId),
        workspaceId,
      );
      sendJson(req, res, 201, file);
      return;
    }

    const driveRenameMatch = pathname.match(/^\/api\/drive\/entries\/([^/]+)\/rename$/);
    if (driveRenameMatch && req.method === "PATCH") {
      const workspaceId = getRequestWorkspaceId(req);
      const id = decodeURIComponent(driveRenameMatch[1]);
      const body = await readRequestJson(req);
      const entry = await renameDriveEntry(
        id,
        body?.name,
        parseNullableFolderId(body?.campaignId),
        workspaceId,
      );
      if (!entry) {
        sendJson(req, res, 404, { error: "Drive entry not found" });
        return;
      }
      sendJson(req, res, 200, entry);
      return;
    }

    const driveMoveMatch = pathname.match(/^\/api\/drive\/entries\/([^/]+)\/move$/);
    if (driveMoveMatch && req.method === "PATCH") {
      const workspaceId = getRequestWorkspaceId(req);
      const id = decodeURIComponent(driveMoveMatch[1]);
      const body = await readRequestJson(req);
      const destinationFolderId = parseNullableFolderId(body?.destinationFolderId);
      const entry = await moveDriveEntry(
        id,
        destinationFolderId,
        parseNullableFolderId(body?.campaignId),
        workspaceId,
      );
      if (!entry) {
        sendJson(req, res, 404, { error: "Drive entry not found" });
        return;
      }
      sendJson(req, res, 200, entry);
      return;
    }

    const driveDeleteMatch = pathname.match(/^\/api\/drive\/entries\/([^/]+)$/);
    if (driveDeleteMatch && req.method === "DELETE") {
      const workspaceId = getRequestWorkspaceId(req);
      const id = decodeURIComponent(driveDeleteMatch[1]);
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      sendJson(req, res, 200, { deleted: await deleteDriveEntry(id, campaignId, workspaceId) });
      return;
    }

    if (req.method === "GET" && pathname === "/api/chat/messages") {
      const workspaceId = getRequestWorkspaceId(req);
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      sendJson(req, res, 200, await getChatMessages(campaignId, workspaceId));
      return;
    }

    if (req.method === "DELETE" && pathname === "/api/chat/messages") {
      const workspaceId = getRequestWorkspaceId(req);
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      sendJson(req, res, 200, await clearChatMessages(campaignId, workspaceId));
      return;
    }

    if (req.method === "GET" && pathname === "/api/chat/memory") {
      const workspaceId = getRequestWorkspaceId(req);
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      sendJson(req, res, 200, await getChatMemorySnapshot(campaignId, workspaceId));
      return;
    }

    if (req.method === "DELETE" && pathname === "/api/chat/memory") {
      const workspaceId = getRequestWorkspaceId(req);
      const campaignId = parseNullableFolderId(url.searchParams.get("campaignId"));
      sendJson(req, res, 200, await clearChatMemory(campaignId, workspaceId));
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/messages") {
      const workspaceId = getRequestWorkspaceId(req);
      const body = await readRequestJson(req);
      const campaignId = parseNullableFolderId(body?.campaignId);
      const message = {
        id: typeof body?.message?.id === "string" ? body.message.id : createChatMessageId(),
        role: body?.message?.role === "assistant" ? "assistant" : "user",
        content: String(body?.message?.content ?? ""),
        createdAt: typeof body?.message?.createdAt === "string" ? body.message.createdAt : nowIso(),
        citations: Array.isArray(body?.message?.citations) ? body.message.citations : [],
      };
      sendJson(req, res, 201, await appendChatMessage(campaignId, message, workspaceId));
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/turn") {
      const workspaceId = getRequestWorkspaceId(req);
      const body = await readRequestJson(req);
      const prompt = String(body?.prompt ?? "").trim();
      if (!prompt) {
        sendJson(req, res, 400, { error: "Prompt is required" });
        return;
      }

      const campaign = body?.campaign && typeof body.campaign === "object" ? body.campaign : null;
      const campaignId = campaign?.campaign?.id
        ? String(campaign.campaign.id)
        : parseNullableFolderId(body?.campaignId);
      const includeExternal = Boolean(body?.includeExternal);
      const provider = normalizeAiProvider(body?.provider || AI_PROVIDER_DEFAULT);
      const taggedDocumentIds = normalizeTaggedDocumentIds(body?.taggedDocumentIds);

      const userMessage = await appendChatMessage(campaignId, {
        id: createChatMessageId(),
        role: "user",
        content: prompt,
        createdAt: nowIso(),
      }, workspaceId);
      await updateChatMemoryFromUserPrompt(campaignId, prompt, workspaceId);

      const generated = await buildChatResponse({
        prompt,
        campaign,
        campaignId,
        includeExternal,
        provider,
        taggedDocumentIds,
        workspaceId,
      });
      const assistantMessage = await appendChatMessage(campaignId, {
        id: createChatMessageId(),
        role: "assistant",
        content: generated.content,
        createdAt: nowIso(),
        citations: generated.citations,
      }, workspaceId);

      sendJson(req, res, 200, {
        provider: generated.providerUsed || provider,
        userMessage,
        message: assistantMessage,
        messages: await getChatMessages(campaignId, workspaceId),
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/telemetry/incidents") {
      const body = await readRequestJson(req);
      const incident = buildIncidentRecord(body, req);
      const workspaceId = getRequestWorkspaceId(req);
      await persistIncidentRecord(incident, workspaceId);
      sendJson(req, res, 202, { accepted: true, id: incident.id });
      return;
    }

    if (req.method === "GET" && pathname === "/api/telemetry/incidents") {
      const workspaceId = getRequestWorkspaceId(req);
      const result = await readRecentIncidents({
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
        query: url.searchParams.get("q"),
        type: url.searchParams.get("type"),
        source: url.searchParams.get("source"),
        requestId: url.searchParams.get("requestId"),
        route: url.searchParams.get("route"),
        workspaceId,
      });
      sendJson(req, res, 200, result);
      return;
    }

    if (req.method === "GET" && pathname === "/api/telemetry/requests") {
      const result = listRecentRequestEvents({
        limit: url.searchParams.get("limit"),
        offset: url.searchParams.get("offset"),
        query: url.searchParams.get("q"),
        event: url.searchParams.get("event"),
        method: url.searchParams.get("method"),
        path: url.searchParams.get("path"),
        requestId: url.searchParams.get("requestId"),
        statusClass: url.searchParams.get("statusClass"),
      });
      sendJson(req, res, 200, result);
      return;
    }

    if (req.method === "GET" && pathname === "/api/campaigns") {
      const workspaceId = getRequestWorkspaceId(req);
      sendJson(req, res, 200, await listCampaigns(workspaceId));
      return;
    }

    if (req.method === "POST" && pathname === "/api/campaigns") {
      const workspaceId = getRequestWorkspaceId(req);
      const body = await readRequestJson(req);
      const campaign = body?.campaign ? normalizeCampaign(body) : createDefaultCampaignData(body);
      sendJson(req, res, 201, await upsertCampaign(campaign, workspaceId));
      return;
    }

    if (req.method === "GET" && pathname === "/api/campaigns/stats") {
      const workspaceId = getRequestWorkspaceId(req);
      sendJson(req, res, 200, await getStorageStats(workspaceId));
      return;
    }

    if (req.method === "GET" && pathname === "/api/campaigns/export") {
      const workspaceId = getRequestWorkspaceId(req);
      sendJson(req, res, 200, { data: await exportCampaigns(workspaceId) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/campaigns/import") {
      const workspaceId = getRequestWorkspaceId(req);
      const body = await readRequestJson(req);
      const mode = url.searchParams.get("mode") === "replace" ? "replace" : "merge";
      const payload = typeof body?.payload === "string" ? body.payload : JSON.stringify(body);
      sendJson(req, res, 200, await importCampaigns(payload, mode, workspaceId));
      return;
    }

    if (req.method === "POST" && pathname === "/api/campaigns/reset") {
      const workspaceId = getRequestWorkspaceId(req);
      sendJson(req, res, 200, await resetCampaigns(workspaceId));
      return;
    }

    if (req.method === "GET" && pathname === "/api/notifications") {
      const workspaceId = getRequestWorkspaceId(req);
      const items =
        workspaceNotifications.get(normalizeWorkspaceId(workspaceId)) ||
        (await rebuildWorkspaceNotifications(workspaceId));
      sendJson(req, res, 200, items);
      return;
    }

    const healthMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/health$/);
    if (healthMatch && req.method === "GET") {
      const id = decodeURIComponent(healthMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(id, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }
      sendJson(req, res, 200, buildCampaignHealth(campaign));
      return;
    }

    const preflightMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/preflight$/);
    if (preflightMatch && req.method === "GET") {
      const id = decodeURIComponent(preflightMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(id, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }
      sendJson(req, res, 200, computePreflightChecks(campaign));
      return;
    }

    const stageTransitionMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/stage-transition$/);
    if (stageTransitionMatch && req.method === "POST") {
      const id = decodeURIComponent(stageTransitionMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(id, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }

      const body = await readRequestJson(req);
      const nextStage = normalizeWorkflowStage(body?.stage);
      const actor = hasText(body?.actor) ? String(body.actor).trim() : "System";
      const currentStage = campaign?.workflow?.stage || "draft";

      const stageOrder = ["draft", "review", "approved", "ready_to_launch"];
      const currentIndex = stageOrder.indexOf(currentStage);
      const nextIndex = stageOrder.indexOf(nextStage);
      if (nextIndex > currentIndex + 1) {
        sendJson(req, res, 409, {
          error: `Invalid stage transition: ${currentStage} -> ${nextStage}. Move step-by-step.`,
        });
        return;
      }

      if (nextStage === "review") {
        const allCampaigns = await listCampaigns(workspaceId);
        const reviewCount = allCampaigns.filter(
          (entry) => entry?.campaign?.id !== id && entry?.workflow?.stage === "review",
        ).length;
        const wipLimit = Number(campaign?.workflow?.wipLimit || 3);
        if (reviewCount >= wipLimit) {
          sendJson(req, res, 409, {
            error: `WIP limit reached (${wipLimit}). Resolve campaigns already in review before moving this one.`,
          });
          return;
        }
      }

      if (nextStage === "ready_to_launch") {
        const governance = evaluateGovernanceApprovalGate(campaign);
        if (governance.policy.requirePreflightPassForReady) {
          const preflight = computePreflightChecks(campaign);
          if (!preflight.passed) {
            sendJson(req, res, 409, {
              error: `Preflight blocked: score ${preflight.score} is below threshold ${preflight.passThreshold}.`,
              details: preflight.checks.filter((check) => !check.passed),
            });
            return;
          }
        }

        if (governance.policy.requireNoCriticalIncidentsForReady) {
          const criticalOpenIssues = Array.isArray(campaign?.issues)
            ? campaign.issues.filter((entry) => entry?.severity === "critical" && entry?.status !== "resolved")
            : [];
          if (criticalOpenIssues.length > 0) {
            sendJson(req, res, 409, {
              error: `Critical incident gate blocked: ${criticalOpenIssues.length} critical incident(s) unresolved.`,
            });
            return;
          }
        }

        if (!governance.passed) {
          sendJson(req, res, 409, {
            error: "Approval gate blocked: governance policy requirements are not yet met.",
            details: {
              approvedCount: governance.approvedCount,
              minApprovedCount: governance.minApprovedCount,
              missingRoles: governance.missingRoles,
            },
          });
          return;
        }
      }

      campaign.workflow = {
        ...(campaign.workflow || {}),
        stage: nextStage,
        stageUpdatedAt: nowIso(),
        wipLimit: Number(campaign?.workflow?.wipLimit || 3),
      };
      appendCampaignAuditEvent(
        campaign,
        "stage_transition",
        actor,
        `Workflow stage changed from ${currentStage} to ${nextStage}.`,
      );
      await upsertCampaign(campaign, workspaceId);
      sendJson(req, res, 200, campaign.workflow);
      return;
    }

    const incidentsCollectionMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/incidents$/);
    if (incidentsCollectionMatch) {
      const id = decodeURIComponent(incidentsCollectionMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(id, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }

      if (req.method === "GET") {
        const items = Array.isArray(campaign.issues) ? campaign.issues : [];
        sendJson(req, res, 200, items);
        return;
      }

      if (req.method === "POST") {
        const body = await readRequestJson(req);
        const title = hasText(body?.title) ? String(body.title).trim() : "";
        if (!title) {
          sendJson(req, res, 400, { error: "Issue title is required" });
          return;
        }
        const issue = {
          id: `issue-${randomUUID()}`,
          title,
          description: hasText(body?.description) ? String(body.description).trim() : "",
          severity: ["low", "medium", "high", "critical"].includes(body?.severity)
            ? body.severity
            : "medium",
          status: "open",
          owner: hasText(body?.owner) ? String(body.owner).trim() : "Unassigned",
          slaHours: Number.isFinite(Number(body?.slaHours))
            ? Math.max(1, Math.min(720, Math.round(Number(body.slaHours))))
            : 48,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        const nextIssues = Array.isArray(campaign.issues) ? [...campaign.issues, issue] : [issue];
        campaign.issues = nextIssues;
        appendCampaignAuditEvent(campaign, "incident_created", issue.owner, `Issue created: ${issue.title}`);
        await upsertCampaign(campaign, workspaceId);
        sendJson(req, res, 201, issue);
        return;
      }
    }

    const incidentItemMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/incidents\/([^/]+)$/);
    if (incidentItemMatch) {
      const campaignId = decodeURIComponent(incidentItemMatch[1]);
      const issueId = decodeURIComponent(incidentItemMatch[2]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(campaignId, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }

      const issues = Array.isArray(campaign.issues) ? campaign.issues : [];
      const index = issues.findIndex((entry) => entry.id === issueId);
      if (index < 0) {
        sendJson(req, res, 404, { error: "Issue not found" });
        return;
      }

      if (req.method === "PATCH") {
        const body = await readRequestJson(req);
        const current = issues[index];
        const nextStatus = ["open", "in_progress", "resolved"].includes(body?.status)
          ? body.status
          : current.status;
        const nextSeverity = ["low", "medium", "high", "critical"].includes(body?.severity)
          ? body.severity
          : current.severity;
        const updated = {
          ...current,
          status: nextStatus,
          severity: nextSeverity,
          owner: hasText(body?.owner) ? String(body.owner).trim() : current.owner,
          postmortem:
            typeof body?.postmortem === "string" && body.postmortem.trim()
              ? body.postmortem.trim()
              : current.postmortem,
          updatedAt: nowIso(),
          resolvedAt: nextStatus === "resolved" ? nowIso() : undefined,
        };

        issues[index] = updated;
        campaign.issues = issues;
        appendCampaignAuditEvent(
          campaign,
          "incident_updated",
          hasText(updated.owner) ? updated.owner : "System",
          `Issue ${updated.title} moved to ${updated.status}.`,
        );
        await upsertCampaign(campaign, workspaceId);
        sendJson(req, res, 200, updated);
        return;
      }

      if (req.method === "DELETE") {
        const removed = issues[index];
        campaign.issues = issues.filter((entry) => entry.id !== issueId);
        appendCampaignAuditEvent(
          campaign,
          "incident_deleted",
          hasText(removed?.owner) ? removed.owner : "System",
          `Issue removed: ${removed?.title || issueId}.`,
        );
        await upsertCampaign(campaign, workspaceId);
        sendJson(req, res, 200, { deleted: true });
        return;
      }
    }

    const remindersMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/reminders$/);
    if (remindersMatch && req.method === "GET") {
      const id = decodeURIComponent(remindersMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(id, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }
      const reminders = computeCampaignReminders(campaign);
      campaign.reminders = reminders;
      await upsertCampaign(campaign, workspaceId);
      sendJson(req, res, 200, reminders);
      return;
    }

    const versionsCollectionMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/versions$/);
    if (versionsCollectionMatch) {
      const id = decodeURIComponent(versionsCollectionMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(id, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }

      if (req.method === "GET") {
        const snapshots = Array.isArray(campaign.snapshots) ? campaign.snapshots : [];
        const ordered = snapshots.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        sendJson(req, res, 200, ordered);
        return;
      }

      if (req.method === "POST") {
        const body = await readRequestJson(req);
        const label = hasText(body?.label) ? String(body.label).trim() : "Campaign snapshot";
        const createdBy = hasText(body?.createdBy) ? String(body.createdBy).trim() : "System";
        const snapshot = {
          id: `snap-${randomUUID()}`,
          label,
          createdAt: nowIso(),
          createdBy,
          summary: summarizeCampaignForSnapshot(campaign),
          state: stripCampaignSnapshotState(campaign),
        };
        const snapshots = Array.isArray(campaign.snapshots) ? campaign.snapshots : [];
        campaign.snapshots = [...snapshots, snapshot].slice(-60);
        appendCampaignAuditEvent(campaign, "snapshot_created", createdBy, `Snapshot created: ${label}`);
        await upsertCampaign(campaign, workspaceId);
        sendJson(req, res, 201, snapshot);
        return;
      }
    }

    const compareVersionsMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/versions\/compare$/);
    if (compareVersionsMatch && req.method === "GET") {
      const id = decodeURIComponent(compareVersionsMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(id, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }
      const baseId = String(url.searchParams.get("base") || "");
      const targetId = String(url.searchParams.get("target") || "");
      const snapshots = Array.isArray(campaign.snapshots) ? campaign.snapshots : [];
      const baseSnapshot = snapshots.find((entry) => entry.id === baseId);
      const targetSnapshot = snapshots.find((entry) => entry.id === targetId);
      if (!baseSnapshot || !targetSnapshot) {
        sendJson(req, res, 404, { error: "Snapshot pair not found" });
        return;
      }
      sendJson(req, res, 200, compareSnapshots(baseSnapshot, targetSnapshot));
      return;
    }

    const versionItemMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/versions\/([^/]+)$/);
    if (versionItemMatch && req.method === "DELETE") {
      const campaignId = decodeURIComponent(versionItemMatch[1]);
      const snapshotId = decodeURIComponent(versionItemMatch[2]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(campaignId, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }
      const snapshots = Array.isArray(campaign.snapshots) ? campaign.snapshots : [];
      const existing = snapshots.find((entry) => entry.id === snapshotId);
      if (!existing) {
        sendJson(req, res, 404, { error: "Snapshot not found" });
        return;
      }
      campaign.snapshots = snapshots.filter((entry) => entry.id !== snapshotId);
      appendCampaignAuditEvent(
        campaign,
        "snapshot_deleted",
        "System",
        `Snapshot removed: ${existing.label}.`,
      );
      await upsertCampaign(campaign, workspaceId);
      sendJson(req, res, 200, { deleted: true });
      return;
    }

    const approvalsCollectionMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/approvals$/);
    if (approvalsCollectionMatch) {
      const id = decodeURIComponent(approvalsCollectionMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(id, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }

      if (req.method === "GET") {
        const approvals = Array.isArray(campaign.approvals) ? campaign.approvals : [];
        sendJson(req, res, 200, approvals);
        return;
      }

      if (req.method === "POST") {
        const body = await readRequestJson(req);
        const role = ["strategy_lead", "creative_lead", "client_partner", "compliance"].includes(body?.role)
          ? body.role
          : "strategy_lead";
        const approver = hasText(body?.approver) ? String(body.approver).trim() : "";
        const signature = hasText(body?.signature) ? String(body.signature).trim() : "";
        if (!approver || !signature) {
          sendJson(req, res, 400, { error: "approver and signature are required" });
          return;
        }
        const status = ["pending", "approved", "rejected"].includes(body?.status)
          ? body.status
          : "approved";
        const approval = {
          id: `approval-${randomUUID()}`,
          role,
          approver,
          signature,
          status,
          note: hasText(body?.note) ? String(body.note).trim() : "",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          approvedAt: status === "approved" ? nowIso() : undefined,
        };
        const approvals = Array.isArray(campaign.approvals) ? campaign.approvals : [];
        campaign.approvals = [...approvals, approval];
        appendCampaignAuditEvent(
          campaign,
          "approval_signed",
          approver,
          `${role} approval set to ${status}.`,
        );
        await upsertCampaign(campaign, workspaceId);
        sendJson(req, res, 201, approval);
        return;
      }
    }

    const approvalItemMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/approvals\/([^/]+)$/);
    if (approvalItemMatch) {
      const campaignId = decodeURIComponent(approvalItemMatch[1]);
      const approvalId = decodeURIComponent(approvalItemMatch[2]);
      const workspaceId = getRequestWorkspaceId(req);
      const campaign = await getCampaignById(campaignId, workspaceId);
      if (!campaign) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }
      const approvals = Array.isArray(campaign.approvals) ? campaign.approvals : [];
      const index = approvals.findIndex((entry) => entry.id === approvalId);
      if (index < 0) {
        sendJson(req, res, 404, { error: "Approval not found" });
        return;
      }

      if (req.method === "PATCH") {
        const body = await readRequestJson(req);
        const current = approvals[index];
        const status = ["pending", "approved", "rejected"].includes(body?.status)
          ? body.status
          : current.status;
        const updated = {
          ...current,
          approver: hasText(body?.approver) ? String(body.approver).trim() : current.approver,
          signature: hasText(body?.signature) ? String(body.signature).trim() : current.signature,
          status,
          note: typeof body?.note === "string" ? body.note : current.note,
          updatedAt: nowIso(),
          approvedAt: status === "approved" ? nowIso() : undefined,
        };
        approvals[index] = updated;
        campaign.approvals = approvals;
        appendCampaignAuditEvent(
          campaign,
          "approval_updated",
          updated.approver || "System",
          `Approval ${updated.role} moved to ${updated.status}.`,
        );
        await upsertCampaign(campaign, workspaceId);
        sendJson(req, res, 200, updated);
        return;
      }

      if (req.method === "DELETE") {
        const removed = approvals[index];
        campaign.approvals = approvals.filter((entry) => entry.id !== approvalId);
        appendCampaignAuditEvent(
          campaign,
          "approval_deleted",
          hasText(removed?.approver) ? removed.approver : "System",
          `Approval removed: ${removed?.role || approvalId}.`,
        );
        await upsertCampaign(campaign, workspaceId);
        sendJson(req, res, 200, { deleted: true });
        return;
      }
    }

    const campaignIdMatch = pathname.match(/^\/api\/campaigns\/([^/]+)$/);
    if (campaignIdMatch) {
      const id = decodeURIComponent(campaignIdMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);

      if (req.method === "GET") {
        const campaign = await getCampaignById(id, workspaceId);
        if (!campaign) {
          sendJson(req, res, 404, { error: "Campaign not found" });
          return;
        }
        sendJson(req, res, 200, campaign);
        return;
      }

      if (req.method === "PUT") {
        const body = await readRequestJson(req);
        if (body?.campaign?.id !== id) {
          sendJson(req, res, 400, { error: "campaign.id must match path id" });
          return;
        }
        sendJson(req, res, 200, await upsertCampaign(body, workspaceId));
        return;
      }

      if (req.method === "DELETE") {
        sendJson(req, res, 200, { deleted: await deleteCampaign(id, workspaceId) });
        return;
      }
    }

    const duplicateMatch = pathname.match(/^\/api\/campaigns\/([^/]+)\/duplicate$/);
    if (duplicateMatch && req.method === "POST") {
      const id = decodeURIComponent(duplicateMatch[1]);
      const workspaceId = getRequestWorkspaceId(req);
      const duplicated = await duplicateCampaign(id, workspaceId);
      if (!duplicated) {
        sendJson(req, res, 404, { error: "Campaign not found" });
        return;
      }
      sendJson(req, res, 201, duplicated);
      return;
    }

    sendJson(req, res, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    logRequest("request_failed", {
      requestId: getRequestId(req),
      workspaceId: req.__requestContext?.workspaceId || getRequestWorkspaceId(req),
      method: req.method || "UNKNOWN",
      path: req.__requestContext?.path || req.url || "",
      error: message,
    });
    sendJson(req, res, 500, { error: message });
  }
});

server.on("upgrade", (req, socket, head) => {
  if (!req.url) {
    socket.destroy();
    return;
  }

  let url;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    socket.destroy();
    return;
  }

  if (url.pathname !== REFRESH_SIGNAL_WS_PATH) {
    socket.destroy();
    return;
  }

  const origin = getRequestOrigin(req);
  if (!isOriginAllowed(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  if (!isAuthorizedRealtimeRequest(req, url)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  const workspaceId = normalizeWorkspaceId(url.searchParams.get("workspaceId") || getRequestWorkspaceId(req));
  knownWorkspaceIds.add(workspaceId);

  refreshSignalSocketServer.handleUpgrade(req, socket, head, (websocket) => {
    registerRefreshSignalWebSocket(websocket, req, url);
  });
});

await ensureSeed();
await rebuildAllWorkspaceNotifications();
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Campaign backend running on http://localhost:${PORT}`);
});
