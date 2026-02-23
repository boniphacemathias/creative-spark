import { CampaignData, Concept, PortfolioConfig } from "@/types/campaign";

export interface PortfolioConceptScore {
  conceptId: string;
  conceptName: string;
  total: number;
  impact: number;
  feasibility: number;
  strategicFit: number;
  culturalFit: number;
  risk: number;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function deriveRisk(concept: Concept): number {
  const riskPenalty = Math.min(100, concept.risks.length * 18);
  return clamp(100 - riskPenalty);
}

function deriveImpact(concept: Concept): number {
  let score = 35;
  if (hasText(concept.bigIdea)) score += 20;
  if (hasText(concept.keyPromise)) score += 16;
  if ((concept.channels || []).length >= 3) score += 12;
  if ((concept.supportPoints || []).length >= 3) score += 12;
  if (concept.status === "final") score += 5;
  return clamp(score);
}

function deriveFeasibility(concept: Concept): number {
  let score = 28;
  if ((concept.channels || []).length > 0) score += 20;
  if ((concept.supportPoints || []).length > 0) score += 14;
  if ((concept.risks || []).length <= 2) score += 18;
  if (hasText(concept.executionRationale)) score += 15;
  if (hasText(concept.behaviorTrigger)) score += 10;
  return clamp(score);
}

function deriveStrategicFit(concept: Concept, data: CampaignData): number {
  let score = 30;
  if (hasText(data.communicationObjective)) score += 10;
  if (hasText(data.businessObjective)) score += 10;
  if (hasText(concept.smp)) score += 18;
  if (hasText(concept.keyPromise)) score += 16;
  if ((concept.selectedIdeaIds || []).length > 0) score += 10;
  return clamp(score);
}

function deriveCulturalFit(concept: Concept, data: CampaignData): number {
  let score = 35;
  if (hasText(concept.tone)) score += 20;
  if (hasText(data.creativeBrief.culturalCuesEmbrace)) score += 15;
  if ((concept.channels || []).some((channel) => channel.toLowerCase().includes("community"))) score += 10;
  if ((concept.risks || []).some((risk) => risk.toLowerCase().includes("inclusive"))) score += 5;
  return clamp(score);
}

function normalizePortfolioConfig(config: PortfolioConfig | undefined): PortfolioConfig {
  return (
    config || {
      scenarioPreset: "balanced",
      budgetCutPercent: 20,
      weights: {
        impact: 0.3,
        feasibility: 0.2,
        strategicFit: 0.25,
        culturalFit: 0.15,
        risk: 0.1,
      },
    }
  );
}

export function scorePortfolio(data: CampaignData): PortfolioConceptScore[] {
  const config = normalizePortfolioConfig(data.portfolio);
  const cutPenalty = Math.max(0, Math.min(50, config.budgetCutPercent)) / 100;

  return data.concepts
    .map((concept) => {
      const impact = deriveImpact(concept);
      const feasibilityRaw = deriveFeasibility(concept);
      const feasibility = clamp(feasibilityRaw - feasibilityRaw * cutPenalty);
      const strategicFit = deriveStrategicFit(concept, data);
      const culturalFit = deriveCulturalFit(concept, data);
      const risk = deriveRisk(concept);

      const total =
        impact * config.weights.impact +
        feasibility * config.weights.feasibility +
        strategicFit * config.weights.strategicFit +
        culturalFit * config.weights.culturalFit +
        risk * config.weights.risk;

      return {
        conceptId: concept.id,
        conceptName: concept.name,
        total: clamp(total),
        impact,
        feasibility,
        strategicFit,
        culturalFit,
        risk,
      };
    })
    .sort((a, b) => b.total - a.total);
}
