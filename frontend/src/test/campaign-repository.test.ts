import { describe, expect, it } from "vitest";
import { sampleCampaignData } from "@/data/sampleCampaign";
import { CampaignError } from "@/domain/campaign/errors";
import {
  CAMPAIGN_STORE_KEY_V2,
  LEGACY_CAMPAIGN_STORE_KEY_V1,
  LocalCampaignRepository,
} from "@/repositories/campaign-repository";
import { KeyValueStorage } from "@/lib/storage/kv-storage";

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

describe("LocalCampaignRepository", () => {
  it("supports create, update, upsert and delete with proper revisioning", () => {
    const repo = new LocalCampaignRepository(new MemoryKV());
    const data = cloneSample();

    const created = repo.create(data);
    expect(created.revision).toBe(1);

    const updated = repo.update(data.campaign.id, {
      ...data,
      campaign: { ...data.campaign, name: "Updated Name" },
    });
    expect(updated.revision).toBe(2);
    expect(updated.data.campaign.name).toBe("Updated Name");

    const upserted = repo.upsert({
      ...updated.data,
      campaign: { ...updated.data.campaign, country: "Ghana" },
    });
    expect(upserted.revision).toBe(3);
    expect(upserted.data.campaign.country).toBe("Ghana");

    const deleted = repo.delete(data.campaign.id);
    expect(deleted).toBe(true);
    expect(repo.getById(data.campaign.id)).toBeNull();
  });

  it("rejects update when payload ID does not match route ID", () => {
    const repo = new LocalCampaignRepository(new MemoryKV());
    const data = cloneSample();
    repo.create(data);

    expect(() =>
      repo.update(data.campaign.id, {
        ...data,
        campaign: { ...data.campaign, id: "another-id" },
      }),
    ).toThrow(CampaignError);
  });

  it("migrates legacy v1 array into v2 store on first read", () => {
    const kv = new MemoryKV();
    kv.setItem(LEGACY_CAMPAIGN_STORE_KEY_V1, JSON.stringify([cloneSample()]));

    const repo = new LocalCampaignRepository(kv);
    const list = repo.list();

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("demo");
    const currentStore = kv.getItem(CAMPAIGN_STORE_KEY_V2);
    expect(currentStore).toBeTruthy();
  });
});
