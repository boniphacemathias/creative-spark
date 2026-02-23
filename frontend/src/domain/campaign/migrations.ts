import { CampaignData } from "@/types/campaign";
import { CampaignRecord, CampaignStoreV2, parseCampaignData, parseCampaignStoreV2 } from "@/domain/campaign/schema";

function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyCampaignStoreV2(at: string = nowIso()): CampaignStoreV2 {
  return {
    version: 2,
    migratedAt: at,
    campaigns: [],
  };
}

export function tryParseCampaignStoreV2(raw: string): CampaignStoreV2 | null {
  try {
    return parseCampaignStoreV2(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function migrateLegacyCampaignArrayToV2(legacyRaw: string, at: string = nowIso()): CampaignStoreV2 {
  let parsed: unknown;

  try {
    parsed = JSON.parse(legacyRaw);
  } catch {
    return createEmptyCampaignStoreV2(at);
  }

  const legacyCampaigns = Array.isArray(parsed) ? parsed : [];
  const records: CampaignRecord[] = [];

  for (const candidate of legacyCampaigns) {
    try {
      const sanitized = parseCampaignData(candidate as CampaignData);
      records.push({
        id: sanitized.campaign.id,
        revision: 1,
        createdAt: at,
        updatedAt: at,
        data: sanitized,
      });
    } catch {
      continue;
    }
  }

  return {
    version: 2,
    migratedAt: at,
    campaigns: records,
  };
}
