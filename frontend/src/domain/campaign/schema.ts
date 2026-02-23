import { z } from "zod";
import { CampaignData, DEFAULT_CREATIVE_BRIEF, DEFAULT_QA_CHECKLIST, DRIVER_MOTIVES } from "@/types/campaign";
import { CampaignError } from "@/domain/campaign/errors";

export interface CampaignRecord {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: CampaignData;
}

export interface CampaignStoreV2 {
  version: 2;
  migratedAt: string;
  campaigns: CampaignRecord[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const campaignSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  country: z.string().trim().min(1).max(120),
  languages: z.array(z.string().trim().min(1)).default([]),
  startDate: z.string().trim().regex(DATE_PATTERN),
  endDate: z.string().trim().regex(DATE_PATTERN),
  status: z.enum(["draft", "in_review", "final"]),
});

const audienceSchema = z.object({
  id: z.string().trim().min(1),
  priority: z.enum(["primary", "secondary"]),
  segmentName: z.string().trim().min(1),
  description: z.string(),
  barriers: z.string(),
  motivators: z.string(),
  desiredAction: z.string(),
  keyMessage: z.string().optional().default(""),
  supportRtb: z.string().optional().default(""),
  cta: z.string().optional().default(""),
});

const behaviorSchema = z.object({
  behaviorStatement: z.string(),
  currentBehavior: z.string(),
  desiredBehavior: z.string(),
  context: z.string(),
});

const insightSchema = z.object({
  insightText: z.string(),
  evidenceSource: z.string(),
  confidenceLevel: z.enum(["low", "medium", "high"]),
});

const driverSchema = z.object({
  driverTypes: z.array(z.enum(DRIVER_MOTIVES)).default([]),
  driverText: z.string(),
  whyNow: z.string(),
  tension: z.string(),
});

const channelRoleSchema = z.object({
  id: z.string().trim().min(1),
  category: z.enum(["paid", "owned", "earned"]),
  channel: z.string().trim().min(1),
  role: z.string().trim().min(1),
});

const mediaPlanRowSchema = z.object({
  id: z.string().trim().min(1),
  channel: z.string().default(""),
  targeting: z.string().default(""),
  flighting: z.string().default(""),
  budget: z.string().default(""),
  kpi: z.string().default(""),
  benchmark: z.string().default(""),
});

const qaChecklistItemSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  checked: z.boolean().default(false),
});

const ideaSchema = z.object({
  id: z.string().trim().min(1),
  method: z.enum(["Revolution", "RelatedWorlds", "Re-expression", "RandomLinks"]),
  title: z.string().trim().min(1),
  description: z.string(),
  linkToInsight: z.string(),
  linkToDriver: z.string(),
  feasibilityScore: z.number().finite().min(0).max(5),
  originalityScore: z.number().finite().min(0).max(5),
  strategicFitScore: z.number().finite().min(0).max(5),
  culturalFitScore: z.number().finite().min(0).max(5),
  selected: z.boolean().optional(),
});

const conceptSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  bigIdea: z.string(),
  smp: z.string(),
  keyPromise: z.string(),
  supportPoints: z.array(z.string()).default([]),
  tone: z.string(),
  selectedIdeaIds: z.array(z.string()).default([]),
  channels: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  tagline: z.string().optional().default(""),
  keyVisualDescription: z.string().optional().default(""),
  executionRationale: z.string().optional().default(""),
  behaviorTrigger: z.string().optional().default(""),
  status: z.enum(["draft", "shortlisted", "final"]),
});

const creativeBriefDeliverableSchema = z.object({
  id: z.string().trim().min(1),
  asset: z.string().default(""),
  platform: z.string().default(""),
  format: z.string().default(""),
  dimensionsDuration: z.string().default(""),
  copyLimits: z.string().default(""),
  languages: z.string().default(""),
  accessibility: z.string().default(""),
});

const creativeBriefSchema = z.object({
  activityName: z.string().default(""),
  agencyName: z.string().default(""),
  owner: z.string().default(""),
  audience: z.string().default(""),
  purpose: z.string().default(""),
  projectName: z.string().default(""),
  projectOverview: z.string().default(""),
  background: z.string().default(""),
  singleMindedObjective: z.string().default(""),
  audienceWho: z.string().default(""),
  audienceTension: z.string().default(""),
  audienceDesiredChange: z.string().default(""),
  keyProposition: z.string().default(""),
  reasonsToBelieve: z.string().default(""),
  toneAndPersonality: z.string().default(""),
  culturalCuesEmbrace: z.string().default(""),
  culturalCuesAvoid: z.string().default(""),
  logoUsage: z.string().default(""),
  colorsTypography: z.string().default(""),
  legal: z.string().default(""),
  doExamples: z.string().default(""),
  dontExamples: z.string().default(""),
  deliverables: z.array(creativeBriefDeliverableSchema).default([]),
});

const teamMessageSchema = z.object({
  id: z.string().trim().min(1),
  author: z.string().trim().min(1),
  content: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  mentions: z.array(z.string().trim().min(1)).default([]),
  parentId: z.string().trim().min(1).optional(),
  resolved: z.boolean().default(false),
  resolvedAt: z.string().datetime().optional(),
  resolvedBy: z.string().trim().min(1).optional(),
  fieldKey: z.string().trim().min(1).optional(),
  anchorLabel: z.string().trim().min(1).optional(),
});

const collaborationSchema = z.object({
  members: z.array(z.string().trim().min(1)).default(["Planner", "Designer", "Research Lead"]),
  messages: z.array(teamMessageSchema).default([]),
  presence: z.array(
    z.object({
      member: z.string().trim().min(1),
      fieldKey: z.string().trim().min(1).optional(),
      isTyping: z.boolean().default(false),
      lastSeenAt: z.string().datetime(),
    }),
  ).default([]),
});

const workflowSchema = z.object({
  stage: z.enum(["draft", "review", "approved", "ready_to_launch"]).default("draft"),
  stageUpdatedAt: z.string().datetime(),
  wipLimit: z.number().int().min(1).max(12).default(3),
});

const evidenceItemSchema = z.object({
  id: z.string().trim().min(1),
  section: z.enum([
    "research",
    "communication_brief",
    "creative_brief",
    "ideation",
    "concept_development",
    "concept_board",
  ]),
  claim: z.string().trim().min(1),
  source: z.string().trim().min(1),
  sourceQuality: z.enum(["low", "medium", "high"]).default("medium"),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
  owner: z.string().trim().optional(),
  url: z.string().trim().optional(),
  createdAt: z.string().datetime(),
});

const issueSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().default(""),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  status: z.enum(["open", "in_progress", "resolved"]).default("open"),
  owner: z.string().trim().min(1),
  slaHours: z.number().int().min(1).max(720).default(48),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  postmortem: z.string().optional(),
});

const reminderSchema = z.object({
  id: z.string().trim().min(1),
  type: z.enum(["inactive_concept", "unresolved_mention", "approval_pending", "overdue_issue"]),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  message: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  dueAt: z.string().datetime().optional(),
});

const portfolioSchema = z.object({
  scenarioPreset: z.enum(["balanced", "growth", "efficiency", "risk_control"]).default("balanced"),
  budgetCutPercent: z.number().min(0).max(90).default(20),
  weights: z.object({
    impact: z.number().min(0).max(1).default(0.3),
    feasibility: z.number().min(0).max(1).default(0.2),
    strategicFit: z.number().min(0).max(1).default(0.25),
    culturalFit: z.number().min(0).max(1).default(0.15),
    risk: z.number().min(0).max(1).default(0.1),
  }),
});

const snapshotSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  createdBy: z.string().trim().min(1),
  summary: z.string().default(""),
  state: z.record(z.string(), z.unknown()).default({}),
});

const approvalSchema = z.object({
  id: z.string().trim().min(1),
  role: z.enum(["strategy_lead", "creative_lead", "client_partner", "compliance"]),
  approver: z.string().trim().min(1),
  signature: z.string().trim().min(1),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  note: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  approvedAt: z.string().datetime().optional(),
});

const auditEventSchema = z.object({
  id: z.string().trim().min(1),
  action: z.string().trim().min(1),
  actor: z.string().trim().min(1),
  detail: z.string().default(""),
  createdAt: z.string().datetime(),
});

function createDefaultCreativeBrief() {
  return {
    ...DEFAULT_CREATIVE_BRIEF,
    deliverables: DEFAULT_CREATIVE_BRIEF.deliverables.map((entry) => ({ ...entry })),
  };
}

export const campaignDataSchema = z.object({
  campaign: campaignSchema,
  audiences: z.array(audienceSchema).default([]),
  behavior: behaviorSchema,
  insight: insightSchema,
  driver: driverSchema,
  situation: z.string(),
  problem: z.string(),
  priorLearnings: z.string(),
  businessObjective: z.string(),
  communicationObjective: z.string(),
  creativeBrief: creativeBriefSchema.default(createDefaultCreativeBrief()),
  channelRoles: z.array(channelRoleSchema).default([]),
  mediaPlanRows: z.array(mediaPlanRowSchema).default([]),
  contentThemesAndCalendar: z.string().default(""),
  deliverablesNeeded: z.string().default(""),
  measurementAndLearningPlan: z.string().default(""),
  governanceRisksAndApprovals: z.string().default(""),
  timelineDetails: z.string().default(""),
  appendices: z.string().default(""),
  qaChecklist: z.array(qaChecklistItemSchema).default(DEFAULT_QA_CHECKLIST.map((item) => ({ ...item }))),
  ideas: z.array(ideaSchema).default([]),
  concepts: z.array(conceptSchema).default([]),
  collaboration: collaborationSchema.default({}),
  workflow: workflowSchema.optional(),
  evidenceItems: z.array(evidenceItemSchema).default([]),
  issues: z.array(issueSchema).default([]),
  reminders: z.array(reminderSchema).default([]),
  portfolio: portfolioSchema.optional(),
  snapshots: z.array(snapshotSchema).default([]),
  approvals: z.array(approvalSchema).default([]),
  auditTrail: z.array(auditEventSchema).default([]),
});

export const campaignRecordSchema = z.object({
  id: z.string().trim().min(1),
  revision: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  data: campaignDataSchema,
});

export const campaignStoreV2Schema = z.object({
  version: z.literal(2),
  migratedAt: z.string().datetime(),
  campaigns: z.array(campaignRecordSchema).default([]),
});

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}

function sanitizeDate(raw: string, fallback: string): string {
  return DATE_PATTERN.test(raw) ? raw : fallback;
}

function normalizeCampaignData(data: CampaignData): CampaignData {
  const today = new Date().toISOString().slice(0, 10);
  const languages = uniqueBy(
    data.campaign.languages.map((language) => language.trim()).filter(Boolean),
    (language) => language.toLowerCase(),
  );

  const startDate = sanitizeDate(data.campaign.startDate, today);
  let endDate = sanitizeDate(data.campaign.endDate, startDate);

  if (endDate < startDate) {
    endDate = startDate;
  }

  const ideas = uniqueBy(data.ideas, (idea) => idea.id);
  const ideaIds = new Set(ideas.map((idea) => idea.id));
  const audiences = uniqueBy(data.audiences, (audience) => audience.id);
  const concepts = uniqueBy(data.concepts, (concept) => concept.id).map((concept) => ({
    ...concept,
    selectedIdeaIds: uniqueBy(
      concept.selectedIdeaIds.filter((ideaId) => ideaIds.has(ideaId)),
      (ideaId) => ideaId,
    ),
  }));
  const members = uniqueBy(
    data.collaboration.members.map((member) => member.trim()).filter(Boolean),
    (member) => member.toLowerCase(),
  );
  const messages = uniqueBy(data.collaboration.messages, (message) => message.id).map((message) => ({
    ...message,
    mentions: uniqueBy(
      message.mentions.map((mention) => mention.trim()).filter(Boolean),
      (mention) => mention.toLowerCase(),
    ),
  }));
  const driverTypes = uniqueBy(data.driver.driverTypes, (motive) => motive);
  const channelRoles = uniqueBy(data.channelRoles, (entry) => entry.id);
  const mediaPlanRows = uniqueBy(data.mediaPlanRows, (entry) => entry.id);
  const creativeBriefDeliverables = uniqueBy(data.creativeBrief.deliverables, (entry) => entry.id);
  const qaById = new Map(uniqueBy(data.qaChecklist, (entry) => entry.id).map((entry) => [entry.id, entry]));
  const qaChecklist = DEFAULT_QA_CHECKLIST.map((item) => {
    const existing = qaById.get(item.id);
    return existing ? { ...item, checked: existing.checked } : { ...item };
  });
  const messageIds = new Set(messages.map((message) => message.id));
  const normalizedMessages = messages.map((message) => {
    const hasValidParent = message.parentId ? messageIds.has(message.parentId) : false;
    const parentId = hasValidParent ? message.parentId : undefined;
    const resolved = Boolean(message.resolved);
    const resolvedAt = resolved ? message.resolvedAt : undefined;
    const resolvedBy = resolved ? message.resolvedBy : undefined;

    return {
      ...message,
      parentId,
      resolved,
      resolvedAt,
      resolvedBy,
    };
  });
  const presence = uniqueBy(
    (data.collaboration.presence || [])
      .filter((entry) => entry && entry.member && entry.lastSeenAt)
      .map((entry) => ({
        member: entry.member.trim(),
        fieldKey: entry.fieldKey?.trim() || undefined,
        isTyping: Boolean(entry.isTyping),
        lastSeenAt: entry.lastSeenAt,
      })),
    (entry) => entry.member.toLowerCase(),
  );
  const evidenceItems = uniqueBy(data.evidenceItems || [], (entry) => entry.id);
  const issues = uniqueBy(data.issues || [], (entry) => entry.id).map((entry) => ({
    ...entry,
    postmortem: entry.postmortem || undefined,
    resolvedAt: entry.status === "resolved" ? entry.resolvedAt : undefined,
  }));
  const reminders = uniqueBy(data.reminders || [], (entry) => entry.id);
  const snapshots = uniqueBy(data.snapshots || [], (entry) => entry.id);
  const approvals = uniqueBy(data.approvals || [], (entry) => entry.id);
  const auditTrail = uniqueBy(data.auditTrail || [], (entry) => entry.id);
  const workflow = data.workflow || {
    stage: "draft",
    stageUpdatedAt: new Date().toISOString(),
    wipLimit: 3,
  };
  const portfolio = data.portfolio || {
    scenarioPreset: "balanced",
    budgetCutPercent: 20,
    weights: {
      impact: 0.3,
      feasibility: 0.2,
      strategicFit: 0.25,
      culturalFit: 0.15,
      risk: 0.1,
    },
  };

  return {
    ...data,
    campaign: {
      ...data.campaign,
      languages,
      startDate,
      endDate,
    },
    audiences,
    ideas,
    concepts,
    driver: {
      ...data.driver,
      driverTypes,
    },
    creativeBrief: {
      ...data.creativeBrief,
      deliverables: creativeBriefDeliverables,
    },
    channelRoles,
    mediaPlanRows,
    qaChecklist,
    collaboration: {
      members,
      messages: normalizedMessages,
      presence,
    },
    workflow,
    evidenceItems,
    issues,
    reminders,
    portfolio,
    snapshots,
    approvals,
    auditTrail,
  };
}

export function parseCampaignData(input: unknown): CampaignData {
  const parsed = campaignDataSchema.safeParse(input);
  if (!parsed.success) {
    throw new CampaignError("VALIDATION_FAILED", "Campaign payload failed validation", parsed.error.flatten());
  }

  return normalizeCampaignData(parsed.data as CampaignData);
}

export function parseCampaignRecord(input: unknown): CampaignRecord {
  const parsed = campaignRecordSchema.safeParse(input);
  if (!parsed.success) {
    throw new CampaignError("VALIDATION_FAILED", "Campaign record failed validation", parsed.error.flatten());
  }

  if (parsed.data.id !== parsed.data.data.campaign.id) {
    throw new CampaignError("VALIDATION_FAILED", "Campaign record ID mismatch", {
      recordId: parsed.data.id,
      campaignId: parsed.data.data.campaign.id,
    });
  }

  return {
    ...parsed.data,
    data: normalizeCampaignData(parsed.data.data as CampaignData),
  } as CampaignRecord;
}

export function parseCampaignStoreV2(input: unknown): CampaignStoreV2 {
  const parsed = campaignStoreV2Schema.safeParse(input);
  if (!parsed.success) {
    throw new CampaignError("VALIDATION_FAILED", "Campaign store failed validation", parsed.error.flatten());
  }

  const campaigns = parsed.data.campaigns
    .map((record) => parseCampaignRecord(record))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return {
    ...parsed.data,
    campaigns,
  } as CampaignStoreV2;
}
