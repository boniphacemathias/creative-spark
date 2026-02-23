import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedService } = vi.hoisted(() => ({
  mockedService: {
    generateText: vi.fn(),
  },
}));

vi.mock("@/server/ai/huggingface.service", () => ({
  getHuggingFaceService: () => mockedService,
  HuggingFaceServiceError: class HuggingFaceServiceError extends Error {
    status: number;
    code: string;

    constructor(message: string, status = 500, code = "AI_SERVICE_ERROR") {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  HUGGINGFACE_GENERATION_FALLBACK: "AI generation is temporarily unavailable. Please retry in a few moments.",
}));

import { handleGeneratePayload, handleGenerateRequest } from "@/pages/api/ai/generate";
import { HuggingFaceServiceError } from "@/server/ai/huggingface.service";

describe("api/ai/generate", () => {
  beforeEach(() => {
    mockedService.generateText.mockReset();
  });

  it("returns 400 for invalid prompt", async () => {
    const result = await handleGeneratePayload({ prompt: "" });

    expect(result.status).toBe(400);
    expect(result.body.success).toBe(false);
  });

  it("returns 413 when prompt is too large", async () => {
    const result = await handleGeneratePayload({ prompt: "x".repeat(12_001) });

    expect(result.status).toBe(413);
    expect(result.body.success).toBe(false);
  });

  it("returns AI response on success", async () => {
    mockedService.generateText.mockResolvedValue("AI output text");

    const result = await handleGeneratePayload({ prompt: "Generate ideas" });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, result: "AI output text" });
    expect(mockedService.generateText).toHaveBeenCalledWith("Generate ideas");
  });

  it("returns fallback on upstream errors without leaking internals", async () => {
    mockedService.generateText.mockRejectedValue(
      new HuggingFaceServiceError("Internal provider detail", 429, "RATE_LIMITED"),
    );

    const result = await handleGeneratePayload({ prompt: "Generate ideas" });

    expect(result.status).toBe(429);
    expect(result.body.success).toBe(false);
    expect(result.body.result).toMatch(/temporarily unavailable/i);
    expect(result.body.result).not.toMatch(/internal provider detail/i);
  });

  it("handles request object for POST endpoint", async () => {
    mockedService.generateText.mockResolvedValue("Server response");

    const request = new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "hello" }),
    });

    const response = await handleGenerateRequest(request);
    const payload = (await response.json()) as { success: boolean; result: string };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.result).toBe("Server response");
  });
});
