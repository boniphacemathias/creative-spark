import { CampaignData } from "@/types/campaign";

export interface StepValidation {
  isValid: boolean;
  issues: string[];
}

export interface CampaignProgress {
  completedSteps: number;
  totalSteps: number;
  completionRatio: number;
  stepCompletion: boolean[];
}

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function validateWizardStep(step: number, data: CampaignData): StepValidation {
  const issues: string[] = [];

  if (step === 0) {
    if (!hasText(data.campaign.name)) issues.push("Campaign name is required.");
    if (!hasText(data.campaign.country)) issues.push("Country is required.");
    if (!hasText(data.campaign.startDate)) issues.push("Start date is required.");
    if (!hasText(data.campaign.endDate)) issues.push("End date is required.");
    if (data.campaign.endDate < data.campaign.startDate) {
      issues.push("End date must be after start date.");
    }
  }

  if (step === 1) {
    if (!hasText(data.situation)) issues.push("Situation is required.");
    if (!hasText(data.problem)) issues.push("Problem statement is required.");
    if (!hasText(data.businessObjective)) issues.push("Business objective is required.");
    if (!hasText(data.communicationObjective)) issues.push("Communication objective is required.");
    if (!hasText(data.insight.insightText)) issues.push("Human insight is required.");
    if (!hasText(data.driver.driverText)) issues.push("Driver statement is required.");
    if (data.driver.driverTypes.length === 0) issues.push("Select at least one driver motive.");
  }

  if (step === 4 && !data.ideas.some((idea) => idea.selected)) {
    issues.push("Select at least one idea before moving to concept development.");
  }

  if (step === 5 && data.concepts.length === 0) {
    issues.push("Create at least one concept before opening the concept board.");
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

function isCommunicationBriefComplete(data: CampaignData): boolean {
  return (
    hasText(data.contentThemesAndCalendar) &&
    hasText(data.measurementAndLearningPlan) &&
    data.channelRoles.some((entry) => hasText(entry.channel) || hasText(entry.role))
  );
}

function isCreativeBriefComplete(data: CampaignData): boolean {
  const brief = data.creativeBrief;
  return (
    hasText(brief.singleMindedObjective) &&
    hasText(brief.keyProposition) &&
    brief.deliverables.some((deliverable) => hasText(deliverable.asset))
  );
}

function isConceptBoardComplete(data: CampaignData): boolean {
  return data.concepts.some((concept) => {
    if (!concept.boardData) {
      return false;
    }

    const board = concept.boardData;
    return (
      board.keyVisualDirections.some(hasText) ||
      board.socialPosts.some(hasText) ||
      hasText(board.radioScript) ||
      board.headlines.some(hasText) ||
      board.whatsappSequence.some(hasText) ||
      board.messageBarrierMap.some(
        (row) => hasText(row.barrier) || hasText(row.strategy) || hasText(row.channel),
      ) ||
      board.pretestQuestions.some(hasText)
    );
  });
}

export function getCampaignProgress(data: CampaignData): CampaignProgress {
  const stepCompletion = [
    validateWizardStep(0, data).isValid,
    validateWizardStep(1, data).isValid,
    isCommunicationBriefComplete(data),
    isCreativeBriefComplete(data),
    validateWizardStep(4, data).isValid,
    validateWizardStep(5, data).isValid,
    isConceptBoardComplete(data),
  ];

  const completedSteps = stepCompletion.filter(Boolean).length;
  const totalSteps = stepCompletion.length;

  return {
    completedSteps,
    totalSteps,
    completionRatio: totalSteps === 0 ? 0 : completedSteps / totalSteps,
    stepCompletion,
  };
}
