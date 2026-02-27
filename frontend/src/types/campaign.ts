export interface Campaign {
  id: string;
  name: string;
  country: string;
  languages: string[];
  startDate: string;
  endDate: string;
  status: 'draft' | 'in_review' | 'final';
}

export interface AudienceSegment {
  id: string;
  priority: 'primary' | 'secondary';
  segmentName: string;
  description: string;
  barriers: string;
  motivators: string;
  desiredAction: string;
  keyMessage?: string;
  supportRtb?: string;
  cta?: string;
}

export interface Behavior {
  behaviorStatement: string;
  currentBehavior: string;
  desiredBehavior: string;
  context: string;
}

export interface Insight {
  insightText: string;
  evidenceSource: string;
  confidenceLevel: 'low' | 'medium' | 'high';
}

export const DRIVER_MOTIVES = [
  "hoard",
  "create",
  "fear",
  "disgust",
  "hunger",
  "comfort",
  "lust",
  "attract",
  "love",
  "nurture",
  "curiosity",
  "play",
  "affiliate",
  "status",
  "justice",
] as const;

export type DriverMotive = (typeof DRIVER_MOTIVES)[number];

export interface Driver {
  driverTypes: DriverMotive[];
  driverText: string;
  whyNow: string;
  tension: string;
}

export interface Idea {
  id: string;
  method: 'Revolution' | 'RelatedWorlds' | 'Re-expression' | 'RandomLinks';
  title: string;
  description: string;
  linkToInsight: string;
  linkToDriver: string;
  feasibilityScore: number;
  originalityScore: number;
  strategicFitScore: number;
  culturalFitScore: number;
  selected?: boolean;
}

export interface Concept {
  id: string;
  name: string;
  bigIdea: string;
  smp: string;
  keyPromise: string;
  supportPoints: string[];
  tone: string;
  selectedIdeaIds: string[];
  channels: string[];
  risks: string[];
  tagline?: string;
  keyVisualDescription?: string;
  executionRationale?: string;
  behaviorTrigger?: string;
  boardData?: ConceptBoardData;
  status: 'draft' | 'shortlisted' | 'final';
}

export interface ConceptBoardBarrierRow {
  id: string;
  barrier: string;
  strategy: string;
  channel: string;
}

export interface ConceptBoardData {
  keyVisualDirections: string[];
  socialPosts: string[];
  radioScript: string;
  headlines: string[];
  whatsappSequence: string[];
  messageBarrierMap: ConceptBoardBarrierRow[];
  pretestQuestions: string[];
  updatedAt: string;
}

export interface CreativeBriefDeliverable {
  id: string;
  asset: string;
  platform: string;
  format: string;
  dimensionsDuration: string;
  copyLimits: string;
  languages: string;
  accessibility: string;
}

export interface CreativeBriefData {
  activityName: string;
  agencyName: string;
  owner: string;
  audience: string;
  purpose: string;
  projectName: string;
  projectOverview: string;
  background: string;
  singleMindedObjective: string;
  audienceWho: string;
  audienceTension: string;
  audienceDesiredChange: string;
  keyProposition: string;
  reasonsToBelieve: string;
  toneAndPersonality: string;
  culturalCuesEmbrace: string;
  culturalCuesAvoid: string;
  logoUsage: string;
  colorsTypography: string;
  legal: string;
  doExamples: string;
  dontExamples: string;
  deliverables: CreativeBriefDeliverable[];
}

export const DEFAULT_CREATIVE_BRIEF: CreativeBriefData = {
  activityName: "Get to Know Us",
  agencyName: "CLEARKAMO",
  owner: "Brand/Creative",
  audience: "Designers, writers, producers, editors",
  purpose: "What We're Making & Why It'll Work",
  projectName: "Get to Know Us Campaign",
  projectOverview: "Introduce the CLEARKAMO brand identity while preserving trust and continuity.",
  background:
    "Project CLEAR is transitioning to CLEARKAMO, signaling a broader strategic role while retaining the same trusted team.",
  singleMindedObjective: "Make audiences clearly understand who CLEARKAMO is and trust us as a strategic partner.",
  audienceWho:
    "Government ministries, development partners, NGOs, and private-sector social impact organizations.",
  audienceTension:
    "Audiences know Project CLEAR but are unsure what the transition to CLEARKAMO means in practice.",
  audienceDesiredChange:
    "Audiences see CLEARKAMO as the same trusted team, now stronger and more strategic.",
  keyProposition: "Powered by Real Human Understanding.",
  reasonsToBelieve: [
    "8+ years of strategic and behavior-change experience.",
    "Trusted by ministries and global development partners.",
    "Proven in co-design, community engagement, and measurable impact.",
  ].join("\n"),
  toneAndPersonality: "Human, confident, modern, Afrocentric, practical.",
  culturalCuesEmbrace: [
    "Swahili + English mix",
    "Warm visuals of communities",
    "African textures, patterns, and colours",
    "Real people, real voices, real stories",
  ].join("\n"),
  culturalCuesAvoid: [
    "Overly corporate tone",
    "Technical jargon without context",
    "Stock imagery unrelated to African settings",
  ].join("\n"),
  logoUsage: [
    "Use CLEARKAMO horizontal or stacked logo.",
    "Clear space equals the height of letter C.",
    "Never distort, recolour, rotate, or place on busy backgrounds.",
  ].join("\n"),
  colorsTypography: [
    "Colours: #a3a3a3 (Neutral Grey), #03a4fc (Clear Blue), #ffffff (Pure White).",
    "Typography: Montserrat (headlines), Inter/Open Sans (supporting copy).",
  ].join("\n"),
  legal: [
    "All testimonials must have consent.",
    "All footage requires signed release forms.",
    "Music must be licensed.",
  ].join("\n"),
  doExamples: [
    "Use human-centered footage.",
    "Keep visuals clean and minimal.",
    "Represent real Tanzanian environments.",
    "Use brand colours consistently.",
  ].join("\n"),
  dontExamples: [
    "Use stock photos unrelated to context.",
    "Add unnecessary effects or clutter.",
    "Misrepresent partner logos or hierarchy.",
  ].join("\n"),
  deliverables: [
    {
      id: "cb-deliverable-1",
      asset: "Reveal Video (Brand Reveal)",
      platform: "Social + Web",
      format: "MP4 (H.264)",
      dimensionsDuration: "1080x1080 + 1920x1080",
      copyLimits: "<=40 words",
      languages: "Sw/Eng",
      accessibility: "Subtitles",
    },
    {
      id: "cb-deliverable-2",
      asset: "Client/Partner Testimonial Videos",
      platform: "Social",
      format: "MP4",
      dimensionsDuration: "1080x1080 / 1920x1080",
      copyLimits: "<=35 words",
      languages: "Sw/Eng",
      accessibility: "Subtitles",
    },
    {
      id: "cb-deliverable-3",
      asset: "Thought Leadership Podcast",
      platform: "YouTube, Spotify, Apple Podcasts",
      format: "MP3, MP4",
      dimensionsDuration: "15-30 minutes",
      copyLimits: "<=20 words/headline",
      languages: "Sw/Eng",
      accessibility: "Captions + subtitles",
    },
    {
      id: "cb-deliverable-4",
      asset: "Social Graphics",
      platform: "Instagram/FB/LinkedIn",
      format: "PNG/JPG",
      dimensionsDuration: "1080x1350",
      copyLimits: "<=12 words",
      languages: "Sw/Eng",
      accessibility: "Alt text",
    },
  ],
};

export interface TeamMessage {
  id: string;
  author: string;
  content: string;
  createdAt: string;
  mentions: string[];
  parentId?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  fieldKey?: string;
  anchorLabel?: string;
}

export interface CollaborationPresence {
  member: string;
  fieldKey?: string;
  isTyping: boolean;
  lastSeenAt: string;
}

export interface CollaborationData {
  members: string[];
  messages: TeamMessage[];
  presence?: CollaborationPresence[];
}

export interface ChannelRoleEntry {
  id: string;
  category: 'paid' | 'owned' | 'earned';
  channel: string;
  role: string;
}

export interface MediaPlanRow {
  id: string;
  channel: string;
  targeting: string;
  flighting: string;
  budget: string;
  kpi: string;
  benchmark: string;
}

export interface QaChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export const DEFAULT_QA_CHECKLIST: QaChecklistItem[] = [
  { id: "qa-objectives-smart", label: "Objectives are SMART and measurable", checked: false },
  { id: "qa-audience-priority", label: "Audience is clearly prioritized", checked: false },
  { id: "qa-message-map", label: "Message map fits each audience + explicit CTA", checked: false },
  { id: "qa-channels-role", label: "Each channel has a role in the funnel", checked: false },
  { id: "qa-budget-kpi", label: "Budget ties to KPIs; benchmarks defined", checked: false },
  { id: "qa-measurement-attr", label: "Measurement plan + attribution is instrumented", checked: false },
  { id: "qa-risks-approvals", label: "Risks/approvals are documented", checked: false },
];

export type WorkflowStage = "draft" | "review" | "approved" | "ready_to_launch";

export interface CampaignWorkflow {
  stage: WorkflowStage;
  stageUpdatedAt: string;
  wipLimit: number;
}

export interface EvidenceItem {
  id: string;
  section:
    | "research"
    | "communication_brief"
    | "creative_brief"
    | "ideation"
    | "concept_development"
    | "concept_board";
  claim: string;
  source: string;
  sourceQuality: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  owner?: string;
  url?: string;
  createdAt: string;
}

export interface CampaignIssue {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "resolved";
  owner: string;
  slaHours: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  postmortem?: string;
}

export interface CampaignReminder {
  id: string;
  type: "inactive_concept" | "unresolved_mention" | "approval_pending" | "overdue_issue" | "segment_due_action";
  severity: "info" | "warning" | "critical";
  message: string;
  createdAt: string;
  dueAt?: string;
}

export interface PortfolioWeights {
  impact: number;
  feasibility: number;
  strategicFit: number;
  culturalFit: number;
  risk: number;
}

export interface PortfolioConfig {
  scenarioPreset: "balanced" | "growth" | "efficiency" | "risk_control";
  budgetCutPercent: number;
  weights: PortfolioWeights;
}

export interface TemplateSystemTemplate {
  id: string;
  name: string;
  industry: string;
  objectiveType: string;
  defaultSections: string[];
  localizationHints: string[];
}

export interface TemplateLocalizationConfig {
  language: string;
  tone: string;
  culturalMustInclude: string[];
  culturalMustAvoid: string[];
}

export interface CampaignTemplateSystem {
  selectedTemplateId: string;
  availableTemplates: TemplateSystemTemplate[];
  localization: TemplateLocalizationConfig;
}

export interface DigitalOpsChannelSla {
  channel: string;
  firstResponseHours: number;
  followUpHours: number;
}

export interface DigitalOpsChannelMetric {
  id: string;
  channel: string;
  metric: string;
  value: string;
  period: string;
}

export interface CampaignDigitalOps {
  attributionModel: "last_touch" | "first_touch" | "weighted_multi_touch" | "media_mix";
  channelSlaHours: DigitalOpsChannelSla[];
  channelMetrics: DigitalOpsChannelMetric[];
}

export interface CrmLifecycleSegment {
  id: string;
  name: string;
  lifecycleStage: "acquire" | "onboard" | "retain" | "reactivate";
  size: number;
  priority: "high" | "medium" | "low";
  nextAction: string;
  dueAt: string;
  owner: string;
}

export interface CrmAutomationRule {
  id: string;
  trigger: string;
  action: string;
  slaHours: number;
  active: boolean;
}

export interface CampaignCrmLifecycle {
  memberRetentionTarget: number;
  segments: CrmLifecycleSegment[];
  automationRules: CrmAutomationRule[];
}

export interface ExperimentHypothesis {
  id: string;
  name: string;
  hypothesis: string;
  metric: string;
  baseline: number;
  target: number;
  status: "planned" | "running" | "completed" | "stopped";
  winnerConceptId?: string;
  startDate: string;
  endDate?: string;
}

export interface CampaignExperimentLab {
  experiments: ExperimentHypothesis[];
  promoteWinnerConceptId: string;
}

export interface CampaignGovernancePolicy {
  requiredApprovalRoles: CampaignApproval["role"][];
  minApprovedCount: number;
  requirePreflightPassForReady: boolean;
  requireNoCriticalIncidentsForReady: boolean;
}

export interface CampaignSnapshot {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  summary: string;
  state: Record<string, unknown>;
}

export interface CampaignApproval {
  id: string;
  role: "strategy_lead" | "creative_lead" | "client_partner" | "compliance";
  approver: string;
  signature: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
}

export interface CampaignAuditEvent {
  id: string;
  action: string;
  actor: string;
  detail: string;
  createdAt: string;
}

export interface CampaignData {
  campaign: Campaign;
  audiences: AudienceSegment[];
  behavior: Behavior;
  insight: Insight;
  driver: Driver;
  situation: string;
  problem: string;
  priorLearnings: string;
  businessObjective: string;
  communicationObjective: string;
  creativeBrief: CreativeBriefData;
  channelRoles: ChannelRoleEntry[];
  mediaPlanRows: MediaPlanRow[];
  contentThemesAndCalendar: string;
  deliverablesNeeded: string;
  measurementAndLearningPlan: string;
  governanceRisksAndApprovals: string;
  timelineDetails: string;
  appendices: string;
  qaChecklist: QaChecklistItem[];
  ideas: Idea[];
  concepts: Concept[];
  collaboration: CollaborationData;
  workflow?: CampaignWorkflow;
  evidenceItems?: EvidenceItem[];
  issues?: CampaignIssue[];
  reminders?: CampaignReminder[];
  portfolio?: PortfolioConfig;
  templateSystem?: CampaignTemplateSystem;
  digitalOps?: CampaignDigitalOps;
  crmLifecycle?: CampaignCrmLifecycle;
  experimentLab?: CampaignExperimentLab;
  governancePolicy?: CampaignGovernancePolicy;
  snapshots?: CampaignSnapshot[];
  approvals?: CampaignApproval[];
  auditTrail?: CampaignAuditEvent[];
}

export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WIZARD_STEPS = [
  { label: 'Setup', description: 'Campaign basics' },
  { label: 'Research', description: 'Inputs & insights' },
  { label: 'Comm Brief', description: 'Strategic foundation' },
  { label: 'Creative Brief', description: 'Creative direction' },
  { label: '4Rs Ideation', description: 'Divergent ideas' },
  { label: 'Concepts', description: 'Convergent selection' },
  { label: 'Board', description: 'Prototype & export' },
] as const;
