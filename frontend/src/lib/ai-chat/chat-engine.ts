import { CampaignData } from "@/types/campaign";
import { DriveFile } from "@/lib/drive-storage";
import { buildDocumentContext, DocumentCitation } from "@/lib/ai-chat/document-context-builder";
import { PlaceholderSearchConnector } from "@/lib/ai-chat/search-connector";
import { cleanAiText, generateTextViaApi } from "@/lib/ai/ai-client";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  citations?: DocumentCitation[];
}

export interface ChatTurnInput {
  prompt: string;
  campaign: CampaignData | null;
  driveFiles: DriveFile[];
  includeExternal?: boolean;
  taggedDocumentIds?: string[];
}

export interface ChatTurnResult {
  message: ChatMessage;
}

function buildId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `chat-${crypto.randomUUID()}`;
  }
  return `chat-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function compact(value: string, max = 700): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3)}...`;
}

function normalizePrompt(value: string): string {
  return value.replace(/^(prompt focus:\s*)+/i, "").replace(/\s+/g, " ").trim();
}

function classifyLocalIntent(prompt: string): "chat" | "task" {
  const normalized = normalizePrompt(prompt).toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);

  const socialPattern =
    /^(hi|hello|hey|yo|hola|good morning|good afternoon|good evening|how are you|thanks|thank you)\b/;
  const friendPattern =
    /\b(friend|friends|become friends|can we be friends|who are you|tell me about yourself|introduce yourself|your name)\b/;
  const getToKnowPattern = /\b(get to know each other|know each other|let us know each other|let's know each other)\b/;

  if ((socialPattern.test(normalized) && words.length <= 12) || friendPattern.test(normalized) || getToKnowPattern.test(normalized)) {
    return "chat";
  }

  return "task";
}

function isCampaignTaskPrompt(prompt: string): boolean {
  const normalized = normalizePrompt(prompt).toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /\b(campaign|brief|communication brief|creative brief|ideation|idea|concept|audience|behavior|behaviour|driver|motive|insight|sbcc|message|messaging|channel|kpi|cta)\b/.test(
      normalized,
    ) ||
    /\b(behavior change|behaviour change|target audience|target behavior|desired behavior)\b/.test(normalized)
  );
}

function buildFastLocalSocialReply(prompt: string): string {
  const normalized = normalizePrompt(prompt).toLowerCase();
  if (/\bhow are you\b/.test(normalized)) {
    return "I’m doing well, thanks. What can I help you with?";
  }
  if (/\b(can we be friends|become friends|friends?)\b/.test(normalized)) {
    return "Absolutely. I’m here as your AI teammate whenever you need support.";
  }
  if (/^(thanks|thank you)\b/.test(normalized)) {
    return "You’re welcome. Ready when you are.";
  }
  return "Hello! I’m here and ready to help.";
}

function createFallbackRecommendations(prompt: string, campaign: CampaignData | null): string[] {
  if (!isCampaignTaskPrompt(prompt)) {
    return [
      "State the exact output you want (summary, analysis, plan, rewrite, or brainstorm).",
      "Add any constraints (audience, tone, length, deadline) so the output is precise.",
      "Tag files with #filename when you want evidence-grounded answers from AI Drive.",
    ];
  }

  const recommendations = [
    "Use one clear behavior prompt with a measurable action.",
    "Test two variants: one surprise-led and one relevance-led.",
    "Track adoption and completion in a weekly learning loop.",
  ];

  if (campaign) {
    recommendations.unshift(
      `Align to ${campaign.audiences[0]?.segmentName || "priority audience"} and target action: ${campaign.behavior.desiredBehavior}.`,
    );
  }

  if (prompt.toLowerCase().includes("brief")) {
    recommendations.push("Translate outputs into communication and creative brief fields after review.");
  }

  return recommendations;
}

function buildTaggedDocumentSummary(context: ReturnType<typeof buildDocumentContext>, taggedDocumentIds: string[]): string {
  if (taggedDocumentIds.length === 0) {
    return "Tagged documents: none";
  }

  const tagged = context.citations.filter((citation) => taggedDocumentIds.includes(citation.id));
  if (tagged.length === 0) {
    return "Tagged documents: selected tags were not found in available AI Drive files.";
  }

  return `Tagged documents:\n${tagged
    .map((citation, index) => `${index + 1}. ${citation.label}: ${citation.excerpt}`)
    .join("\n")}`;
}

function buildChatPrompt(input: ChatTurnInput, context: ReturnType<typeof buildDocumentContext>, externalNotes: string): string {
  const taggedDocumentIds = Array.from(new Set((input.taggedDocumentIds ?? []).filter(Boolean)));
  const campaignTask = isCampaignTaskPrompt(input.prompt);
  const lines = [
    "You are a high-quality AI assistant.",
    "Default to general-purpose assistance unless the user explicitly asks for campaign or behaviour-change work.",
    "Do not force campaign framing for normal conversation or general tasks.",
    `User prompt: ${input.prompt}`,
    campaignTask ? `Campaign context: ${context.campaignSummary}` : "",
    context.citations.length > 0 ? `Document context: ${context.documentSummary}` : "",
    context.citations.length > 0 ? buildTaggedDocumentSummary(context, taggedDocumentIds) : "",
    context.citations.length > 0
      ? `Document snippets:\n${context.citations.map((citation, index) => `${index + 1}. ${citation.excerpt}`).join("\n")}`
      : "",
    externalNotes || "",
    "Response rules:",
    "1) Keep answer concise and actionable.",
    "2) If the request is campaign-related, include concrete behavior-change recommendations.",
    "3) If evidence is weak, state assumptions clearly.",
    "4) Do not expose internal chain-of-thought.",
  ];

  return lines.filter(Boolean).join("\n\n");
}

export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const context = buildDocumentContext(
    input.campaign,
    input.driveFiles,
    input.prompt,
    input.taggedDocumentIds ?? [],
  );
  const externalConnector = new PlaceholderSearchConnector();
  const externalResults = input.includeExternal ? await externalConnector.search(input.prompt) : [];

  const externalNotes = externalResults.length > 0
    ? `External references:\n${externalResults
        .map((result, index) => `${index + 1}. ${result.title} (${result.url}) - ${result.snippet}`)
        .join("\n")}`
    : "";

  const prompt = buildChatPrompt(input, context, externalNotes);

  try {
    const aiResult = await generateTextViaApi(prompt);
    const content = cleanAiText(aiResult);

    return {
      message: {
        id: buildId(),
        role: "assistant",
        content: content || "I could not generate a response from the current context.",
        createdAt: nowIso(),
        citations: context.citations,
      },
    };
  } catch {
    const intent = classifyLocalIntent(input.prompt);
    if (intent === "chat") {
      return {
        message: {
          id: buildId(),
          role: "assistant",
          content: buildFastLocalSocialReply(input.prompt),
          createdAt: nowIso(),
          citations: [],
        },
      };
    }

    const recommendations = createFallbackRecommendations(input.prompt, input.campaign);
    const normalizedPrompt = normalizePrompt(input.prompt);
    const campaignTask = isCampaignTaskPrompt(input.prompt);
    const lines = [
      `I can help with that. Here’s a practical starting point for: ${compact(normalizedPrompt, 180)}.`,
      campaignTask ? `Campaign context: ${context.campaignSummary}.` : "",
      context.citations.length > 0 ? `Document context: ${context.documentSummary}.` : "",
      "Recommended next steps:",
      ...recommendations.map((recommendation, index) => `${index + 1}. ${recommendation}`),
    ];

    if (externalResults.length > 0) {
      lines.push("External references:");
      lines.push(...externalResults.map((result, index) => `${index + 1}. ${result.title} (${result.url}) - ${result.snippet}`));
    }

    return {
      message: {
        id: buildId(),
        role: "assistant",
        content: lines.filter(Boolean).join("\n"),
        createdAt: nowIso(),
        citations: context.citations,
      },
    };
  }
}
