import { describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { buildClientReportHtml, downloadClientReportDoc } from "@/lib/client-report";

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }
  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("client report export", () => {
  it("builds a detailed report with all core campaign output sections", () => {
    const html = buildClientReportHtml(cloneSample());

    expect(html).toContain("Communication Brief Output");
    expect(html).toContain("Creative Brief Output");
    expect(html).toContain("4Rs Ideation Output");
    expect(html).toContain("Concept Development Output");
    expect(html).toContain("Concept Board / Prototype Output");
    expect(html).toContain("Collaboration Log (Chat and Comments)");
  });

  it("downloads report as a client-report doc file", () => {
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
    const baseCreateElement = document.createElement.bind(document);
    const anchorProbe = baseCreateElement("a");
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string): HTMLElement => {
        if (tagName.toLowerCase() === "a") {
          return anchorProbe;
        }
        return baseCreateElement(tagName);
      });

    try {
      downloadClientReportDoc(cloneSample());

      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      const blob = createObjectUrlSpy.mock.calls[0][0] as Blob;
      expect(blob.type).toBe("application/msword");
      expect(anchorProbe.download).toContain("-client-report.doc");
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    } finally {
      createElementSpy.mockRestore();
      createObjectUrlSpy.mockRestore();
      revokeObjectUrlSpy.mockRestore();
      anchorClickSpy.mockRestore();
    }
  });
});
