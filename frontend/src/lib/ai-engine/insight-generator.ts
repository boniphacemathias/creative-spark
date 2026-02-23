import { CampaignData, DriverMotive } from "@/types/campaign";
import { ParsedResearchData } from "@/lib/ai-engine/research-parser";

function clean(value: string): string {
  return value.trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function toAudienceId(index: number): string {
  return `aud-auto-${index + 1}`;
}

function inferAudiencePriority(index: number): "primary" | "secondary" {
  return index === 0 ? "primary" : "secondary";
}

function buildAudienceDescription(name: string, parsed: ParsedResearchData): string {
  return `Auto-derived segment from uploaded data: ${name}.`; 
}

function buildAudienceBarrier(parsed: ParsedResearchData): string {
  return parsed.tension;
}

function buildAudienceMotivator(parsed: ParsedResearchData): string {
  return parsed.driverText;
}

export interface InsightAutomationOutput {
  audiences: CampaignData["audiences"];
  behavior: CampaignData["behavior"];
  insight: CampaignData["insight"];
  driver: CampaignData["driver"];
  situation: string;
  problem: string;
  priorLearnings: string;
  businessObjective: string;
  communicationObjective: string;
}

export function generateInsightAutomation(data: CampaignData, parsed: ParsedResearchData): InsightAutomationOutput {
  const derivedAudienceNames = parsed.audiences.length > 0 ? parsed.audiences : data.audiences.map((audience) => audience.segmentName);

  const audiences = unique(derivedAudienceNames)
    .slice(0, 6)
    .map((name, index) => ({
      id: data.audiences[index]?.id ?? toAudienceId(index),
      priority: data.audiences[index]?.priority ?? inferAudiencePriority(index),
      segmentName: clean(name) || data.audiences[index]?.segmentName || `Audience ${index + 1}`,
      description: clean(data.audiences[index]?.description || "") || buildAudienceDescription(name, parsed),
      barriers: clean(data.audiences[index]?.barriers || "") || buildAudienceBarrier(parsed),
      motivators: clean(data.audiences[index]?.motivators || "") || buildAudienceMotivator(parsed),
      desiredAction: clean(data.audiences[index]?.desiredAction || "") || parsed.desiredBehavior,
      keyMessage: clean(data.audiences[index]?.keyMessage || ""),
      supportRtb: clean(data.audiences[index]?.supportRtb || ""),
      cta: clean(data.audiences[index]?.cta || ""),
    }));

  const motiveTypes: DriverMotive[] = parsed.driverTypes.length > 0 ? parsed.driverTypes : data.driver.driverTypes;

  return {
    audiences,
    behavior: {
      behaviorStatement: clean(parsed.behaviorStatement) || data.behavior.behaviorStatement,
      currentBehavior: clean(parsed.currentBehavior) || data.behavior.currentBehavior,
      desiredBehavior: clean(parsed.desiredBehavior) || data.behavior.desiredBehavior,
      context: clean(parsed.behaviorContext) || data.behavior.context,
    },
    insight: {
      insightText: clean(parsed.insightText) || data.insight.insightText,
      evidenceSource: clean(parsed.evidenceSource) || data.insight.evidenceSource,
      confidenceLevel: parsed.confidenceLevel,
    },
    driver: {
      driverTypes: motiveTypes,
      driverText: clean(parsed.driverText) || data.driver.driverText,
      whyNow: clean(parsed.whyNow) || data.driver.whyNow,
      tension: clean(parsed.tension) || data.driver.tension,
    },
    situation: clean(parsed.situation) || data.situation,
    problem: clean(parsed.problem) || data.problem,
    priorLearnings: clean(parsed.priorLearnings) || data.priorLearnings,
    businessObjective: clean(parsed.businessObjective) || data.businessObjective,
    communicationObjective: clean(parsed.communicationObjective) || data.communicationObjective,
  };
}
