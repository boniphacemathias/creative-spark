import { getActiveWorkspaceId } from "@/lib/workspace";

export interface RecentCampaignVisit {
  campaignId: string;
  campaignName: string;
  lastVisitedAt: string;
}

const RECENT_STORAGE_KEY_PREFIX = "creative-spark-recent-campaigns";
const RECENT_CHANGE_EVENT = "creative-spark-recent-campaigns-change";
const MAX_RECENT_ITEMS = 20;

function getRecentStorageKey() {
  return `${RECENT_STORAGE_KEY_PREFIX}:${getActiveWorkspaceId()}`;
}

function readRecentVisits(): RecentCampaignVisit[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getRecentStorageKey());
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as RecentCampaignVisit[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((entry) => entry && typeof entry.campaignId === "string")
      .map((entry) => ({
        campaignId: String(entry.campaignId || "").trim(),
        campaignName: String(entry.campaignName || "Campaign").trim() || "Campaign",
        lastVisitedAt: typeof entry.lastVisitedAt === "string" ? entry.lastVisitedAt : new Date().toISOString(),
      }))
      .filter((entry) => entry.campaignId);
  } catch {
    return [];
  }
}

function writeRecentVisits(visits: RecentCampaignVisit[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getRecentStorageKey(), JSON.stringify(visits.slice(0, MAX_RECENT_ITEMS)));
  window.dispatchEvent(new CustomEvent(RECENT_CHANGE_EVENT));
}

export function listRecentCampaignVisits(limit = 8): RecentCampaignVisit[] {
  return readRecentVisits().slice(0, Math.max(1, limit));
}

export function recordCampaignVisit(input: { campaignId: string; campaignName?: string }) {
  const campaignId = String(input.campaignId || "").trim();
  if (!campaignId) {
    return;
  }

  const campaignName = String(input.campaignName || "Campaign").trim() || "Campaign";
  const existing = readRecentVisits();
  const filtered = existing.filter((entry) => entry.campaignId !== campaignId);
  const next: RecentCampaignVisit = {
    campaignId,
    campaignName,
    lastVisitedAt: new Date().toISOString(),
  };
  writeRecentVisits([next, ...filtered]);
}

export function subscribeRecentCampaignVisits(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== getRecentStorageKey()) {
      return;
    }
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(RECENT_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(RECENT_CHANGE_EVENT, listener);
  };
}
