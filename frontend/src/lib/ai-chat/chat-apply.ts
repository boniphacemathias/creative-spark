import { CampaignData } from "@/types/campaign";

export type ChatApplyTarget =
  | "insight"
  | "communicationObjective"
  | "creativeKeyProposition"
  | "measurementPlan"
  | "appendices";

export const CHAT_APPLY_TARGET_OPTIONS: Array<{ id: ChatApplyTarget; label: string }> = [
  { id: "insight", label: "Insight" },
  { id: "communicationObjective", label: "Communication Objective" },
  { id: "creativeKeyProposition", label: "Creative Key Proposition" },
  { id: "measurementPlan", label: "Measurement Plan" },
  { id: "appendices", label: "Appendices Notes" },
];

function appendValue(existing: string, incoming: string): string {
  const current = existing.trim();
  const next = incoming.trim();
  if (!next) {
    return current;
  }
  return current ? `${current}\n\n${next}` : next;
}

export function applyAssistantMessageToCampaign(
  campaign: CampaignData,
  target: ChatApplyTarget,
  content: string,
): CampaignData {
  const text = content.trim();
  if (!text) {
    return campaign;
  }

  if (target === "insight") {
    return {
      ...campaign,
      insight: {
        ...campaign.insight,
        insightText: text,
      },
    };
  }

  if (target === "communicationObjective") {
    return {
      ...campaign,
      communicationObjective: text,
    };
  }

  if (target === "creativeKeyProposition") {
    return {
      ...campaign,
      creativeBrief: {
        ...campaign.creativeBrief,
        keyProposition: text,
      },
    };
  }

  if (target === "measurementPlan") {
    return {
      ...campaign,
      measurementAndLearningPlan: text,
    };
  }

  return {
    ...campaign,
    appendices: appendValue(campaign.appendices, text),
  };
}
