import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import {
  automateCampaignFromDocuments,
  automateCampaignFromDocumentsWithAI,
} from "@/lib/ai-engine/campaign-automation";

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("campaign-automation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-generates research, briefs, ideas, and concepts from uploaded docs", () => {
    const data = cloneSample();

    const result = automateCampaignFromDocuments(data, [
      {
        name: "research.txt",
        type: "text/plain",
        text: [
          "Situation: Public trust is fragile after mixed messages.",
          "Problem: Caregivers postpone action because elders are skeptical.",
          "Business Objective: Increase full compliance by 30%.",
          "Communication Objective: Think clear, feel confident, do immediate action.",
          "Audience: Caregivers, Elders, Health workers",
          "Insight: People fear social judgment more than technical risk.",
          "Driver: social pressure, nurture, status",
          "Desired Behavior: Complete required action before deadlines.",
        ].join("\n"),
      },
    ]);

    expect(result.patch.situation).toMatch(/trust/i);
    expect(result.patch.problem).toMatch(/caregivers/i);
    expect(result.patch.insight?.insightText).toMatch(/\S/);
    expect(result.patch.ideas?.length ?? 0).toBeGreaterThan(0);
    expect(result.patch.concepts?.length ?? 0).toBeGreaterThan(0);
    expect(result.patch.channelRoles?.length ?? 0).toBeGreaterThan(0);
    expect(result.patch.creativeBrief?.singleMindedObjective).toMatch(/\S/);
  });

  it("applies resilient fallback values for empty input", () => {
    const data = cloneSample();

    const result = automateCampaignFromDocuments(data, [
      {
        name: "empty.txt",
        type: "text/plain",
        text: "",
      },
    ]);

    expect(result.patch.situation).toMatch(/\S/);
    expect(result.patch.problem).toMatch(/\S/);
    expect(result.patch.businessObjective).toMatch(/\S/);
    expect(result.patch.insight?.insightText ?? "").toMatch(/\S/);
    expect(result.parsed.warnings.length).toBeGreaterThan(0);
  });

  it("falls back safely when AI generation fails", async () => {
    const data = cloneSample();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const result = await automateCampaignFromDocumentsWithAI(data, [
      {
        name: "research.txt",
        type: "text/plain",
        text: "Situation: trust gap. Problem: low action uptake. Insight: fear of social judgment.",
      },
    ]);

    expect(result.patch.situation).toMatch(/\S/);
    expect(result.patch.problem).toMatch(/\S/);
    expect(result.patch.ideas?.length ?? 0).toBeGreaterThan(0);
    expect(result.patch.concepts?.length ?? 0).toBeGreaterThan(0);
  });
});
