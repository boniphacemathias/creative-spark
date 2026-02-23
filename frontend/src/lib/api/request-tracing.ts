const REQUEST_ID_HEADER = "X-Request-Id";

function randomSuffix(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function createRequestId(prefix = "cs"): string {
  return `${prefix}-${randomSuffix()}`;
}

export function buildJsonHeaders(
  initHeaders?: HeadersInit,
  extraHeaders?: Record<string, string>,
): Headers {
  const headers = new Headers(initHeaders);
  headers.set("Content-Type", "application/json");
  if (!headers.has(REQUEST_ID_HEADER)) {
    headers.set(REQUEST_ID_HEADER, createRequestId());
  }

  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }

  return headers;
}

export function appendRequestIdToErrorMessage(message: string, response: Response): string {
  const requestId = response.headers.get("x-request-id")?.trim();
  if (!requestId) {
    return message;
  }
  return `${message} (request id: ${requestId})`;
}
