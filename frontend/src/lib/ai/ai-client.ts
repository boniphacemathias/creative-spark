import { appendRequestIdToErrorMessage, buildJsonHeaders } from "@/lib/api/request-tracing";
import { getActiveWorkspaceId } from "@/lib/workspace";

interface CachedPromptResult {
  expiresAt: number;
  value: string;
}

interface GenerateApiResponse {
  success: boolean;
  result: string;
}

const MAX_PROMPT_LENGTH = 12_000;
const REQUEST_TIMEOUT_MS = 45_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const API_BASE_URL =
  (typeof import.meta.env.VITE_CAMPAIGN_API_BASE_URL === "string"
    ? import.meta.env.VITE_CAMPAIGN_API_BASE_URL.trim().replace(/\/$/, "")
    : "") || "http://127.0.0.1:8787";
const API_AUTH_TOKEN = (typeof import.meta.env.VITE_BACKEND_AUTH_TOKEN === "string"
  ? import.meta.env.VITE_BACKEND_AUTH_TOKEN.trim()
  : "");
const resultCache = new Map<string, CachedPromptResult>();
const inFlight = new Map<string, Promise<string>>();

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\r/g, "\n").replace(/\u0000/g, "").trim();
}

function now(): number {
  return Date.now();
}

function pruneCache(): void {
  const timestamp = now();
  for (const [key, entry] of resultCache.entries()) {
    if (entry.expiresAt <= timestamp) {
      resultCache.delete(key);
    }
  }
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  return "";
}

async function postPrompt(prompt: string): Promise<string> {
  const endpoints = [`${API_BASE_URL}/api/ai/generate`, "/api/ai/generate"];
  let lastError: Error | null = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: buildJsonHeaders(
          undefined,
          {
            ...(API_AUTH_TOKEN
              ? {
                  Authorization: `Bearer ${API_AUTH_TOKEN}`,
                  "X-API-Key": API_AUTH_TOKEN,
                }
              : {}),
            "X-Workspace-Id": getActiveWorkspaceId(),
          },
        ),
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<GenerateApiResponse>;
      const result = typeof payload.result === "string" ? payload.result.trim() : "";

      if (!response.ok) {
        throw new Error(
          appendRequestIdToErrorMessage(result || "AI generation request failed.", response),
        );
      }

      if (!payload.success) {
        throw new Error(result || "AI generation failed.");
      }

      if (!result) {
        throw new Error("AI generation returned empty text.");
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("AI generation request failed.");
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("AI generation request failed.");
}

export async function generateTextViaApi(prompt: string): Promise<string> {
  const normalized = normalizePrompt(prompt);

  if (!normalized) {
    throw new Error("Prompt is required.");
  }

  if (normalized.length > MAX_PROMPT_LENGTH) {
    throw new Error("Prompt exceeds maximum allowed length.");
  }

  pruneCache();
  const cached = resultCache.get(normalized);
  if (cached && cached.expiresAt > now()) {
    return cached.value;
  }

  const existing = inFlight.get(normalized);
  if (existing) {
    return existing;
  }

  const pending = postPrompt(normalized)
    .then((value) => {
      resultCache.set(normalized, {
        value,
        expiresAt: now() + CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      inFlight.delete(normalized);
    });

  inFlight.set(normalized, pending);
  return pending;
}

export function parseJsonFromModelText<T>(text: string): T | null {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    return null;
  }

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

export function cleanAiText(value: string): string {
  return value
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/i, "")
    .replace(/\r/g, "")
    .trim();
}
