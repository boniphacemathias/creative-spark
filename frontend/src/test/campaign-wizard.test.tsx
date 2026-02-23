import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CampaignWizard from "@/pages/CampaignWizard";
import { sampleCampaignData } from "@/data/sampleCampaign";

const storageMock = {
  getCampaignById: vi.fn(),
  upsertCampaign: vi.fn(),
};

vi.mock("@/lib/campaign-storage", () => ({
  getCampaignById: (...args: unknown[]) => storageMock.getCampaignById(...args),
  upsertCampaign: (...args: unknown[]) => storageMock.upsertCampaign(...args),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function renderWizard(path = "/campaign/demo") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/campaign/:id" element={<CampaignWizard />} />
      </Routes>
    </MemoryRouter>,
  );
}

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("CampaignWizard", () => {
  beforeEach(() => {
    storageMock.getCampaignById.mockReset();
    storageMock.upsertCampaign.mockReset();

    storageMock.getCampaignById.mockResolvedValue(cloneSample());
    storageMock.upsertCampaign.mockImplementation(async (payload: unknown) => [payload]);
  });

  it("loads campaign by id and renders setup step", async () => {
    renderWizard();

    await waitFor(() => expect(storageMock.getCampaignById).toHaveBeenCalledWith("demo"));
    expect(await screen.findByText("Campaign Setup")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("Immunize Naija")).toBeInTheDocument();
  });

  it("blocks next step when current step validation fails", async () => {
    renderWizard();

    const nameInput = await screen.findByDisplayValue("Immunize Naija");
    fireEvent.change(nameInput, { target: { value: "" } });
    await waitFor(() => expect((nameInput as HTMLInputElement).value).toBe(""));

    const nextButton = await screen.findByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    await waitFor(() => expect(screen.getByText("Campaign Setup")).toBeInTheDocument());
    expect(screen.queryByText("Research Inputs")).not.toBeInTheDocument();
  });
});
