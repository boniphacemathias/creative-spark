const HF_INFERENCE_ENDPOINT = "https://api-inference.huggingface.co/models/google/flan-t5-large";
const DEFAULT_TIMEOUT_MS = 35_000;
const MAX_RETRIES = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PROMPT_LENGTH = 12_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

interface CachedValue {
  expiresAt: number;
  value: string;
}

interface RateWindowState {
  timestamps: number[];
}

interface HuggingFaceGenerationPayload {
  generated_text?: string;
}

interface HuggingFaceErrorPayload {
  error?: string;
  estimated_time?: number;
}

function now(): number {
  return Date.now();
}

function getEnvValue(name: string): string {
  const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processRef?.env?.[name] ?? "";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\r/g, "\n").replace(/\u0000/g, "").trim();
}

function cleanModelOutput(text: string): string {
  return text
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

function parseGeneratedText(payload: unknown): string {
  if (Array.isArray(payload)) {
    const first = payload[0] as HuggingFaceGenerationPayload | undefined;
    if (first && typeof first.generated_text === "string") {
      return cleanModelOutput(first.generated_text);
    }
  }

  if (payload && typeof payload === "object") {
    const candidate = payload as HuggingFaceGenerationPayload;
    if (typeof candidate.generated_text === "string") {
      return cleanModelOutput(candidate.generated_text);
    }
  }

  return "";
}

function extractEstimatedWaitMs(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return 1_500;
  }

  const result = payload as HuggingFaceErrorPayload;
  if (typeof result.estimated_time === "number" && Number.isFinite(result.estimated_time)) {
    return Math.max(1_000, Math.min(12_000, Math.round(result.estimated_time * 1000)));
  }

  return 1_500;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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

export class HuggingFaceServiceError extends Error {
  code: string;
  status: number;

  constructor(message: string, status = 500, code = "AI_SERVICE_ERROR") {
    super(message);
    this.name = "HuggingFaceServiceError";
    this.status = status;
    this.code = code;
  }
}

class HuggingFaceService {
  private cache = new Map<string, CachedValue>();
  private inFlight = new Map<string, Promise<string>>();
  private rateWindow: RateWindowState = { timestamps: [] };

  async generateText(prompt: string): Promise<string> {
    const normalizedPrompt = normalizePrompt(prompt);

    if (!normalizedPrompt) {
      throw new HuggingFaceServiceError("Prompt is required.", 400, "INVALID_PROMPT");
    }

    if (normalizedPrompt.length > MAX_PROMPT_LENGTH) {
      throw new HuggingFaceServiceError("Prompt exceeds allowed length.", 413, "PROMPT_TOO_LARGE");
    }

    const cached = this.cache.get(normalizedPrompt);
    if (cached && cached.expiresAt > now()) {
      return cached.value;
    }

    const existing = this.inFlight.get(normalizedPrompt);
    if (existing) {
      return existing;
    }

    const pending = this.generateTextInternal(normalizedPrompt)
      .then((result) => {
        this.cache.set(normalizedPrompt, {
          value: result,
          expiresAt: now() + CACHE_TTL_MS,
        });
        return result;
      })
      .finally(() => {
        this.inFlight.delete(normalizedPrompt);
      });

    this.inFlight.set(normalizedPrompt, pending);
    return pending;
  }

  private enforceRateLimit(): void {
    const threshold = now() - RATE_LIMIT_WINDOW_MS;
    this.rateWindow.timestamps = this.rateWindow.timestamps.filter((timestamp) => timestamp >= threshold);

    if (this.rateWindow.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      throw new HuggingFaceServiceError("AI rate limit exceeded. Please retry shortly.", 429, "RATE_LIMITED");
    }

    this.rateWindow.timestamps.push(now());
  }

  private async generateTextInternal(prompt: string): Promise<string> {
    this.enforceRateLimit();

    const apiKey = getEnvValue("HF_API_KEY");
    if (!apiKey) {
      throw new HuggingFaceServiceError("AI service is not configured.", 500, "MISSING_API_KEY");
    }

    let lastError: HuggingFaceServiceError | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await fetchWithTimeout(
          HF_INFERENCE_ENDPOINT,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: prompt,
              options: { wait_for_model: true },
            }),
          },
          DEFAULT_TIMEOUT_MS,
        );

        const body = await response.json().catch(() => ({}));

        if (response.status === 503) {
          lastError = new HuggingFaceServiceError("Model is loading.", 503, "MODEL_LOADING");
          if (attempt < MAX_RETRIES) {
            await wait(extractEstimatedWaitMs(body));
            continue;
          }
          throw lastError;
        }

        if (response.status === 429) {
          throw new HuggingFaceServiceError("AI request limit reached. Try again shortly.", 429, "RATE_LIMITED");
        }

        if (!response.ok) {
          lastError = new HuggingFaceServiceError("AI provider request failed.", response.status, "UPSTREAM_FAILURE");
          if (attempt < MAX_RETRIES && response.status >= 500) {
            await wait(attempt * 600);
            continue;
          }
          throw lastError;
        }

        const generatedText = parseGeneratedText(body);
        if (!generatedText) {
          lastError = new HuggingFaceServiceError("AI provider returned empty output.", 502, "EMPTY_OUTPUT");
          if (attempt < MAX_RETRIES) {
            await wait(attempt * 450);
            continue;
          }
          throw lastError;
        }

        return generatedText;
      } catch (error) {
        if (error instanceof HuggingFaceServiceError) {
          lastError = error;
          if (error.status === 429) {
            throw error;
          }
          if (attempt < MAX_RETRIES && error.status >= 500) {
            await wait(attempt * 600);
            continue;
          }
          throw error;
        }

        const errorName = error instanceof Error ? error.name : "UnknownError";
        const timeoutFailure = errorName === "AbortError";
        lastError = timeoutFailure
          ? new HuggingFaceServiceError("AI request timed out.", 504, "TIMEOUT")
          : new HuggingFaceServiceError("AI request failed.", 502, "NETWORK_FAILURE");

        if (attempt < MAX_RETRIES) {
          await wait(attempt * 600);
          continue;
        }
      }
    }

    throw lastError ?? new HuggingFaceServiceError("AI service unavailable.", 503, "UNAVAILABLE");
  }
}

let instance: HuggingFaceService | null = null;

export function getHuggingFaceService(): HuggingFaceService {
  if (!instance) {
    instance = new HuggingFaceService();
  }
  return instance;
}

export const HUGGINGFACE_GENERATION_FALLBACK =
  "AI generation is temporarily unavailable. Please retry in a few moments.";
