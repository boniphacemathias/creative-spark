import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { TeamChatPanel } from "@/pages/campaign/TeamChatPanel";

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("TeamChatPanel", () => {
  it("parses mentions and emits collaboration updates", () => {
    const onChange = vi.fn();
    const data = cloneSample();

    render(<TeamChatPanel data={data} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/write a review comment/i), {
      target: { value: "Please review this before launch @Planner @CommsLead" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add comment/i }));

    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls[0][0];
    expect(payload.collaboration.messages[payload.collaboration.messages.length - 1].mentions).toEqual([
      "Planner",
      "CommsLead",
    ]);
    expect(payload.collaboration.messages[payload.collaboration.messages.length - 1].resolved).toBe(false);
    expect(payload.collaboration.members).toContain("CommsLead");
  });

  it("posts threaded replies and resolves comments", () => {
    const onChange = vi.fn();
    const data = cloneSample();

    render(<TeamChatPanel data={data} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: /reply/i })[0]);
    fireEvent.change(screen.getByPlaceholderText(/reply to/i), {
      target: { value: "Acknowledged. Will update docs." },
    });
    fireEvent.click(screen.getByRole("button", { name: /post reply/i }));

    const replyPayload = onChange.mock.calls[0][0];
    const createdReply = replyPayload.collaboration.messages[replyPayload.collaboration.messages.length - 1];
    expect(createdReply.parentId).toBe("msg-1");

    fireEvent.click(screen.getAllByRole("button", { name: /resolve/i })[0]);
    const resolvePayload = onChange.mock.calls[1][0];
    const resolvedThread = resolvePayload.collaboration.messages.find((message: { id: string }) => message.id === "msg-1");
    expect(resolvedThread.resolved).toBe(true);
    expect(resolvedThread.resolvedAt).toBeTruthy();
  });
});
