import { describe, expect, it } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { KeyValueStorage } from "@/lib/storage/kv-storage";
import {
  CAMPAIGN_STORE_KEY_V2,
  LEGACY_CAMPAIGN_STORE_KEY_V1,
  LocalCampaignRepository,
} from "@/repositories/campaign-repository";
import { CampaignService } from "@/services/campaign-service";

class MemoryKV implements KeyValueStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

function cloneSample() {
  if (typeof structuredClone === "function") {
    return structuredClone(sampleCampaignData);
  }

  return JSON.parse(JSON.stringify(sampleCampaignData));
}

describe("CampaignService", () => {
  it("migrates legacy storage into v2 store", () => {
    const kv = new MemoryKV();
    kv.setItem(LEGACY_CAMPAIGN_STORE_KEY_V1, JSON.stringify([cloneSample()]));

    const service = new CampaignService(new LocalCampaignRepository(kv), cloneSample);
    const campaigns = service.listCampaigns();

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].campaign.id).toBe("demo");

    const migrated = kv.getItem(CAMPAIGN_STORE_KEY_V2);
    expect(migrated).toBeTruthy();
    expect(JSON.parse(migrated as string).version).toBe(2);
  });

  it("supports full CRUD lifecycle", () => {
    const service = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);

    const created = service.createCampaign({ name: "Growth Campaign" });
    expect(service.getCampaignById(created.campaign.id)?.campaign.name).toBe("Growth Campaign");

    const updated = service.updateCampaign(created.campaign.id, (current) => ({
      ...current,
      campaign: { ...current.campaign, name: "Growth Campaign Updated" },
    }));
    expect(updated.campaign.name).toBe("Growth Campaign Updated");

    const deleted = service.deleteCampaign(created.campaign.id);
    expect(deleted).toBe(true);
    expect(service.getCampaignById(created.campaign.id)).toBeNull();
  });

  it("initializes collaboration defaults for newly created campaigns", () => {
    const service = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);
    const created = service.createCampaign({ name: "Collab Campaign" });

    expect(created.collaboration.members.length).toBeGreaterThan(0);
    expect(created.collaboration.messages).toHaveLength(0);
  });

  it("enforces consistency by filtering invalid concept references", () => {
    const service = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);
    const created = service.createCampaign();

    const updated = service.updateCampaign(created.campaign.id, (current) => ({
      ...current,
      concepts: [
        {
          id: "test-concept",
          name: "Test",
          bigIdea: "Big",
          smp: "SMP",
          keyPromise: "Promise",
          supportPoints: [],
          tone: "Warm",
          selectedIdeaIds: ["missing-idea"],
          channels: ["Radio"],
          risks: [],
          status: "draft",
        },
      ],
    }));

    expect(updated.concepts[0].selectedIdeaIds).toEqual([]);
  });

  it("duplicates an existing campaign", () => {
    const service = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);
    const created = service.createCampaign({ name: "Primary Campaign" });
    const duplicate = service.duplicateCampaign(created.campaign.id);

    expect(duplicate.campaign.id).not.toBe(created.campaign.id);
    expect(duplicate.campaign.name).toContain("(Copy)");
    expect(service.listCampaigns().length).toBeGreaterThanOrEqual(3);
  });

  it("exports and imports campaign bundles", () => {
    const source = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);
    source.createCampaign({ name: "Portable Campaign" });
    const exported = source.exportCampaigns();

    const target = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);
    const result = target.importCampaigns(exported, "replace");

    expect(result.imported).toBeGreaterThan(0);
    expect(target.listCampaigns().length).toBe(result.imported);
  });

  it("hydrates collaboration defaults when importing legacy campaign shapes", () => {
    const target = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);
    const legacyCampaign = cloneSample() as unknown as Record<string, unknown>;
    delete legacyCampaign.collaboration;

    const payload = JSON.stringify({
      version: 1,
      campaigns: [legacyCampaign],
    });

    const result = target.importCampaigns(payload, "replace");
    const imported = target.listCampaigns();

    expect(result.imported).toBe(1);
    expect(imported[0].collaboration.members.length).toBeGreaterThan(0);
    expect(Array.isArray(imported[0].collaboration.messages)).toBe(true);
  });

  it("hydrates threaded-review defaults for legacy messages", () => {
    const target = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);
    const legacyCampaign = cloneSample() as unknown as Record<string, unknown>;
    legacyCampaign.collaboration = {
      members: ["Planner"],
      messages: [
        {
          id: "legacy-msg",
          author: "Planner",
          content: "Legacy message without review fields",
          createdAt: "2026-01-01T00:00:00.000Z",
          mentions: [],
        },
      ],
    };

    const payload = JSON.stringify({ campaigns: [legacyCampaign] });
    target.importCampaigns(payload, "replace");
    const imported = target.listCampaigns()[0];

    expect(imported.collaboration.messages[0].resolved).toBe(false);
    expect(imported.collaboration.messages[0].parentId).toBeUndefined();
  });

  it("resets storage to default sample", () => {
    const service = new CampaignService(new LocalCampaignRepository(new MemoryKV()), cloneSample);
    service.createCampaign({ name: "Will Be Removed" });
    const reset = service.resetToDefaultSample();

    expect(reset).toHaveLength(1);
    expect(reset[0].campaign.id).toBe("demo");
  });
});
