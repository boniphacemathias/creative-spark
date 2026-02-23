import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CreativeBriefStep } from "@/pages/campaign/CreativeBriefStep";
import { CampaignData } from "@/types/campaign";
import { generateCreativeBriefFromCampaign } from "@/lib/ai-engine/campaign-automation";

const automationMock = vi.hoisted(() => ({
  generateCreativeBriefFromCampaignWithAI: vi.fn(),
}));

vi.mock("@/lib/ai-engine/campaign-automation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai-engine/campaign-automation")>(
    "@/lib/ai-engine/campaign-automation",
  );

  return {
    ...actual,
    generateCreativeBriefFromCampaignWithAI: automationMock.generateCreativeBriefFromCampaignWithAI,
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

describe("CreativeBriefStep", () => {
  beforeEach(() => {
    automationMock.generateCreativeBriefFromCampaignWithAI.mockReset();
    automationMock.generateCreativeBriefFromCampaignWithAI.mockImplementation(
      async (campaign: CampaignData) => generateCreativeBriefFromCampaign(campaign),
    );
  });

  it("renders editable creative brief sections", () => {
    const data = cloneSample();
    const onChange = vi.fn();

    render(<CreativeBriefStep data={data} onChange={onChange} />);

    expect(screen.getByText(/creative brief/i)).toBeInTheDocument();
    expect(screen.getByText(/project overview/i)).toBeInTheDocument();
    expect(screen.getByText(/audience snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/the idea/i)).toBeInTheDocument();
    expect(screen.getByText(/mandatories & brand guardrails/i)).toBeInTheDocument();
    expect(screen.getByText(/deliverables \(exact specs\)/i)).toBeInTheDocument();
  });

  it("updates brief fields through onChange", () => {
    const data = cloneSample();
    const onChange = vi.fn();

    render(<CreativeBriefStep data={data} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/one action from one audience/i), {
      target: { value: "Build trust in CLEARKAMO as transformation partner." },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        creativeBrief: expect.objectContaining({
          singleMindedObjective: "Build trust in CLEARKAMO as transformation partner.",
        }),
      }),
    );
  });

  it("keeps deliverables inputs resizable and wide enough for side-to-side editing", () => {
    const data = cloneSample();
    const onChange = vi.fn();

    render(<CreativeBriefStep data={data} onChange={onChange} />);

    const assetField = screen.getAllByPlaceholderText(/^asset$/i)[0] as HTMLTextAreaElement;
    const platformField = screen.getAllByPlaceholderText(/^platform$/i)[0] as HTMLTextAreaElement;
    const table = screen.getByRole("table");

    expect(assetField.className).toContain("resize");
    expect(platformField.className).toContain("resize");
    expect(assetField.style.width).toBe("220px");
    expect(platformField.style.width).toBe("210px");
    expect(table.className).toContain("min-w-[1250px]");
  });

  it("adds and removes deliverables rows", () => {
    const data = cloneSample();
    const onChange = vi.fn();

    render(<CreativeBriefStep data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add deliverable/i }));

    const addPayload = onChange.mock.calls[0][0];
    expect(addPayload.creativeBrief.deliverables.length).toBe(data.creativeBrief.deliverables.length + 1);

    const firstRemoveButton = screen.getAllByRole("button", { name: /remove deliverable/i })[0];
    fireEvent.click(firstRemoveButton);

    const removePayload = onChange.mock.calls[1][0];
    expect(removePayload.creativeBrief.deliverables.length).toBe(data.creativeBrief.deliverables.length - 1);
  });

  it("generates draft values from campaign flow context (setup -> research -> communication -> concept)", async () => {
    const data = cloneSample();
    data.campaign.name = "Mvomero BASIN";
    data.situation = "Community trust in public services is fragile.";
    data.problem = "Households delay preventive actions despite available services.";
    data.communicationObjective = "Adopt water-safe practices before the next rainy season.";
    data.behavior.desiredBehavior = "Install and consistently use safe water practices.";
    data.driver.tension = "People value safety but fear social judgment for changing norms first.";
    data.insight.evidenceSource = "Mvomero CVCA 2025";
    data.creativeBrief.singleMindedObjective = "";
    data.creativeBrief.projectOverview = "";
    data.creativeBrief.background = "";
    data.creativeBrief.audienceWho = "";
    data.creativeBrief.audienceTension = "";
    data.creativeBrief.audienceDesiredChange = "";
    data.creativeBrief.keyProposition = "";
    data.creativeBrief.reasonsToBelieve = "";
    data.creativeBrief.toneAndPersonality = "";
    const onChange = vi.fn();

    render(<CreativeBriefStep data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(automationMock.generateCreativeBriefFromCampaignWithAI).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign: expect.objectContaining({ id: data.campaign.id, name: data.campaign.name }),
        communicationObjective: data.communicationObjective,
        behavior: expect.objectContaining({ desiredBehavior: data.behavior.desiredBehavior }),
      }),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        creativeBrief: expect.objectContaining({
          projectOverview: data.situation,
          background: expect.stringContaining(data.problem),
          singleMindedObjective: data.communicationObjective,
          audienceWho: expect.stringContaining(data.audiences[0].segmentName),
          audienceTension: expect.stringContaining(data.driver.tension),
          audienceDesiredChange: expect.stringContaining(data.behavior.desiredBehavior),
          keyProposition: data.concepts[0].smp,
          reasonsToBelieve: expect.stringContaining(data.insight.evidenceSource),
          toneAndPersonality: data.concepts[0].tone,
        }),
      }),
    );
  });

  it("syncs creative brief fields from previous campaign steps", () => {
    const data = cloneSample();
    data.communicationObjective = "Shift trust perception and drive weekly preventive action.";
    data.behavior.desiredBehavior = "Complete preventive action every week.";
    data.deliverablesNeeded = "Short video cutdown\nCommunity radio script";
    data.creativeBrief.singleMindedObjective = "Outdated objective";
    data.creativeBrief.audience = "Outdated audience";
    data.creativeBrief.projectName = "Outdated project";
    const onChange = vi.fn();

    render(<CreativeBriefStep data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /sync context/i }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        creativeBrief: expect.objectContaining({
          projectName: data.campaign.name,
          audience: `${data.audiences[0].segmentName}, ${data.audiences[1].segmentName}`,
          singleMindedObjective: data.communicationObjective,
          audienceDesiredChange: expect.stringContaining(data.behavior.desiredBehavior),
          deliverables: expect.arrayContaining([
            expect.objectContaining({ asset: "Short video cutdown" }),
          ]),
        }),
      }),
    );
  });

  it("applies AI draft output directly when generation returns explicit values", async () => {
    const data = cloneSample();
    const onChange = vi.fn();

    const aiDraft = {
      ...data.creativeBrief,
      projectOverview: "AI overview",
      singleMindedObjective: "AI single objective",
      keyProposition: "AI proposition",
      reasonsToBelieve: "AI evidence 1\nAI evidence 2",
    };
    automationMock.generateCreativeBriefFromCampaignWithAI.mockResolvedValueOnce(aiDraft);

    render(<CreativeBriefStep data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ creativeBrief: aiDraft }));
  });

  it("keeps command UI primitives renderable for workflow command surfaces", () => {
    render(
      <Command>
        <CommandInput placeholder="Search workflow" />
        <CommandList>
          <CommandItem value="setup">Campaign Setup</CommandItem>
          <CommandItem value="creative">Creative Brief</CommandItem>
        </CommandList>
      </Command>,
    );

    expect(screen.getByPlaceholderText(/search workflow/i)).toBeInTheDocument();
    expect(screen.getByText(/campaign setup/i)).toBeInTheDocument();
    expect(screen.getByText(/creative brief/i)).toBeInTheDocument();
  });

  it("exports html doc with creative-brief structure and no logo or watermark", () => {
    const data = cloneSample();
    const onChange = vi.fn();
    const originalCreate = (URL as unknown as { createObjectURL?: (blob: Blob) => string }).createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: (url: string) => void }).revokeObjectURL;
    const originalBlob = globalThis.Blob;
    const originalCreateElement = document.createElement.bind(document);

    const createObjectURL = vi.fn().mockReturnValue("blob:creative-brief");
    const revokeObjectURL = vi.fn();
    const blobSpy = vi.fn().mockImplementation((parts: unknown[], options?: { type?: string }) => ({
      parts,
      type: options?.type ?? "",
    }));
    const anchorClick = vi.fn();
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) => {
        if (tagName === "a") {
          return {
            click: anchorClick,
            href: "",
            download: "",
          } as unknown as HTMLAnchorElement;
        }
        return originalCreateElement(tagName);
      });

    (globalThis as unknown as { Blob: typeof Blob }).Blob = blobSpy as unknown as typeof Blob;
    (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = revokeObjectURL;

    try {
      render(<CreativeBriefStep data={data} onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", { name: /export doc/i }));

      expect(createObjectURL).toHaveBeenCalled();
      const blobArg = createObjectURL.mock.calls[0][0] as { parts: unknown[]; type: string };
      expect(blobArg.type).toBe("application/msword");
      const documentText = String(blobArg.parts[0] ?? "");
      expect(documentText).toContain("CREATIVE BRIEF");
      expect(documentText).toContain("Deliverables (Exact Specs)");
      expect(documentText).toContain("class=\"page\"");
      expect(documentText).toContain("box-sizing: border-box;");
      expect(documentText).toContain("overflow: hidden;");
      expect(documentText).toContain("class=\"deliverables\"");
      expect(documentText).toContain("table-layout: fixed;");
      expect(documentText).toContain("overflow-wrap: anywhere;");
      expect(documentText).toContain("word-wrap: break-word;");
      expect(documentText).toContain("word-break: break-word;");
      expect(documentText).toContain("mso-table-lspace: 0pt;");
      expect(documentText).not.toContain("class=\"watermark\"");
      expect(documentText).not.toContain("class=\"brand-header\"");
      expect(documentText).not.toContain("data:image/");
      expect(anchorClick).toHaveBeenCalled();
    } finally {
      createElementSpy.mockRestore();
      (globalThis as unknown as { Blob: typeof Blob }).Blob = originalBlob;
      if (originalCreate) {
        (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = originalCreate;
      }
      if (originalRevoke) {
        (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = originalRevoke;
      }
    }
  });
});
