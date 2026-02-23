import {
  CampaignData,
  CreativeBriefData,
  DEFAULT_CREATIVE_BRIEF,
  DriverMotive,
  DRIVER_MOTIVES,
} from "@/types/campaign";
import { cleanAiText, generateTextViaApi, parseJsonFromModelText } from "@/lib/ai/ai-client";
import { generateConceptFromCampaign, generateConceptFromCampaignWithAI } from "@/lib/ai-engine/concept-generator";
import { generateIdeas, generateIdeasWithAI } from "@/lib/ai-engine/ideation-generator";
import { generateInsightAutomation } from "@/lib/ai-engine/insight-generator";
import { ParsedResearchData, ResearchDocumentInput, parseResearchDocuments } from "@/lib/ai-engine/research-parser";

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureLines(value: string, fallback: string[]): string {
  const lines = splitLines(value);
  return lines.length > 0 ? lines.join("\n") : fallback.join("\n");
}

function sanitizeText(value: unknown): string {
  return typeof value === "string" ? cleanAiText(value).trim() : "";
}

function sanitizeMultiline(value: unknown, fallback: string): string {
  const sanitized = sanitizeText(value);
  return sanitized || fallback;
}

function sanitizeDriverTypes(value: unknown, fallback: DriverMotive[]): DriverMotive[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean)
    .map((item) => {
      const direct = DRIVER_MOTIVES.find((motive) => motive === item);
      if (direct) {
        return direct;
      }

      if (item.includes("affili")) return "affiliate";
      if (item.includes("nurt")) return "nurture";
      if (item.includes("status")) return "status";
      if (item.includes("fear")) return "fear";
      if (item.includes("curio")) return "curiosity";
      if (item.includes("love")) return "love";
      if (item.includes("just")) return "justice";
      if (item.includes("comfort")) return "comfort";
      if (item.includes("create")) return "create";
      if (item.includes("hunger")) return "hunger";
      if (item.includes("hoard")) return "hoard";
      if (item.includes("disgust")) return "disgust";
      if (item.includes("play")) return "play";
      if (item.includes("lust")) return "lust";
      if (item.includes("attract")) return "attract";
      return null;
    })
    .filter((item): item is DriverMotive => Boolean(item));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

function parseJson<T>(raw: string): T | null {
  return parseJsonFromModelText<T>(raw);
}

function createAudienceId(index: number): string {
  return `aud-auto-${index + 1}`;
}

export interface CampaignAutomationResult {
  parsed: ParsedResearchData;
  patch: Partial<CampaignData>;
}

interface AiResearchExtractionOutput {
  situation?: string;
  problem?: string;
  priorLearnings?: string;
  businessObjective?: string;
  communicationObjective?: string;
  insightText?: string;
  evidenceSource?: string;
  confidenceLevel?: "low" | "medium" | "high";
  behaviorStatement?: string;
  currentBehavior?: string;
  desiredBehavior?: string;
  behaviorContext?: string;
  driverText?: string;
  whyNow?: string;
  tension?: string;
  audiences?: string[];
  driverTypes?: string[];
}

interface AiCommunicationAudience {
  segmentName?: string;
  keyMessage?: string;
  supportRtb?: string;
  cta?: string;
}

interface AiCommunicationChannel {
  category?: string;
  channel?: string;
  role?: string;
}

interface AiCommunicationMediaRow {
  channel?: string;
  targeting?: string;
  flighting?: string;
  budget?: string;
  kpi?: string;
  benchmark?: string;
}

interface AiCommunicationOutput {
  audiences?: AiCommunicationAudience[];
  channelRoles?: AiCommunicationChannel[];
  mediaPlanRows?: AiCommunicationMediaRow[];
  contentThemesAndCalendar?: string;
  deliverablesNeeded?: string;
  measurementAndLearningPlan?: string;
  governanceRisksAndApprovals?: string;
  timelineDetails?: string;
  appendices?: string;
}

interface AiCreativeDeliverable {
  asset?: string;
  platform?: string;
  format?: string;
  dimensionsDuration?: string;
  copyLimits?: string;
  languages?: string;
  accessibility?: string;
}

interface AiCreativeOutput {
  activityName?: string;
  agencyName?: string;
  owner?: string;
  audience?: string;
  purpose?: string;
  projectName?: string;
  projectOverview?: string;
  background?: string;
  singleMindedObjective?: string;
  audienceWho?: string;
  audienceTension?: string;
  audienceDesiredChange?: string;
  keyProposition?: string;
  reasonsToBelieve?: string;
  toneAndPersonality?: string;
  culturalCuesEmbrace?: string;
  culturalCuesAvoid?: string;
  logoUsage?: string;
  colorsTypography?: string;
  legal?: string;
  doExamples?: string;
  dontExamples?: string;
  deliverables?: AiCreativeDeliverable[];
}

function buildResearchExtractionPrompt(documents: ResearchDocumentInput[]): string {
  const combinedText = documents
    .map((document) => `### ${document.name}\n${document.text}`)
    .join("\n\n")
    .slice(0, 10_500);

  return [
    "You are an expert SBCC strategist helping generate behaviour change campaigns.",
    "Extract campaign-relevant research fields from the uploaded text.",
    "Return JSON only using this exact shape:",
    '{"situation":"...","problem":"...","priorLearnings":"...","businessObjective":"...","communicationObjective":"...","insightText":"...","evidenceSource":"...","confidenceLevel":"low|medium|high","behaviorStatement":"...","currentBehavior":"...","desiredBehavior":"...","behaviorContext":"...","driverText":"...","whyNow":"...","tension":"...","audiences":["..."],"driverTypes":["..."]}',
    "Keep language concise and action-oriented.",
    "Uploaded research text:",
    combinedText,
  ].join("\n\n");
}

async function enrichParsedResearchWithAi(parsed: ParsedResearchData, documents: ResearchDocumentInput[]): Promise<ParsedResearchData> {
  const rawText = documents.map((entry) => entry.text).join("\n").trim();
  if (!rawText) {
    return parsed;
  }

  try {
    const output = await generateTextViaApi(buildResearchExtractionPrompt(documents));
    const aiData = parseJson<AiResearchExtractionOutput>(output);
    if (!aiData || typeof aiData !== "object") {
      return parsed;
    }

    return {
      ...parsed,
      situation: sanitizeText(aiData.situation) || parsed.situation,
      problem: sanitizeText(aiData.problem) || parsed.problem,
      priorLearnings: sanitizeText(aiData.priorLearnings) || parsed.priorLearnings,
      businessObjective: sanitizeText(aiData.businessObjective) || parsed.businessObjective,
      communicationObjective: sanitizeText(aiData.communicationObjective) || parsed.communicationObjective,
      insightText: sanitizeText(aiData.insightText) || parsed.insightText,
      evidenceSource: sanitizeText(aiData.evidenceSource) || parsed.evidenceSource,
      confidenceLevel:
        aiData.confidenceLevel === "low" || aiData.confidenceLevel === "medium" || aiData.confidenceLevel === "high"
          ? aiData.confidenceLevel
          : parsed.confidenceLevel,
      behaviorStatement: sanitizeText(aiData.behaviorStatement) || parsed.behaviorStatement,
      currentBehavior: sanitizeText(aiData.currentBehavior) || parsed.currentBehavior,
      desiredBehavior: sanitizeText(aiData.desiredBehavior) || parsed.desiredBehavior,
      behaviorContext: sanitizeText(aiData.behaviorContext) || parsed.behaviorContext,
      driverText: sanitizeText(aiData.driverText) || parsed.driverText,
      whyNow: sanitizeText(aiData.whyNow) || parsed.whyNow,
      tension: sanitizeText(aiData.tension) || parsed.tension,
      audiences:
        Array.isArray(aiData.audiences) && aiData.audiences.length > 0
          ? aiData.audiences.map((entry) => sanitizeText(entry)).filter(Boolean)
          : parsed.audiences,
      driverTypes: sanitizeDriverTypes(aiData.driverTypes, parsed.driverTypes),
    };
  } catch {
    return parsed;
  }
}

function buildCommunicationPrompt(data: CampaignData): string {
  const audienceSummary = data.audiences
    .map((audience) => `${audience.segmentName}: desired action ${audience.desiredAction}`)
    .join("\n");

  return [
    "You are an expert SBCC strategist helping generate behaviour change campaigns.",
    "Generate communication brief details from campaign inputs.",
    `Campaign: ${data.campaign.name}`,
    `Situation: ${data.situation}`,
    `Problem: ${data.problem}`,
    `Business objective: ${data.businessObjective}`,
    `Communication objective: ${data.communicationObjective}`,
    `Insight: ${data.insight.insightText}`,
    `Driver: ${data.driver.driverText}`,
    `Desired behavior: ${data.behavior.desiredBehavior}`,
    `Audience details:\n${audienceSummary}`,
    "Return JSON only in this shape:",
    '{"audiences":[{"segmentName":"...","keyMessage":"...","supportRtb":"...","cta":"..."}],"channelRoles":[{"category":"paid|owned|earned","channel":"...","role":"..."}],"mediaPlanRows":[{"channel":"...","targeting":"...","flighting":"...","budget":"...","kpi":"...","benchmark":"..."}],"contentThemesAndCalendar":"...","deliverablesNeeded":"...","measurementAndLearningPlan":"...","governanceRisksAndApprovals":"...","timelineDetails":"...","appendices":"..."}',
  ].join("\n\n");
}

function mapAudienceMessages(
  data: CampaignData,
  fallbackAudiences: CampaignData["audiences"],
  aiAudiences: AiCommunicationAudience[] | undefined,
): CampaignData["audiences"] {
  if (!Array.isArray(aiAudiences) || aiAudiences.length === 0) {
    return fallbackAudiences;
  }

  return fallbackAudiences.map((audience, index) => {
    const directMatch = aiAudiences.find(
      (item) => sanitizeText(item.segmentName).toLowerCase() === audience.segmentName.trim().toLowerCase(),
    );
    const byIndex = aiAudiences[index];
    const source = directMatch ?? byIndex;

    return {
      ...audience,
      keyMessage: sanitizeText(source?.keyMessage) || audience.keyMessage || "",
      supportRtb: sanitizeText(source?.supportRtb) || audience.supportRtb || "",
      cta: sanitizeText(source?.cta) || audience.cta || "",
    };
  });
}

function normalizeChannelCategory(value: unknown): "paid" | "owned" | "earned" {
  const normalized = sanitizeText(value).toLowerCase();
  if (normalized === "paid" || normalized === "owned" || normalized === "earned") {
    return normalized;
  }

  if (normalized.includes("own")) return "owned";
  if (normalized.includes("earn")) return "earned";
  return "paid";
}

function mapChannelRoles(aiRoles: AiCommunicationChannel[] | undefined, fallback: CampaignData["channelRoles"]): CampaignData["channelRoles"] {
  if (!Array.isArray(aiRoles) || aiRoles.length === 0) {
    return fallback;
  }

  const rows = aiRoles
    .map((entry, index) => ({
      id: fallback[index]?.id ?? `ai-channel-${Date.now()}-${index}`,
      category: normalizeChannelCategory(entry.category),
      channel: sanitizeText(entry.channel),
      role: sanitizeText(entry.role),
    }))
    .filter((row) => row.channel || row.role);

  return rows.length > 0 ? rows : fallback;
}

function mapMediaRows(aiRows: AiCommunicationMediaRow[] | undefined, fallback: CampaignData["mediaPlanRows"]): CampaignData["mediaPlanRows"] {
  if (!Array.isArray(aiRows) || aiRows.length === 0) {
    return fallback;
  }

  const mapped = aiRows
    .map((entry, index) => ({
      id: fallback[index]?.id ?? `ai-media-${Date.now()}-${index}`,
      channel: sanitizeText(entry.channel),
      targeting: sanitizeText(entry.targeting),
      flighting: sanitizeText(entry.flighting),
      budget: sanitizeText(entry.budget),
      kpi: sanitizeText(entry.kpi),
      benchmark: sanitizeText(entry.benchmark),
    }))
    .filter((row) => row.channel || row.targeting || row.kpi);

  return mapped.length > 0 ? mapped : fallback;
}

function uniqueNonEmptyLines(values: string[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const value of values) {
    for (const line of splitLines(value || "")) {
      const normalized = line.trim();
      const fingerprint = normalized.toLowerCase();
      if (!normalized || seen.has(fingerprint)) {
        continue;
      }
      seen.add(fingerprint);
      lines.push(normalized);
    }
  }

  return lines;
}

function deriveCreativeDeliverablesFromCampaign(data: CampaignData): CreativeBriefData["deliverables"] {
  const requestedAssets = uniqueNonEmptyLines([data.deliverablesNeeded]).slice(0, 8);
  if (requestedAssets.length === 0) {
    return DEFAULT_CREATIVE_BRIEF.deliverables.map((entry) => ({ ...entry }));
  }

  const availableChannels = data.channelRoles.map((entry) => sanitizeText(entry.channel)).filter(Boolean);
  const languageHint = data.campaign.languages.join("/") || "N/A";

  return requestedAssets.map((asset, index) => ({
    id: `cb-deliverable-derived-${index + 1}`,
    asset,
    platform: availableChannels[index % Math.max(availableChannels.length, 1)] || "Integrated campaign channels",
    format: "",
    dimensionsDuration: "",
    copyLimits: "",
    languages: languageHint,
    accessibility: "Alt text / subtitles where relevant",
  }));
}

function buildCreativePrompt(data: CampaignData): string {
  const concept = data.concepts[0];

  return [
    "You are an expert SBCC strategist helping generate behaviour change campaigns.",
    "Generate a complete creative brief draft based on campaign context.",
    `Campaign: ${data.campaign.name}`,
    `Situation: ${data.situation}`,
    `Problem: ${data.problem}`,
    `Objective: ${data.communicationObjective}`,
    `Insight: ${data.insight.insightText}`,
    `Driver: ${data.driver.driverText}`,
    `Audience: ${data.audiences.map((entry) => entry.segmentName).join(", ")}`,
    `Active concept: ${concept?.name ?? "N/A"}`,
    `SMP: ${concept?.smp ?? "N/A"}`,
    "Return JSON only in this shape:",
    '{"activityName":"...","agencyName":"...","owner":"...","audience":"...","purpose":"...","projectName":"...","projectOverview":"...","background":"...","singleMindedObjective":"...","audienceWho":"...","audienceTension":"...","audienceDesiredChange":"...","keyProposition":"...","reasonsToBelieve":"...","toneAndPersonality":"...","culturalCuesEmbrace":"...","culturalCuesAvoid":"...","logoUsage":"...","colorsTypography":"...","legal":"...","doExamples":"...","dontExamples":"...","deliverables":[{"asset":"...","platform":"...","format":"...","dimensionsDuration":"...","copyLimits":"...","languages":"...","accessibility":"..."}]}'
  ].join("\n\n");
}

function mapCreativeDeliverables(
  aiDeliverables: AiCreativeDeliverable[] | undefined,
  fallbackDeliverables: CreativeBriefData["deliverables"],
): CreativeBriefData["deliverables"] {
  if (!Array.isArray(aiDeliverables) || aiDeliverables.length === 0) {
    return fallbackDeliverables;
  }

  const mapped = aiDeliverables
    .map((entry, index) => ({
      id: fallbackDeliverables[index]?.id ?? `cb-deliverable-ai-${index + 1}`,
      asset: sanitizeText(entry.asset),
      platform: sanitizeText(entry.platform),
      format: sanitizeText(entry.format),
      dimensionsDuration: sanitizeText(entry.dimensionsDuration),
      copyLimits: sanitizeText(entry.copyLimits),
      languages: sanitizeText(entry.languages),
      accessibility: sanitizeText(entry.accessibility),
    }))
    .filter((row) => row.asset || row.platform || row.format);

  return mapped.length > 0 ? mapped : fallbackDeliverables;
}

export function deriveCreativeBriefFromCampaignContext(data: CampaignData): CreativeBriefData {
  const leadConcept = data.concepts[0];
  const audienceNames = data.audiences.map((audience) => sanitizeText(audience.segmentName)).filter(Boolean);
  const audienceWhoLines = uniqueNonEmptyLines(
    data.audiences.map((audience) => {
      const name = sanitizeText(audience.segmentName);
      const description = sanitizeText(audience.description);
      return name && description ? `${name}: ${description}` : name || description;
    }),
  );
  const tensionLines = uniqueNonEmptyLines([
    data.driver.tension,
    ...data.audiences.map((audience) => audience.barriers),
    data.problem,
  ]);
  const desiredChangeLines = uniqueNonEmptyLines([
    ...data.audiences.map((audience) => audience.desiredAction),
    data.behavior.desiredBehavior,
  ]);
  const reasonLines = uniqueNonEmptyLines([
    data.insight.evidenceSource,
    ...data.audiences.map((audience) => audience.supportRtb || ""),
    ...(leadConcept?.supportPoints ?? []),
    data.measurementAndLearningPlan,
  ]);
  const backgroundLines = uniqueNonEmptyLines([data.problem, data.priorLearnings]).slice(0, 8);
  const contextualPurpose = `Translate the communication strategy into executable creative that drives: ${data.behavior.desiredBehavior || data.communicationObjective || "the target behavior"}.`;

  return {
    ...DEFAULT_CREATIVE_BRIEF,
    activityName: data.campaign.name || DEFAULT_CREATIVE_BRIEF.activityName,
    agencyName: "CLEARKAMO",
    owner: "Brand / Creative Team",
    audience: audienceNames.join(", ") || data.creativeBrief.audience || DEFAULT_CREATIVE_BRIEF.audience,
    purpose: contextualPurpose,
    projectName: data.campaign.name || DEFAULT_CREATIVE_BRIEF.projectName,
    projectOverview: data.situation || data.creativeBrief.projectOverview || DEFAULT_CREATIVE_BRIEF.projectOverview,
    background:
      backgroundLines.join("\n") || data.creativeBrief.background || DEFAULT_CREATIVE_BRIEF.background,
    singleMindedObjective:
      data.communicationObjective || data.creativeBrief.singleMindedObjective || DEFAULT_CREATIVE_BRIEF.singleMindedObjective,
    audienceWho:
      audienceWhoLines.join("\n") || data.creativeBrief.audienceWho || DEFAULT_CREATIVE_BRIEF.audienceWho,
    audienceTension:
      tensionLines.join("\n") || data.creativeBrief.audienceTension || DEFAULT_CREATIVE_BRIEF.audienceTension,
    audienceDesiredChange:
      desiredChangeLines.join("\n") || data.creativeBrief.audienceDesiredChange || DEFAULT_CREATIVE_BRIEF.audienceDesiredChange,
    keyProposition:
      leadConcept?.tagline ||
      leadConcept?.smp ||
      data.audiences[0]?.keyMessage ||
      data.creativeBrief.keyProposition ||
      "Insight-driven action starts now.",
    reasonsToBelieve:
      reasonLines.join("\n") || data.creativeBrief.reasonsToBelieve || DEFAULT_CREATIVE_BRIEF.reasonsToBelieve,
    toneAndPersonality:
      leadConcept?.tone || data.creativeBrief.toneAndPersonality || "Human, confident, practical.",
    culturalCuesEmbrace:
      data.creativeBrief.culturalCuesEmbrace || DEFAULT_CREATIVE_BRIEF.culturalCuesEmbrace,
    culturalCuesAvoid:
      data.creativeBrief.culturalCuesAvoid || DEFAULT_CREATIVE_BRIEF.culturalCuesAvoid,
    logoUsage: data.creativeBrief.logoUsage || DEFAULT_CREATIVE_BRIEF.logoUsage,
    colorsTypography: data.creativeBrief.colorsTypography || DEFAULT_CREATIVE_BRIEF.colorsTypography,
    legal: data.creativeBrief.legal || DEFAULT_CREATIVE_BRIEF.legal,
    doExamples:
      data.creativeBrief.doExamples ||
      [
        "Lead with one clear action.",
        "Use trusted local proof and practical examples.",
        "Keep message and asset role consistent by channel.",
      ].join("\n"),
    dontExamples:
      data.creativeBrief.dontExamples ||
      [
        "Avoid abstract awareness-only statements.",
        "Avoid claims without evidence or proof.",
        "Avoid channel-first creative without audience context.",
      ].join("\n"),
    deliverables: deriveCreativeDeliverablesFromCampaign(data),
  };
}

export function automateCampaignFromDocuments(data: CampaignData, documents: ResearchDocumentInput[]): CampaignAutomationResult {
  const parsed = parseResearchDocuments(documents);
  const insightPatch = generateInsightAutomation(data, parsed);

  const baseData: CampaignData = {
    ...data,
    ...insightPatch,
  };

  const communicationPatch = generateCommunicationBriefPatch(baseData);
  const creativeBrief = generateCreativeBriefFromCampaign(baseData);
  const generatedIdeas = generateIdeas(baseData, { count: 4 });
  const generatedConcept = generateConceptFromCampaign(
    { ...baseData, ideas: generatedIdeas },
    { existingConcepts: baseData.concepts },
  );

  return {
    parsed,
    patch: {
      ...insightPatch,
      ...communicationPatch,
      creativeBrief,
      ideas: generatedIdeas,
      concepts: [generatedConcept],
    },
  };
}

export async function automateCampaignFromDocumentsWithAI(
  data: CampaignData,
  documents: ResearchDocumentInput[],
): Promise<CampaignAutomationResult> {
  const fallback = automateCampaignFromDocuments(data, documents);

  try {
    const parsed = await enrichParsedResearchWithAi(fallback.parsed, documents);
    const insightPatch = generateInsightAutomation(data, parsed);
    const baseData: CampaignData = {
      ...data,
      ...insightPatch,
    };

    const [communicationPatch, creativeBrief, generatedIdeas] = await Promise.all([
      generateCommunicationBriefPatchWithAI(baseData),
      generateCreativeBriefFromCampaignWithAI(baseData),
      generateIdeasWithAI(baseData, { count: 4 }),
    ]);

    const conceptSourceData: CampaignData = {
      ...baseData,
      ...communicationPatch,
      creativeBrief,
      ideas: generatedIdeas,
    };

    const generatedConcept = await generateConceptFromCampaignWithAI(conceptSourceData, {
      existingConcepts: baseData.concepts,
    });

    return {
      parsed,
      patch: {
        ...insightPatch,
        ...communicationPatch,
        creativeBrief,
        ideas: generatedIdeas,
        concepts: [generatedConcept],
      },
    };
  } catch {
    return fallback;
  }
}

export function generateCommunicationBriefPatch(data: CampaignData): Partial<CampaignData> {
  const audienceLines = data.audiences
    .map((audience) => audience.segmentName)
    .filter(Boolean)
    .slice(0, 4);
  const audienceSummary = audienceLines.join(", ") || "Priority audience";

  const audiences = data.audiences.map((audience) => ({
    ...audience,
    keyMessage: hasText(audience.keyMessage)
      ? audience.keyMessage
      : `For ${audience.segmentName}, ${data.communicationObjective || "this behavior matters now."}`,
    supportRtb: hasText(audience.supportRtb)
      ? audience.supportRtb
      : data.insight.evidenceSource || "Evidence from uploaded documents and observed behavior patterns.",
    cta: hasText(audience.cta)
      ? audience.cta
      : audience.desiredAction || data.behavior.desiredBehavior || "Take the next recommended action.",
  }));

  const channelRoles =
    data.channelRoles.length > 0
      ? data.channelRoles
      : [
          {
            id: "auto-channel-paid",
            category: "paid" as const,
            channel: "Targeted paid media",
            role: "Generate rapid awareness among priority segments.",
          },
          {
            id: "auto-channel-owned",
            category: "owned" as const,
            channel: "Owned campaign channels",
            role: "Guide audiences from awareness to action.",
          },
          {
            id: "auto-channel-earned",
            category: "earned" as const,
            channel: "Community and partner amplification",
            role: "Build social proof and trust.",
          },
        ];

  const mediaPlanRows =
    data.mediaPlanRows.length > 0
      ? data.mediaPlanRows
      : [
          {
            id: "auto-media-1",
            channel: "Community Radio",
            targeting: audienceSummary,
            flighting: `${data.campaign.startDate} to ${data.campaign.endDate}`,
            budget: "TBD",
            kpi: "Reach",
            benchmark: "Baseline +20%",
          },
          {
            id: "auto-media-2",
            channel: "WhatsApp / Mobile",
            targeting: audienceSummary,
            flighting: "Weekly sequence",
            budget: "TBD",
            kpi: "Response rate",
            benchmark: ">=10%",
          },
        ];

  return {
    audiences,
    channelRoles,
    mediaPlanRows,
    contentThemesAndCalendar: ensureLines(data.contentThemesAndCalendar, [
      "Theme 1: Human insight and tension",
      "Theme 2: Proof and relevance",
      "Theme 3: Action prompts and accountability",
      "Cadence: 3 touchpoints per week",
    ]),
    deliverablesNeeded: ensureLines(data.deliverablesNeeded, [
      "Key message matrix by audience",
      "Social and radio creative variations",
      "Community activation toolkit",
      "Measurement dashboard template",
    ]),
    measurementAndLearningPlan: ensureLines(data.measurementAndLearningPlan, [
      "Primary KPI: Target behavior adoption",
      "Secondary KPI: Message relevance and intent",
      "Learning loop: Weekly review and adjustment",
    ]),
    governanceRisksAndApprovals: ensureLines(data.governanceRisksAndApprovals, [
      "Approvers: Campaign owner, strategy lead, compliance",
      "Risks: message misinterpretation, low channel fit",
      "Mitigation: pretest + weekly optimization",
    ]),
    timelineDetails: hasText(data.timelineDetails)
      ? data.timelineDetails
      : `Start: ${data.campaign.startDate}\nEnd: ${data.campaign.endDate}\nMilestones: Weekly optimization checkpoints`,
    appendices: ensureLines(data.appendices, ["Uploaded research sources", "Audience evidence notes", "Tracking framework"]),
  };
}

export async function generateCommunicationBriefPatchWithAI(data: CampaignData): Promise<Partial<CampaignData>> {
  const fallback = generateCommunicationBriefPatch(data);

  try {
    const output = await generateTextViaApi(buildCommunicationPrompt(data));
    const aiData = parseJson<AiCommunicationOutput>(output);

    if (!aiData || typeof aiData !== "object") {
      return fallback;
    }

    return {
      audiences: mapAudienceMessages(data, fallback.audiences ?? data.audiences, aiData.audiences),
      channelRoles: mapChannelRoles(aiData.channelRoles, fallback.channelRoles ?? data.channelRoles),
      mediaPlanRows: mapMediaRows(aiData.mediaPlanRows, fallback.mediaPlanRows ?? data.mediaPlanRows),
      contentThemesAndCalendar: sanitizeMultiline(aiData.contentThemesAndCalendar, fallback.contentThemesAndCalendar ?? data.contentThemesAndCalendar),
      deliverablesNeeded: sanitizeMultiline(aiData.deliverablesNeeded, fallback.deliverablesNeeded ?? data.deliverablesNeeded),
      measurementAndLearningPlan: sanitizeMultiline(aiData.measurementAndLearningPlan, fallback.measurementAndLearningPlan ?? data.measurementAndLearningPlan),
      governanceRisksAndApprovals: sanitizeMultiline(aiData.governanceRisksAndApprovals, fallback.governanceRisksAndApprovals ?? data.governanceRisksAndApprovals),
      timelineDetails: sanitizeMultiline(aiData.timelineDetails, fallback.timelineDetails ?? data.timelineDetails),
      appendices: sanitizeMultiline(aiData.appendices, fallback.appendices ?? data.appendices),
    };
  } catch {
    return fallback;
  }
}

export function generateCreativeBriefFromCampaign(data: CampaignData): CreativeBriefData {
  const leadConcept = data.concepts[0];
  const derived = deriveCreativeBriefFromCampaignContext(data);

  return {
    ...data.creativeBrief,
    activityName: derived.activityName,
    agencyName: hasText(data.creativeBrief.agencyName) ? data.creativeBrief.agencyName : derived.agencyName,
    owner: hasText(data.creativeBrief.owner) ? data.creativeBrief.owner : derived.owner,
    audience: derived.audience,
    purpose:
      hasText(data.creativeBrief.purpose)
        ? data.creativeBrief.purpose
        : derived.purpose,
    projectName: derived.projectName,
    projectOverview:
      hasText(data.creativeBrief.projectOverview)
        ? data.creativeBrief.projectOverview
        : derived.projectOverview,
    background: hasText(data.creativeBrief.background) ? data.creativeBrief.background : derived.background,
    singleMindedObjective: derived.singleMindedObjective,
    audienceWho: hasText(data.creativeBrief.audienceWho)
      ? data.creativeBrief.audienceWho
      : derived.audienceWho,
    audienceTension: hasText(data.creativeBrief.audienceTension)
      ? data.creativeBrief.audienceTension
      : derived.audienceTension,
    audienceDesiredChange: derived.audienceDesiredChange,
    keyProposition: hasText(data.creativeBrief.keyProposition)
      ? data.creativeBrief.keyProposition
      : derived.keyProposition,
    reasonsToBelieve: hasText(data.creativeBrief.reasonsToBelieve)
      ? data.creativeBrief.reasonsToBelieve
      : derived.reasonsToBelieve,
    toneAndPersonality: hasText(data.creativeBrief.toneAndPersonality)
      ? data.creativeBrief.toneAndPersonality
      : leadConcept?.tone || derived.toneAndPersonality,
    culturalCuesEmbrace: hasText(data.creativeBrief.culturalCuesEmbrace)
      ? data.creativeBrief.culturalCuesEmbrace
      : derived.culturalCuesEmbrace,
    culturalCuesAvoid: hasText(data.creativeBrief.culturalCuesAvoid)
      ? data.creativeBrief.culturalCuesAvoid
      : derived.culturalCuesAvoid,
    logoUsage: hasText(data.creativeBrief.logoUsage)
      ? data.creativeBrief.logoUsage
      : derived.logoUsage,
    colorsTypography: hasText(data.creativeBrief.colorsTypography)
      ? data.creativeBrief.colorsTypography
      : derived.colorsTypography,
    legal: hasText(data.creativeBrief.legal)
      ? data.creativeBrief.legal
      : derived.legal,
    doExamples: hasText(data.creativeBrief.doExamples)
      ? data.creativeBrief.doExamples
      : derived.doExamples,
    dontExamples: hasText(data.creativeBrief.dontExamples)
      ? data.creativeBrief.dontExamples
      : derived.dontExamples,
    deliverables:
      data.creativeBrief.deliverables.length > 0
        ? data.creativeBrief.deliverables
        : derived.deliverables,
  };
}

export async function generateCreativeBriefFromCampaignWithAI(data: CampaignData): Promise<CreativeBriefData> {
  const fallback = generateCreativeBriefFromCampaign(data);

  try {
    const output = await generateTextViaApi(buildCreativePrompt(data));
    const aiData = parseJson<AiCreativeOutput>(output);
    if (!aiData || typeof aiData !== "object") {
      return fallback;
    }

    return {
      ...fallback,
      activityName: sanitizeText(aiData.activityName) || fallback.activityName,
      agencyName: sanitizeText(aiData.agencyName) || fallback.agencyName,
      owner: sanitizeText(aiData.owner) || fallback.owner,
      audience: sanitizeText(aiData.audience) || fallback.audience,
      purpose: sanitizeText(aiData.purpose) || fallback.purpose,
      projectName: sanitizeText(aiData.projectName) || fallback.projectName,
      projectOverview: sanitizeText(aiData.projectOverview) || fallback.projectOverview,
      background: sanitizeMultiline(aiData.background, fallback.background),
      singleMindedObjective: sanitizeText(aiData.singleMindedObjective) || fallback.singleMindedObjective,
      audienceWho: sanitizeMultiline(aiData.audienceWho, fallback.audienceWho),
      audienceTension: sanitizeMultiline(aiData.audienceTension, fallback.audienceTension),
      audienceDesiredChange: sanitizeMultiline(aiData.audienceDesiredChange, fallback.audienceDesiredChange),
      keyProposition: sanitizeText(aiData.keyProposition) || fallback.keyProposition,
      reasonsToBelieve: sanitizeMultiline(aiData.reasonsToBelieve, fallback.reasonsToBelieve),
      toneAndPersonality: sanitizeMultiline(aiData.toneAndPersonality, fallback.toneAndPersonality),
      culturalCuesEmbrace: sanitizeMultiline(aiData.culturalCuesEmbrace, fallback.culturalCuesEmbrace),
      culturalCuesAvoid: sanitizeMultiline(aiData.culturalCuesAvoid, fallback.culturalCuesAvoid),
      logoUsage: sanitizeMultiline(aiData.logoUsage, fallback.logoUsage),
      colorsTypography: sanitizeMultiline(aiData.colorsTypography, fallback.colorsTypography),
      legal: sanitizeMultiline(aiData.legal, fallback.legal),
      doExamples: sanitizeMultiline(aiData.doExamples, fallback.doExamples),
      dontExamples: sanitizeMultiline(aiData.dontExamples, fallback.dontExamples),
      deliverables: mapCreativeDeliverables(aiData.deliverables, fallback.deliverables),
    };
  } catch {
    return fallback;
  }
}

export function regenerateCampaignIdeas(data: CampaignData, count = 4): CampaignData["ideas"] {
  return generateIdeas(data, { count });
}

export async function regenerateCampaignIdeasWithAI(data: CampaignData, count = 4): Promise<CampaignData["ideas"]> {
  return generateIdeasWithAI(data, { count });
}

export function regenerateConcepts(data: CampaignData): CampaignData["concepts"] {
  return [generateConceptFromCampaign(data, { existingConcepts: data.concepts })];
}

export async function regenerateConceptsWithAI(data: CampaignData): Promise<CampaignData["concepts"]> {
  return [await generateConceptFromCampaignWithAI(data, { existingConcepts: data.concepts })];
}

export function normalizeAudienceList(audiences: string[]): CampaignData["audiences"] {
  return audiences.map((name, index) => ({
    id: createAudienceId(index),
    priority: index === 0 ? "primary" : "secondary",
    segmentName: sanitizeText(name) || `Audience ${index + 1}`,
    description: "",
    barriers: "",
    motivators: "",
    desiredAction: "",
    keyMessage: "",
    supportRtb: "",
    cta: "",
  }));
}
