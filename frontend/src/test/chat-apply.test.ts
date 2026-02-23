import { describe, expect, it } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { applyAssistantMessageToCampaign } from "@/lib/ai-chat/chat-apply";

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("chat-apply", () => {
  it("writes assistant content into insight field", () => {
    const data = cloneSample();
    const updated = applyAssistantMessageToCampaign(
      data,
      "insight",
      "Mothers delay vaccines mainly due to elder trust hierarchies.",
    );

    expect(updated.insight.insightText).toContain("elder trust hierarchies");
    expect(updated.communicationObjective).toBe(data.communicationObjective);
  });

  it("writes assistant content into creative key proposition", () => {
    const data = cloneSample();
    const updated = applyAssistantMessageToCampaign(
      data,
      "creativeKeyProposition",
      "Trusted voices make protection feel safe and immediate.",
    );

    expect(updated.creativeBrief.keyProposition).toBe(
      "Trusted voices make protection feel safe and immediate.",
    );
  });

  it("appends assistant content to appendices", () => {
    const data = cloneSample();
    const updated = applyAssistantMessageToCampaign(
      data,
      "appendices",
      "Added from AI chat: pilot KPI baseline and weekly dashboard rule.",
    );

    expect(updated.appendices).toContain("UTM template");
    expect(updated.appendices).toContain("Added from AI chat");
  });
});
