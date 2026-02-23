import { describe, expect, it } from "vitest";
import {
  detectAutoFillStepFromPrompt,
  isAutoFillContinuationPrompt,
  resolveAutoFillStepFromPromptContext,
} from "@/lib/ai-chat/chat-autofill";

describe("detectAutoFillStepFromPrompt", () => {
  it("detects research step from direct command", () => {
    expect(detectAutoFillStepFromPrompt("proceed to fill the research fields")).toBe("research");
  });

  it("detects research step from field-template prompt", () => {
    const prompt = [
      "You are filling one specific form field for a campaign workflow.",
      "Field label: Business Situation",
      "User instruction: Write a strong draft for Business Situation.",
    ].join("\n");
    expect(detectAutoFillStepFromPrompt(prompt)).toBe("research");
  });

  it("detects communication brief step", () => {
    expect(detectAutoFillStepFromPrompt("please fill communication brief fields now")).toBe(
      "communicationBrief",
    );
  });

  it("detects creative brief step", () => {
    expect(detectAutoFillStepFromPrompt("auto-fill the creative brief step")).toBe("creativeBrief");
  });

  it("detects ideation step", () => {
    expect(detectAutoFillStepFromPrompt("please fill ideation fields")).toBe("ideation");
  });

  it("detects concepts step", () => {
    expect(detectAutoFillStepFromPrompt("fill concept development fields")).toBe("concepts");
  });

  it("detects slash command step prompts", () => {
    expect(detectAutoFillStepFromPrompt("/fill research with current documents")).toBe("research");
    expect(detectAutoFillStepFromPrompt("/autofill creative-brief")).toBe("creativeBrief");
    expect(detectAutoFillStepFromPrompt("/auto-fill concepts")).toBe("concepts");
  });

  it("returns null for unrelated prompts", () => {
    expect(detectAutoFillStepFromPrompt("hello there")).toBeNull();
  });
});

describe("resolveAutoFillStepFromPromptContext", () => {
  it("resolves continuation prompts using previous autofill intent", () => {
    const previous = ["please fill communication brief fields now"];
    expect(resolveAutoFillStepFromPromptContext("okay proceed", previous)).toBe(
      "communicationBrief",
    );
  });

  it("returns null for continuation prompts with no prior autofill context", () => {
    expect(resolveAutoFillStepFromPromptContext("continue", ["hello"])).toBeNull();
  });
});

describe("isAutoFillContinuationPrompt", () => {
  it("matches short continuation commands", () => {
    expect(isAutoFillContinuationPrompt("continue")).toBe(true);
    expect(isAutoFillContinuationPrompt("go ahead")).toBe(true);
    expect(isAutoFillContinuationPrompt("okay proceed")).toBe(true);
  });

  it("does not match regular requests", () => {
    expect(isAutoFillContinuationPrompt("fill research")).toBe(false);
    expect(isAutoFillContinuationPrompt("analyze this report")).toBe(false);
  });
});
