import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { IdeationEngine } from "@/pages/campaign/IdeationEngine";

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("IdeationEngine", () => {
  it("generates active-method ideas with simple, readable idea backing text", async () => {
    const data = cloneSample();
    data.ideas = [];
    const onChange = vi.fn();

    render(<IdeationEngine data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /generate active method/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    const payload = onChange.mock.calls[0][0];
    expect(payload.ideas).toHaveLength(3);
    expect(payload.ideas.every((idea: { method: string }) => idea.method === "Revolution")).toBe(true);
    expect(payload.ideas[0].description).toContain("To execute");
    expect(payload.ideas.every((idea: { description: string }) => idea.description.includes("To execute"))).toBe(true);
    expect(payload.ideas[0].description).not.toContain("Surprise:");
    expect(payload.ideas[0].description).not.toContain("Relevance:");
    expect(payload.ideas[0].description).not.toContain("Action:");
    expect(payload.ideas[0].linkToInsight).toContain("Insight:");
    expect(payload.ideas[0].linkToDriver).toContain("Driver:");
    expect(payload.ideas[0].linkToDriver).toContain("Why now:");
    expect(new Set(payload.ideas.map((idea: { title: string }) => idea.title.toLowerCase())).size).toBe(
      payload.ideas.length,
    );
  });

  it("runs 4R sprint and generates one idea per method", async () => {
    const data = cloneSample();
    data.ideas = [];
    const onChange = vi.fn();

    render(<IdeationEngine data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /run 4r sprint/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const payload = onChange.mock.calls[0][0];
    const methods = payload.ideas.map((idea: { method: string }) => idea.method);
    expect(payload.ideas).toHaveLength(4);
    expect(methods).toContain("Revolution");
    expect(methods).toContain("RelatedWorlds");
    expect(methods).toContain("Re-expression");
    expect(methods).toContain("RandomLinks");
  });

  it("uses selected creative mode to vary generated idea execution style", async () => {
    const data = cloneSample();
    data.ideas = [];
    const onChange = vi.fn();

    render(<IdeationEngine data={data} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/ideation generation mode/i), {
      target: { value: "pragmatic" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate active method/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const payload = onChange.mock.calls[0][0];
    const descriptions = payload.ideas.map((idea: { description: string }) => idea.description.toLowerCase());

    expect(
      descriptions.some((description: string) =>
        /existing partner channels|simple rollout|low-cost weekly cadence/.test(description),
      ),
    ).toBe(true);
  });

  it("avoids repeating ideas on subsequent generation runs", async () => {
    const data = cloneSample();
    data.ideas = [];
    const onChange = vi.fn();

    const { rerender } = render(<IdeationEngine data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /generate active method/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const firstPayload = onChange.mock.calls[0][0];
    const firstGenerated = firstPayload.ideas;
    const firstTitles = new Set(firstGenerated.map((idea: { title: string }) => idea.title.toLowerCase()));

    const secondData = { ...data, ideas: firstGenerated };
    onChange.mockClear();
    rerender(<IdeationEngine data={secondData} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /generate active method/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const secondPayload = onChange.mock.calls[0][0];
    const secondGenerated = secondPayload.ideas.slice(firstGenerated.length);
    expect(secondGenerated).toHaveLength(3);
    expect(secondGenerated.every((idea: { title: string }) => !firstTitles.has(idea.title.toLowerCase()))).toBe(true);
  });

  it("supports manual create for ideas", () => {
    const data = cloneSample();
    data.ideas = [];
    const onChange = vi.fn();

    render(<IdeationEngine data={data} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/manual idea title/i), {
      target: { value: "Manual behavior nudge" },
    });
    fireEvent.change(screen.getByLabelText(/manual idea description/i), {
      target: {
        value:
          "Instead of clinic reminders, use neighborhood check-ins led by trusted community mothers.",
      },
    });
    fireEvent.change(screen.getByLabelText(/manual idea insight link/i), {
      target: { value: "Insight: Social proof drives timely action." },
    });
    fireEvent.change(screen.getByLabelText(/manual idea driver link/i), {
      target: { value: "Driver: Nurture" },
    });
    fireEvent.change(screen.getByLabelText(/manual idea relevance score/i), {
      target: { value: "5" },
    });

    fireEvent.click(screen.getByRole("button", { name: /add manual idea/i }));

    const payload = onChange.mock.calls[0][0];
    expect(payload.ideas).toHaveLength(1);
    expect(payload.ideas[0]).toMatchObject({
      method: "Revolution",
      title: "Manual behavior nudge",
      description: "Instead of clinic reminders, use neighborhood check-ins led by trusted community mothers.",
      linkToInsight: "Insight: Social proof drives timely action.",
      linkToDriver: "Driver: Nurture",
      strategicFitScore: 5,
    });
  });

  it("supports update and delete for existing ideas", () => {
    const data = cloneSample();
    data.ideas = data.ideas.slice(0, 2);
    const originalFirstIdeaId = data.ideas[0].id;
    const onChange = vi.fn();

    render(<IdeationEngine data={data} onChange={onChange} />);

    fireEvent.click(screen.getAllByLabelText(/edit idea/i)[0]);
    fireEvent.change(screen.getByLabelText(/edit idea title/i), {
      target: { value: "Updated Idea Title" },
    });
    fireEvent.change(screen.getByLabelText(/edit idea action score/i), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save idea/i }));

    const updatePayload = onChange.mock.calls[0][0];
    const updatedFirstIdea = updatePayload.ideas.find((idea: { id: string }) => idea.id === originalFirstIdeaId);
    expect(updatedFirstIdea).toMatchObject({
      title: "Updated Idea Title",
      feasibilityScore: 5,
    });

    onChange.mockClear();
    fireEvent.click(screen.getAllByLabelText(/delete idea/i)[0]);

    const deletePayload = onChange.mock.calls[0][0];
    expect(deletePayload.ideas).toHaveLength(1);
    expect(deletePayload.ideas.some((idea: { id: string }) => idea.id === originalFirstIdeaId)).toBe(false);
  });

  it("filters ideas by search query while preserving method context", () => {
    const data = cloneSample();
    const onChange = vi.fn();

    render(<IdeationEngine data={data} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/filter ideas/i), {
      target: { value: "grandmother" },
    });
    expect(screen.getByText(/grandmother champions/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/filter ideas/i), {
      target: { value: "no-match-idea" },
    });
    expect(screen.getByText(/no ideas for this method yet/i)).toBeInTheDocument();
  });

  it("shows BCD principle labels in the idea cards", () => {
    const data = cloneSample();
    const onChange = vi.fn();

    render(<IdeationEngine data={data} onChange={onChange} />);

    expect(screen.getAllByText(/surprise/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/revaluation\/relevance/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/performance\/action/i).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/creative design checkpoints, not campaign impact metrics/i),
    ).toBeInTheDocument();
  });

  it("can filter to quality-ready ideas only", () => {
    const data = cloneSample();
    data.ideas = [
      {
        ...data.ideas[0],
        id: "strong-idea",
        method: "Revolution",
        title: "Strong Idea",
        description:
          "Instead of passive reminders, run elder-led proof sessions and measure weekly on-time completion for mothers.",
      },
      {
        ...data.ideas[1],
        id: "weak-idea",
        method: "Revolution",
        title: "Weak Idea",
        description: "Share awareness content online.",
        originalityScore: 1,
        strategicFitScore: 1,
        feasibilityScore: 1,
      },
    ];

    const onChange = vi.fn();
    render(<IdeationEngine data={data} onChange={onChange} />);

    expect(screen.getByText("Strong Idea")).toBeInTheDocument();
    expect(screen.getByText("Weak Idea")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/show quality-ready ideas only/i));

    expect(screen.getByText("Strong Idea")).toBeInTheDocument();
    expect(screen.queryByText("Weak Idea")).not.toBeInTheDocument();
  });
});
