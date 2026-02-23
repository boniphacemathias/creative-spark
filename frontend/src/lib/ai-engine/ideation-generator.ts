import { CampaignData, Idea } from "@/types/campaign";
import { cleanAiText, generateTextViaApi, parseJsonFromModelText } from "@/lib/ai/ai-client";
import { evaluateIdeaQuality } from "@/lib/ai-engine/idea-quality";

const METHODS: Idea["method"][] = ["Revolution", "RelatedWorlds", "Re-expression", "RandomLinks"];

const METHOD_TOKENS: Record<Idea["method"], string[]> = {
  Revolution: ["invert", "remove friction", "public proof", "counter-norm", "rapid challenge"],
  RelatedWorlds: ["startup beta", "sports debut", "hospitality onboarding", "gaming progression", "logistics checkpoint"],
  "Re-expression": ["bridge", "shield", "momentum", "mirror", "seed"],
  RandomLinks: ["compass", "magnet", "blueprint", "relay", "lighthouse"],
};

const EXECUTION_METRICS = [
  "adoption",
  "completion",
  "repeat action",
  "decision follow-through",
  "conversion",
];

export type IdeationCreativeMode = "balanced" | "bold" | "pragmatic" | "cultural";

const MODE_DIRECTIVES: Record<IdeationCreativeMode, string> = {
  balanced: "Balance novelty with feasibility and include one measurable action step.",
  bold: "Push for surprising, counter-intuitive concepts while keeping execution realistic.",
  pragmatic: "Prioritize low-cost, fast-launch ideas that can run with existing channels and teams.",
  cultural: "Anchor ideas in local rituals, language, status dynamics, and trusted social actors.",
};

const MODE_TOKENS: Record<IdeationCreativeMode, string[]> = {
  balanced: ["pilot rapidly", "show proof", "iterate weekly"],
  bold: ["public commitment moment", "counter-norm framing", "high-attention reveal"],
  pragmatic: ["existing partner channels", "simple rollout", "low-cost weekly cadence"],
  cultural: ["elder endorsements", "community rituals", "local-language storytelling"],
};
const SIMILARITY_THRESHOLD = 0.84;
const MIN_DESCRIPTION_WORDS = 20;
const MAX_DESCRIPTION_WORDS = 80;

export interface IdeationGenerationOptions {
  count: number;
  method?: Idea["method"];
  mode?: IdeationCreativeMode;
}

interface AiIdeaOutput {
  method?: string;
  title?: string;
  description?: string;
  linkToInsight?: string;
  linkToDriver?: string;
  feasibilityScore?: number;
  originalityScore?: number;
  strategicFitScore?: number;
  culturalFitScore?: number;
}

interface AiIdeasEnvelope {
  ideas?: AiIdeaOutput[];
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toPhrase(value: string, fallback: string, maxWords = 12): string {
  const source = normalize(value || fallback);
  const words = source.split(" ").filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function clamp(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function createRng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(source: string): number {
  let output = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    output ^= source.charCodeAt(i);
    output = Math.imul(output, 16777619);
  }
  return output >>> 0;
}

function pick<T>(items: T[], rng: () => number): T {
  const index = Math.floor(rng() * items.length);
  return items[Math.max(0, Math.min(items.length - 1, index))];
}

function ideaKey(idea: Pick<Idea, "title" | "description" | "method">): string {
  return `${idea.method}|${idea.title.toLowerCase()}|${idea.description.toLowerCase()}`;
}

function signatureTokens(idea: Pick<Idea, "title" | "description" | "linkToInsight" | "linkToDriver">): Set<string> {
  const raw = `${idea.title} ${idea.description} ${idea.linkToInsight} ${idea.linkToDriver}`.toLowerCase();
  const words = raw
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
  return new Set(words);
}

function similarityScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(a.size, b.size);
}

function cleanDescription(value: string): string {
  return cleanAiText(value)
    .replace(/\bSurprise\s*:\s*/gi, "")
    .replace(/\bRelevance\s*:\s*/gi, "")
    .replace(/\bRevaluation\s*:\s*/gi, "")
    .replace(/\bAction\s*:\s*/gi, "")
    .replace(/^\s*[-*]\s*/gim, "")
    .replace(/^\s*\d+\.\s*/gim, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function truncateWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value;
  }
  return `${words.slice(0, maxWords).join(" ")}.`;
}

function sentenceHasActionCue(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return (
    /(to execute|launch|run|pilot|test|deploy|host|activate|schedule|measure|track)/.test(lower) &&
    /(week|month|day|kpi|adoption|completion|conversion|follow-through|timeline|within)/.test(lower)
  );
}

function ensureSentenceEndsWithPunctuation(value: string): string {
  if (!value) {
    return value;
  }
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function ensureLabeledLink(value: string, label: "Insight" | "Driver", fallback: string): string {
  const normalized = normalize(value || "");
  if (!normalized) {
    return fallback;
  }
  const withoutLabel = normalized.replace(/^(insight|driver)\s*:\s*/i, "").trim();
  return `${label}: ${withoutLabel}`.trim();
}

function ensureDescriptionQuality(
  description: string,
  context: { audience: string; insight: string; behaviorAction: string; executionMetric: string },
): string {
  const cleaned = cleanDescription(description);
  let sentences = splitSentences(cleaned);

  if (sentences.length === 0) {
    sentences = [
      `Instead of generic messaging, use a targeted trigger for ${context.audience} around ${context.insight}.`,
      `To execute, run a 14-day pilot and track ${context.executionMetric} for ${context.behaviorAction}.`,
    ];
  }

  if (sentences.length > 3) {
    sentences = sentences.slice(0, 3);
  }

  const hasActionSentence = sentences.some(sentenceHasActionCue);
  if (!hasActionSentence) {
    sentences.push(
      `To execute, run a 14-day pilot and track ${context.executionMetric} for ${context.behaviorAction}.`,
    );
  }

  let normalized = sentences
    .map((sentence) => ensureSentenceEndsWithPunctuation(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.split(/\s+/).length < MIN_DESCRIPTION_WORDS) {
    normalized = `${normalized} This creates visible proof that motivates repeat action.`;
  }

  normalized = truncateWords(normalized, MAX_DESCRIPTION_WORDS);
  return normalized;
}

function rankIdeasByQuality(ideas: Idea[], data: CampaignData): Idea[] {
  return [...ideas]
    .map((idea) => ({
      idea,
      quality: evaluateIdeaQuality(idea, data),
    }))
    .sort((a, b) => {
      if (b.quality.total !== a.quality.total) {
        return b.quality.total - a.quality.total;
      }
      if (b.idea.originalityScore !== a.idea.originalityScore) {
        return b.idea.originalityScore - a.idea.originalityScore;
      }
      if (b.idea.strategicFitScore !== a.idea.strategicFitScore) {
        return b.idea.strategicFitScore - a.idea.strategicFitScore;
      }
      return b.idea.feasibilityScore - a.idea.feasibilityScore;
    })
    .map((entry) => entry.idea);
}

function selectDiverseIdeas(ideas: Idea[], count: number, preferredMethod?: Idea["method"]): Idea[] {
  if (count <= 0 || ideas.length === 0) {
    return [];
  }

  if (preferredMethod) {
    return ideas.filter((idea) => idea.method === preferredMethod).slice(0, count);
  }

  const byMethod = new Map<Idea["method"], Idea[]>();
  for (const method of METHODS) {
    byMethod.set(method, ideas.filter((idea) => idea.method === method));
  }

  const selected: Idea[] = [];
  for (const method of METHODS) {
    const first = byMethod.get(method)?.[0];
    if (first) {
      selected.push(first);
      byMethod.set(method, byMethod.get(method)!.slice(1));
      if (selected.length >= count) {
        return selected.slice(0, count);
      }
    }
  }

  const remaining = METHODS.flatMap((method) => byMethod.get(method) ?? []);
  return [...selected, ...remaining].slice(0, count);
}

function parseMethod(value: string | undefined, fallback: Idea["method"]): Idea["method"] {
  if (!value) {
    return fallback;
  }

  const normalized = value.toLowerCase().replace(/\s+/g, "");
  if (normalized.includes("revolution")) {
    return "Revolution";
  }
  if (normalized.includes("related")) {
    return "RelatedWorlds";
  }
  if (normalized.includes("re-expression") || normalized.includes("reexpression")) {
    return "Re-expression";
  }
  if (normalized.includes("random")) {
    return "RandomLinks";
  }

  return fallback;
}

function buildIdea(
  method: Idea["method"],
  data: CampaignData,
  sequence: number,
  attempt: number,
  mode: IdeationCreativeMode = "balanced",
): Idea {
  const audience = toPhrase(data.audiences[0]?.segmentName || "", "priority audience", 8);
  const insight = toPhrase(data.insight.insightText, "core human tension", 14);
  const motive = data.driver.driverTypes.length > 0 ? data.driver.driverTypes.join(", ") : toPhrase(data.driver.driverText, "core motive", 6);
  const action = toPhrase(data.behavior.desiredBehavior, "target behavior shift", 14);
  const whyNow = toPhrase(data.driver.whyNow, "urgent pressure point", 10);

  const seed = hash(`${method}|${insight}|${motive}|${action}|${whyNow}|${sequence}|${attempt}|${Date.now()}|${Math.random()}`);
  const rng = createRng(seed);
  const token = pick(METHOD_TOKENS[method], rng);
  const metric = pick(EXECUTION_METRICS, rng);
  const modeToken = pick(MODE_TOKENS[mode], rng);

  const title = `${method}: ${token.replace(/\b\w/g, (character) => character.toUpperCase())} ${Math.floor(rng() * 900 + 100)}`;
  const description = `Use ${token} to interrupt current behavior for ${audience}. This makes ${insight} feel personally relevant and gives a practical next step. To execute, ${modeToken} in a rapid pilot with visible proof points and measure ${metric} tied to ${action}.`;

  return {
    id: `${method.toLowerCase().replace(/[^a-z]+/g, "-")}-${Date.now()}-${sequence}-${Math.floor(rng() * 1000000)}`,
    method,
    title,
    description,
    linkToInsight: `Insight: ${insight}`,
    linkToDriver: `Driver: ${motive}. Why now: ${whyNow}`,
    feasibilityScore: clamp(3 + Math.round(rng() * 2)),
    originalityScore: clamp(4 + Math.round(rng())),
    strategicFitScore: clamp(3 + Math.round(rng() * 2)),
    culturalFitScore: clamp(3 + Math.round(rng() * 2)),
    selected: false,
  };
}

function buildAiPrompt(data: CampaignData, options: IdeationGenerationOptions): string {
  const audience = data.audiences.map((entry) => entry.segmentName).filter(Boolean).join(", ") || "Priority audience";
  const insight = data.insight.insightText || "Behavior is constrained by trust and relevance.";
  const driver = data.driver.driverTypes.length > 0 ? data.driver.driverTypes.join(", ") : data.driver.driverText;
  const behaviorAction = data.behavior.desiredBehavior || "Perform the desired behavior on time.";

  const methodInstruction = options.method
    ? `Use only this ideation method: ${options.method}.`
    : "Distribute ideas across Revolution, RelatedWorlds, Re-expression, and RandomLinks.";
  const mode = options.mode ?? "balanced";

  return [
    "You are an expert SBCC strategist helping generate behaviour change campaigns.",
    `Generate ${options.count} highly creative but executable ideas for a campaign.`,
    methodInstruction,
    `Creative mode: ${mode}. ${MODE_DIRECTIVES[mode]}`,
    `Target audience: ${audience}`,
    `Human insight: ${insight}`,
    `Behavioral driver(s): ${driver}`,
    `Desired measurable action: ${behaviorAction}`,
    "Apply BCD design logic in each idea:",
    "1) Surprise: break attention in an unexpected but credible way.",
    "2) Revaluation/Relevance: connect directly to audience tension and motive.",
    "3) Performance/Action: include one clear measurable action within a timeline.",
    "Descriptions must be simple natural language (2-3 sentences), no headings, no labels like Surprise/Relevance/Action.",
    "Avoid repeating the same mechanism across ideas; each idea must feel materially different.",
    "Use specific actors, channels, and execution triggers rather than generic awareness phrasing.",
    "Return JSON only in this exact format:",
    '{"ideas":[{"method":"Revolution|RelatedWorlds|Re-expression|RandomLinks","title":"...","description":"...","linkToInsight":"...","linkToDriver":"...","feasibilityScore":1,"originalityScore":1,"strategicFitScore":1,"culturalFitScore":1}]}',
  ].join("\n");
}

function mapAiIdeaToIdea(
  candidate: AiIdeaOutput,
  fallback: Idea,
  fallbackMethod: Idea["method"],
  data: CampaignData,
): Idea {
  const method = parseMethod(candidate.method, fallbackMethod);
  const audience = toPhrase(data.audiences[0]?.segmentName || "", "priority audience", 10);
  const insight = toPhrase(data.insight.insightText || "", "core human tension", 14);
  const behaviorAction = toPhrase(data.behavior.desiredBehavior || "", "target behavior shift", 14);
  const executionMetric = pick(EXECUTION_METRICS, createRng(hash(`${fallback.id}|${method}|${insight}`)));
  const description = ensureDescriptionQuality(candidate.description || "", {
    audience,
    insight,
    behaviorAction,
    executionMetric,
  });
  const normalizedTitle = normalize(cleanAiText(candidate.title || ""))
    .replace(/^[-•\d.\s]+/, "")
    .slice(0, 96)
    .trim();

  return {
    ...fallback,
    method,
    title: normalizedTitle || fallback.title,
    description: description || fallback.description,
    linkToInsight: ensureLabeledLink(candidate.linkToInsight || "", "Insight", fallback.linkToInsight),
    linkToDriver: ensureLabeledLink(candidate.linkToDriver || "", "Driver", fallback.linkToDriver),
    feasibilityScore: clamp(Number(candidate.feasibilityScore) || fallback.feasibilityScore),
    originalityScore: clamp(Number(candidate.originalityScore) || fallback.originalityScore),
    strategicFitScore: clamp(Number(candidate.strategicFitScore) || fallback.strategicFitScore),
    culturalFitScore: clamp(Number(candidate.culturalFitScore) || fallback.culturalFitScore),
    selected: false,
  };
}

function extractAiIdeas(raw: string): AiIdeaOutput[] {
  const parsedEnvelope = parseJsonFromModelText<AiIdeasEnvelope>(raw);
  if (parsedEnvelope && Array.isArray(parsedEnvelope.ideas)) {
    return parsedEnvelope.ideas;
  }

  const parsedArray = parseJsonFromModelText<AiIdeaOutput[]>(raw);
  if (Array.isArray(parsedArray)) {
    return parsedArray;
  }

  return [];
}

function dedupeIdeas(ideas: Idea[], existingIdeas: Idea[]): Idea[] {
  const usedKeys = new Set(existingIdeas.map(ideaKey));
  const usedTitles = new Set(existingIdeas.map((idea) => idea.title.toLowerCase()));
  const signatureBank = existingIdeas.map(signatureTokens);
  const deduped: Idea[] = [];

  for (const idea of ideas) {
    const key = ideaKey(idea);
    const titleKey = idea.title.toLowerCase();
    const nextSignature = signatureTokens(idea);
    const isTooSimilar = signatureBank.some(
      (known) => similarityScore(known, nextSignature) >= SIMILARITY_THRESHOLD,
    );

    if (!usedKeys.has(key) && !usedTitles.has(titleKey) && !isTooSimilar) {
      usedKeys.add(key);
      usedTitles.add(titleKey);
      signatureBank.push(nextSignature);
      deduped.push(idea);
    }
  }

  return deduped;
}

export function generateIdeasForMethod(
  data: CampaignData,
  method: Idea["method"],
  count: number,
  existingIdeas: Idea[] = data.ideas,
  mode: IdeationCreativeMode = "balanced",
): Idea[] {
  const usedKeys = new Set(existingIdeas.map(ideaKey));
  const usedTitles = new Set(existingIdeas.map((idea) => idea.title.toLowerCase()));
  const signatureBank = existingIdeas.map(signatureTokens);
  const generated: Idea[] = [];

  let attempt = 0;
  while (generated.length < count && attempt < count * 60) {
    const candidate = buildIdea(method, data, existingIdeas.length + generated.length + 1, attempt, mode);
    const key = ideaKey(candidate);
    const titleKey = candidate.title.toLowerCase();
    const nextSignature = signatureTokens(candidate);
    const isTooSimilar = signatureBank.some(
      (known) => similarityScore(known, nextSignature) >= SIMILARITY_THRESHOLD,
    );

    if (!usedKeys.has(key) && !usedTitles.has(titleKey) && !isTooSimilar) {
      usedKeys.add(key);
      usedTitles.add(titleKey);
      signatureBank.push(nextSignature);
      generated.push(candidate);
    }

    attempt += 1;
  }

  let fallbackAttempt = 0;
  while (generated.length < count && fallbackAttempt < count * 30) {
    const base = buildIdea(
      method,
      data,
      existingIdeas.length + generated.length + 1,
      attempt + fallbackAttempt + 1000,
      mode,
    );
    const forced: Idea = {
      ...base,
      title: `${base.title} v${generated.length + 1}`,
      description: `${base.description} Variant ${generated.length + 1}.`,
    };
    const key = ideaKey(forced);
    const titleKey = forced.title.toLowerCase();

    if (!usedKeys.has(key) && !usedTitles.has(titleKey)) {
      usedKeys.add(key);
      usedTitles.add(titleKey);
      generated.push(forced);
    }

    fallbackAttempt += 1;
  }

  return generated;
}

export function generateIdeas(data: CampaignData, options: IdeationGenerationOptions): Idea[] {
  const methods = options.method ? [options.method] : METHODS;
  const perMethod = Math.max(1, Math.ceil(options.count / methods.length));
  const generated: Idea[] = [];
  const mode = options.mode ?? "balanced";

  for (const method of methods) {
    const chunk = generateIdeasForMethod(data, method, perMethod, [...data.ideas, ...generated], mode);
    generated.push(...chunk);
  }

  const ranked = rankIdeasByQuality(generated, data);
  return selectDiverseIdeas(ranked, options.count, options.method);
}

export async function generateIdeasWithAI(data: CampaignData, options: IdeationGenerationOptions): Promise<Idea[]> {
  const fallbackIdeas = generateIdeas(data, options);
  const prompt = buildAiPrompt(data, options);
  const mode = options.mode ?? "balanced";

  try {
    const raw = await generateTextViaApi(prompt);
    const aiIdeas = extractAiIdeas(raw).slice(0, options.count);

    if (aiIdeas.length === 0) {
      return fallbackIdeas;
    }

    const mapped = aiIdeas.map((candidate, index) => {
      const fallbackMethod = options.method ?? fallbackIdeas[index % Math.max(1, fallbackIdeas.length)]?.method ?? METHODS[index % METHODS.length];
      const fallback = buildIdea(fallbackMethod, data, data.ideas.length + index + 1, index + 1, mode);
      return mapAiIdeaToIdea(candidate, fallback, fallbackMethod, data);
    });

    const deduped = dedupeIdeas(mapped, data.ideas);
    const ranked = rankIdeasByQuality(deduped, data);
    const selected = selectDiverseIdeas(ranked, options.count, options.method);

    if (selected.length >= options.count) {
      return selected.slice(0, options.count);
    }

    const fallbackFill = dedupeIdeas(fallbackIdeas, [...data.ideas, ...selected]).slice(
      0,
      options.count - selected.length,
    );
    const combined = rankIdeasByQuality([...selected, ...fallbackFill], data);
    return selectDiverseIdeas(combined, options.count, options.method);
  } catch {
    return rankIdeasByQuality(fallbackIdeas, data).slice(0, options.count);
  }
}

export async function generateIdeasForMethodWithAI(
  data: CampaignData,
  method: Idea["method"],
  count: number,
  existingIdeas: Idea[] = data.ideas,
  mode: IdeationCreativeMode = "balanced",
): Promise<Idea[]> {
  const generated = await generateIdeasWithAI({ ...data, ideas: existingIdeas }, { count, method, mode });
  const deduped = rankIdeasByQuality(dedupeIdeas(generated, existingIdeas), data).slice(0, count);
  if (deduped.length >= count) {
    return deduped;
  }

  const fallbackFill = generateIdeasForMethod(
    { ...data, ideas: [...existingIdeas, ...deduped] },
    method,
    count - deduped.length,
    [...existingIdeas, ...deduped],
    mode,
  );

  return rankIdeasByQuality([...deduped, ...fallbackFill], data).slice(0, count);
}

export function filterIdeas(ideas: Idea[], query: string): Idea[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return ideas;
  }

  return ideas.filter((idea) => {
    const haystack = `${idea.title} ${idea.description} ${idea.linkToDriver} ${idea.linkToInsight}`.toLowerCase();
    return haystack.includes(normalized);
  });
}
