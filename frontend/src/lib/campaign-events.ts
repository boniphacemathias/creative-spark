import { CampaignData } from "@/types/campaign";

export const CAMPAIGN_PATCH_APPLIED_EVENT = "creative-spark-campaign-patch-applied";

export interface CampaignPatchAppliedDetail {
  campaignId: string;
  patch: Partial<CampaignData>;
  source: "ai-chat-autofill" | "ai-chat-apply";
}

export function dispatchCampaignPatchApplied(detail: CampaignPatchAppliedDetail): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<CampaignPatchAppliedDetail>(CAMPAIGN_PATCH_APPLIED_EVENT, { detail }));
}

