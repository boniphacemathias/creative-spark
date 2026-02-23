import { CampaignData, Concept, ConceptBoardData, ConceptBoardBarrierRow, Idea } from "@/types/campaign";
import { cleanAiText, generateTextViaApi, parseJsonFromModelText } from "@/lib/ai/ai-client";

export type ConceptCreativeMode = "balanced" | "bold" | "pragmatic" | "cultural";

export interface ConceptGenerationOptions {
  mode?: ConceptCreativeMode;
  leadIdeaId?: string;
  existingConcepts?: Concept[];
}

export interface ConceptQualityEvaluation {
  scalable: number;
  universal: number;
  memorable: number;
  simple: number;
  unexpectedRelevant: number;
  total: number;
  passes: boolean;
  suggestions: string[];
}

interface ConceptFrame {
  nameSeed: string;
  metaphor: string;
  surpriseHook: string;
  scaleCue: string;
  actionCue: string;
}

interface AiConceptOutput {
  name?: string;
  bigIdea?: string;
  smp?: string;
  keyPromise?: string;
  supportPoints?: string[];
  tone?: string;
  channels?: string[];
  risks?: string[];
  tagline?: string;
  keyVisualDescription?: string;
  executionRationale?: string;
  behaviorTrigger?: string;
}

const CONCEPT_MODE_DIRECTIVES: Record<ConceptCreativeMode, string> = {
  balanced: "Balance surprise, relevance, and practical execution with one clear measurable action.",
  bold: "Prioritize disruptive metaphor and high-attention creative while preserving strategic clarity.",
  pragmatic: "Prioritize low-cost, fast-launch execution and clear operational ownership.",
  cultural: "Anchor concept in local cultural codes, trusted actors, and community rituals.",
};

const CONCEPT_MODE_TONE: Record<ConceptCreativeMode, string> = {
  balanced: "Human, confident, practical",
  bold: "Bold, urgent, confident",
  pragmatic: "Practical, clear, execution-focused",
  cultural: "Human, culturally grounded, respectful",
};

const CONCEPT_FRAMES: Record<ConceptCreativeMode, ConceptFrame[]> = {
  balanced: [
    {
      nameSeed: "Proof Loop",
      metaphor: "a bridge from fear to confidence",
      surpriseHook: "showing outcomes before persuasion",
      scaleCue: "repeatable channel playbooks",
      actionCue: "weekly proof checkpoints",
    },
    {
      nameSeed: "Momentum Arc",
      metaphor: "a staircase of visible milestones",
      surpriseHook: "making progress public",
      scaleCue: "simple rollout templates",
      actionCue: "14-day behavior sprint",
    },
    {
      nameSeed: "Signal Shift",
      metaphor: "turning noise into a trusted signal",
      surpriseHook: "countering expectations with live evidence",
      scaleCue: "channel-by-channel adaptation",
      actionCue: "clear owner and completion metric",
    },
  ],
  bold: [
    {
      nameSeed: "Public Bet",
      metaphor: "a high-stakes relay where everyone sees the baton",
      surpriseHook: "public commitment before private doubt",
      scaleCue: "citywide challenge format",
      actionCue: "48-hour decision activation",
    },
    {
      nameSeed: "Rule Breaker",
      metaphor: "flipping the default script",
      surpriseHook: "doing the opposite of category norms",
      scaleCue: "copy-ready activation kit",
      actionCue: "rapid pilot with daily scorecard",
    },
    {
      nameSeed: "Shock-to-Trust",
      metaphor: "a spark that ignites community proof",
      surpriseHook: "unexpected reveal tied to real action",
      scaleCue: "modular format for multiple audiences",
      actionCue: "same-week conversion target",
    },
  ],
  pragmatic: [
    {
      nameSeed: "Fast Lane",
      metaphor: "a shortcut that removes first-step friction",
      surpriseHook: "turning complex decisions into one-step actions",
      scaleCue: "resource-light deployment",
      actionCue: "7-day implementation cycle",
    },
    {
      nameSeed: "Practical Trigger",
      metaphor: "a checklist people can run immediately",
      surpriseHook: "clarity where audiences expect complexity",
      scaleCue: "reusable implementation SOP",
      actionCue: "weekly completion tracking",
    },
    {
      nameSeed: "Action Engine",
      metaphor: "a flywheel powered by simple repeat behaviors",
      surpriseHook: "proof first, messaging second",
      scaleCue: "low-cost replication path",
      actionCue: "bi-weekly optimization loop",
    },
  ],
  cultural: [
    {
      nameSeed: "Community Echo",
      metaphor: "a trusted story repeated across social circles",
      surpriseHook: "local authority voices leading the unexpected move",
      scaleCue: "language-localized campaign system",
      actionCue: "community rhythm-based reminders",
    },
    {
      nameSeed: "Ritual Bridge",
      metaphor: "linking familiar rituals to new behavior",
      surpriseHook: "reframing tradition as modern proof",
      scaleCue: "adaptable cultural script",
      actionCue: "milestone action prompt before each ritual window",
    },
    {
      nameSeed: "Status Shift",
      metaphor: "turning action into visible social respect",
      surpriseHook: "making desired behavior a prestige signal",
      scaleCue: "peer-champion network model",
      actionCue: "monthly public recognition cycle",
    },
  ],
};

const ACTION_VERBS = ["run", "launch", "pilot", "test", "activate", "deploy", "host", "track", "measure", "complete"];
const SURPRISE_CUES = ["unexpected", "instead of", "reverse", "counter", "flip", "surprising", "opposite", "before"];
const METAPHOR_CUES = ["like", "as", "bridge", "shield", "engine", "compass", "relay", "staircase", "flywheel", "signal"];
const SCALABLE_CUES = ["scale", "scalable", "replicate", "repeatable", "rollout", "playbook", "template", "system"];
const UNIVERSAL_CUES = ["across", "all", "multiple", "different", "universal", "community", "audiences", "segments"];
const JARGON_CUES = ["synergy", "paradigm", "leveraging", "omnichannel", "holistic architecture", "ecosystem optimization"];

const CONCEPT_SIMILARITY_THRESHOLD = 0.78;
const MIN_ACCEPTABLE_QUALITY = 70;
const MAX_AI_ATTEMPTS = 3;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toPhrase(value: string, fallback: string, maxWords = 10): string {
  const source = clean(value || fallback);
  const words = source.split(" ").filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function buildId(): string {
  return `concept-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function hashString(source: string): number {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokenize(source: string): string[] {
  return source
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const bSet = new Set(b);
  let hits = 0;
  const uniqueA = new Set(a);
  for (const token of uniqueA) {
    if (bSet.has(token)) {
      hits += 1;
    }
  }

  return hits / Math.max(1, uniqueA.size);
}

function hasCue(text: string, cues: string[]): boolean {
  const lower = text.toLowerCase();
  return cues.some((cue) => lower.includes(cue));
}

function toWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function toSentenceCount(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
}

function scoreIdea(idea: Idea): number {
  return (
    idea.originalityScore * 0.3 +
    idea.strategicFitScore * 0.3 +
    idea.feasibilityScore * 0.25 +
    idea.culturalFitScore * 0.15
  );
}

function pickLeadIdea(
  data: CampaignData,
  selectedIdeas: Idea[],
  options?: ConceptGenerationOptions,
): Idea | null {
  if (options?.leadIdeaId) {
    const explicit = data.ideas.find((idea) => idea.id === options.leadIdeaId);
    if (explicit) {
      return explicit;
    }
  }

  if (selectedIdeas.length > 0) {
    return [...selectedIdeas].sort((a, b) => scoreIdea(b) - scoreIdea(a))[0];
  }

  if (data.ideas.length === 0) {
    return null;
  }

  return [...data.ideas].sort((a, b) => scoreIdea(b) - scoreIdea(a))[0];
}

function sentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeName(name: string): string {
  return clean(name)
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ");
}

function ensureSentence(value: string): string {
  if (!value) {
    return value;
  }
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function ensureBriefSentence(value: string, fallback: string, maxWords = 34): string {
  const cleaned = clean(cleanAiText(value || ""));
  const source = cleaned || fallback;
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return ensureSentence(source);
  }
  return `${words.slice(0, maxWords).join(" ")}.`;
}

function deriveTagline(leadIdea: Idea, behaviorAction: string, mode: ConceptCreativeMode, frame: ConceptFrame): string {
  const stem = leadIdea.title.split(":").slice(-1)[0].trim();
  const action = sentenceCase(toPhrase(behaviorAction, "Take the next action", 8));

  if (mode === "bold") {
    return `${stem}. ${frame.surpriseHook}. ${action}.`;
  }
  if (mode === "pragmatic") {
    return `${stem}. ${frame.actionCue}. ${action}.`;
  }
  if (mode === "cultural") {
    return `${stem}. ${frame.metaphor}. ${action}.`;
  }
  return `${stem}. ${action}.`;
}

function deriveVisualDescription(leadIdea: Idea, audience: string, frame: ConceptFrame): string {
  return `A visual of ${audience} in a real decision moment, using ${frame.metaphor} and linked to "${leadIdea.title}" with clear before/after proof.`;
}

function deriveExecutionRationale(
  leadIdea: Idea,
  insight: string,
  motive: string,
  desiredBehavior: string,
  frame: ConceptFrame,
): string {
  return `This concept translates insight (${insight}) and motive (${motive}) into ${frame.scaleCue} using ${leadIdea.method}, so audiences can ${desiredBehavior} with measurable follow-through.`;
}

function ensureActionLanguage(value: string, fallbackAction: string): string {
  const cleaned = clean(cleanAiText(value || ""));
  if (!cleaned) {
    return fallbackAction;
  }
  const lower = cleaned.toLowerCase();
  const hasVerb = ACTION_VERBS.some((verb) => lower.includes(verb));
  if (hasVerb) {
    return cleaned;
  }
  return `Run this now: ${cleaned}`;
}

function deriveBehaviorTrigger(behaviorAction: string, timeline: string): string {
  const action = toPhrase(behaviorAction, "take the recommended behavior", 14);
  const timelinePhrase = toPhrase(timeline, "within 14 days", 8);
  const normalizedTimeline = /(week|month|day|quarter|before|within|by\s)/i.test(timelinePhrase)
    ? timelinePhrase
    : "within 14 days";
  return `Trigger immediate action: ${action}. Confirm completion ${normalizedTimeline}.`;
}

function extractAudienceSummary(data: CampaignData): string {
  const primary = data.audiences[0];
  if (!primary) {
    return "Priority audience";
  }
  const segment = primary.segmentName || "Priority audience";
  const barrier = toPhrase(primary.barriers, "faces behavior barriers", 12);
  const motivator = toPhrase(primary.motivators, "is motivated by protection and status", 12);
  return `${segment}; barrier: ${barrier}; motivator: ${motivator}`;
}

function selectedIdeasContext(selectedIdeas: Idea[]): string {
  if (selectedIdeas.length === 0) {
    return "No selected ideas. Use strongest available campaign context.";
  }

  return selectedIdeas
    .slice(0, 6)
    .map((idea, index) => `${index + 1}. [${idea.method}] ${idea.title} — ${idea.description}`)
    .join("\n");
}

function existingConceptsContext(existingConcepts: Concept[]): string {
  if (existingConcepts.length === 0) {
    return "None";
  }

  return existingConcepts
    .slice(0, 5)
    .map((concept, index) => `${index + 1}. ${concept.name}: ${concept.bigIdea}`)
    .join("\n");
}

function deriveChannels(data: CampaignData): string[] {
  const fromRoles = data.channelRoles.map((entry) => entry.channel.trim()).filter(Boolean);
  if (fromRoles.length > 0) {
    return Array.from(new Set(fromRoles)).slice(0, 5);
  }
  return ["Community radio", "WhatsApp", "Field activation"];
}

function ensureArray(values: string[], fallback: string[]): string[] {
  const cleaned = values.map((value) => clean(cleanAiText(value))).filter(Boolean);
  if (cleaned.length === 0) {
    return fallback;
  }
  return Array.from(new Set(cleaned));
}

function toStringArray(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  return ensureArray(
    input
      .map((value) => (typeof value === "string" ? cleanAiText(value).trim() : ""))
      .filter(Boolean),
    fallback,
  );
}

function ensureSupportPoints(values: string[], fallback: string[]): string[] {
  const normalized = ensureArray(values, fallback).map((entry) => ensureBriefSentence(entry, entry, 20));
  return normalized.slice(0, 5);
}

function ensureRisks(values: string[], fallback: string[]): string[] {
  const normalized = ensureArray(values, fallback).map((entry) => ensureBriefSentence(entry, entry, 20));
  return normalized.slice(0, 4);
}

function ensureChannels(values: string[], fallback: string[]): string[] {
  const normalized = ensureArray(values, fallback).map((entry) => entry.replace(/[.;]+$/g, ""));
  return normalized.slice(0, 5);
}

function ensureLinkToAction(value: string, behaviorAction: string, timeline: string): string {
  const fallback = deriveBehaviorTrigger(behaviorAction, timeline);
  const normalized = ensureActionLanguage(value, fallback);
  const lower = normalized.toLowerCase();
  if (!/(week|month|day|quarter|before|within|by\s)/.test(lower)) {
    return `${normalized} within 14 days.`;
  }
  return normalized;
}

function pickConceptFrame(
  data: CampaignData,
  leadIdea: Idea | null,
  mode: ConceptCreativeMode,
  existingConcepts: Concept[],
  attempt = 0,
): ConceptFrame {
  const frames = CONCEPT_FRAMES[mode];
  const entropy = Math.floor(Date.now() / 1000);
  const seed = hashString(
    [
      data.campaign.id,
      data.campaign.name,
      leadIdea?.id || "none",
      existingConcepts.map((concept) => concept.name).join("|"),
      mode,
      String(entropy),
      String(attempt),
    ].join("|"),
  );

  return frames[seed % frames.length];
}

function conceptSignatureTokens(concept: Pick<Concept, "name" | "bigIdea" | "smp" | "tagline">): Set<string> {
  const raw = `${concept.name} ${concept.bigIdea} ${concept.smp} ${concept.tagline || ""}`;
  return new Set(tokenize(raw));
}

export function measureConceptSimilarity(
  a: Pick<Concept, "name" | "bigIdea" | "smp" | "tagline">,
  b: Pick<Concept, "name" | "bigIdea" | "smp" | "tagline">,
): number {
  const aTokens = conceptSignatureTokens(a);
  const bTokens = conceptSignatureTokens(b);

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function isConceptTooSimilar(candidate: Concept, existingConcepts: Concept[]): boolean {
  const normalizedName = normalizeName(candidate.name).toLowerCase();

  return existingConcepts.some((existing) => {
    const existingName = normalizeName(existing.name).toLowerCase();
    if (existingName === normalizedName) {
      return true;
    }

    return measureConceptSimilarity(candidate, existing) >= CONCEPT_SIMILARITY_THRESHOLD;
  });
}

function buildConceptPrompt(
  data: CampaignData,
  leadIdea: Idea | null,
  mode: ConceptCreativeMode,
  existingConcepts: Concept[],
  frame: ConceptFrame,
  attempt: number,
): string {
  const audience = extractAudienceSummary(data);
  const insight = data.insight.insightText || "Behavior is constrained by relevance and trust.";
  const motive = data.driver.driverTypes.length > 0 ? data.driver.driverTypes.join(", ") : data.driver.driverText;
  const behaviorAction = data.behavior.desiredBehavior || "Perform the target behavior.";
  const selectedIdeas = selectedIdeasContext(data.ideas.filter((idea) => idea.selected));
  const channels = deriveChannels(data).join(", ");
  const communicationObjective = data.communicationObjective || "Drive a measurable behavior shift.";
  const businessObjective = data.businessObjective || "Improve measurable campaign outcomes.";
  const timeline = data.timelineDetails || `${data.campaign.startDate} to ${data.campaign.endDate}`;
  const measurementPlan = data.measurementAndLearningPlan || "Track action uptake and completion weekly.";
  const toneCue = data.creativeBrief.toneAndPersonality || CONCEPT_MODE_TONE[mode];
  const culturalCue = data.creativeBrief.culturalCuesEmbrace || "Use culturally resonant language and symbols.";

  return [
    "You are an expert SBCC strategist helping generate behaviour change campaigns.",
    "Create one highly creative but executable campaign concept from the campaign context.",
    `Creative mode: ${mode}. ${CONCEPT_MODE_DIRECTIVES[mode]}`,
    `Campaign: ${data.campaign.name || "Untitled Campaign"} in ${data.campaign.country || "target geography"}`,
    `Primary audience summary: ${audience}`,
    `Insight: ${insight}`,
    `Motive/Driver: ${motive}`,
    `Behavior action to achieve: ${behaviorAction}`,
    `Communication objective: ${communicationObjective}`,
    `Business objective: ${businessObjective}`,
    `Preferred channels: ${channels}`,
    `Measurement plan: ${measurementPlan}`,
    `Timeline: ${timeline}`,
    `Tone/personality cue: ${toneCue}`,
    `Cultural cues to embrace: ${culturalCue}`,
    `Lead idea: ${leadIdea?.title ?? "Not selected"}`,
    `Lead idea description: ${leadIdea?.description ?? "Use campaign context"}`,
    `Selected ideas:\n${selectedIdeas}`,
    `Metaphor lane to explore: ${frame.metaphor}`,
    `Surprise direction to apply: ${frame.surpriseHook}`,
    `Scalability requirement: ${frame.scaleCue}`,
    `Action trigger requirement: ${frame.actionCue}`,
    `Existing concepts to avoid repeating:\n${existingConceptsContext(existingConcepts)}`,
    attempt > 0
      ? "Previous concept was too similar. Use a different metaphor family, different concept name, and a distinct action mechanism."
      : "",
    "Write simple natural-language outputs (no labels like Surprise/Relevance/Action).",
    "The concept must be scalable, universal, memorable, simple, and unexpectedly relevant.",
    "Return JSON only in this exact shape:",
    '{"name":"...","bigIdea":"...","smp":"...","keyPromise":"...","supportPoints":["..."],"tone":"...","channels":["..."],"risks":["..."],"tagline":"...","keyVisualDescription":"...","executionRationale":"...","behaviorTrigger":"..."}',
    "Keep language concise, human, and implementation-ready.",
  ]
    .filter(Boolean)
    .join("\n");
}

function reinforceConceptQuality(
  concept: Concept,
  data: CampaignData,
  mode: ConceptCreativeMode,
  frame: ConceptFrame,
): Concept {
  const behaviorAction = data.behavior.desiredBehavior || "perform the desired behavior";
  const timeline = data.timelineDetails || `${data.campaign.startDate} to ${data.campaign.endDate}`;
  const fallbackChannels = deriveChannels(data);

  let bigIdea = ensureBriefSentence(concept.bigIdea, concept.bigIdea, 52);
  if (!hasCue(bigIdea, SURPRISE_CUES)) {
    bigIdea = ensureBriefSentence(`Unexpectedly, ${bigIdea.charAt(0).toLowerCase()}${bigIdea.slice(1)}`, bigIdea, 52);
  }
  if (!hasCue(bigIdea, METAPHOR_CUES)) {
    bigIdea = ensureBriefSentence(`${bigIdea} Think of it as ${frame.metaphor}.`, bigIdea, 52);
  }

  const supportPoints = [...concept.supportPoints];
  if (!supportPoints.some((item) => hasCue(item, SCALABLE_CUES))) {
    supportPoints.push(`Built for ${frame.scaleCue}.`);
  }
  if (!supportPoints.some((item) => hasCue(item, UNIVERSAL_CUES))) {
    supportPoints.push("Simple enough to adapt across multiple audiences and channels.");
  }

  const keyPromiseBase = ensureBriefSentence(concept.keyPromise, concept.keyPromise, 32);
  const keyPromise = keyPromiseBase.toLowerCase().includes(toPhrase(behaviorAction, "", 3).toLowerCase())
    ? keyPromiseBase
    : ensureBriefSentence(`${keyPromiseBase} This drives ${toPhrase(behaviorAction, "the desired behavior", 12)}.`, keyPromiseBase, 32);

  const leadTagline = ensureBriefSentence(
    concept.tagline || concept.smp,
    concept.tagline || concept.smp,
    14,
  );

  return {
    ...concept,
    name: normalizeName(ensureBriefSentence(concept.name, concept.name, 12)),
    bigIdea,
    smp: ensureBriefSentence(concept.smp, concept.smp, 14),
    keyPromise,
    supportPoints: ensureSupportPoints(supportPoints, concept.supportPoints),
    tone: cleanAiText(concept.tone || "") || CONCEPT_MODE_TONE[mode],
    channels: ensureChannels(concept.channels, fallbackChannels),
    risks: ensureRisks(concept.risks, concept.risks),
    tagline: leadTagline,
    keyVisualDescription: ensureBriefSentence(
      concept.keyVisualDescription || "",
      concept.keyVisualDescription || "Use one clear visual that links metaphor to immediate action.",
      34,
    ),
    executionRationale: ensureBriefSentence(
      concept.executionRationale || "",
      concept.executionRationale || `Use ${frame.actionCue} with measurable checkpoints.`,
      40,
    ),
    behaviorTrigger: ensureLinkToAction(concept.behaviorTrigger || "", behaviorAction, timeline),
  };
}

function mergeConceptFromAi(
  base: Concept,
  aiOutput: AiConceptOutput,
  context: { behaviorAction: string; timeline: string },
): Concept {
  return {
    ...base,
    name: ensureBriefSentence(aiOutput.name || "", base.name, 12),
    bigIdea: ensureBriefSentence(aiOutput.bigIdea || "", base.bigIdea, 52),
    smp: ensureBriefSentence(aiOutput.smp || "", base.smp, 14),
    keyPromise: ensureBriefSentence(aiOutput.keyPromise || "", base.keyPromise, 32),
    supportPoints: ensureSupportPoints(toStringArray(aiOutput.supportPoints, base.supportPoints), base.supportPoints),
    tone: cleanAiText(aiOutput.tone || "") || base.tone,
    channels: ensureChannels(toStringArray(aiOutput.channels, base.channels), base.channels),
    risks: ensureRisks(toStringArray(aiOutput.risks, base.risks), base.risks),
    tagline: ensureBriefSentence(aiOutput.tagline || "", base.tagline || "", 14),
    keyVisualDescription: ensureBriefSentence(
      aiOutput.keyVisualDescription || "",
      base.keyVisualDescription || "",
      34,
    ),
    executionRationale: ensureBriefSentence(
      aiOutput.executionRationale || "",
      base.executionRationale || "",
      40,
    ),
    behaviorTrigger: ensureLinkToAction(
      aiOutput.behaviorTrigger || "",
      context.behaviorAction,
      context.timeline,
    ),
  };
}

function buildFallbackConcept(
  data: CampaignData,
  options: ConceptGenerationOptions,
  leadIdea: Idea | null,
  selectedIdeas: Idea[],
  frame: ConceptFrame,
  attempt: number,
): Concept {
  const mode = options.mode ?? "balanced";
  const channels = deriveChannels(data);
  const timeline = data.timelineDetails || `${data.campaign.startDate} to ${data.campaign.endDate}`;

  if (!leadIdea) {
    const baseNoIdea: Concept = {
      id: buildId(),
      name: `${frame.nameSeed} Concept ${attempt + 1}`,
      bigIdea: `Unexpectedly use ${frame.metaphor} to make the next behavior step obvious and repeatable across channels.`,
      smp: "Insight-led action, repeated at scale",
      keyPromise: "The concept turns insight into specific action with measurable follow-through.",
      supportPoints: [
        `Designed with ${frame.scaleCue}.`,
        "Simple enough for use across different audience segments.",
        `Activation is driven by ${frame.actionCue}.`,
      ],
      tone: CONCEPT_MODE_TONE[mode],
      selectedIdeaIds: [],
      channels,
      risks: ["Requires selected ideation input to maximize creative specificity."],
      status: "draft",
      tagline: "Unexpected signal. Immediate action.",
      keyVisualDescription: "Human-centered visual with one clear metaphor and one explicit next step.",
      executionRationale: `Use ${frame.surpriseHook} and ${frame.actionCue} to convert attention into measurable behavior.`,
      behaviorTrigger: deriveBehaviorTrigger(data.behavior.desiredBehavior, timeline),
    };

    return reinforceConceptQuality(baseNoIdea, data, mode, frame);
  }

  const insight = toPhrase(data.insight.insightText, "core human tension", 14);
  const motive =
    data.driver.driverTypes.length > 0
      ? data.driver.driverTypes.join(", ")
      : toPhrase(data.driver.driverText, "core motive", 8);
  const audience = toPhrase(data.audiences[0]?.segmentName || "", "priority audience", 8);
  const behaviorAction = toPhrase(data.behavior.desiredBehavior, "target behavior", 12);
  const behaviorObjective = toPhrase(
    data.communicationObjective || data.businessObjective,
    "improve behavior uptake",
    16,
  );

  const selectedIds = selectedIdeas.length > 0 ? selectedIdeas.map((idea) => idea.id) : [leadIdea.id];

  const baseConcept: Concept = {
    id: buildId(),
    name: `${frame.nameSeed}: ${leadIdea.title}`,
    bigIdea: `Unexpectedly, use ${frame.metaphor} so ${audience} can move from insight (${insight}) to action (${behaviorAction}) through ${frame.surpriseHook}.`,
    smp: `${toPhrase(leadIdea.title, "Single-minded proposition", 10)}. ${frame.actionCue}.`,
    keyPromise: `If we deploy ${leadIdea.title}, ${audience} are more likely to ${behaviorAction}.`,
    supportPoints: [
      `Anchored in insight: ${insight}`,
      `Motive alignment: ${motive}`,
      `Execution target: ${behaviorAction}`,
      `Objective alignment: ${behaviorObjective}`,
      `Built for scale via ${frame.scaleCue}`,
    ],
    tone: CONCEPT_MODE_TONE[mode],
    selectedIdeaIds: selectedIds,
    channels,
    risks: ["Message novelty could reduce clarity; validate comprehension in rapid pretest."],
    status: "draft",
    tagline: deriveTagline(leadIdea, behaviorAction, mode, frame),
    keyVisualDescription: deriveVisualDescription(leadIdea, audience, frame),
    executionRationale: deriveExecutionRationale(leadIdea, insight, motive, behaviorAction, frame),
    behaviorTrigger: deriveBehaviorTrigger(behaviorAction, timeline),
  };

  return reinforceConceptQuality(baseConcept, data, mode, frame);
}

export function evaluateConceptQuality(concept: Concept, data: CampaignData): ConceptQualityEvaluation {
  const combined = `${concept.name} ${concept.bigIdea} ${concept.smp} ${concept.keyPromise} ${concept.tagline || ""} ${concept.executionRationale || ""} ${concept.behaviorTrigger || ""}`;

  const context = `${data.insight.insightText} ${data.driver.driverTypes.join(" ")} ${data.driver.driverText} ${data.behavior.desiredBehavior} ${data.communicationObjective} ${data.businessObjective} ${data.audiences.map((a) => a.segmentName).join(" ")}`;
  const overlap = overlapRatio(tokenize(combined), tokenize(context));

  const channelDepth = concept.channels.length;
  const supportDepth = concept.supportPoints.length;

  const scalable = clamp(
    channelDepth * 16 +
      supportDepth * 8 +
      (hasCue(combined, SCALABLE_CUES) ? 24 : 0) +
      (hasCue(concept.behaviorTrigger || "", ACTION_VERBS) ? 12 : 0),
  );

  const universal = clamp(
    (hasCue(combined, UNIVERSAL_CUES) ? 30 : 12) +
      channelDepth * 10 +
      overlap * 35,
  );

  const taglineWords = toWordCount(concept.tagline || concept.smp);
  const memorable = clamp(
    (taglineWords <= 10 ? 32 : 18) +
      (hasCue(concept.bigIdea, METAPHOR_CUES) ? 28 : 10) +
      (toWordCount(concept.smp) <= 12 ? 24 : 12),
  );

  const bigIdeaWords = toWordCount(concept.bigIdea);
  const bigIdeaSentences = toSentenceCount(concept.bigIdea);
  const jargonPenalty = hasCue(combined, JARGON_CUES) ? 24 : 0;
  const simple = clamp(
    (bigIdeaWords <= 45 ? 40 : 22) +
      (bigIdeaSentences <= 3 ? 28 : 14) +
      (toWordCount(concept.keyPromise) <= 30 ? 18 : 10) -
      jargonPenalty,
  );

  const unexpectedRelevant = clamp(
    (hasCue(combined, SURPRISE_CUES) ? 28 : 10) +
      (hasCue(concept.behaviorTrigger || "", ACTION_VERBS) ? 18 : 8) +
      overlap * 38,
  );

  const total = clamp((scalable + universal + memorable + simple + unexpectedRelevant) / 5);
  const passes =
    total >= MIN_ACCEPTABLE_QUALITY &&
    scalable >= 60 &&
    universal >= 60 &&
    memorable >= 60 &&
    simple >= 60 &&
    unexpectedRelevant >= 60;

  const suggestions: string[] = [];
  if (scalable < 60) {
    suggestions.push("Strengthen rollout scalability with repeatable channel playbooks and clearer deployment structure.");
  }
  if (universal < 60) {
    suggestions.push("Make the concept transferable across segments by simplifying and broadening application context.");
  }
  if (memorable < 60) {
    suggestions.push("Sharpen the metaphor/tagline to make the concept easier to recall after first exposure.");
  }
  if (simple < 60) {
    suggestions.push("Reduce complexity and jargon so the big idea can be understood in one quick read.");
  }
  if (unexpectedRelevant < 60) {
    suggestions.push("Increase the unexpected angle while linking more directly to insight, motive, and behavior action.");
  }

  return {
    scalable,
    universal,
    memorable,
    simple,
    unexpectedRelevant,
    total,
    passes,
    suggestions,
  };
}

function applyUniqueSuffix(concept: Concept, index: number): Concept {
  const suffix = `V${index}`;
  const baseName = concept.name.replace(/\s+V\d+$/i, "").trim();
  const baseTagline = (concept.tagline || concept.smp).replace(/\s+V\d+$/i, "").trim();

  return {
    ...concept,
    name: `${baseName} ${suffix}`,
    tagline: `${baseTagline} ${suffix}`,
  };
}

function generateUniqueFallbackConcept(
  data: CampaignData,
  options: ConceptGenerationOptions,
  selectedIdeas: Idea[],
  leadIdea: Idea | null,
  existingConcepts: Concept[],
): Concept {
  let latest: Concept | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const frame = pickConceptFrame(data, leadIdea, options.mode ?? "balanced", existingConcepts, attempt);
    const candidate = buildFallbackConcept(data, options, leadIdea, selectedIdeas, frame, attempt);
    latest = candidate;

    if (!isConceptTooSimilar(candidate, existingConcepts)) {
      return candidate;
    }
  }

  return applyUniqueSuffix(
    latest || buildFallbackConcept(data, options, leadIdea, selectedIdeas, CONCEPT_FRAMES[options.mode ?? "balanced"][0], 0),
    existingConcepts.length + 1,
  );
}

export function generateConceptFromCampaign(
  data: CampaignData,
  options: ConceptGenerationOptions = {},
): Concept {
  const selectedIdeas = data.ideas.filter((idea) => idea.selected);
  const leadIdea = pickLeadIdea(data, selectedIdeas, options);
  const existingConcepts = options.existingConcepts ?? data.concepts;

  return generateUniqueFallbackConcept(data, options, selectedIdeas, leadIdea, existingConcepts);
}

export async function generateConceptFromCampaignWithAI(
  data: CampaignData,
  options: ConceptGenerationOptions = {},
): Promise<Concept> {
  const mode = options.mode ?? "balanced";
  const selectedIdeas = data.ideas.filter((idea) => idea.selected);
  const leadIdea = pickLeadIdea(data, selectedIdeas, options);
  const existingConcepts = options.existingConcepts ?? data.concepts;
  const behaviorAction = data.behavior.desiredBehavior || "perform the desired action";
  const timeline = data.timelineDetails || `${data.campaign.startDate} to ${data.campaign.endDate}`;

  let best = generateUniqueFallbackConcept(data, options, selectedIdeas, leadIdea, existingConcepts);
  let bestScore = evaluateConceptQuality(best, data).total;

  for (let attempt = 0; attempt < MAX_AI_ATTEMPTS; attempt += 1) {
    const frame = pickConceptFrame(data, leadIdea, mode, existingConcepts, attempt);
    const fallback = buildFallbackConcept(data, options, leadIdea, selectedIdeas, frame, attempt);

    try {
      const prompt = buildConceptPrompt(data, leadIdea, mode, existingConcepts, frame, attempt);
      const raw = await generateTextViaApi(prompt);
      const parsed = parseJsonFromModelText<AiConceptOutput>(raw);

      const merged =
        parsed && typeof parsed === "object"
          ? mergeConceptFromAi(fallback, parsed, { behaviorAction, timeline })
          : fallback;

      const candidate = reinforceConceptQuality(merged, data, mode, frame);
      const quality = evaluateConceptQuality(candidate, data);
      const similarityPenalty = isConceptTooSimilar(candidate, existingConcepts) ? 20 : 0;
      const score = quality.total - similarityPenalty;

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }

      if (!isConceptTooSimilar(candidate, existingConcepts) && quality.passes) {
        return candidate;
      }
    } catch {
      const quality = evaluateConceptQuality(fallback, data);
      if (quality.total > bestScore && !isConceptTooSimilar(fallback, existingConcepts)) {
        best = fallback;
        bestScore = quality.total;
      }
    }
  }

  if (isConceptTooSimilar(best, existingConcepts)) {
    return generateUniqueFallbackConcept(data, options, selectedIdeas, leadIdea, existingConcepts);
  }

  return best;
}

export interface ConceptBoardModel {
  keyVisualDirections: string[];
  headlines: string[];
  socialPosts: string[];
  radioScript: string;
  whatsappSequence: string[];
  messageBarrierMap: ConceptBoardBarrierRow[];
  pretestQuestions: string[];
}

function createBarrierRowId(): string {
  return `barrier-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeBarrierRows(rows: ConceptBoardBarrierRow[]): ConceptBoardBarrierRow[] {
  return rows.map((row) => ({
    id: row.id || createBarrierRowId(),
    barrier: clean(row.barrier || ""),
    strategy: clean(row.strategy || ""),
    channel: clean(row.channel || ""),
  }));
}

function toBoardData(data: ConceptBoardModel): ConceptBoardData {
  return {
    ...data,
    updatedAt: new Date().toISOString(),
  };
}

export function updateConceptWithBoardData(concept: Concept, board: ConceptBoardModel): Concept {
  return {
    ...concept,
    boardData: toBoardData(board),
  };
}

export function hydrateConceptWithBoardData(data: CampaignData, concept: Concept): Concept {
  const defaultBoard = buildDefaultConceptBoardModel(data, concept);
  const saved = concept.boardData;

  if (!saved) {
    return updateConceptWithBoardData(concept, defaultBoard);
  }

  const mergedBoard: ConceptBoardModel = {
    keyVisualDirections: saved.keyVisualDirections?.filter(Boolean).length
      ? saved.keyVisualDirections.filter(Boolean)
      : defaultBoard.keyVisualDirections,
    headlines: saved.headlines?.filter(Boolean).length
      ? saved.headlines.filter(Boolean)
      : defaultBoard.headlines,
    socialPosts: saved.socialPosts?.filter(Boolean).length
      ? saved.socialPosts.filter(Boolean)
      : defaultBoard.socialPosts,
    radioScript: clean(saved.radioScript || "") || defaultBoard.radioScript,
    whatsappSequence: saved.whatsappSequence?.filter(Boolean).length
      ? saved.whatsappSequence.filter(Boolean)
      : defaultBoard.whatsappSequence,
    messageBarrierMap: Array.isArray(saved.messageBarrierMap) && saved.messageBarrierMap.length > 0
      ? normalizeBarrierRows(saved.messageBarrierMap)
      : defaultBoard.messageBarrierMap,
    pretestQuestions: saved.pretestQuestions?.filter(Boolean).length
      ? saved.pretestQuestions.filter(Boolean)
      : defaultBoard.pretestQuestions,
  };

  return updateConceptWithBoardData(concept, mergedBoard);
}

export function buildDefaultConceptBoardModel(data: CampaignData, concept: Concept): ConceptBoardModel {
  const primaryAudience = data.audiences[0]?.segmentName || "priority audience";
  const action = data.behavior.desiredBehavior || "take the target action";
  const baseChannel = concept.channels[0] || "Community channels";

  const keyVisualDirections = [
    concept.keyVisualDescription || "Visual direction generated from concept signal",
    ...concept.supportPoints.slice(0, 2),
  ].filter(Boolean);

  return {
    keyVisualDirections,
    headlines: [
      concept.tagline || "Insight to Action",
      `${primaryAudience}: ${action}`,
      "Now is the moment to act",
      "Proof, not promises",
    ],
    socialPosts: [
      `${concept.tagline || concept.smp} ${action}.`,
      `For ${primaryAudience}, this is practical and immediate. Start this week.`,
      `From insight to execution: ${concept.executionRationale || concept.keyPromise}`,
      `Behavior trigger: ${concept.behaviorTrigger || action}`,
    ],
    radioScript: `Narrator: ${concept.tagline || concept.smp}. For ${primaryAudience}, the next step is simple: ${action}. ${concept.behaviorTrigger || "Take the action today."}`,
    whatsappSequence: [
      `${concept.tagline || concept.smp}`,
      `Next step: ${action}`,
      "Reply YES to receive your immediate action checklist.",
    ],
    messageBarrierMap: normalizeBarrierRows([
      {
        id: createBarrierRowId(),
        barrier: data.driver.tension || "Low confidence in the action",
        strategy: concept.executionRationale || concept.keyPromise,
        channel: baseChannel,
      },
      {
        id: createBarrierRowId(),
        barrier: data.audiences[0]?.barriers || "Perceived effort is too high",
        strategy: concept.behaviorTrigger || "Reduce friction with clear next steps",
        channel: concept.channels[1] || baseChannel,
      },
    ]),
    pretestQuestions: [
      "What message do you remember most from this concept?",
      "Does this feel relevant to your real situation?",
      "Is the action step clear enough to do today?",
      "What would make this idea stronger before launch?",
    ],
  };
}

export function buildConceptBoardModel(data: CampaignData, concept: Concept): ConceptBoardModel {
  return hydrateConceptWithBoardData(data, concept).boardData as ConceptBoardData;
}
