import { CampaignData } from "@/types/campaign";
import {
  getCampaignService,
  CampaignImportResult,
  CampaignStorageStats,
} from "@/services/campaign-service";
import { appendRequestIdToErrorMessage, buildJsonHeaders } from "@/lib/api/request-tracing";
import { recordActivityEvent } from "@/lib/activity-log";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { sampleCampaignData } from "@/data/sampleCampaign";

const API_BASE_URL =
  import.meta.env.VITE_CAMPAIGN_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8787";
const API_AUTH_TOKEN = (typeof import.meta.env.VITE_BACKEND_AUTH_TOKEN === "string"
  ? import.meta.env.VITE_BACKEND_AUTH_TOKEN.trim()
  : "");

const EMPTY_STORAGE_STATS: CampaignStorageStats = {
  total: 0,
  byStatus: { draft: 0, in_review: 0, final: 0 },
};

function cloneCampaign(data: CampaignData): CampaignData {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }

  return JSON.parse(JSON.stringify(data)) as CampaignData;
}

function logCampaignStorageError(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[campaign-storage] ${scope}: ${message}`);
}

function listCampaignsFromServiceSafe(): CampaignData[] {
  try {
    return getCampaignService().listCampaigns();
  } catch (error) {
    logCampaignStorageError("fallback listCampaigns", error);
    return [];
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders =
    API_AUTH_TOKEN
      ? {
          Authorization: `Bearer ${API_AUTH_TOKEN}`,
          "X-API-Key": API_AUTH_TOKEN,
        }
      : {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildJsonHeaders(init?.headers, {
      ...authHeaders,
      "X-Workspace-Id": getActiveWorkspaceId(),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    const baseError = (payload.error || payload.message || `Campaign API request failed: ${response.status}`).trim();
    throw new Error(appendRequestIdToErrorMessage(baseError, response));
  }

  return (await response.json()) as T;
}

export async function listCampaigns(): Promise<CampaignData[]> {
  try {
    return await requestJson<CampaignData[]>("/api/campaigns");
  } catch (error) {
    logCampaignStorageError("listCampaigns", error);
    return listCampaignsFromServiceSafe();
  }
}

export async function getCampaignById(id: string): Promise<CampaignData | null> {
  try {
    return await requestJson<CampaignData>(`/api/campaigns/${encodeURIComponent(id)}`);
  } catch (error) {
    logCampaignStorageError("getCampaignById", error);
    try {
      return getCampaignService().getCampaignById(id);
    } catch (fallbackError) {
      logCampaignStorageError("fallback getCampaignById", fallbackError);
      return null;
    }
  }
}

export async function upsertCampaign(data: CampaignData): Promise<CampaignData[]> {
  try {
    await requestJson<CampaignData>(`/api/campaigns/${encodeURIComponent(data.campaign.id)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return await listCampaigns();
  } catch (error) {
    logCampaignStorageError("upsertCampaign", error);
    try {
      getCampaignService().saveCampaign(data);
    } catch (fallbackError) {
      logCampaignStorageError("fallback saveCampaign", fallbackError);
    }
    const fallbackList = listCampaignsFromServiceSafe();
    return fallbackList.length > 0 ? fallbackList : [cloneCampaign(data)];
  }
}

export async function createCampaign(): Promise<CampaignData> {
  try {
    const created = await requestJson<CampaignData>("/api/campaigns", {
      method: "POST",
    });
    recordActivityEvent({
      action: "campaign_created",
      message: `Created campaign "${created.campaign.name}".`,
    });
    return created;
  } catch (error) {
    logCampaignStorageError("createCampaign", error);
    try {
      const created = getCampaignService().createCampaign();
      recordActivityEvent({
        action: "campaign_created",
        message: `Created campaign "${created.campaign.name}".`,
      });
      return created;
    } catch (fallbackError) {
      logCampaignStorageError("fallback createCampaign", fallbackError);
      const fallbackExisting = listCampaignsFromServiceSafe();
      if (fallbackExisting.length > 0) {
        return fallbackExisting[0];
      }
      return cloneCampaign(sampleCampaignData);
    }
  }
}

export async function updateCampaign(
  id: string,
  updater: (existing: CampaignData) => CampaignData,
): Promise<CampaignData | null> {
  try {
    const existing = await getCampaignById(id);
    if (!existing) {
      return null;
    }

    const next = updater(existing);
    if (next.campaign.id !== id) {
      return null;
    }

    return await requestJson<CampaignData>(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(next),
    });
  } catch (error) {
    logCampaignStorageError("updateCampaign", error);
    try {
      return getCampaignService().updateCampaign(id, updater);
    } catch (fallbackError) {
      logCampaignStorageError("fallback updateCampaign", fallbackError);
      return null;
    }
  }
}

export async function deleteCampaign(id: string): Promise<boolean> {
  try {
    const result = await requestJson<{ deleted: boolean }>(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (result.deleted) {
      recordActivityEvent({
        action: "campaign_deleted",
        message: `Deleted campaign ${id}.`,
      });
    }
    return result.deleted;
  } catch (error) {
    logCampaignStorageError("deleteCampaign", error);
    try {
      return getCampaignService().deleteCampaign(id);
    } catch (fallbackError) {
      logCampaignStorageError("fallback deleteCampaign", fallbackError);
      return false;
    }
  }
}

export async function duplicateCampaign(id: string): Promise<CampaignData | null> {
  try {
    const duplicated = await requestJson<CampaignData>(`/api/campaigns/${encodeURIComponent(id)}/duplicate`, {
      method: "POST",
    });
    recordActivityEvent({
      action: "campaign_duplicated",
      message: `Duplicated campaign as "${duplicated.campaign.name}".`,
    });
    return duplicated;
  } catch (error) {
    logCampaignStorageError("duplicateCampaign", error);
    try {
      const duplicated = getCampaignService().duplicateCampaign(id);
      recordActivityEvent({
        action: "campaign_duplicated",
        message: `Duplicated campaign as "${duplicated.campaign.name}".`,
      });
      return duplicated;
    } catch (fallbackError) {
      logCampaignStorageError("fallback duplicateCampaign", fallbackError);
      return null;
    }
  }
}

export async function exportCampaigns(): Promise<string | null> {
  try {
    const result = await requestJson<{ data: string }>("/api/campaigns/export");
    return result.data;
  } catch (error) {
    logCampaignStorageError("exportCampaigns", error);
    try {
      return getCampaignService().exportCampaigns();
    } catch (fallbackError) {
      logCampaignStorageError("fallback exportCampaigns", fallbackError);
      return null;
    }
  }
}

export async function importCampaigns(
  raw: string,
  mode: "merge" | "replace" = "merge",
): Promise<CampaignImportResult | null> {
  try {
    const result = await requestJson<CampaignImportResult>(`/api/campaigns/import?mode=${mode}`, {
      method: "POST",
      body: JSON.stringify({ payload: raw }),
    });
    recordActivityEvent({
      action: "campaigns_imported",
      message: `Imported campaigns with ${mode} mode (${result.imported} records).`,
    });
    return result;
  } catch (error) {
    logCampaignStorageError("importCampaigns", error);
    try {
      const result = getCampaignService().importCampaigns(raw, mode);
      recordActivityEvent({
        action: "campaigns_imported",
        message: `Imported campaigns with ${mode} mode (${result.imported} records).`,
      });
      return result;
    } catch (fallbackError) {
      logCampaignStorageError("fallback importCampaigns", fallbackError);
      return null;
    }
  }
}

export async function resetCampaigns(): Promise<CampaignData[]> {
  try {
    const result = await requestJson<CampaignData[]>("/api/campaigns/reset", {
      method: "POST",
    });
    recordActivityEvent({
      action: "campaigns_reset",
      message: "Reset campaign storage to defaults.",
    });
    return result;
  } catch (error) {
    logCampaignStorageError("resetCampaigns", error);
    try {
      const result = getCampaignService().resetToDefaultSample();
      recordActivityEvent({
        action: "campaigns_reset",
        message: "Reset campaign storage to defaults.",
      });
      return result;
    } catch (fallbackError) {
      logCampaignStorageError("fallback resetCampaigns", fallbackError);
      return [];
    }
  }
}

export async function getCampaignStorageStats(): Promise<CampaignStorageStats> {
  try {
    return await requestJson<CampaignStorageStats>("/api/campaigns/stats");
  } catch (error) {
    logCampaignStorageError("getCampaignStorageStats", error);
    try {
      return getCampaignService().getStorageStats();
    } catch (fallbackError) {
      logCampaignStorageError("fallback getCampaignStorageStats", fallbackError);
      return EMPTY_STORAGE_STATS;
    }
  }
}
