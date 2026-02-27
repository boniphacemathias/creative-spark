import { CampaignData, DEFAULT_CREATIVE_BRIEF, Idea } from '@/types/campaign';

const sampleIdeas: Idea[] = [
  {
    id: 'rev-1', method: 'Revolution', title: 'The Anti-Clinic',
    description: 'Instead of asking mothers to come to clinics, bring vaccines to places they already gather — markets, hair salons, churches. Remove the "clinical" barrier entirely.',
    linkToInsight: 'Fear of clinical settings', linkToDriver: 'Social comfort in familiar spaces',
    feasibilityScore: 4, originalityScore: 5, strategicFitScore: 5, culturalFitScore: 4
  },
  {
    id: 'rev-2', method: 'Revolution', title: 'Grandmother Champions',
    description: 'Instead of fighting elder skepticism, recruit grandmothers as vaccination advocates. Those who were vaccinated themselves become proof points.',
    linkToInsight: 'Trusted community voices', linkToDriver: 'Respect for elders',
    feasibilityScore: 3, originalityScore: 4, strategicFitScore: 5, culturalFitScore: 5
  },
  {
    id: 'rev-3', method: 'Revolution', title: 'Vaccination Celebration',
    description: 'Reframe vaccination from a medical obligation to a celebration milestone — like naming ceremonies. Each dose is a community event.',
    linkToInsight: 'Negative framing of vaccines', linkToDriver: 'Cultural love of ceremonies',
    feasibilityScore: 3, originalityScore: 5, strategicFitScore: 4, culturalFitScore: 5
  },
  {
    id: 'rw-1', method: 'RelatedWorlds', title: 'The Loyalty Card',
    description: 'From retail: a "stamp card" for each vaccination dose completed. Full card = reward (baby supplies bundle). Gamifies the schedule.',
    linkToInsight: 'Incomplete schedules', linkToDriver: 'Practical incentive',
    feasibilityScore: 5, originalityScore: 3, strategicFitScore: 4, culturalFitScore: 3
  },
  {
    id: 'rw-2', method: 'RelatedWorlds', title: 'The Weather Forecast Model',
    description: 'From weather apps: weekly "disease risk forecast" shared via WhatsApp. High risk = urgent call to vaccinate. Makes the invisible visible.',
    linkToInsight: 'Invisible threat perception', linkToDriver: 'Immediate risk awareness',
    feasibilityScore: 4, originalityScore: 5, strategicFitScore: 4, culturalFitScore: 3
  },
  {
    id: 'rw-3', method: 'RelatedWorlds', title: 'The Apprenticeship Approach',
    description: 'From trade learning: pair new mothers with experienced "vaccination mentor" mothers who guide them through the schedule, not health workers.',
    linkToInsight: 'Distrust of formal health system', linkToDriver: 'Peer-to-peer trust',
    feasibilityScore: 4, originalityScore: 4, strategicFitScore: 5, culturalFitScore: 5
  },
  {
    id: 're-1', method: 'Re-expression', title: 'Shield, Not Shot',
    description: 'Reframe from "injection/shot" to "shield" — every dose is a layer of armor protecting the child. Visual metaphor of a warrior shield.',
    linkToInsight: 'Fear of needles/pain', linkToDriver: 'Maternal protection instinct',
    feasibilityScore: 5, originalityScore: 4, strategicFitScore: 5, culturalFitScore: 4
  },
  {
    id: 're-2', method: 'Re-expression', title: 'The Growth Map',
    description: 'Reframe vaccination schedule as a "growth journey map" — each dose is a milestone on the child\'s journey to strength, not a medical procedure.',
    linkToInsight: 'Schedule seems arbitrary', linkToDriver: 'Desire for child\'s growth',
    feasibilityScore: 5, originalityScore: 3, strategicFitScore: 4, culturalFitScore: 4
  },
  {
    id: 'rl-1', method: 'RandomLinks', title: 'The Seed Planting Campaign',
    description: 'Random stimulus: "garden". Like planting seeds at the right time for harvest, vaccines must be given at the right time. Community seed-planting events paired with vaccination days.',
    linkToInsight: 'Timing misunderstanding', linkToDriver: 'Agricultural familiarity',
    feasibilityScore: 4, originalityScore: 5, strategicFitScore: 4, culturalFitScore: 5
  },
  {
    id: 'rl-2', method: 'RandomLinks', title: 'The Recipe for Health',
    description: 'Random stimulus: "cooking". Each vaccine is an "ingredient" in the recipe for a healthy child. Incomplete recipe = incomplete protection. Cook-along radio segments.',
    linkToInsight: 'Incomplete understanding', linkToDriver: 'Cooking as universal activity',
    feasibilityScore: 4, originalityScore: 4, strategicFitScore: 4, culturalFitScore: 5
  },
];

export const sampleCampaignData: CampaignData = {
  campaign: {
    id: 'demo',
    name: 'Immunize Naija',
    country: 'Nigeria',
    languages: ['English', 'Hausa', 'Yoruba'],
    startDate: '2026-04-01',
    endDate: '2026-12-31',
    status: 'draft',
  },
  audiences: [
    {
      id: 'aud-1', priority: 'primary', segmentName: 'Young Mothers (18–35)',
      description: 'First- and second-time mothers in rural and peri-urban northern Nigeria who are primary caregivers.',
      barriers: 'Fear of side effects from community stories; distance to clinics; husband/mother-in-law gatekeeping; misinformation on social media.',
      motivators: 'Desire for healthy children; peer approval; trusted health worker relationships; tangible incentives.',
      desiredAction: 'Complete the full immunization schedule for children under 5.',
      keyMessage: 'Vaccination is an act of love and long-term protection for your child.',
      supportRtb: 'WHO safety guidance, local nurse validation, and testimonies from vaccinated families.',
      cta: 'Visit your nearest clinic this week and complete the next scheduled dose.',
    },
    {
      id: 'aud-2', priority: 'secondary', segmentName: 'Community Elders & Grandmothers',
      description: 'Influential family and community decision-makers who shape health-seeking behavior.',
      barriers: 'Skepticism of modern medicine; traditional remedies preference; misinformation.',
      motivators: 'Legacy of healthy grandchildren; community respect; religious endorsement.',
      desiredAction: 'Actively support and encourage daughters/daughters-in-law to vaccinate children.',
      keyMessage: 'Your support helps families protect children and strengthen the whole community.',
      supportRtb: 'Trusted local evidence from community health workers and faith leaders.',
      cta: 'Encourage one caregiver this week to complete their child vaccination schedule.',
    },
  ],
  behavior: {
    behaviorStatement: 'Mothers of children under 5 in northern Nigeria avoid or delay taking children for scheduled vaccinations.',
    currentBehavior: 'Mothers start but do not complete the vaccination schedule; drop-off after first dose is 40%.',
    desiredBehavior: 'Mothers complete the full immunization schedule on time for all children under 5.',
    context: 'Low-resource settings with limited clinic access; strong community and family influence on health decisions.',
  },
  insight: {
    insightText: 'Mothers want to protect their children but fear that vaccines cause illness because they\'ve heard frightening stories from trusted community members — creating a painful tension between love and perceived risk.',
    evidenceSource: 'Qualitative research: 120 in-depth interviews across 3 LGAs (2025); NDHS data; community listening sessions.',
    confidenceLevel: 'high',
  },
  driver: {
    driverTypes: ['affiliate', 'nurture'],
    driverText: 'Social pressure from mothers-in-law and community elders who are skeptical of modern medicine creates a powerful barrier — mothers fear social punishment more than disease.',
    whyNow: 'Rising measles outbreaks in 2025 have created urgency; new state government commitment to immunization; global polio eradication push.',
    tension: 'Mothers are caught between wanting to be seen as "good modern mothers" and respecting elder authority.',
  },
  situation: 'Nigeria has one of the highest rates of under-5 mortality globally, with vaccine-preventable diseases accounting for 30% of deaths. Routine immunization coverage in northern states remains below 40%, despite free vaccine availability.',
  problem: 'Despite free vaccines and expanded clinic hours, immunization completion rates in target LGAs have stalled at 35% — well below the 80% herd immunity threshold. The gap is driven by demand-side barriers, not supply.',
  priorLearnings: 'Previous mass campaigns increased awareness but not completion. Radio jingles had high recall but low behavior change. Community health worker home visits showed promise but were not sustained. Financial incentives worked short-term but created dependency.',
  businessObjective: 'Increase immunization completion rate from 35% to 60% among children under 5 in 6 target LGAs within 9 months (April–December 2026), measured by DHIS2 administrative data.',
  communicationObjective: 'Think: Mothers believe vaccination is a gift of protection, not a risk. Feel: Empowered to champion their child\'s health despite social pressure. Do: Complete all scheduled doses and encourage one other mother to do the same.',
  creativeBrief: {
    ...DEFAULT_CREATIVE_BRIEF,
    projectName: 'Immunize Naija',
    activityName: 'Immunize Naija',
    deliverables: DEFAULT_CREATIVE_BRIEF.deliverables.map((entry) => ({ ...entry })),
  },
  channelRoles: [
    {
      id: 'ch-1',
      category: 'paid',
      channel: 'Sponsored LinkedIn campaigns',
      role: 'Reach and create word of mouth at scale.',
    },
    {
      id: 'ch-2',
      category: 'owned',
      channel: 'Website storytelling hub',
      role: 'Engage, nurture, and convert audiences.',
    },
    {
      id: 'ch-3',
      category: 'earned',
      channel: 'Stakeholder testimonials',
      role: 'Validate, build trust, and increase credibility.',
    },
  ],
  mediaPlanRows: [
    {
      id: "media-1",
      channel: "Community radio",
      targeting: "Caregivers in 6 LGAs",
      flighting: "Apr-Dec 2026",
      budget: "$18,000",
      kpi: "Reach",
      benchmark: "1.2M listeners",
    },
    {
      id: "media-2",
      channel: "WhatsApp broadcasts",
      targeting: "Mothers and elder influencers",
      flighting: "Bi-weekly",
      budget: "$4,500",
      kpi: "CTR",
      benchmark: "8%",
    },
  ],
  contentThemesAndCalendar: [
    "Themes: Who We Are; How We Work; Proof of Impact; Partners' Voices; What Makes Us Different.",
    "Cadence: 3 posts per week; 1 testimonial video per week; 1 documentary clip per month; 2 WhatsApp broadcasts per month.",
  ].join("\n"),
  deliverablesNeeded: [
    "Campaign master slogan + supporting captions",
    "Short and long documentary edits",
    "Interview testimonial videos",
    "Visual identity pack",
  ].join("\n"),
  measurementAndLearningPlan: [
    "Primary KPIs: Reach, engagement, inquiries, meetings booked.",
    "Secondary KPIs: Completion rate, sentiment, traffic.",
    "Attribution: UTM scheme and CRM lead-source tagging.",
  ].join("\n"),
  governanceRisksAndApprovals: [
    "Approvers: Head of Strategic Development, Communications Lead, Managing Director.",
    "Risks: Misinterpretation, quote pre-approval, overpromising.",
    "Compliance: Evidence-based claims and approved assets only.",
  ].join("\n"),
  timelineDetails: "Start: 2026-04-01 -> End: 2026-12-31. Major checkpoints every 4 weeks.",
  appendices: "UTM template, audience definitions, budget roll-up.",
  qaChecklist: [
    { id: "qa-objectives-smart", label: "Objectives are SMART and measurable", checked: true },
    { id: "qa-audience-priority", label: "Audience is clearly prioritized", checked: true },
    { id: "qa-message-map", label: "Message map fits each audience + explicit CTA", checked: true },
    { id: "qa-channels-role", label: "Each channel has a role in the funnel", checked: true },
    { id: "qa-budget-kpi", label: "Budget ties to KPIs; benchmarks defined", checked: true },
    { id: "qa-measurement-attr", label: "Measurement plan + attribution is instrumented", checked: true },
    { id: "qa-risks-approvals", label: "Risks/approvals are documented", checked: true },
  ],
  ideas: sampleIdeas,
  concepts: [
    {
      id: 'concept-1', name: 'Shield of Love', bigIdea: 'Every vaccination is a mother\'s act of love — a shield she gives her child against the invisible.',
      smp: 'Love shields. Vaccinate.',
      keyPromise: 'Completing your child\'s vaccinations is the most powerful act of maternal love and protection.',
      supportPoints: ['WHO-endorsed safety data', 'Testimonials from vaccinated families', 'Religious leader endorsements', 'Community celebration events'],
      tone: 'Warm, empowering, culturally respectful, never preachy',
      selectedIdeaIds: ['rev-3', 're-1', 'rl-1'],
      channels: ['Community radio', 'WhatsApp groups', 'Market activations', 'Religious gatherings'],
      risks: ['Shield metaphor may feel militaristic — test visuals carefully', 'Religious framing must be inclusive across faiths'],
      status: 'shortlisted',
    },
  ],
  collaboration: {
    members: ["Planner", "Designer", "Research Lead", "Field Ops"],
    messages: [
      {
        id: "msg-1",
        author: "Research Lead",
        content: "Community interviews suggest elder approval is still the biggest blocker. @Planner can we tighten this in the brief?",
        createdAt: "2026-02-12T10:30:00.000Z",
        mentions: ["Planner"],
        resolved: false,
      },
      {
        id: "msg-2",
        author: "Designer",
        content: "Noted. I can test softer visuals for the shield metaphor this week. @Field Ops please share market-day references.",
        createdAt: "2026-02-12T11:00:00.000Z",
        mentions: ["Field Ops"],
        parentId: "msg-1",
        resolved: false,
      },
      {
        id: "msg-3",
        author: "Planner",
        content: "Updated the creative brief with elder-approval messaging. Marking this resolved.",
        createdAt: "2026-02-13T09:00:00.000Z",
        mentions: [],
        resolved: true,
        resolvedAt: "2026-02-13T09:05:00.000Z",
        resolvedBy: "Planner",
      },
    ],
    presence: [],
  },
  workflow: {
    stage: "review",
    stageUpdatedAt: "2026-02-13T09:10:00.000Z",
    wipLimit: 3,
  },
  evidenceItems: [
    {
      id: "ev-1",
      section: "communication_brief",
      claim: "Community elder endorsement improves vaccine completion intent.",
      source: "2025 qualitative interviews across 3 LGAs",
      sourceQuality: "high",
      confidence: "high",
      owner: "Research Lead",
      createdAt: "2026-02-11T09:00:00.000Z",
    },
    {
      id: "ev-2",
      section: "creative_brief",
      claim: "Shield metaphor resonates when paired with trusted local voices.",
      source: "Creative concept pretest wave 1",
      sourceQuality: "medium",
      confidence: "medium",
      owner: "Designer",
      createdAt: "2026-02-12T16:20:00.000Z",
    },
  ],
  issues: [
    {
      id: "issue-1",
      title: "Finalize elder-voice creative assets",
      description: "Need legal approval for testimonial footage and voiceover scripts.",
      severity: "high",
      status: "in_progress",
      owner: "Designer",
      slaHours: 48,
      createdAt: "2026-02-13T09:20:00.000Z",
      updatedAt: "2026-02-13T12:00:00.000Z",
    },
  ],
  reminders: [],
  portfolio: {
    scenarioPreset: "balanced",
    budgetCutPercent: 20,
    weights: {
      impact: 0.3,
      feasibility: 0.2,
      strategicFit: 0.25,
      culturalFit: 0.15,
      risk: 0.1,
    },
  },
  templateSystem: {
    selectedTemplateId: "template-awareness",
    availableTemplates: [
      {
        id: "template-awareness",
        name: "Awareness Launch",
        industry: "Brand",
        objectiveType: "awareness",
        defaultSections: ["research", "communication_brief", "creative_brief", "concept_board"],
        localizationHints: ["language", "symbols", "social_norms"],
      },
      {
        id: "template-conversion",
        name: "Behavior Conversion",
        industry: "Behavior Change",
        objectiveType: "conversion",
        defaultSections: ["research", "ideation", "concept_development", "prototype"],
        localizationHints: ["barriers", "motivators", "trusted_voices"],
      },
    ],
    localization: {
      language: "English",
      tone: "Community-first and practical",
      culturalMustInclude: ["Local elder endorsement", "Community market references"],
      culturalMustAvoid: ["Clinical fear framing"],
    },
  },
  digitalOps: {
    attributionModel: "weighted_multi_touch",
    channelSlaHours: [
      { channel: "WhatsApp", firstResponseHours: 1, followUpHours: 24 },
      { channel: "Email", firstResponseHours: 6, followUpHours: 48 },
      { channel: "Social", firstResponseHours: 4, followUpHours: 24 },
    ],
    channelMetrics: [
      {
        id: "metric-1",
        channel: "WhatsApp",
        metric: "Message reply rate",
        value: "32%",
        period: "Last 7 days",
      },
      {
        id: "metric-2",
        channel: "Community radio",
        metric: "Estimated reach",
        value: "1.2M",
        period: "Current flight",
      },
    ],
  },
  crmLifecycle: {
    memberRetentionTarget: 0.64,
    segments: [
      {
        id: "crm-new",
        name: "New Mothers",
        lifecycleStage: "onboard",
        size: 4300,
        priority: "high",
        nextAction: "Trigger dose-2 reminder sequence",
        dueAt: "2026-02-20T09:00:00.000Z",
        owner: "CRM Manager",
      },
      {
        id: "crm-elders",
        name: "Elder Influencers",
        lifecycleStage: "retain",
        size: 1200,
        priority: "medium",
        nextAction: "Share endorsement audio pack",
        dueAt: "2026-02-26T11:00:00.000Z",
        owner: "Community Lead",
      },
    ],
    automationRules: [
      {
        id: "rule-inactive-72h",
        trigger: "no_activity_72h",
        action: "send_reengagement_nudge",
        slaHours: 24,
        active: true,
      },
      {
        id: "rule-unresolved-24h",
        trigger: "unresolved_comment_24h",
        action: "notify_owner",
        slaHours: 12,
        active: true,
      },
    ],
  },
  experimentLab: {
    experiments: [
      {
        id: "exp-1",
        name: "Shield vs Growth framing",
        hypothesis: "Growth framing improves completion intent among first-time mothers.",
        metric: "Intent uplift",
        baseline: 0.42,
        target: 0.55,
        status: "running",
        winnerConceptId: "concept-1",
        startDate: "2026-02-10T08:00:00.000Z",
      },
    ],
    promoteWinnerConceptId: "concept-1",
  },
  governancePolicy: {
    requiredApprovalRoles: ["strategy_lead", "creative_lead", "client_partner"],
    minApprovedCount: 2,
    requirePreflightPassForReady: true,
    requireNoCriticalIncidentsForReady: true,
  },
  snapshots: [],
  approvals: [
    {
      id: "approval-1",
      role: "strategy_lead",
      approver: "Planner",
      signature: "Planner / 2026-02-13",
      status: "approved",
      note: "Approved with elder-targeting emphasis.",
      createdAt: "2026-02-13T12:30:00.000Z",
      updatedAt: "2026-02-13T12:30:00.000Z",
      approvedAt: "2026-02-13T12:30:00.000Z",
    },
  ],
  auditTrail: [
    {
      id: "audit-1",
      action: "approval_signed",
      actor: "Planner",
      detail: "Strategy lead approval signed.",
      createdAt: "2026-02-13T12:30:00.000Z",
    },
  ],
};
