import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { ResearchInputs } from "@/pages/campaign/ResearchInputs";

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("ResearchInputs", () => {
  it("updates situation input", () => {
    const onChange = vi.fn();
    const data = cloneSample();

    render(<ResearchInputs data={data} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/business situation/i), {
      target: { value: "Updated situation context" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ situation: "Updated situation context" }),
    );
  });

  it("adds and removes audience segments", () => {
    const onChange = vi.fn();
    const data = cloneSample();

    render(<ResearchInputs data={data} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /add audience/i }));
    const addPayload = onChange.mock.calls[0][0];
    expect(addPayload.audiences.length).toBe(data.audiences.length + 1);
    expect(
      screen.getAllByPlaceholderText(/head of household, government, enterprises/i).length,
    ).toBeGreaterThan(0);

    onChange.mockClear();
    fireEvent.click(screen.getAllByRole("button", { name: /remove audience/i })[0]);
    const removePayload = onChange.mock.calls[0][0];
    expect(removePayload.audiences.length).toBe(data.audiences.length - 1);
  });

  it("supports all 15 driver motives with multi-select checkboxes", () => {
    const onChange = vi.fn();
    const data = cloneSample();

    render(<ResearchInputs data={data} onChange={onChange} />);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(15);

    fireEvent.click(screen.getByLabelText(/driver motive fear/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: expect.objectContaining({
          driverTypes: expect.arrayContaining(["affiliate", "nurture", "fear"]),
          driverText: expect.stringContaining("Selected motives: Affiliate, Nurture, Fear"),
        }),
      }),
    );

    onChange.mockClear();
    fireEvent.click(screen.getByLabelText(/driver motive status/i));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: expect.objectContaining({
          driverTypes: expect.arrayContaining(["affiliate", "nurture", "status"]),
        }),
      }),
    );
  });

  it("auto-populates research, insight, driver, ideation, and concept fields from uploaded data", async () => {
    const onChange = vi.fn();
    const data = cloneSample();
    data.ideas = [];
    data.concepts = [];

    render(<ResearchInputs data={data} onChange={onChange} />);

    const fileContent = [
      "Situation: Community trust has dropped after recent misinformation waves.\n",
      "Problem: Caregivers delay key health actions even when services are available.\n",
      "Business Objective: Increase on-time action completion by 25% this quarter.\n",
      "Communication Objective: Think services are trustworthy; Feel confident; Do complete the action this week.\n",
      "Audience: Caregivers, Community Elders, Government Officers\n",
      "Insight: People want to protect their family but fear social judgment when acting first.\n",
      "Driver: social proof, nurture, status pressure from peers\n",
      "Desired Behavior: Complete the required service action before the next milestone.\n",
    ].join("");
    const file = new File([fileContent], "research-input.txt", { type: "text/plain" });

    fireEvent.change(screen.getByLabelText(/upload research documents/i), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const payload = onChange.mock.calls[0][0];

    expect(payload).toEqual(
      expect.objectContaining({
        situation: expect.stringMatching(/community trust/i),
        problem: expect.stringMatching(/caregivers delay/i),
        businessObjective: expect.stringMatching(/25%/i),
        communicationObjective: expect.stringMatching(/think services are trustworthy/i),
        insight: expect.objectContaining({
          insightText: expect.stringMatching(/protect their family/i),
          confidenceLevel: expect.stringMatching(/low|medium|high/),
        }),
        driver: expect.objectContaining({
          driverTypes: expect.arrayContaining(["nurture", "affiliate"]),
          driverText: expect.stringMatching(/social proof|status|nurture/i),
        }),
        ideas: expect.any(Array),
        concepts: expect.any(Array),
      }),
    );
    expect(payload.ideas.length).toBeGreaterThan(0);
    expect(payload.concepts.length).toBeGreaterThan(0);
  });

  it("handles empty or malformed uploads with non-empty automation fallbacks", async () => {
    const onChange = vi.fn();
    const data = cloneSample();

    render(<ResearchInputs data={data} onChange={onChange} />);

    const malformedFile = new File(["### ??? :::"], "broken.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/upload research documents/i), {
      target: { files: [malformedFile] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const malformedPayload = onChange.mock.calls[0][0];

    expect(malformedPayload.situation).toMatch(/\S/);
    expect(malformedPayload.problem).toMatch(/\S/);
    expect(malformedPayload.businessObjective).toMatch(/\S/);
    expect(malformedPayload.communicationObjective).toMatch(/\S/);
    expect(malformedPayload.insight.insightText).toMatch(/\S/);

    onChange.mockClear();

    const emptyFile = new File([""], "empty.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText(/upload research documents/i), {
      target: { files: [emptyFile] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const emptyPayload = onChange.mock.calls[0][0];

    expect(emptyPayload.situation).toMatch(/\S/);
    expect(emptyPayload.problem).toMatch(/\S/);
    expect(emptyPayload.insight.insightText).toMatch(/\S/);
    expect(emptyPayload.driver.driverTypes.length).toBeGreaterThan(0);
  });
});
