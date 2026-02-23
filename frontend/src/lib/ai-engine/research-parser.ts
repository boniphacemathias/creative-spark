import { DriverMotive, DRIVER_MOTIVES } from "@/types/campaign";

export interface ResearchDocumentInput {
  id?: string;
  name: string;
  type: string;
  text: string;
}

export interface ParsedResearchData {
  sourceNames: string[];
  normalizedText: string;
  situation: string;
  problem: string;
  priorLearnings: string;
  businessObjective: string;
  communicationObjective: string;
  insightText: string;
  evidenceSource: string;
  confidenceLevel: "low" | "medium" | "high";
  behaviorStatement: string;
  currentBehavior: string;
  desiredBehavior: string;
  behaviorContext: string;
  driverText: string;
  whyNow: string;
  tension: string;
  audiences: string[];
  driverTypes: DriverMotive[];
  warnings: string[];
}

const PREFIX_PATTERNS: Record<string, RegExp[]> = {
  situation: [/^situation\s*[:\-]\s*(.+)$/i, /^background\s*[:\-]\s*(.+)$/i],
  problem: [/^problem\s*[:\-]\s*(.+)$/i, /^challenge\s*[:\-]\s*(.+)$/i],
  priorLearnings: [/^learning[s]?\s*[:\-]\s*(.+)$/i, /^prior\s+learning[s]?\s*[:\-]\s*(.+)$/i],
  businessObjective: [/^business\s+objective\s*[:\-]\s*(.+)$/i, /^objective\s*[:\-]\s*(.+)$/i],
  communicationObjective: [/^communication\s+objective\s*[:\-]\s*(.+)$/i],
  insightText: [/^insight\s*[:\-]\s*(.+)$/i, /^human\s+insight\s*[:\-]\s*(.+)$/i],
  evidenceSource: [/^source\s*[:\-]\s*(.+)$/i, /^evidence\s*[:\-]\s*(.+)$/i],
  behaviorStatement: [/^behavior\s+statement\s*[:\-]\s*(.+)$/i],
  currentBehavior: [/^current\s+behavior\s*[:\-]\s*(.+)$/i],
  desiredBehavior: [/^desired\s+behavior\s*[:\-]\s*(.+)$/i],
  behaviorContext: [/^context\s*[:\-]\s*(.+)$/i],
  driverText: [/^driver\s*[:\-]\s*(.+)$/i, /^motive\s*[:\-]\s*(.+)$/i],
  whyNow: [/^why\s+now\s*[:\-]\s*(.+)$/i],
  tension: [/^tension\s*[:\-]\s*(.+)$/i],
  audiences: [/^audience[s]?\s*[:\-]\s*(.+)$/i, /^target\s+audience[s]?\s*[:\-]\s*(.+)$/i],
};

const MOTIVE_SYNONYMS: Record<DriverMotive, string[]> = {
  hoard: ["hoard", "save", "store", "security"],
  create: ["create", "build", "innovate", "design"],
  fear: ["fear", "risk", "unsafe", "danger"],
  disgust: ["disgust", "dirty", "contaminated", "gross"],
  hunger: ["hunger", "food", "nutrition", "eat"],
  comfort: ["comfort", "ease", "convenience", "safe"],
  lust: ["lust", "desire", "attraction"],
  attract: ["attract", "appeal", "attention", "visible"],
  love: ["love", "care", "family", "affection"],
  nurture: ["nurture", "protect", "child", "caregiver"],
  curiosity: ["curiosity", "learn", "discover", "new"],
  play: ["play", "fun", "enjoy", "game"],
  affiliate: ["affiliate", "belong", "peer", "community", "social"],
  status: ["status", "respect", "reputation", "pride"],
  justice: ["justice", "fair", "equity", "rights"],
};

function sanitizeText(raw: string): string {
  return raw.replace(/\r/g, "").replace(/\u0000/g, "").trim();
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function pickLineByPatterns(lines: string[], patterns: RegExp[]): string {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }
  return "";
}

function pickSentenceByKeyword(text: string, keywords: string[]): string {
  const sentences = splitSentences(text);
  const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const found = sentences.find((sentence) =>
    loweredKeywords.some((keyword) => sentence.toLowerCase().includes(keyword)),
  );
  return found ?? "";
}

function deriveAudiences(audienceText: string, sourceText: string): string[] {
  const candidates = audienceText
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (candidates.length > 0) {
    return Array.from(new Set(candidates)).slice(0, 6);
  }

  const fallbackSeeds = [
    "mothers",
    "caregivers",
    "community leaders",
    "government stakeholders",
    "youth",
    "enterprises",
  ];

  const text = sourceText.toLowerCase();
  const inferred = fallbackSeeds.filter((seed) => text.includes(seed));

  if (inferred.length > 0) {
    return inferred.map((seed) => seed.replace(/\b\w/g, (character) => character.toUpperCase()));
  }

  return ["Priority Audience"];
}

function deriveDriverTypes(text: string): DriverMotive[] {
  const lowered = text.toLowerCase();
  const detected: DriverMotive[] = [];

  for (const motive of DRIVER_MOTIVES) {
    const synonyms = MOTIVE_SYNONYMS[motive];
    if (synonyms.some((synonym) => lowered.includes(synonym))) {
      detected.push(motive);
    }
  }

  if (detected.length > 0) {
    return detected;
  }

  return ["affiliate", "nurture"];
}

function deriveConfidence(sources: number, warningsCount: number): "low" | "medium" | "high" {
  if (sources >= 2 && warningsCount <= 1) {
    return "high";
  }

  if (sources >= 1 && warningsCount <= 4) {
    return "medium";
  }

  return "low";
}

function withFallback(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function parseResearchDocuments(documents: ResearchDocumentInput[]): ParsedResearchData {
  const sanitizedDocs = documents
    .map((document) => ({
      ...document,
      text: sanitizeText(document.text),
    }))
    .filter((document) => document.text.length > 0);

  const warnings: string[] = [];
  if (sanitizedDocs.length === 0) {
    warnings.push("No parsable text content found in uploaded documents.");
  }

  const sourceNames = sanitizedDocs.map((document) => document.name);
  const mergedText = sanitizedDocs.map((document) => document.text).join("\n");
  const lines = splitLines(mergedText);

  const situation = pickLineByPatterns(lines, PREFIX_PATTERNS.situation) || pickSentenceByKeyword(mergedText, ["situation", "context", "market"]);
  const problem = pickLineByPatterns(lines, PREFIX_PATTERNS.problem) || pickSentenceByKeyword(mergedText, ["problem", "barrier", "challenge"]);
  const priorLearnings = pickLineByPatterns(lines, PREFIX_PATTERNS.priorLearnings) || pickSentenceByKeyword(mergedText, ["learning", "previous", "prior"]);
  const businessObjective = pickLineByPatterns(lines, PREFIX_PATTERNS.businessObjective) || pickSentenceByKeyword(mergedText, ["increase", "improve", "objective", "target"]);
  const communicationObjective = pickLineByPatterns(lines, PREFIX_PATTERNS.communicationObjective) || pickSentenceByKeyword(mergedText, ["communicat", "think", "feel", "do"]);
  const insightText = pickLineByPatterns(lines, PREFIX_PATTERNS.insightText) || pickSentenceByKeyword(mergedText, ["because", "tension", "believe", "insight"]);
  const evidenceSource = pickLineByPatterns(lines, PREFIX_PATTERNS.evidenceSource) || sourceNames.join(", ");
  const behaviorStatement = pickLineByPatterns(lines, PREFIX_PATTERNS.behaviorStatement) || pickSentenceByKeyword(mergedText, ["currently", "today", "habit", "behavior"]);
  const currentBehavior = pickLineByPatterns(lines, PREFIX_PATTERNS.currentBehavior) || pickSentenceByKeyword(mergedText, ["current", "today", "existing"]);
  const desiredBehavior = pickLineByPatterns(lines, PREFIX_PATTERNS.desiredBehavior) || pickSentenceByKeyword(mergedText, ["desired", "target behavior", "should"]);
  const behaviorContext = pickLineByPatterns(lines, PREFIX_PATTERNS.behaviorContext) || pickSentenceByKeyword(mergedText, ["context", "environment", "setting"]);
  const driverText = pickLineByPatterns(lines, PREFIX_PATTERNS.driverText) || pickSentenceByKeyword(mergedText, ["motive", "driver", "pressure", "influence"]);
  const whyNow = pickLineByPatterns(lines, PREFIX_PATTERNS.whyNow) || pickSentenceByKeyword(mergedText, ["now", "urgent", "timely"]);
  const tension = pickLineByPatterns(lines, PREFIX_PATTERNS.tension) || pickSentenceByKeyword(mergedText, ["tension", "trade-off", "conflict"]);
  const audienceText = pickLineByPatterns(lines, PREFIX_PATTERNS.audiences);

  const audiences = deriveAudiences(audienceText, mergedText);
  const driverTypes = deriveDriverTypes(`${driverText} ${insightText} ${mergedText}`);

  const normalizedText = withFallback(mergedText, "No uploaded content.");

  const output: ParsedResearchData = {
    sourceNames,
    normalizedText,
    situation: withFallback(situation, "Insufficient situation detail in uploaded data."),
    problem: withFallback(problem, "Problem statement not detected; review uploaded research."),
    priorLearnings: withFallback(priorLearnings, "No prior learnings detected."),
    businessObjective: withFallback(businessObjective, "Define measurable campaign objective from uploaded evidence."),
    communicationObjective: withFallback(
      communicationObjective,
      "Think: audience understands the value. Feel: audience confidence increases. Do: audience takes the target action.",
    ),
    insightText: withFallback(
      insightText,
      "Audience behavior is constrained by trust, relevance, and perceived risk in the current context.",
    ),
    evidenceSource: withFallback(evidenceSource, "Uploaded research documents"),
    confidenceLevel: "low",
    behaviorStatement: withFallback(behaviorStatement, "Current behavior does not consistently match campaign goals."),
    currentBehavior: withFallback(currentBehavior, "Target audience delays or avoids the recommended behavior."),
    desiredBehavior: withFallback(desiredBehavior, "Target audience performs the recommended behavior on time."),
    behaviorContext: withFallback(behaviorContext, "Behavior takes place under social and practical constraints."),
    driverText: withFallback(driverText, "Social proof, trust, and identity are the main behavior drivers."),
    whyNow: withFallback(whyNow, "Current conditions create urgency to shift behavior now."),
    tension: withFallback(tension, "People want the positive outcome but fear social, practical, or reputational costs."),
    audiences,
    driverTypes,
    warnings,
  };

  const missingKeys = [
    output.situation,
    output.problem,
    output.businessObjective,
    output.communicationObjective,
    output.insightText,
  ].filter((value) => value.includes("not") || value.includes("Insufficient"));

  if (missingKeys.length > 1) {
    output.warnings.push("Uploaded text was partially structured; AI fallbacks filled missing fields.");
  }

  output.confidenceLevel = deriveConfidence(sanitizedDocs.length, output.warnings.length);

  return output;
}
