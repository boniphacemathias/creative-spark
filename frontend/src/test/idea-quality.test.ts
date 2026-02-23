import { describe, expect, it } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { evaluateIdeaPortfolio, evaluateIdeaQuality } from "@/lib/ai-engine/idea-quality";
import { Idea } from "@/types/campaign";

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("idea-quality", () => {
  it("scores strong ideas as quality-ready", () => {
    const data = cloneSample();
    const idea: Idea = {
      id: "quality-strong",
      method: "Revolution",
      title: "Unexpected Elder Proof Sessions",
      description:
        "Instead of one-way reminders, run live elder proof sessions where trusted grandmothers demonstrate completed vaccination records. Launch weekly in market hubs and track on-time completion within 30 days.",
      linkToInsight: "Insight: Mothers fear social punishment more than disease.",
      linkToDriver: "Driver: affiliate, nurture. Why now: measles outbreaks.",
      feasibilityScore: 4,
      originalityScore: 5,
      strategicFitScore: 5,
      culturalFitScore: 4,
      selected: false,
    };

    const score = evaluateIdeaQuality(idea, data);

    expect(score.total).toBeGreaterThanOrEqual(70);
    expect(score.passes).toBe(true);
    expect(score.level === "good" || score.level === "strong").toBe(true);
  });

  it("flags weak ideas with actionable suggestions", () => {
    const data = cloneSample();
    const weakIdea: Idea = {
      id: "weak-idea",
      method: "RelatedWorlds",
      title: "Generic awareness",
      description: "Share awareness content online.",
      linkToInsight: "Insight: N/A",
      linkToDriver: "Driver: N/A",
      feasibilityScore: 2,
      originalityScore: 1,
      strategicFitScore: 1,
      culturalFitScore: 1,
      selected: false,
    };

    const score = evaluateIdeaQuality(weakIdea, data);

    expect(score.passes).toBe(false);
    expect(score.total).toBeLessThan(70);
    expect(score.suggestions.length).toBeGreaterThan(0);
  });

  it("summarizes portfolio pass-rate and average quality", () => {
    const data = cloneSample();
    const summary = evaluateIdeaPortfolio(data.ideas, data);

    expect(summary.passCount + summary.failCount).toBe(data.ideas.length);
    expect(summary.averageTotal).toBeGreaterThan(0);
    expect(summary.passRate).toBeGreaterThanOrEqual(0);
    expect(summary.passRate).toBeLessThanOrEqual(100);
  });
});
