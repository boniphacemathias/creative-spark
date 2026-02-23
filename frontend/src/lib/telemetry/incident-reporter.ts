import { buildJsonHeaders, createRequestId } from "@/lib/api/request-tracing";

interface FrontendIncidentInput {
  type: string;
  message: string;
  stack?: string;
  source?: string;
  route?: string;
  meta?: Record<string, unknown>;
}

const API_BASE_URL =
  (typeof import.meta.env.VITE_CAMPAIGN_API_BASE_URL === "string"
    ? import.meta.env.VITE_CAMPAIGN_API_BASE_URL.trim().replace(/\/$/, "")
    : "") || "http://127.0.0.1:8787";
const API_AUTH_TOKEN = (typeof import.meta.env.VITE_BACKEND_AUTH_TOKEN === "string"
  ? import.meta.env.VITE_BACKEND_AUTH_TOKEN.trim()
  : "");
const TELEMETRY_ENABLED = String(import.meta.env.VITE_TELEMETRY_ENABLED || "true").toLowerCase() !== "false";
const INCIDENT_DEDUPE_WINDOW_MS = 5000;
const recentIncidents = new Map<string, number>();

function normalize(value: string, max = 4000): string {
  const normalized = String(value || "").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function pruneRecent(nowMs: number) {
  for (const [signature, timestamp] of recentIncidents.entries()) {
    if (nowMs - timestamp > INCIDENT_DEDUPE_WINDOW_MS) {
      recentIncidents.delete(signature);
    }
  }
}

function buildSignature(input: FrontendIncidentInput): string {
  return `${input.type}::${normalize(input.message, 240)}::${normalize(input.route || "", 120)}`;
}

export async function reportFrontendIncident(input: FrontendIncidentInput): Promise<void> {
  if (!TELEMETRY_ENABLED) {
    return;
  }

  const message = normalize(input.message, 4000);
  if (!message) {
    return;
  }

  const route =
    input.route ||
    (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "");
  const nowMs = Date.now();
  const signature = buildSignature({ ...input, route, message });
  pruneRecent(nowMs);

  const lastSentAt = recentIncidents.get(signature);
  if (lastSentAt && nowMs - lastSentAt <= INCIDENT_DEDUPE_WINDOW_MS) {
    return;
  }
  recentIncidents.set(signature, nowMs);

  const body = {
    id: createRequestId("incident"),
    type: normalize(input.type, 80) || "client_error",
    message,
    stack: normalize(input.stack || "", 12000),
    source: normalize(input.source || "frontend", 120),
    route: normalize(route, 300),
    userAgent: typeof navigator !== "undefined" ? normalize(navigator.userAgent, 300) : "",
    meta: input.meta || {},
  };

  try {
    await fetch(`${API_BASE_URL}/api/telemetry/incidents`, {
      method: "POST",
      headers: buildJsonHeaders(
        undefined,
        API_AUTH_TOKEN
          ? {
              Authorization: `Bearer ${API_AUTH_TOKEN}`,
              "X-API-Key": API_AUTH_TOKEN,
            }
          : undefined,
      ),
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Intentionally swallow telemetry failures.
  }
}
