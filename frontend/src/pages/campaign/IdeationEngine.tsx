import { ComponentType, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { CampaignData, Idea } from "@/types/campaign";
import {
  Lightbulb,
  Sparkles,
  Shuffle,
  RefreshCw,
  Repeat,
  Globe,
  Wand2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  filterIdeas as filterIdeasWithQuery,
  IdeationCreativeMode,
  generateIdeasForMethodWithAI,
  generateIdeasWithAI,
} from "@/lib/ai-engine/ideation-generator";
import { evaluateIdeaPortfolio, evaluateIdeaQuality, IdeaQualityEvaluation } from "@/lib/ai-engine/idea-quality";
import { downloadPresentationPpt } from "@/lib/presentation-ppt";
import { EvidencePanel } from "@/components/campaign/EvidencePanel";

interface Props {
  data: CampaignData;
  onChange: (d: Partial<CampaignData>) => void;
}

interface IdeaFormState {
  title: string;
  description: string;
  linkToInsight: string;
  linkToDriver: string;
  feasibilityScore: number;
  originalityScore: number;
  strategicFitScore: number;
  culturalFitScore: number;
}

const METHODS: Idea["method"][] = ["Revolution", "RelatedWorlds", "Re-expression", "RandomLinks"];
const SCORE_OPTIONS = [1, 2, 3, 4, 5] as const;
const CREATIVE_MODES: Array<{ id: IdeationCreativeMode; label: string }> = [
  { id: "balanced", label: "Balanced" },
  { id: "bold", label: "Bold" },
  { id: "pragmatic", label: "Pragmatic" },
  { id: "cultural", label: "Cultural" },
];

const METHOD_LABELS: Record<Idea["method"], string> = {
  Revolution: "Revolution",
  RelatedWorlds: "Related Worlds",
  "Re-expression": "Re-expression",
  RandomLinks: "Random Links",
};

const methodMeta: Record<
  Idea["method"],
  {
    icon: ComponentType<{ className?: string }>;
    color: string;
    description: string;
    catalyst: string;
  }
> = {
  Revolution: {
    icon: RefreshCw,
    color: "text-red-400",
    description: "Flip assumptions and challenge category rules.",
    catalyst: "Inversion + subtraction + bold reframes",
  },
  RelatedWorlds: {
    icon: Globe,
    color: "text-blue-400",
    description: "Borrow strategic patterns from other domains.",
    catalyst: "Analog transfer from adjacent and unrelated sectors",
  },
  "Re-expression": {
    icon: Repeat,
    color: "text-green-400",
    description: "Restate the problem in new frames and metaphors.",
    catalyst: "Visual/structural reframing",
  },
  RandomLinks: {
    icon: Shuffle,
    color: "text-purple-400",
    description: "Use random stimuli to force unexpected but useful links.",
    catalyst: "Serendipity mapped back to behavioral brief",
  },
};

const REVOLUTION_FRAMES = [
  {
    title: "Proof Before Pitch",
    interruption: "show live outcomes before introducing credentials",
    proofStep: "real-time confidence voting by decision-makers",
  },
  {
    title: "No-Deck Sprint",
    interruption: "replace presentations with one-page strategic prototypes",
    proofStep: "48-hour decision challenge with a clear go/no-go checkpoint",
  },
  {
    title: "Reverse Authority",
    interruption: "let frontline users define success criteria before leadership review",
    proofStep: "public scorecards owned by users, not only experts",
  },
  {
    title: "Decision Theater",
    interruption: "turn abstract strategy into a staged decision simulation",
    proofStep: "stakeholder commitment captured in-session",
  },
];

const REVOLUTION_ASSUMPTIONS = [
  "long expert-led briefings",
  "top-down directives with little participation",
  "awareness-only messaging",
  "slow approvals before testing ideas",
  "one-size-fits-all messaging",
  "generic credibility claims",
  "policy language without human proof",
  "passive communication with no immediate next step",
];

const REVOLUTION_ACTIVATIONS = [
  "run a live challenge in the audience's own setting",
  "launch a 7-day pilot with visible daily updates",
  "publish side-by-side before/after proof moments",
  "use peer testimonials in front of skeptics",
  "convert each touchpoint into a micro-commitment",
  "pair every claim with one practical demonstration",
  "introduce a public progress wall in community spaces",
  "trigger same-day sign-up and scheduling",
];

const REVOLUTION_TITLE_VARIANTS = [
  "Activation",
  "Catalyst",
  "Switch",
  "Playbook",
  "Trigger",
];

const RELATED_WORLD_PATTERNS = [
  {
    world: "Tech Startups",
    pattern: "beta releases + rapid feedback loops",
    translation: "ship fast pilots and adapt every week from real user feedback",
  },
  {
    world: "Sports Rookie Systems",
    pattern: "debut moments under pressure",
    translation: "design high-visibility moments where new actors prove competence quickly",
  },
  {
    world: "Education Journeys",
    pattern: "progress ladders with milestones",
    translation: "make change visible through simple, sequential milestones",
  },
  {
    world: "Emergency Health Response",
    pattern: "clarity under urgency",
    translation: "simplify decisions so people know what to do immediately",
  },
  {
    world: "Hospitality",
    pattern: "frictionless onboarding",
    translation: "remove first-step friction and make the first action feel welcoming",
  },
  {
    world: "E-commerce",
    pattern: "guided conversion funnels",
    translation: "move audiences from curiosity to decision through clear staged prompts",
  },
  {
    world: "Gaming",
    pattern: "progressive rewards and streaks",
    translation: "reinforce repeat behavior through visible progress and social recognition",
  },
  {
    world: "Supply Chain Logistics",
    pattern: "predictable checkpoint systems",
    translation: "build trust with transparent timelines and checkpoint accountability",
  },
];

const RELATED_WORLD_EXECUTIONS = [
  "weekly demo clinics",
  "peer-led onboarding circles",
  "decision-day events",
  "WhatsApp milestone reminders",
  "micro-incentive checkpoints",
  "public dashboard updates",
  "community endorsement waves",
  "same-week follow-up calls",
];

const RE_EXPRESSION_LENSES = [
  {
    lens: "Bridge Lens",
    shift: "present change as a bridge from trusted past to stronger future capability",
    output: "pair what stays trusted with what improves now",
  },
  {
    lens: "Seed Lens",
    shift: "frame new behavior as a seed that compounds over time",
    output: "show each small action as the start of larger gains",
  },
  {
    lens: "Mirror Lens",
    shift: "position the idea as a reflection of audience identity and aspiration",
    output: "speak to how people want to be seen by peers and family",
  },
  {
    lens: "Shield Lens",
    shift: "reframe risk management as active protection",
    output: "translate technical action into emotional protection language",
  },
  {
    lens: "Momentum Lens",
    shift: "show delay as loss of progress and action as acceleration",
    output: "highlight fast wins that prove momentum early",
  },
  {
    lens: "Pride Lens",
    shift: "convert compliance into a badge of leadership",
    output: "tie the behavior to status and social respect",
  },
];

const RE_EXPRESSION_PROMPTS = [
  "use a two-line message that flips the old assumption",
  "turn the core message into a practical proverb",
  "replace jargon with a vivid everyday metaphor",
  "lead with a question that challenges autopilot thinking",
  "pair emotion-first copy with a concrete next action",
  "use before/after framing to make value visible quickly",
];

const RANDOM_LINK_STIMULI = [
  { word: "Velcro", attribute: "instant connection", mappedAction: "build one-tap starter pathways" },
  { word: "Compass", attribute: "direction under uncertainty", mappedAction: "publish next-step maps for first 90 days" },
  { word: "Fire", attribute: "ignition energy", mappedAction: "run high-attention launch rituals tied to clear action" },
  { word: "Lighthouse", attribute: "clarity in risk", mappedAction: "show navigation dashboards with bottlenecks and fixes" },
  { word: "Tree", attribute: "roots + growth", mappedAction: "connect trusted history to future outcomes in one storyline" },
  { word: "Passport", attribute: "permission to progress", mappedAction: "issue visible progress stamps after each key action" },
  { word: "Magnet", attribute: "pull through relevance", mappedAction: "design content that pulls skeptics into low-risk trials" },
  { word: "Relay Baton", attribute: "shared responsibility", mappedAction: "handover responsibilities across community actors" },
  { word: "Blueprint", attribute: "clarity before action", mappedAction: "simplify complex journeys into step-by-step plans" },
  { word: "Bridge Cable", attribute: "strength through tension", mappedAction: "convert conflicting motivations into one shared goal" },
];

const RANDOM_LINK_EXECUTIONS = [
  "hosting rapid pop-up activations",
  "embedding prompts in existing routines",
  "using community champions as first movers",
  "turning each milestone into public proof",
  "automating reminders with visible checkpoints",
  "running pilot cohorts and publishing outcomes",
  "creating an open feedback loop with weekly iteration",
  "linking action to immediate social recognition",
];

const EXECUTION_WINDOWS = [
  "within 7 days",
  "within 14 days",
  "before month-end",
  "within one quarter",
  "by the next campaign milestone",
];

const EXECUTION_METRICS = [
  "conversion",
  "adoption",
  "repeat participation",
  "on-time completion",
  "informed decision follow-through",
];

const SCORE_BASELINE: Record<Idea["method"], { surprise: number; relevance: number; action: number; cultural: number }> = {
  Revolution: { surprise: 5, relevance: 4, action: 4, cultural: 3 },
  RelatedWorlds: { surprise: 4, relevance: 4, action: 4, cultural: 4 },
  "Re-expression": { surprise: 4, relevance: 5, action: 4, cultural: 4 },
  RandomLinks: { surprise: 5, relevance: 3, action: 3, cultural: 4 },
};

function ScoreBar({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className={cn("w-2 h-2 rounded-full", i < score ? "bg-primary" : "bg-muted")} />
      ))}
    </div>
  );
}

function normalizeText(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function toPhrase(value: string | undefined, fallback: string, maxWords = 10): string {
  const source = normalizeText(value, fallback).replace(/\s+/g, " ");
  const words = source.split(" ").filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function hashString(source: string): number {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickFrom<T>(items: T[], rng: () => number): T {
  const index = Math.floor(rng() * items.length);
  return items[Math.max(0, Math.min(items.length - 1, index))];
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function withJitter(base: number, rng: () => number): number {
  const offset = Math.floor(rng() * 3) - 1;
  return clampScore(base + offset);
}

function createIdeaRng(
  method: Idea["method"],
  context: { insight: string; driver: string; behaviorAction: string; reasonNow: string },
  indexSeed: number,
  attempt: number,
): () => number {
  const entropy = `${Date.now()}|${Math.random()}|${indexSeed}|${attempt}`;
  const seed = hashString([method, context.insight, context.driver, context.behaviorAction, context.reasonNow, entropy].join("|"));
  return mulberry32(seed);
}

function buildExecutionLine(
  step: string,
  audience: string,
  behaviorAction: string,
  rng: () => number,
): string {
  const window = pickFrom(EXECUTION_WINDOWS, rng);
  const metric = pickFrom(EXECUTION_METRICS, rng);
  return `To execute, ${step}. Measure ${metric} by tracking how many ${audience} ${behaviorAction} ${window}.`;
}

function ideaUniquenessKey(idea: Pick<Idea, "method" | "title" | "description">): string {
  return `${idea.method}|${idea.title.trim().toLowerCase()}|${idea.description.trim().toLowerCase()}`;
}

function createFormFromIdea(idea: Idea): IdeaFormState {
  return {
    title: idea.title,
    description: idea.description,
    linkToInsight: idea.linkToInsight,
    linkToDriver: idea.linkToDriver,
    feasibilityScore: idea.feasibilityScore,
    originalityScore: idea.originalityScore,
    strategicFitScore: idea.strategicFitScore,
    culturalFitScore: idea.culturalFitScore,
  };
}

function buildIdea(method: Idea["method"], data: CampaignData, indexSeed: number, attempt = 0): Idea {
  const audience = toPhrase(data.audiences[0]?.segmentName, "priority audience", 8);
  const insight = toPhrase(data.insight.insightText, "core human tension", 14);
  const driver =
    data.driver.driverTypes.length > 0
      ? data.driver.driverTypes.join(", ")
      : toPhrase(data.driver.driverText, "core motive", 6);
  const behaviorAction = toPhrase(data.behavior.desiredBehavior, "target behavior shift", 14);
  const reasonNow = toPhrase(data.driver.whyNow, "current pressure point", 10);
  const rng = createIdeaRng(
    method,
    {
      insight,
      driver,
      behaviorAction,
      reasonNow,
    },
    indexSeed,
    attempt,
  );
  const baseline = SCORE_BASELINE[method];

  let title = `${METHOD_LABELS[method]} Idea`;
  let description = "";

  if (method === "Revolution") {
    const frame = pickFrom(REVOLUTION_FRAMES, rng);
    const assumption = pickFrom(REVOLUTION_ASSUMPTIONS, rng);
    const activation = pickFrom(REVOLUTION_ACTIVATIONS, rng);
    const titleSuffix = pickFrom(REVOLUTION_TITLE_VARIANTS, rng);
    title = `Revolution: ${frame.title} ${titleSuffix}`;
    description = `Instead of ${assumption}, ${frame.interruption} for ${audience} dealing with ${insight}. ${buildExecutionLine(
      `${activation} and use ${frame.proofStep.toLowerCase()}`,
      audience,
      behaviorAction,
      rng,
    )}`;
  }

  if (method === "RelatedWorlds") {
    const analog = pickFrom(RELATED_WORLD_PATTERNS, rng);
    const executionMode = pickFrom(RELATED_WORLD_EXECUTIONS, rng);
    title = `Related World: ${analog.world} Pattern`;
    description = `Borrow ${analog.pattern} from ${analog.world} and adapt it for ${audience}. It makes ${insight} feel relevant by helping people see the benefit faster. ${buildExecutionLine(
      `${analog.translation} through ${executionMode}`,
      audience,
      behaviorAction,
      rng,
    )}`;
  }

  if (method === "Re-expression") {
    const lens = pickFrom(RE_EXPRESSION_LENSES, rng);
    const prompt = pickFrom(RE_EXPRESSION_PROMPTS, rng);
    title = `Re-expression: ${lens.lens}`;
    description = `Reframe the challenge using ${lens.lens.toLowerCase()}: ${lens.shift}. For ${audience}, ${lens.output}. To activate this, ${prompt} and link it directly to ${behaviorAction}. ${buildExecutionLine(
      "run a message test with two creative variants and keep the higher-performing line",
      audience,
      behaviorAction,
      rng,
    )}`;
  }

  if (method === "RandomLinks") {
    const stimulus = pickFrom(RANDOM_LINK_STIMULI, rng);
    const executionMode = pickFrom(RANDOM_LINK_EXECUTIONS, rng);
    title = `Random Link: ${stimulus.word} Catalyst`;
    description = `Use ${stimulus.word} (${stimulus.attribute}) as an unexpected hook for ${audience}. This creates a new way to understand ${insight} while staying practical. ${buildExecutionLine(
      `${stimulus.mappedAction} by ${executionMode}`,
      audience,
      behaviorAction,
      rng,
    )}`;
  }

  const originalityBoost = method === "RandomLinks" || method === "Revolution" ? 1 : 0;
  const relevanceBoost = method === "Re-expression" ? 1 : 0;
  const actionBoost = description.includes("To execute") ? 1 : 0;

  return {
    id: `${method.toLowerCase().replace(/[^a-z]+/g, "-")}-${Date.now()}-${indexSeed}-${Math.floor(rng() * 1_000_000)}`,
    method,
    title,
    description,
    linkToInsight: `Insight: ${insight}`,
    linkToDriver: `Driver: ${driver}. Why now: ${reasonNow}`,
    feasibilityScore: withJitter(baseline.action + actionBoost, rng),
    originalityScore: withJitter(baseline.surprise + originalityBoost, rng),
    strategicFitScore: withJitter(baseline.relevance + relevanceBoost, rng),
    culturalFitScore: withJitter(baseline.cultural, rng),
    selected: false,
  };
}

function createManualDraft(method: Idea["method"], data: CampaignData, indexSeed: number): IdeaFormState {
  const template = buildIdea(method, data, indexSeed);
  return createFormFromIdea(template);
}

function toIdeaFromForm(
  base: Idea,
  method: Idea["method"],
  form: IdeaFormState,
  idOverride?: string,
): Idea {
  return {
    ...base,
    id: idOverride ?? base.id,
    method,
    title: normalizeText(form.title, base.title),
    description: normalizeText(form.description, base.description),
    linkToInsight: normalizeText(form.linkToInsight, base.linkToInsight),
    linkToDriver: normalizeText(form.linkToDriver, base.linkToDriver),
    feasibilityScore: clampScore(form.feasibilityScore),
    originalityScore: clampScore(form.originalityScore),
    strategicFitScore: clampScore(form.strategicFitScore),
    culturalFitScore: clampScore(form.culturalFitScore),
  };
}

function generateIdeasForMethod(method: Idea["method"], data: CampaignData, count: number): Idea[] {
  const existingCount = data.ideas.filter((idea) => idea.method === method).length;
  const usedKeys = new Set(data.ideas.map(ideaUniquenessKey));
  const usedTitles = new Set(data.ideas.map((idea) => idea.title.trim().toLowerCase()));
  const generated: Idea[] = [];

  let attempt = 0;
  while (generated.length < count && attempt < count * 40) {
    const candidate = buildIdea(method, data, existingCount + generated.length + 1, attempt);
    const key = ideaUniquenessKey(candidate);
    const titleKey = candidate.title.trim().toLowerCase();
    if (!usedKeys.has(key) && !usedTitles.has(titleKey)) {
      usedKeys.add(key);
      usedTitles.add(titleKey);
      generated.push(candidate);
    }
    attempt += 1;
  }

  while (generated.length < count) {
    const fallback = buildIdea(method, data, existingCount + generated.length + 1, attempt + 1000);
    const variant = existingCount + generated.length + 1;
    const patched: Idea = {
      ...fallback,
      title: `${fallback.title} v${variant}`,
      description: `${fallback.description} Pilot variant ${variant}.`,
    };
    const key = ideaUniquenessKey(patched);
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      usedTitles.add(patched.title.trim().toLowerCase());
      generated.push(patched);
    }
    attempt += 1;
  }

  return generated;
}

function ScoreSelectField({
  label,
  value,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
}) {
  return (
    <label className="space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={clampScore(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={ariaLabel}
        className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
      >
        {SCORE_OPTIONS.map((score) => (
          <option key={score} value={score}>
            {score}
          </option>
        ))}
      </select>
    </label>
  );
}

function IdeaFormFields({
  labelPrefix,
  form,
  onChange,
}: {
  labelPrefix: "Manual" | "Edit";
  form: IdeaFormState;
  onChange: (updates: Partial<IdeaFormState>) => void;
}) {
  return (
    <div className="space-y-3">
      <Input
        value={form.title}
        onChange={(event) => onChange({ title: event.target.value })}
        placeholder="Enter idea title"
        aria-label={`${labelPrefix} idea title`}
        className="h-9"
      />
      <Textarea
        value={form.description}
        onChange={(event) => onChange({ description: event.target.value })}
        placeholder="Describe the idea in simple behavior-change language"
        aria-label={`${labelPrefix} idea description`}
        className="min-h-[88px]"
      />
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          value={form.linkToInsight}
          onChange={(event) => onChange({ linkToInsight: event.target.value })}
          placeholder="How this links to the insight"
          aria-label={`${labelPrefix} idea insight link`}
          className="h-9"
        />
        <Input
          value={form.linkToDriver}
          onChange={(event) => onChange({ linkToDriver: event.target.value })}
          placeholder="How this links to the driver/motive"
          aria-label={`${labelPrefix} idea driver link`}
          className="h-9"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreSelectField
          label="Surprise"
          value={form.originalityScore}
          onChange={(originalityScore) => onChange({ originalityScore })}
          ariaLabel={`${labelPrefix} idea surprise score`}
        />
        <ScoreSelectField
          label="Relevance"
          value={form.strategicFitScore}
          onChange={(strategicFitScore) => onChange({ strategicFitScore })}
          ariaLabel={`${labelPrefix} idea relevance score`}
        />
        <ScoreSelectField
          label="Action"
          value={form.feasibilityScore}
          onChange={(feasibilityScore) => onChange({ feasibilityScore })}
          ariaLabel={`${labelPrefix} idea action score`}
        />
        <ScoreSelectField
          label="Cultural Fit"
          value={form.culturalFitScore}
          onChange={(culturalFitScore) => onChange({ culturalFitScore })}
          ariaLabel={`${labelPrefix} idea cultural fit score`}
        />
      </div>
    </div>
  );
}

function IdeaCard({
  idea,
  quality,
  isEditing,
  editForm,
  onToggle,
  onStartEdit,
  onDelete,
  onEditFormChange,
  onSaveEdit,
  onCancelEdit,
}: {
  idea: Idea;
  quality: IdeaQualityEvaluation;
  isEditing: boolean;
  editForm: IdeaFormState | null;
  onToggle: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onEditFormChange: (updates: Partial<IdeaFormState>) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  if (isEditing && editForm) {
    return (
      <Card className="p-4 bg-gradient-card border-primary/40 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-display font-semibold text-sm">Edit Idea</h4>
          <Badge variant="outline" className="text-[10px]">
            {METHOD_LABELS[idea.method]}
          </Badge>
        </div>

        <IdeaFormFields labelPrefix="Edit" form={editForm} onChange={onEditFormChange} />

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancelEdit}>
            <X className="mr-1 h-3 w-3" /> Cancel
          </Button>
          <Button size="sm" onClick={onSaveEdit}>
            <Save className="mr-1 h-3 w-3" /> Save Idea
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "p-4 bg-gradient-card transition-all",
        idea.selected && "border-primary/40 border-glow",
      )}
      onClick={onToggle}
      role="button"
    >
      <div className="flex items-start justify-between mb-2 gap-2">
        <h4 className="font-display font-semibold text-sm">{idea.title}</h4>
        <div className="flex items-center gap-1">
          <Badge
            variant={quality.passes ? "secondary" : "outline"}
            className={cn("text-[10px]", quality.passes ? "text-emerald-700" : "text-amber-700")}
          >
            Quality {quality.total}/100
          </Badge>
          {idea.selected && <Badge className="text-[10px]">Selected</Badge>}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Edit idea"
            onClick={(event) => {
              event.stopPropagation();
              onStartEdit();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            aria-label="Delete idea"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">{idea.description}</p>

      <div className="grid gap-1 text-[10px] text-muted-foreground/70">
        <div className="flex items-center justify-between gap-2">
          <span>Surprise (attention break)</span>
          <ScoreBar score={idea.originalityScore} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Revaluation/Relevance (personal meaning)</span>
          <ScoreBar score={idea.strategicFitScore} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Performance/Action (observable step)</span>
          <ScoreBar score={idea.feasibilityScore} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        <Badge variant="outline" className="text-[10px]">
          {idea.linkToInsight}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {idea.linkToDriver}
        </Badge>
      </div>

      {!quality.passes && quality.suggestions.length > 0 && (
        <p className="mt-2 text-[10px] text-amber-700">{quality.suggestions[0]}</p>
      )}
    </Card>
  );
}

export function IdeationEngine({ data, onChange }: Props) {
  const { toast } = useToast();
  const [activeMethod, setActiveMethod] = useState<Idea["method"]>("Revolution");
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);
  const [editingIdeaForm, setEditingIdeaForm] = useState<IdeaFormState | null>(null);
  const [manualIdeaForm, setManualIdeaForm] = useState<IdeaFormState>(() => createManualDraft("Revolution", data, 1));
  const [ideaFilterQuery, setIdeaFilterQuery] = useState("");
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [showQualityReadyOnly, setShowQualityReadyOnly] = useState(false);
  const [generationMode, setGenerationMode] = useState<IdeationCreativeMode>("balanced");

  const selectedCount = data.ideas.filter((idea) => idea.selected).length;
  const ideaQualityMap = useMemo(() => {
    const entries = data.ideas.map((idea) => [idea.id, evaluateIdeaQuality(idea, data)] as const);
    return Object.fromEntries(entries) as Record<string, IdeaQualityEvaluation>;
  }, [data]);
  const portfolioQuality = useMemo(() => evaluateIdeaPortfolio(data.ideas, data), [data]);

  const designCheckpointSignals = useMemo(() => {
    if (data.ideas.length === 0) {
      return { surprise: 0, relevance: 0, action: 0 };
    }

    const total = data.ideas.reduce(
      (accumulator, idea) => ({
        surprise: accumulator.surprise + idea.originalityScore,
        relevance: accumulator.relevance + idea.strategicFitScore,
        action: accumulator.action + idea.feasibilityScore,
      }),
      { surprise: 0, relevance: 0, action: 0 },
    );

    return {
      surprise: Math.round((total.surprise / data.ideas.length) * 10) / 10,
      relevance: Math.round((total.relevance / data.ideas.length) * 10) / 10,
      action: Math.round((total.action / data.ideas.length) * 10) / 10,
    };
  }, [data.ideas]);

  const insightPreview = toPhrase(data.insight.insightText, "No insight yet.", 16);
  const driverPreview =
    data.driver.driverTypes.length > 0
      ? data.driver.driverTypes.join(", ")
      : toPhrase(data.driver.driverText, "No driver selected.", 12);
  const actionPreview = toPhrase(data.behavior.desiredBehavior, "No target action yet.", 16);

  const newDraftForMethod = (method: Idea["method"]) => {
    const existingCount = data.ideas.filter((idea) => idea.method === method).length;
    return createManualDraft(method, data, existingCount + 1);
  };

  const setActiveMethodWithDraft = (method: Idea["method"]) => {
    setActiveMethod(method);
    setManualIdeaForm(newDraftForMethod(method));
  };

  const toggleIdea = (id: string) => {
    onChange({
      ideas: data.ideas.map((idea) => (idea.id === id ? { ...idea, selected: !idea.selected } : idea)),
    });
  };

  const setSelectionForActiveMethod = (selected: boolean) => {
    onChange({
      ideas: data.ideas.map((idea) => (idea.method === activeMethod ? { ...idea, selected } : idea)),
    });
  };

  const generateActiveMethodIdeas = async () => {
    if (isGeneratingIdeas) {
      return;
    }

    setIsGeneratingIdeas(true);
    try {
      const generated = await generateIdeasForMethodWithAI(
        data,
        activeMethod,
        3,
        data.ideas,
        generationMode,
      );
      const qualityReadyCount = generated.filter((idea) => evaluateIdeaQuality(idea, data).passes).length;
      onChange({ ideas: [...data.ideas, ...generated] });
      toast({
        title: "Ideas generated",
        description: `${generated.length} ${METHOD_LABELS[activeMethod]} ideas added (${generationMode} mode). ${qualityReadyCount}/${generated.length} are quality-ready.`,
      });
      setManualIdeaForm(newDraftForMethod(activeMethod));
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  const runSprint = async () => {
    if (isGeneratingIdeas) {
      return;
    }

    setIsGeneratingIdeas(true);
    try {
      const generated = await generateIdeasWithAI(data, { count: METHODS.length, mode: generationMode });
      const qualityReadyCount = generated.filter((idea) => evaluateIdeaQuality(idea, data).passes).length;
      onChange({ ideas: [...data.ideas, ...generated] });
      toast({
        title: "4R sprint complete",
        description: `Generated one surprise-relevance-action idea per method (${generationMode} mode). ${qualityReadyCount}/${generated.length} are quality-ready.`,
      });
      setManualIdeaForm(newDraftForMethod(activeMethod));
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  const regenerateLowQuality = async (method: Idea["method"]) => {
    if (isGeneratingIdeas) {
      return;
    }

    const lowQualityIdeas = data.ideas.filter(
      (idea) => idea.method === method && !(ideaQualityMap[idea.id]?.passes ?? false),
    );

    if (lowQualityIdeas.length === 0) {
      toast({
        title: "No regeneration needed",
        description: "All ideas in this method currently pass quality checks.",
      });
      return;
    }

    setIsGeneratingIdeas(true);
    try {
      const lowQualityIds = new Set(lowQualityIdeas.map((idea) => idea.id));
      const retainedIdeas = data.ideas.filter((idea) => !lowQualityIds.has(idea.id));
      const regenerated = await generateIdeasForMethodWithAI(
        { ...data, ideas: retainedIdeas },
        method,
        lowQualityIdeas.length,
        retainedIdeas,
        generationMode,
      );

      onChange({
        ideas: [...retainedIdeas, ...regenerated],
      });
      const qualityReadyCount = regenerated.filter((idea) => evaluateIdeaQuality(idea, data).passes).length;
      toast({
        title: "Low-quality ideas regenerated",
        description: `Replaced ${lowQualityIdeas.length} idea(s) with fresh ${METHOD_LABELS[method]} variants. ${qualityReadyCount}/${regenerated.length} now pass quality checks.`,
      });
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  const addManualIdea = () => {
    const base = buildIdea(activeMethod, data, data.ideas.length + 1);
    const nextIdea = toIdeaFromForm(base, activeMethod, manualIdeaForm);
    onChange({ ideas: [...data.ideas, nextIdea] });
    toast({
      title: "Idea added",
      description: `Manual ${METHOD_LABELS[activeMethod]} idea created.`,
    });
    setManualIdeaForm(createManualDraft(activeMethod, data, data.ideas.filter((idea) => idea.method === activeMethod).length + 2));
  };

  const beginEditIdea = (idea: Idea) => {
    setEditingIdeaId(idea.id);
    setEditingIdeaForm(createFormFromIdea(idea));
  };

  const cancelEdit = () => {
    setEditingIdeaId(null);
    setEditingIdeaForm(null);
  };

  const saveEdit = () => {
    if (!editingIdeaId || !editingIdeaForm) {
      return;
    }

    const targetIdea = data.ideas.find((idea) => idea.id === editingIdeaId);
    if (!targetIdea) {
      cancelEdit();
      return;
    }

    const updatedIdeas = data.ideas.map((idea) =>
      idea.id === editingIdeaId
        ? toIdeaFromForm(targetIdea, idea.method, editingIdeaForm, idea.id)
        : idea,
    );

    onChange({ ideas: updatedIdeas });
    toast({
      title: "Idea updated",
      description: "Your idea changes were saved.",
    });
    cancelEdit();
  };

  const deleteIdea = (ideaId: string) => {
    onChange({ ideas: data.ideas.filter((idea) => idea.id !== ideaId) });
    if (editingIdeaId === ideaId) {
      cancelEdit();
    }
    toast({
      title: "Idea deleted",
      description: "The idea was removed from this campaign.",
    });
  };

  const updateManualIdeaForm = (updates: Partial<IdeaFormState>) => {
    setManualIdeaForm((current) => ({ ...current, ...updates }));
  };

  const updateEditingIdeaForm = (updates: Partial<IdeaFormState>) => {
    setEditingIdeaForm((current) => (current ? { ...current, ...updates } : current));
  };

  const exportPresentation = () => {
    const ideasByMethod = METHODS.map((method) => ({
      method,
      ideas: data.ideas.filter((idea) => idea.method === method),
    }));

    downloadPresentationPpt({
      filename: `${data.campaign.name}-4rs-ideation`,
      title: "4Rs Ideation",
      subtitle: "Surprise-Relevance-Action concepts for behavior change",
      campaignName: data.campaign.name,
      complianceTag: `${(data.approvals || []).filter((entry) => entry.status === "approved").length} approval(s) signed`,
      slides: [
        {
          heading: "Ideation Summary",
          bullets: [
            `Total ideas: ${data.ideas.length}`,
            `Selected ideas: ${selectedCount}`,
            `Quality-ready ideas: ${portfolioQuality.passCount}/${data.ideas.length}`,
            `Average quality score: ${portfolioQuality.averageTotal}/100`,
            `Insight anchor: ${insightPreview}`,
            `Driver anchor: ${driverPreview}`,
          ],
        },
        ...ideasByMethod.map((entry) => ({
          heading: `${METHOD_LABELS[entry.method]} Ideas`,
          bullets:
            entry.ideas.length > 0
              ? entry.ideas.slice(0, 8).map((idea) => {
                  const tag = idea.selected ? " [Selected]" : "";
                  return `${idea.title}${tag} - Surprise ${idea.originalityScore}/5, Relevance ${idea.strategicFitScore}/5, Action ${idea.feasibilityScore}/5`;
                })
              : ["No ideas generated for this method yet."],
        })),
      ],
    });

    toast({
      title: "PPT exported",
      description: "4Rs Ideation presentation downloaded.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">4Rs Ideation Engine</h2>
            <p className="text-sm text-muted-foreground">
              {data.ideas.length} ideas generated · {selectedCount} selected
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Mode</span>
            <select
              aria-label="Ideation generation mode"
              className="h-8 rounded border border-input bg-background px-2 text-xs text-foreground"
              value={generationMode}
              onChange={(event) => setGenerationMode(event.target.value as IdeationCreativeMode)}
            >
              {CREATIVE_MODES.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" className="gap-1" onClick={() => void runSprint()} disabled={isGeneratingIdeas}>
            <Wand2 className="h-3 w-3" /> {isGeneratingIdeas ? "Generating..." : "Run 4R Sprint"}
          </Button>
          <Button variant="outline" className="gap-1" onClick={exportPresentation}>
            <Download className="h-3 w-3" /> Export PPT
          </Button>
          <Button className="gap-1 shadow-amber" onClick={() => void generateActiveMethodIdeas()} disabled={isGeneratingIdeas}>
            <Sparkles className="h-3 w-3" /> {isGeneratingIdeas ? "Generating..." : "Generate Active Method"}
          </Button>
        </div>
      </div>

      <EvidencePanel
        data={data}
        onChange={onChange}
        section="ideation"
        title="Evidence Registry (4Rs Ideation)"
      />

      <Card className="p-4 bg-gradient-card space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary/80">Catalyst Inputs</h4>
        <div className="grid gap-3 md:grid-cols-3 text-xs">
          <div>
            <p className="text-muted-foreground mb-1">Insight</p>
            <p className="font-medium">{insightPreview}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Driver/Motive</p>
            <p className="font-medium">{driverPreview}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Target Action</p>
            <p className="font-medium">{actionPreview}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <Badge variant="outline">Surprise signal: {designCheckpointSignals.surprise}/5</Badge>
          <Badge variant="outline">Revaluation/Relevance signal: {designCheckpointSignals.relevance}/5</Badge>
          <Badge variant="outline">Performance/Action signal: {designCheckpointSignals.action}/5</Badge>
          <Badge variant="outline">Quality-ready ideas: {portfolioQuality.passCount}/{data.ideas.length}</Badge>
          <Badge variant="outline">Avg quality score: {portfolioQuality.averageTotal}/100</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground/80">
          BCD principles here are creative design checkpoints, not campaign impact metrics. Use them to test idea quality
          before launch; track behavior uptake with outcome KPIs in measurement.
        </p>
      </Card>

      <Card className="p-3 bg-gradient-card flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 text-xs flex-wrap">
          {METHODS.map((method) => {
            const meta = methodMeta[method];
            const count = data.ideas.filter((idea) => idea.method === method).length;
            const Icon = meta.icon;

            return (
              <div key={method} className="flex items-center gap-1.5">
                <Icon className={cn("h-3 w-3", meta.color)} />
                <span className="text-muted-foreground">{METHOD_LABELS[method]}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {count}
                </Badge>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Switch
              checked={showQualityReadyOnly}
              onCheckedChange={(checked) => setShowQualityReadyOnly(Boolean(checked))}
              aria-label="Show quality-ready ideas only"
            />
            Quality-ready only
          </label>
          <Input
            value={ideaFilterQuery}
            onChange={(event) => setIdeaFilterQuery(event.target.value)}
            placeholder="Filter ideas"
            aria-label="Filter ideas"
            className="h-8 w-[220px]"
          />
        </div>
      </Card>

      <Tabs value={activeMethod} onValueChange={(value) => setActiveMethodWithDraft(value as Idea["method"])}>
        <TabsList className="bg-secondary">
          {METHODS.map((method) => {
            const meta = methodMeta[method];
            const Icon = meta.icon;
            return (
              <TabsTrigger key={method} value={method} className="gap-1 text-xs data-[state=active]:text-primary">
                <Icon className="h-3 w-3" />
                {METHOD_LABELS[method]}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {METHODS.map((method) => {
          const meta = methodMeta[method];
          const scopedIdeas = data.ideas.filter((idea) => idea.method === method);
          const qualityFilteredIdeas = showQualityReadyOnly
            ? scopedIdeas.filter((idea) => ideaQualityMap[idea.id]?.passes)
            : scopedIdeas;
          const ideas = filterIdeasWithQuery(qualityFilteredIdeas, ideaFilterQuery);
          return (
            <TabsContent key={method} value={method} className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                  <p className="text-[10px] text-muted-foreground/70">Catalyst: {meta.catalyst}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSelectionForActiveMethod(true)}>
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectionForActiveMethod(false)}>
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void regenerateLowQuality(method)}
                    disabled={isGeneratingIdeas}
                  >
                    Regenerate Low-Score
                  </Button>
                </div>
              </div>

              {method === activeMethod && (
                <Card className="p-4 bg-gradient-card border-primary/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-primary/80">Manual Idea Entry</h4>
                    <Badge variant="outline" className="text-[10px]">
                      {METHOD_LABELS[activeMethod]}
                    </Badge>
                  </div>
                  <IdeaFormFields labelPrefix="Manual" form={manualIdeaForm} onChange={updateManualIdeaForm} />
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1" onClick={addManualIdea}>
                      <Plus className="h-3 w-3" /> Add Manual Idea
                    </Button>
                  </div>
                </Card>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                {ideas.length > 0 ? (
                  ideas.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      quality={ideaQualityMap[idea.id] ?? evaluateIdeaQuality(idea, data)}
                      isEditing={editingIdeaId === idea.id}
                      editForm={editingIdeaId === idea.id ? editingIdeaForm : null}
                      onToggle={() => toggleIdea(idea.id)}
                      onStartEdit={() => beginEditIdea(idea)}
                      onDelete={() => deleteIdea(idea.id)}
                      onEditFormChange={updateEditingIdeaForm}
                      onSaveEdit={saveEdit}
                      onCancelEdit={cancelEdit}
                    />
                  ))
                ) : (
                  <Card className="p-4 bg-gradient-card text-sm text-muted-foreground">
                    No ideas for this method yet. Generate ideas to continue.
                  </Card>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
