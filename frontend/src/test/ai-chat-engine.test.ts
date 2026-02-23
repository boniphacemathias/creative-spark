import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { runChatTurn } from "@/lib/ai-chat/chat-engine";
import { getDriveStorageService } from "@/lib/drive-storage";

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("ai-chat-engine", () => {
  beforeEach(() => {
    getDriveStorageService().clearAll();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds assistant response with campaign context and document citations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: "Campaign context: prioritize trusted messengers and clear weekly action prompts.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const drive = getDriveStorageService();
    drive.uploadFileFromContent({
      name: "research-notes.txt",
      mimeType: "text/plain",
      size: 120,
      content: "Insight: Caregivers delay due to social pressure from elders.",
      tags: ["insight", "caregiver"],
    });

    const result = await runChatTurn({
      prompt: "How should we improve the campaign brief?",
      campaign: cloneSample(),
      driveFiles: drive.getAllFiles(),
      includeExternal: true,
    });

    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toContain("Campaign context");
    expect(result.message.citations?.length ?? 0).toBeGreaterThan(0);
  });

  it("prioritizes explicitly tagged documents in citations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          result: "Using tagged evidence for relevance.",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const drive = getDriveStorageService();
    const untagged = drive.uploadFileFromContent({
      name: "general-brief.txt",
      mimeType: "text/plain",
      size: 120,
      content: "Generic background notes",
      tags: ["brief"],
    });
    const tagged = drive.uploadFileFromContent({
      name: "mvomero-report.txt",
      mimeType: "text/plain",
      size: 480,
      content: "Mvomero report highlights vaccine skepticism among elders.",
      tags: ["mvomero", "insight"],
    });

    const result = await runChatTurn({
      prompt: "What is the real problem in Mvomero?",
      campaign: cloneSample(),
      driveFiles: [untagged, tagged],
      taggedDocumentIds: [tagged.id],
    });

    expect(result.message.citations?.[0]?.id).toBe(tagged.id);
    expect(result.message.citations?.[0]?.label).toBe("mvomero-report.txt");
  });

  it("keeps social chat generic without forcing campaign framing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network unavailable"));

    const drive = getDriveStorageService();
    const result = await runChatTurn({
      prompt: "let us know each other",
      campaign: cloneSample(),
      driveFiles: drive.getAllFiles(),
    });

    expect(result.message.role).toBe("assistant");
    expect(result.message.content.toLowerCase()).toContain("ready to help");
    expect(result.message.content.toLowerCase()).not.toContain("campaign context");
    expect(result.message.citations?.length ?? 0).toBe(0);
  });
});
