import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { CampaignError } from "@/domain/campaign/errors";
import {
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  exportCampaigns,
  getCampaignById,
  getCampaignStorageStats,
  importCampaigns,
  listCampaigns,
  resetCampaigns,
  updateCampaign,
  upsertCampaign,
} from "@/lib/campaign-storage";

const serviceMock = {
  listCampaigns: vi.fn(),
  getCampaignById: vi.fn(),
  saveCampaign: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  duplicateCampaign: vi.fn(),
  exportCampaigns: vi.fn(),
  importCampaigns: vi.fn(),
  resetToDefaultSample: vi.fn(),
  getStorageStats: vi.fn(),
};

vi.mock("@/services/campaign-service", () => ({
  getCampaignService: () => serviceMock,
}));

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("campaign-storage wrappers", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    Object.values(serviceMock).forEach((fn) => fn.mockReset());
  });

  afterEach(() => {
    errorSpy.mockClear();
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it("returns fail-safe defaults on storage errors", async () => {
    const storageError = new CampaignError("STORAGE_READ_FAILED", "storage down");
    serviceMock.listCampaigns.mockImplementation(() => {
      throw storageError;
    });
    serviceMock.getCampaignById.mockImplementation(() => {
      throw storageError;
    });
    serviceMock.deleteCampaign.mockImplementation(() => {
      throw storageError;
    });
    serviceMock.exportCampaigns.mockImplementation(() => {
      throw storageError;
    });
    serviceMock.importCampaigns.mockImplementation(() => {
      throw storageError;
    });
    serviceMock.resetToDefaultSample.mockImplementation(() => {
      throw storageError;
    });
    serviceMock.getStorageStats.mockImplementation(() => {
      throw storageError;
    });

    await expect(listCampaigns()).resolves.toEqual([]);
    await expect(getCampaignById("demo")).resolves.toBeNull();
    await expect(deleteCampaign("demo")).resolves.toBe(false);
    await expect(exportCampaigns()).resolves.toBeNull();
    await expect(importCampaigns("{}", "merge")).resolves.toBeNull();
    await expect(resetCampaigns()).resolves.toEqual([]);
    await expect(getCampaignStorageStats()).resolves.toEqual({
      total: 0,
      byStatus: { draft: 0, in_review: 0, final: 0 },
    });
  });

  it("returns fail-safe defaults for mutation wrappers when service throws", async () => {
    const sample = cloneSample();
    serviceMock.listCampaigns.mockReturnValue([sample]);
    serviceMock.saveCampaign.mockImplementation(() => {
      throw new CampaignError("STORAGE_WRITE_FAILED", "write failed");
    });
    serviceMock.updateCampaign.mockImplementation(() => {
      throw new CampaignError("NOT_FOUND", "missing");
    });
    serviceMock.duplicateCampaign.mockImplementation(() => {
      throw new CampaignError("NOT_FOUND", "missing");
    });

    await expect(upsertCampaign(sample)).resolves.toEqual([sample]);
    await expect(updateCampaign("missing", (existing) => existing)).resolves.toBeNull();
    await expect(duplicateCampaign("missing")).resolves.toBeNull();
  });

  it("uses existing campaign as create fallback if create operation fails", async () => {
    const sample = cloneSample();
    serviceMock.listCampaigns.mockReturnValue([sample]);
    serviceMock.createCampaign.mockImplementation(() => {
      throw new CampaignError("STORAGE_WRITE_FAILED", "write failed");
    });

    await expect(createCampaign()).resolves.toEqual(sample);
  });

  it("prefers creating a new campaign in fallback mode even when campaigns already exist", async () => {
    const existing = cloneSample();
    const created = cloneSample();
    created.campaign.id = "campaign-new-fallback";
    created.campaign.name = "New Fallback Campaign";

    serviceMock.listCampaigns.mockReturnValue([existing]);
    serviceMock.createCampaign.mockReturnValue(created);

    await expect(createCampaign()).resolves.toEqual(created);
    expect(serviceMock.createCampaign).toHaveBeenCalledTimes(1);
  });

  it("passes through successful service responses", async () => {
    const sample = cloneSample();
    serviceMock.listCampaigns.mockReturnValue([sample]);
    serviceMock.getCampaignById.mockReturnValue(sample);
    serviceMock.createCampaign.mockReturnValue(sample);
    serviceMock.updateCampaign.mockReturnValue(sample);
    serviceMock.deleteCampaign.mockReturnValue(true);
    serviceMock.duplicateCampaign.mockReturnValue(sample);
    serviceMock.exportCampaigns.mockReturnValue("{\"ok\":true}");
    serviceMock.importCampaigns.mockReturnValue({ imported: 1, skipped: 0, mode: "merge" });
    serviceMock.resetToDefaultSample.mockReturnValue([sample]);
    serviceMock.getStorageStats.mockReturnValue({
      total: 1,
      byStatus: { draft: 1, in_review: 0, final: 0 },
    });

    await expect(listCampaigns()).resolves.toEqual([sample]);
    await expect(getCampaignById(sample.campaign.id)).resolves.toEqual(sample);
    await expect(createCampaign()).resolves.toEqual(sample);
    await expect(updateCampaign(sample.campaign.id, (existing) => existing)).resolves.toEqual(sample);
    await expect(deleteCampaign(sample.campaign.id)).resolves.toBe(true);
    await expect(duplicateCampaign(sample.campaign.id)).resolves.toEqual(sample);
    await expect(exportCampaigns()).resolves.toBe("{\"ok\":true}");
    await expect(importCampaigns("{}", "merge")).resolves.toEqual({ imported: 1, skipped: 0, mode: "merge" });
    await expect(resetCampaigns()).resolves.toEqual([sample]);
    await expect(getCampaignStorageStats()).resolves.toEqual({
      total: 1,
      byStatus: { draft: 1, in_review: 0, final: 0 },
    });
  });
});
