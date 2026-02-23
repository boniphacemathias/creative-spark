import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { ConceptDevelopment } from "@/pages/campaign/ConceptDevelopment";
import type { Concept } from "@/types/campaign";

const generateConceptFromCampaignWithAI = vi.fn();

vi.mock("@/lib/ai-engine/concept-generator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-engine/concept-generator")>();
  return {
    ...actual,
    generateConceptFromCampaignWithAI: (...args: unknown[]) =>
      generateConceptFromCampaignWithAI(...args),
  };
});

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

function buildConcept(data = cloneSample()): Concept {
  return {
    id: "concept-test",
    name: "Trust Loop Concept",
    bigIdea: "Convert trusted community voices into visible proof loops that trigger action.",
    smp: "Trusted proof drives timely action.",
    keyPromise: "If we deploy trust loops, mothers complete immunization milestones on schedule.",
    supportPoints: ["Point A", "Point B"],
    tone: "Human, confident, practical",
    selectedIdeaIds: [data.ideas[0]?.id || "rev-1"],
    channels: ["Community radio", "WhatsApp"],
    risks: ["Needs pretest"],
    status: "draft",
    tagline: "Proof first. Action now.",
    keyVisualDescription: "A trusted elder validating action in public.",
    executionRationale: "Aligns motive and behavior with visible social proof.",
    behaviorTrigger: "Complete the next scheduled dose within 14 days.",
  };
}

function buildConceptWithId(id: string, ideaId: string): Concept {
  const base = buildConcept();
  return {
    ...base,
    id,
    name: `Robust Concept ${id}`,
    selectedIdeaIds: [ideaId],
  };
}

describe("ConceptDevelopment", () => {
  beforeEach(() => {
    generateConceptFromCampaignWithAI.mockReset();
  });

  it("passes selected lead idea and generation mode into concept generation", async () => {
    const data = cloneSample();
    data.concepts = [];
    data.ideas = data.ideas.map((idea, index) => ({ ...idea, selected: index <= 1 }));
    const onChange = vi.fn();
    generateConceptFromCampaignWithAI.mockResolvedValueOnce(buildConcept(data));

    render(<ConceptDevelopment data={data} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/concept generation mode/i), {
      target: { value: "bold" },
    });
    fireEvent.change(screen.getByLabelText(/concept lead idea/i), {
      target: { value: data.ideas[1].id },
    });
    fireEvent.click(screen.getByRole("button", { name: /new concept/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(generateConceptFromCampaignWithAI).toHaveBeenCalledWith(
      data,
      expect.objectContaining({
        mode: "bold",
        leadIdeaId: data.ideas[1].id,
      }),
    );
  });

  it("auto-generates concept fields from selected ideas", async () => {
    const data = cloneSample();
    data.concepts = [];
    data.ideas = data.ideas.map((idea, index) => ({ ...idea, selected: index === 0 }));
    const onChange = vi.fn();
    generateConceptFromCampaignWithAI.mockResolvedValueOnce(buildConcept(data));

    render(<ConceptDevelopment data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /new concept/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const payload = onChange.mock.calls[0][0];
    expect(payload.concepts).toHaveLength(1);
    expect(payload.concepts[0]).toEqual(
      expect.objectContaining({
        bigIdea: expect.stringMatching(/\S/),
        tagline: expect.stringMatching(/\S/),
        keyVisualDescription: expect.stringMatching(/\S/),
        executionRationale: expect.stringMatching(/\S/),
        behaviorTrigger: expect.stringMatching(/\S/),
      }),
    );
    expect(payload.concepts[0].selectedIdeaIds).toContain(data.ideas[0].id);
    expect(payload.concepts[0].keyPromise).toMatch(/mothers complete immunization milestones/i);
  });

  it("automates robust concept pack generation from 4Rs ideation sync", async () => {
    const data = cloneSample();
    data.concepts = [];
    data.ideas = data.ideas.map((idea, index) => ({ ...idea, selected: index <= 3 }));
    const onChange = vi.fn();

    const selectedIdeaIds = data.ideas.filter((idea) => idea.selected).map((idea) => idea.id);
    generateConceptFromCampaignWithAI
      .mockResolvedValueOnce(buildConceptWithId("sync-1", selectedIdeaIds[0]))
      .mockResolvedValueOnce(buildConceptWithId("sync-2", selectedIdeaIds[1]))
      .mockResolvedValueOnce(buildConceptWithId("sync-3", selectedIdeaIds[2]))
      .mockResolvedValueOnce(buildConceptWithId("sync-4", selectedIdeaIds[3]));

    render(<ConceptDevelopment data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /sync from 4rs/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(generateConceptFromCampaignWithAI).toHaveBeenCalledTimes(4);
    expect(generateConceptFromCampaignWithAI.mock.calls[0][1]).toEqual(
      expect.objectContaining({ leadIdeaId: expect.any(String) }),
    );
    expect(generateConceptFromCampaignWithAI.mock.calls[1][1]).toEqual(
      expect.objectContaining({ existingConcepts: expect.any(Array) }),
    );

    const payload = onChange.mock.calls[0][0];
    expect(payload.concepts).toHaveLength(4);
    expect(payload.concepts.every((concept: Concept) => concept.selectedIdeaIds.length > 0)).toBe(true);
  });
});
