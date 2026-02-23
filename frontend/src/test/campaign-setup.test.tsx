import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { CampaignSetup } from "@/pages/campaign/CampaignSetup";

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("CampaignSetup", () => {
  it("prevents duplicate languages", () => {
    const onChange = vi.fn();
    const data = cloneSample();
    render(<CampaignSetup data={data} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/add language/i), {
      target: { value: "English" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/language already exists/i)).toBeInTheDocument();
  });

  it("auto-adjusts end date if start date moves later", () => {
    const onChange = vi.fn();
    const data = cloneSample();
    render(<CampaignSetup data={data} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/start date/i), {
      target: { value: "2027-02-01" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign: expect.objectContaining({
          startDate: "2027-02-01",
          endDate: "2027-02-01",
        }),
      }),
    );
  });
});
