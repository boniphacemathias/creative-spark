import { appendRequestIdToErrorMessage, buildJsonHeaders } from "@/lib/api/request-tracing";

const API_BASE_URL =
  (typeof import.meta.env.VITE_CAMPAIGN_API_BASE_URL === "string"
    ? import.meta.env.VITE_CAMPAIGN_API_BASE_URL.trim().replace(/\/$/, "")
    : "") || "http://127.0.0.1:8787";
const API_AUTH_TOKEN = (typeof import.meta.env.VITE_BACKEND_AUTH_TOKEN === "string"
  ? import.meta.env.VITE_BACKEND_AUTH_TOKEN.trim()
  : "");

export interface IncidentRecord {
  id: string;
  requestId?: string;
  type: string;
  message: string;
  source?: string;
  route?: string;
  userAgent?: string;
  createdAt: string;
}

export interface RequestEventRecord {
  timestamp: string;
  event: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: string;
  ip?: string;
  origin?: string | null;
}

export interface IncidentQuery {
  limit?: number;
  offset?: number;
  q?: string;
  type?: string;
  source?: string;
  requestId?: string;
  route?: string;
}

export interface RequestEventQuery {
  limit?: number;
  offset?: number;
  q?: string;
  event?: string;
  method?: string;
  path?: string;
  requestId?: string;
  statusClass?: "2xx" | "4xx" | "5xx";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders =
    API_AUTH_TOKEN
      ? {
          Authorization: `Bearer ${API_AUTH_TOKEN}`,
          "X-API-Key": API_AUTH_TOKEN,
        }
      : {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildJsonHeaders(init?.headers, authHeaders),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    const message = (payload.error || payload.message || `Diagnostics request failed: ${response.status}`).trim();
    throw new Error(appendRequestIdToErrorMessage(message, response));
  }

  return (await response.json()) as T;
}

function applyQueryParams(params: URLSearchParams, query: object) {
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    const normalized = String(value).trim();
    if (!normalized) {
      continue;
    }
    params.set(key, normalized);
  }
}

export async function listIncidentRecords(
  query: IncidentQuery = {},
): Promise<{ items: IncidentRecord[]; total: number; offset: number; limit: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  applyQueryParams(params, query);
  const payload = await requestJson<{
    items?: IncidentRecord[];
    total?: number;
    offset?: number;
    limit?: number;
    hasMore?: boolean;
  }>(
    `/api/telemetry/incidents?${params.toString()}`,
  );
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    total: Number.isFinite(payload.total) ? Number(payload.total) : 0,
    offset: Number.isFinite(payload.offset) ? Number(payload.offset) : 0,
    limit: Number.isFinite(payload.limit) ? Number(payload.limit) : Number(query.limit || 0),
    hasMore: Boolean(payload.hasMore),
  };
}

export async function listRequestEvents(
  query: RequestEventQuery = {},
): Promise<{ items: RequestEventRecord[]; total: number; offset: number; limit: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  applyQueryParams(params, query);
  const payload = await requestJson<{
    items?: RequestEventRecord[];
    total?: number;
    offset?: number;
    limit?: number;
    hasMore?: boolean;
  }>(
    `/api/telemetry/requests?${params.toString()}`,
  );
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    total: Number.isFinite(payload.total) ? Number(payload.total) : 0,
    offset: Number.isFinite(payload.offset) ? Number(payload.offset) : 0,
    limit: Number.isFinite(payload.limit) ? Number(payload.limit) : Number(query.limit || 0),
    hasMore: Boolean(payload.hasMore),
  };
}
