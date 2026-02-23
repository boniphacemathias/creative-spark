import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { ConceptBoard } from "@/pages/campaign/ConceptBoard";

const toastSpy = vi.fn();

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("ConceptBoard", () => {
  beforeEach(() => {
    toastSpy.mockReset();
  });

  it("renders key board sections including key visual direction, social posts, and radio script", () => {
    const data = cloneSample();
    data.concepts[0] = {
      ...data.concepts[0],
      tagline: "Proof first. Action now.",
      keyVisualDescription: "Human-centered decision moment.",
      executionRationale: "Connect insight to practical triggers.",
      behaviorTrigger: "Complete the next milestone this week.",
    };

    render(<ConceptBoard data={data} />);

    expect(screen.getByText(/concept board/i)).toBeInTheDocument();
    expect(screen.getAllByText(/key visual direction/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/sample copy blocks/i)).toBeInTheDocument();
    expect(screen.getByText(/social posts/i)).toBeInTheDocument();
    expect(screen.getByText(/radio script/i)).toBeInTheDocument();
    expect(screen.getByText(/message-to-barrier mapping/i)).toBeInTheDocument();
    expect(screen.getByText(/a\/b pretest questions/i)).toBeInTheDocument();
  });

  it("supports editable CRUD workflow and persists board updates into campaign concepts", async () => {
    const data = cloneSample();
    const onChange = vi.fn();

    render(<ConceptBoard data={data} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /add social post/i }));
    const socialPostFields = screen.getAllByLabelText(/social post/i);
    fireEvent.change(socialPostFields[socialPostFields.length - 1], {
      target: { value: "New community proof social post" },
    });

    fireEvent.change(screen.getByLabelText(/radio script/i), {
      target: { value: "Narrator: Act now and complete the next milestone in 14 days." },
    });

    fireEvent.click(screen.getByRole("button", { name: /add mapping row/i }));
    const barrierFields = screen.getAllByLabelText(/barrier /i);
    fireEvent.change(barrierFields[barrierFields.length - 1], {
      target: { value: "Conflicting household advice" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save board/i }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const payload = onChange.mock.calls[0][0];
    const updatedConcept = payload.concepts[0];

    expect(updatedConcept.boardData).toBeDefined();
    expect(updatedConcept.boardData.socialPosts).toContain("New community proof social post");
    expect(updatedConcept.boardData.radioScript).toContain("complete the next milestone in 14 days");
    expect(updatedConcept.boardData.messageBarrierMap.some((row: { barrier: string }) => row.barrier === "Conflicting household advice")).toBe(true);
  });

  it("copies share link to clipboard", async () => {
    const data = cloneSample();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ConceptBoard data={data} />);

    fireEvent.click(screen.getByRole("button", { name: /share link/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("concept=");
  });

  it("exports DOCX and PDF files", () => {
    const data = cloneSample();
    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        writable: true,
        value: () => "blob:mock",
      });
    }
    if (!("revokeObjectURL" in URL)) {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        writable: true,
        value: () => {},
      });
    }
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    try {
      render(<ConceptBoard data={data} />);

      fireEvent.click(screen.getByRole("button", { name: /export docx/i }));
      fireEvent.click(screen.getByRole("button", { name: /export pdf/i }));

      expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
      const firstBlob = createObjectUrlSpy.mock.calls[0][0] as Blob;
      const secondBlob = createObjectUrlSpy.mock.calls[1][0] as Blob;

      expect(firstBlob.type).toBe("application/msword");
      expect(secondBlob.type).toBe("application/pdf");
      expect(anchorClickSpy).toHaveBeenCalledTimes(2);
      expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(2);
    } finally {
      createObjectUrlSpy.mockRestore();
      revokeObjectUrlSpy.mockRestore();
      anchorClickSpy.mockRestore();
    }
  });
});
