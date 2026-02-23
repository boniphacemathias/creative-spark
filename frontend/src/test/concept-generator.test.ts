import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import {
  evaluateConceptQuality,
  generateConceptFromCampaign,
  generateConceptFromCampaignWithAI,
  measureConceptSimilarity,
} from "@/lib/ai-engine/concept-generator";

const generateTextViaApi = vi.fn();

vi.mock("@/lib/ai/ai-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/ai-client")>("@/lib/ai/ai-client");
  return {
    ...actual,
    generateTextViaApi: (...args: unknown[]) => generateTextViaApi(...args),
  };
});

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("concept-generator", () => {
  beforeEach(() => {
    generateTextViaApi.mockReset();
  });

  it("builds concept from selected lead idea and keeps campaign-step context in sync", () => {
    const data = cloneSample();
    data.ideas = data.ideas.map((idea) => ({
      ...idea,
      selected: idea.id === "re-1" || idea.id === "rev-2",
    }));
    data.communicationObjective = "Mothers choose full immunization despite social pressure.";

    const concept = generateConceptFromCampaign(data, {
      mode: "cultural",
      leadIdeaId: "re-1",
    });

    expect(concept.name).toContain("Shield, Not Shot");
    expect(concept.selectedIdeaIds).toEqual(expect.arrayContaining(["re-1", "rev-2"]));
    expect(concept.channels.length).toBeGreaterThan(0);
    expect(concept.channels[0]).toBe(data.channelRoles[0].channel);
    expect(concept.keyPromise).toMatch(/more likely to/i);
    expect(concept.supportPoints.join(" ")).toMatch(/objective alignment/i);
    expect(concept.tone).toMatch(/culturally grounded/i);
    expect(concept.behaviorTrigger).toMatch(/within|by|week|day/i);
  });

  it("returns a resilient concept scaffold when no ideas exist", () => {
    const data = cloneSample();
    data.ideas = [];

    const concept = generateConceptFromCampaign(data);

    expect(concept.selectedIdeaIds).toHaveLength(0);
    expect(concept.bigIdea).toMatch(/unexpectedly|metaphor|action/i);
    expect(concept.behaviorTrigger).toMatch(/\S/);
    expect(concept.channels.length).toBeGreaterThan(0);
  });

  it("avoids repeating near-duplicate concepts against existing concept library", () => {
    const data = cloneSample();
    data.ideas = data.ideas.map((idea, index) => ({ ...idea, selected: index <= 1 }));
    const first = generateConceptFromCampaign(data, {
      mode: "balanced",
      leadIdeaId: data.ideas[0].id,
      existingConcepts: [],
    });

    const second = generateConceptFromCampaign(data, {
      mode: "balanced",
      leadIdeaId: data.ideas[0].id,
      existingConcepts: [first],
    });

    expect(measureConceptSimilarity(second, first)).toBeLessThan(0.78);
  });

  it("scores concept quality across scalable, universal, memorable, simple and unexpected-relevant traits", () => {
    const data = cloneSample();
    const concept = generateConceptFromCampaign(data, {
      mode: "bold",
      existingConcepts: data.concepts,
    });

    const quality = evaluateConceptQuality(concept, data);
    expect(quality.scalable).toBeGreaterThan(0);
    expect(quality.universal).toBeGreaterThan(0);
    expect(quality.memorable).toBeGreaterThan(0);
    expect(quality.simple).toBeGreaterThan(0);
    expect(quality.unexpectedRelevant).toBeGreaterThan(0);
    expect(quality.total).toBeGreaterThanOrEqual(55);
  });

  it("normalizes AI concept response and enforces action trigger timing", async () => {
    const data = cloneSample();
    data.ideas = data.ideas.map((idea, index) => ({ ...idea, selected: index === 0 }));
    generateTextViaApi.mockResolvedValueOnce(
      JSON.stringify({
        name: "Community Trust Flywheel",
        bigIdea: "Make trusted proof visible through elder-led demonstration moments.",
        smp: "Proof beats fear.",
        keyPromise: "Trust loops increase on-time completion.",
        supportPoints: ["Elder proof sessions", "Public completion board"],
        tone: "Warm, decisive",
        channels: ["Community radio", "Market activations"],
        risks: ["May need local adaptation"],
        tagline: "Proof first, protection next",
        keyVisualDescription: "Grandmothers affirming vaccination in public spaces",
        executionRationale: "Align trusted voices with scheduled action prompts",
        behaviorTrigger: "Prompt caregivers to complete the next dose",
      }),
    );

    const concept = await generateConceptFromCampaignWithAI(data, { mode: "bold" });

    expect(concept.name).toMatch(/community trust flywheel/i);
    expect(concept.channels).toEqual(expect.arrayContaining(["Community radio"]));
    expect(concept.behaviorTrigger).toMatch(/within|by|week|day/i);
  });
});
