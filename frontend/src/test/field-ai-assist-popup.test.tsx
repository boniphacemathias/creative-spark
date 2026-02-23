import { useRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldAIAssistPopup } from "@/components/ai-chat/FieldAIAssistPopup";
import { sampleCampaignData } from "@/data/sampleCampaign";

const chatApiMock = {
  runChatTurnApi: vi.fn(),
};

vi.mock("@/lib/chat-api", () => ({
  runChatTurnApi: (...args: unknown[]) => chatApiMock.runChatTurnApi(...args),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function Harness() {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <div ref={scopeRef} data-testid="field-assist-scope">
        <label htmlFor="audience-description">Audience Description</label>
        <textarea id="audience-description" defaultValue="" />
        <label htmlFor="campaign-objective">Campaign Objective</label>
        <input id="campaign-objective" defaultValue="" />
      </div>
      <FieldAIAssistPopup campaign={sampleCampaignData} scopeRef={scopeRef} />
    </div>
  );
}

describe("FieldAIAssistPopup", () => {
  it("generates and applies field-specific response to focused textarea", async () => {
    chatApiMock.runChatTurnApi.mockResolvedValue({
      message: {
        id: "assistant-1",
        role: "assistant",
        content: "Primary audience: Young mothers in peri-urban wards.",
        createdAt: new Date().toISOString(),
        citations: [],
      },
      messages: [],
    });

    render(<Harness />);

    const textarea = screen.getByLabelText("Audience Description") as HTMLTextAreaElement;
    fireEvent.focus(textarea);

    const openButton = await screen.findByTitle(/AI assist/i);
    fireEvent.click(openButton);

    const promptInput = await screen.findByPlaceholderText(
      /Tell AI what to generate for this specific field/i,
    );
    fireEvent.change(promptInput, { target: { value: "Draft a clear audience description." } });
    fireEvent.click(screen.getByRole("button", { name: /Ask AI/i }));

    await screen.findByText(/Primary audience: Young mothers/i);
    fireEvent.click(screen.getByRole("button", { name: /^Replace$/i }));

    await waitFor(() => {
      expect(textarea.value).toContain("Primary audience: Young mothers in peri-urban wards.");
    });
    expect(chatApiMock.runChatTurnApi).toHaveBeenCalledTimes(1);
  });

  it("switches to hovered field and hides quickly when cursor leaves the scope", async () => {
    render(<Harness />);

    const scope = screen.getByTestId("field-assist-scope");
    const textarea = screen.getByLabelText("Audience Description");
    const objective = screen.getByLabelText("Campaign Objective");

    fireEvent.mouseOver(textarea);
    expect(await screen.findByTitle("AI assist for Audience Description")).toBeInTheDocument();

    fireEvent.mouseOver(objective);
    expect(await screen.findByTitle("AI assist for Campaign Objective")).toBeInTheDocument();

    fireEvent.mouseLeave(scope);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 160));
    });

    await waitFor(() => {
      expect(screen.queryByTitle(/AI assist for/i)).not.toBeInTheDocument();
    });
  });
});
