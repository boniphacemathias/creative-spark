import { CampaignData, Idea } from "@/types/campaign";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "into",
  "your",
  "their",
  "about",
  "have",
  "will",
  "then",
  "when",
  "what",
  "where",
  "which",
  "while",
  "been",
  "were",
  "they",
  "them",
  "very",
  "more",
  "less",
  "also",
  "make",
  "makes",
  "using",
  "used",
  "just",
  "than",
  "over",
  "under",
  "only",
  "each",
  "same",
  "real",
  "time",
]);

const SURPRISE_CUES = [
  "instead of",
  "reframe",
  "unexpected",
  "counter",
  "challenge",
  "flip",
  "reverse",
  "bold",
  "myth",
  "proof-first",
  "surprise",
];

const ACTION_VERBS = [
  "run",
  "launch",
  "test",
  "pilot",
  "build",
  "recruit",
  "measure",
  "track",
  "deploy",
  "host",
  "publish",
  "activate",
  "schedule",
  "complete",
];

const MEASUREMENT_CUES = [
  "measure",
  "track",
  "kpi",
  "target",
  "conversion",
  "adoption",
  "completion",
  "weekly",
  "monthly",
  "within",
  "%",
  "per",
  "by ",
];

export interface IdeaQualityEvaluation {
  surprise: number;
  relevance: number;
  action: number;
  total: number;
  passes: boolean;
  level: "strong" | "good" | "weak";
  suggestions: string[];
}

export interface IdeaQualitySummary {
  passCount: number;
  failCount: number;
  passRate: number;
  averageTotal: number;
}

interface IdeaQualityContext {
  insightText: string;
  driverText: string;
  desiredBehavior: string;
  audienceText: string;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeScore(value: number): number {
  const bounded = Math.max(1, Math.min(5, Number.isFinite(value) ? value : 3));
  return (bounded / 5) * 100;
}

function tokenize(source: string): string[] {
  return source
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const bSet = new Set(b);
  let hits = 0;
  for (const token of a) {
    if (bSet.has(token)) {
      hits += 1;
    }
  }

  return hits / Math.max(1, new Set(a).size);
}

function hasCue(text: string, cues: string[]): boolean {
  const lower = text.toLowerCase();
  return cues.some((cue) => lower.includes(cue));
}

function contextFromCampaign(data: CampaignData): IdeaQualityContext {
  return {
    insightText: data.insight.insightText || "",
    driverText:
      data.driver.driverTypes.length > 0
        ? data.driver.driverTypes.join(" ")
        : data.driver.driverText || "",
    desiredBehavior: data.behavior.desiredBehavior || "",
    audienceText: data.audiences.map((entry) => entry.segmentName).join(" "),
  };
}

export function evaluateIdeaQuality(idea: Idea, data: CampaignData): IdeaQualityEvaluation {
  const context = contextFromCampaign(data);
  const combinedText = `${idea.title} ${idea.description} ${idea.linkToInsight} ${idea.linkToDriver}`;

  const contextTokens = tokenize(
    `${context.insightText} ${context.driverText} ${context.desiredBehavior} ${context.audienceText}`,
  );
  const ideaTokens = tokenize(combinedText);

  const overlap = overlapRatio(ideaTokens, contextTokens);
  const surpriseCueBoost = hasCue(combinedText, SURPRISE_CUES) ? 12 : 0;
  const actionVerbBoost = hasCue(combinedText, ACTION_VERBS) ? 12 : 0;
  const measurableBoost = hasCue(combinedText, MEASUREMENT_CUES) ? 10 : 0;

  const surprise = clampScore(normalizeScore(idea.originalityScore) * 0.82 + surpriseCueBoost);
  const relevance = clampScore(normalizeScore(idea.strategicFitScore) * 0.72 + overlap * 28);
  const action = clampScore(
    normalizeScore(idea.feasibilityScore) * 0.68 + actionVerbBoost + measurableBoost,
  );

  const total = clampScore(surprise * 0.34 + relevance * 0.33 + action * 0.33);
  const passes = total >= 70 && surprise >= 60 && relevance >= 60 && action >= 60;

  const suggestions: string[] = [];
  if (surprise < 60) {
    suggestions.push("Increase disruption with a stronger unexpected angle.");
  }
  if (relevance < 60) {
    suggestions.push("Link the idea more directly to audience tension and insight language.");
  }
  if (action < 60) {
    suggestions.push("Add a specific, measurable action with timeline and owner.");
  }

  const level: IdeaQualityEvaluation["level"] =
    total >= 82 ? "strong" : total >= 70 ? "good" : "weak";

  return {
    surprise,
    relevance,
    action,
    total,
    passes,
    level,
    suggestions,
  };
}

export function evaluateIdeaPortfolio(ideas: Idea[], data: CampaignData): IdeaQualitySummary {
  if (ideas.length === 0) {
    return {
      passCount: 0,
      failCount: 0,
      passRate: 0,
      averageTotal: 0,
    };
  }

  const evaluations = ideas.map((idea) => evaluateIdeaQuality(idea, data));
  const passCount = evaluations.filter((entry) => entry.passes).length;
  const averageTotal = clampScore(
    evaluations.reduce((sum, entry) => sum + entry.total, 0) / evaluations.length,
  );

  return {
    passCount,
    failCount: ideas.length - passCount,
    passRate: clampScore((passCount / ideas.length) * 100),
    averageTotal,
  };
}
