import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { CommunicationBriefStep } from "@/pages/campaign/CommunicationBriefStep";

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("CommunicationBriefStep", () => {
  it("renders full communication brief template sections", () => {
    const onChange = vi.fn();
    const data = cloneSample();

    render(<CommunicationBriefStep data={data} onChange={onChange} />);

    expect(screen.getByText(/background & context/i)).toBeInTheDocument();
    expect(screen.getAllByText(/objectives/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/audience segmentation/i)).toBeInTheDocument();
    expect(screen.getByText(/human insight/i)).toBeInTheDocument();
    expect(screen.getAllByText(/message map/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/channels & roles/i)).toBeInTheDocument();
    expect(screen.getByText(/media\/activation plan & budget/i)).toBeInTheDocument();
    expect(screen.getByText(/content themes & calendar/i)).toBeInTheDocument();
    expect(screen.getByText(/deliverables needed/i)).toBeInTheDocument();
    expect(screen.getByText(/measurement & learning plan/i)).toBeInTheDocument();
    expect(screen.getByText(/governance, risks & approvals/i)).toBeInTheDocument();
    expect(screen.getByText(/timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/appendices/i)).toBeInTheDocument();
    expect(screen.getByText(/qa checklist/i)).toBeInTheDocument();
  });

  it("generates draft message map values for missing fields", async () => {
    const onChange = vi.fn();
    const data = cloneSample();
    data.audiences = data.audiences.map((audience) => ({
      ...audience,
      keyMessage: "",
      supportRtb: "",
      cta: "",
    }));

    render(<CommunicationBriefStep data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /generate draft/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        audiences: expect.arrayContaining([
          expect.objectContaining({
            keyMessage: expect.stringContaining("For"),
            supportRtb: expect.stringMatching(/\S/),
            cta: expect.stringMatching(/\S/),
          }),
        ]),
        channelRoles: expect.arrayContaining([
          expect.objectContaining({
            channel: expect.stringMatching(/\S/),
            role: expect.stringMatching(/\S/),
          }),
        ]),
        contentThemesAndCalendar: expect.stringMatching(/\S/),
        measurementAndLearningPlan: expect.stringMatching(/\S/),
      }),
    );
  });

  it("updates message map fields", () => {
    const onChange = vi.fn();
    const data = cloneSample();

    render(<CommunicationBriefStep data={data} onChange={onChange} />);
    fireEvent.change(screen.getAllByPlaceholderText(/core message for this audience/i)[0], {
      target: { value: "Custom key message" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        audiences: expect.arrayContaining([
          expect.objectContaining({ keyMessage: "Custom key message" }),
        ]),
      }),
    );
  });

  it("accepts input across communication brief placeholder fields", () => {
    const onChange = vi.fn();
    const data = cloneSample();
    data.channelRoles = [
      {
        id: "ch-test",
        category: "paid",
        channel: "",
        role: "",
      },
    ];
    data.mediaPlanRows = [
      {
        id: "media-test",
        channel: "",
        targeting: "",
        flighting: "",
        budget: "",
        kpi: "",
        benchmark: "",
      },
    ];

    render(<CommunicationBriefStep data={data} onChange={onChange} />);

    fireEvent.change(screen.getAllByPlaceholderText(/core message for this audience/i)[0], {
      target: { value: "Message for primary audience" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audiences: expect.arrayContaining([expect.objectContaining({ keyMessage: "Message for primary audience" })]),
      }),
    );

    fireEvent.change(screen.getAllByPlaceholderText(/reasons to believe \/ proof points/i)[0], {
      target: { value: "Proof point 1" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audiences: expect.arrayContaining([expect.objectContaining({ supportRtb: "Proof point 1" })]),
      }),
    );

    fireEvent.change(screen.getAllByPlaceholderText(/call to action/i)[0], {
      target: { value: "Book a session now" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        audiences: expect.arrayContaining([expect.objectContaining({ cta: "Book a session now" })]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/channel name \(e.g. sponsored linkedin campaigns\)/i), {
      target: { value: "Sponsored TV" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channelRoles: expect.arrayContaining([expect.objectContaining({ channel: "Sponsored TV" })]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/role in funnel/i), {
      target: { value: "Drive awareness and consideration" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channelRoles: expect.arrayContaining([
          expect.objectContaining({ role: "Drive awareness and consideration" }),
        ]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/channel \(e.g., radio\)/i), {
      target: { value: "Radio" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaPlanRows: expect.arrayContaining([expect.objectContaining({ channel: "Radio" })]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/targeting \(regions\/segments\)/i), {
      target: { value: "Urban mothers" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaPlanRows: expect.arrayContaining([expect.objectContaining({ targeting: "Urban mothers" })]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/flighting \(dates\)/i), {
      target: { value: "Q2 2026" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaPlanRows: expect.arrayContaining([expect.objectContaining({ flighting: "Q2 2026" })]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/^budget$/i), {
      target: { value: "$25,000" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaPlanRows: expect.arrayContaining([expect.objectContaining({ budget: "$25,000" })]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/kpi \(e.g., reach\/ctr\)/i), {
      target: { value: "Reach" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaPlanRows: expect.arrayContaining([expect.objectContaining({ kpi: "Reach" })]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/benchmark target/i), {
      target: { value: "2M" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mediaPlanRows: expect.arrayContaining([expect.objectContaining({ benchmark: "2M" })]),
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/add themes and publishing cadence/i), {
      target: { value: "Theme A\nCadence weekly" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentThemesAndCalendar: "Theme A\nCadence weekly",
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/list creative deliverables required/i), {
      target: { value: "Video cutdown\nStatic banners" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deliverablesNeeded: "Video cutdown\nStatic banners",
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/define kpis, benchmarks, and learning loops/i), {
      target: { value: "Primary KPI: Reach" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        measurementAndLearningPlan: "Primary KPI: Reach",
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/capture approvers, risks, and compliance guardrails/i), {
      target: { value: "Approver: Comms Lead" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        governanceRisksAndApprovals: "Approver: Comms Lead",
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/outline campaign phases, milestones, and dates/i), {
      target: { value: "Phase 1 - April" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timelineDetails: "Phase 1 - April",
      }),
    );

    fireEvent.change(screen.getByPlaceholderText(/add appendix references and supporting links\/files/i), {
      target: { value: "Appendix A: UTM scheme" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appendices: "Appendix A: UTM scheme",
      }),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /objectives are smart and measurable/i }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        qaChecklist: expect.arrayContaining([
          expect.objectContaining({
            id: "qa-objectives-smart",
            checked: false,
          }),
        ]),
      }),
    );
  });

  it("allows manual channels and roles entry", () => {
    const onChange = vi.fn();
    const data = cloneSample();
    data.channelRoles = [];

    render(<CommunicationBriefStep data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add channel role/i }));

    const addPayload = onChange.mock.calls[0][0];
    expect(addPayload.channelRoles).toHaveLength(1);
    expect(addPayload.channelRoles[0].category).toBe("paid");
  });

  it("exports a document-style brief that includes channels and roles section", async () => {
    const onChange = vi.fn();
    const data = cloneSample();
    const originalCreate = (URL as unknown as { createObjectURL?: (blob: Blob) => string }).createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: (url: string) => void }).revokeObjectURL;
    const originalBlob = globalThis.Blob;
    const originalCreateElement = document.createElement.bind(document);

    const createObjectURL = vi.fn().mockReturnValue("blob:brief");
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
    render(<CommunicationBriefStep data={data} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /export doc/i }));

    expect(createObjectURL).toHaveBeenCalled();
    const blobArg = createObjectURL.mock.calls[0][0] as { parts: unknown[]; type: string };
    expect(blobArg.type).toBe("application/msword");
    const documentText = String(blobArg.parts[0] ?? "");
    expect(documentText).toContain("COMMUNICATION BRIEF");
    expect(documentText).toContain("class=\"page\"");
    expect(documentText).not.toContain("class=\"brand-header\"");
    expect(documentText).not.toContain("class=\"brand-logo\"");
    expect(documentText).not.toContain("CLEARKAMO Logo");
    expect(documentText).not.toContain("data:image/");
    expect(documentText).not.toContain("class=\"watermark\"");
    expect(documentText).not.toContain("CLEARKAMO Symbol Watermark");
    expect(documentText).not.toContain("src=\"/public/");
    expect(documentText).not.toContain("http://");
    expect(documentText).not.toContain("https://");
    expect(documentText).toContain("ACTIVITY NAME");
    expect(documentText).toContain("AGENCY NAME");
    expect(documentText).toContain("Background | Context");
    expect(documentText).toContain("OBJECTIVES | ultimate impact?");
    expect(documentText).toContain("AUDIENCES SEGMENTATION");
    expect(documentText).toContain("Support/RTBs");
    expect(documentText).toContain("Message Map (by audience)");
    expect(documentText).toContain("Channels & Roles");
    expect(documentText).toContain("Media/Activation Plan & Budget");
    expect(documentText).toContain("Content Themes & Calendar");
    expect(documentText).toContain("Deliverables Needed");
    expect(documentText).toContain("Measurement & Learning Plan");
    expect(documentText).toContain("Governance, Risks & Approvals");
    expect(documentText).toContain("Timeline");
    expect(documentText).toContain("Appendices");
    expect(documentText).toContain("Communication Brief QA Checklist");
    expect(documentText).toContain("Paid");
    expect(documentText).toContain("Owned");
    expect(documentText).toContain("Earned");
    expect(documentText).toContain("Budget ties to KPIs; benchmarks defined");
    expect(anchorClick).toHaveBeenCalled();

    createElementSpy.mockRestore();
    (globalThis as unknown as { Blob: typeof Blob }).Blob = originalBlob;
    if (originalCreate) {
      (URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL = originalCreate;
    }
    if (originalRevoke) {
      (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = originalRevoke;
    }
  });
});
