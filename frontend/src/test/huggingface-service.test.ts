import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setApiKey(value: string) {
  const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (processRef?.env) {
    processRef.env.HF_API_KEY = value;
  }
}

describe("huggingface.service", () => {
  beforeEach(() => {
    vi.resetModules();
    setApiKey("test-key");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries when model is loading (503) and then succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Model loading", estimated_time: 0 }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ generated_text: "Generated output" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const { getHuggingFaceService } = await import("@/server/ai/huggingface.service");
    const result = await getHuggingFaceService().generateText("hello world");

    expect(result).toBe("Generated output");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws typed service error on rate limit (429)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limit" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { getHuggingFaceService, HuggingFaceServiceError } = await import("@/server/ai/huggingface.service");

    await expect(getHuggingFaceService().generateText("hello world")).rejects.toBeInstanceOf(HuggingFaceServiceError);
  });

  it("retries after timeout and recovers", async () => {
    const timeoutError = new Error("timeout");
    timeoutError.name = "AbortError";

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ generated_text: "Recovered output" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const { getHuggingFaceService } = await import("@/server/ai/huggingface.service");
    const result = await getHuggingFaceService().generateText("timeout prompt");

    expect(result).toBe("Recovered output");
  });
});
