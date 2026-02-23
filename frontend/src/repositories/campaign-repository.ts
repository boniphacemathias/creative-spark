import { CampaignData } from "@/types/campaign";
import { CampaignError, toCampaignError } from "@/domain/campaign/errors";
import {
  CampaignRecord,
  CampaignStoreV2,
  parseCampaignData,
  parseCampaignRecord,
} from "@/domain/campaign/schema";
import { KeyValueStorage } from "@/lib/storage/kv-storage";
import {
  createEmptyCampaignStoreV2,
  migrateLegacyCampaignArrayToV2,
  tryParseCampaignStoreV2,
} from "@/domain/campaign/migrations";

const LEGACY_KEY = "sbcc_builder_campaigns_v1";
const STORE_KEY = "sbcc_builder_campaigns_v2";

export interface CampaignRepository {
  list(): CampaignRecord[];
  getById(id: string): CampaignRecord | null;
  upsert(data: CampaignData): CampaignRecord;
  create(data: CampaignData): CampaignRecord;
  update(id: string, data: CampaignData): CampaignRecord;
  delete(id: string): boolean;
  replaceAll(campaigns: CampaignData[]): CampaignRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneRecord(record: CampaignRecord): CampaignRecord {
  if (typeof structuredClone === "function") {
    return structuredClone(record);
  }

  return JSON.parse(JSON.stringify(record)) as CampaignRecord;
}

function emptyStore(): CampaignStoreV2 {
  return createEmptyCampaignStoreV2(nowIso());
}

function dedupeRecords(records: CampaignRecord[]): CampaignRecord[] {
  const byId = new Map<string, CampaignRecord>();

  for (const record of records) {
    const existing = byId.get(record.id);
    if (!existing || existing.updatedAt < record.updatedAt) {
      byId.set(record.id, record);
    }
  }

  return [...byId.values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export class LocalCampaignRepository implements CampaignRepository {
  constructor(private readonly storage: KeyValueStorage) {}

  list(): CampaignRecord[] {
    return this.readStore().campaigns.map(cloneRecord);
  }

  getById(id: string): CampaignRecord | null {
    const record = this.readStore().campaigns.find((campaign) => campaign.id === id);
    return record ? cloneRecord(record) : null;
  }

  upsert(data: CampaignData): CampaignRecord {
    const sanitized = parseCampaignData(data);
    const store = this.readStore();
    const existing = store.campaigns.find((record) => record.id === sanitized.campaign.id);

    if (!existing) {
      return this.create(sanitized);
    }

    const updated: CampaignRecord = parseCampaignRecord({
      ...existing,
      updatedAt: nowIso(),
      revision: existing.revision + 1,
      data: sanitized,
    });

    store.campaigns = dedupeRecords(
      store.campaigns.map((record) => (record.id === updated.id ? updated : record)),
    );

    this.writeStore(store);
    return cloneRecord(updated);
  }

  create(data: CampaignData): CampaignRecord {
    const sanitized = parseCampaignData(data);
    const store = this.readStore();

    if (store.campaigns.some((record) => record.id === sanitized.campaign.id)) {
      throw new CampaignError("CONFLICT", `Campaign already exists: ${sanitized.campaign.id}`);
    }

    const timestamp = nowIso();
    const created = parseCampaignRecord({
      id: sanitized.campaign.id,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      data: sanitized,
    });

    store.campaigns = dedupeRecords([...store.campaigns, created]);
    this.writeStore(store);

    return cloneRecord(created);
  }

  update(id: string, data: CampaignData): CampaignRecord {
    const sanitized = parseCampaignData(data);
    const store = this.readStore();
    const existing = store.campaigns.find((record) => record.id === id);

    if (!existing) {
      throw new CampaignError("NOT_FOUND", `Campaign not found: ${id}`);
    }

    if (sanitized.campaign.id !== id) {
      throw new CampaignError("VALIDATION_FAILED", "Campaign update ID mismatch", {
        expected: id,
        actual: sanitized.campaign.id,
      });
    }

    const updated = parseCampaignRecord({
      ...existing,
      data: sanitized,
      revision: existing.revision + 1,
      updatedAt: nowIso(),
    });

    store.campaigns = dedupeRecords(
      store.campaigns.map((record) => (record.id === updated.id ? updated : record)),
    );
    this.writeStore(store);

    return cloneRecord(updated);
  }

  delete(id: string): boolean {
    const store = this.readStore();
    const before = store.campaigns.length;
    store.campaigns = store.campaigns.filter((record) => record.id !== id);

    if (before === store.campaigns.length) {
      return false;
    }

    this.writeStore(store);
    return true;
  }

  replaceAll(campaigns: CampaignData[]): CampaignRecord[] {
    const timestamp = nowIso();
    const records = dedupeRecords(
      campaigns.map((campaign) => {
        const sanitized = parseCampaignData(campaign);
        return parseCampaignRecord({
          id: sanitized.campaign.id,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          data: sanitized,
        });
      }),
    );

    const store = {
      version: 2,
      migratedAt: timestamp,
      campaigns: records,
    } satisfies CampaignStoreV2;

    this.writeStore(store);

    return records.map(cloneRecord);
  }

  private readStore(): CampaignStoreV2 {
    try {
      const currentRaw = this.storage.getItem(STORE_KEY);
      if (currentRaw) {
        const parsed = tryParseCampaignStoreV2(currentRaw);
        if (parsed) {
          return {
            ...parsed,
            campaigns: dedupeRecords(parsed.campaigns),
          };
        }
      }

      const legacyRaw = this.storage.getItem(LEGACY_KEY);
      if (!legacyRaw) {
        const fresh = emptyStore();
        this.writeStore(fresh);
        return fresh;
      }

      const migrated = migrateLegacyCampaignArrayToV2(legacyRaw, nowIso());
      this.writeStore(migrated);
      return migrated;
    } catch (error) {
      throw toCampaignError(error, "STORAGE_READ_FAILED", "Failed to load campaign store");
    }
  }

  private writeStore(store: CampaignStoreV2): void {
    try {
      this.storage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (error) {
      throw toCampaignError(error, "STORAGE_WRITE_FAILED", "Failed to persist campaign store");
    }
  }

}

export const CAMPAIGN_STORE_KEY_V2 = STORE_KEY;
export const LEGACY_CAMPAIGN_STORE_KEY_V1 = LEGACY_KEY;
