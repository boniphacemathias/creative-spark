import { CampaignData } from "@/types/campaign";
import {
  automateCampaignFromDocumentsWithAI,
  generateCommunicationBriefPatchWithAI,
  generateCreativeBriefFromCampaignWithAI,
  regenerateCampaignIdeasWithAI,
  regenerateConceptsWithAI,
} from "@/lib/ai-engine/campaign-automation";
import { listDriveFiles } from "@/lib/drive-api";
import { DriveFile } from "@/lib/drive-storage";
import { ResearchDocumentInput } from "@/lib/ai-engine/research-parser";

export type AutoFillStep =
  | "research"
  | "communicationBrief"
  | "creativeBrief"
  | "ideation"
  | "concepts";

export interface AutoFillExecutionInput {
  step: AutoFillStep;
  campaign: CampaignData;
  campaignId: string;
  taggedDocumentIds?: string[];
  availableDriveFiles?: DriveFile[];
}

export interface AutoFillExecutionResult {
  step: AutoFillStep;
  patch: Partial<CampaignData>;
  sourceCount?: number;
  sourceNames?: string[];
}

const FILL_ACTION_PATTERN = /\b(fill|filling|auto[- ]?fill|populate|complete|pre[- ]?fill|proceed)\b/i;
const FIELD_LABEL_PATTERN = /field label:\s*([^\n\r]+)/i;
const BINARY_FILE_PATTERN = /^binary file uploaded:/i;
const CONTINUATION_PROMPT_PATTERN =
  /^(ok(ay)?|sure|yes|yep|continue|proceed|go ahead|do it|run it|apply|proceed now|okay proceed)[.! ]*$/i;

const RESEARCH_LABEL_KEYWORDS = [
  "business situation",
  "problem / opportunity",
  "prior learnings",
  "business objective",
  "communication objective",
  "audience",
  "human insight",
  "driver",
  "behavior",
];

const COMM_BRIEF_LABEL_KEYWORDS = [
  "message map",
  "channels & roles",
  "media/activation plan",
  "content themes",
  "measurement & learning plan",
  "governance, risks & approvals",
  "timeline",
];

const CREATIVE_LABEL_KEYWORDS = [
  "project overview",
  "single-minded objective",
  "key proposition",
  "reasons to believe",
  "tone and personality",
  "deliverables (exact specs)",
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAnyKeyword(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword));
}

function inferStepFromFieldLabel(fieldLabel: string): AutoFillStep | null {
  const normalized = normalizeText(fieldLabel);

  if (hasAnyKeyword(normalized, RESEARCH_LABEL_KEYWORDS)) {
    return "research";
  }
  if (hasAnyKeyword(normalized, COMM_BRIEF_LABEL_KEYWORDS)) {
    return "communicationBrief";
  }
  if (hasAnyKeyword(normalized, CREATIVE_LABEL_KEYWORDS)) {
    return "creativeBrief";
  }
  if (normalized.includes("idea") || normalized.includes("4rs") || normalized.includes("ideation")) {
    return "ideation";
  }
  if (normalized.includes("concept") || normalized.includes("big idea") || normalized.includes("tagline")) {
    return "concepts";
  }
  return null;
}

function detectSlashCommandStep(prompt: string): AutoFillStep | null {
  const normalized = normalizeText(prompt);
  if (!normalized.startsWith("/")) {
    return null;
  }

  const match = normalized.match(
    /^\/(?:fill|autofill|auto-fill)\s+(research|communication|communication-brief|communicationbrief|comm|creative|creative-brief|creativebrief|ideation|ideas|concept|concepts)\b/,
  );
  if (!match?.[1]) {
    return null;
  }

  const rawStep = match[1];
  if (rawStep === "research") {
    return "research";
  }
  if (
    rawStep === "communication" ||
    rawStep === "communication-brief" ||
    rawStep === "communicationbrief" ||
    rawStep === "comm"
  ) {
    return "communicationBrief";
  }
  if (
    rawStep === "creative" ||
    rawStep === "creative-brief" ||
    rawStep === "creativebrief"
  ) {
    return "creativeBrief";
  }
  if (rawStep === "ideation" || rawStep === "ideas") {
    return "ideation";
  }
  return "concepts";
}

export function detectAutoFillStepFromPrompt(prompt: string): AutoFillStep | null {
  const normalized = normalizeText(prompt);
  if (!normalized) {
    return null;
  }

  const slashCommandStep = detectSlashCommandStep(prompt);
  if (slashCommandStep) {
    return slashCommandStep;
  }

  const fieldLabelMatch = prompt.match(FIELD_LABEL_PATTERN);
  if (fieldLabelMatch?.[1]) {
    const inferred = inferStepFromFieldLabel(fieldLabelMatch[1]);
    if (inferred) {
      return inferred;
    }
  }

  if (!FILL_ACTION_PATTERN.test(normalized)) {
    return null;
  }

  if (
    /\bresearch\b/.test(normalized) ||
    /\b(situation|problem|insight|driver|audience|prior learnings)\b/.test(normalized)
  ) {
    return "research";
  }

  if (
    /\b(communication brief|comm brief|message map|channels|media plan|measurement plan|governance|timeline)\b/.test(
      normalized,
    )
  ) {
    return "communicationBrief";
  }

  if (
    /\b(creative brief|key proposition|single-minded objective|deliverables)\b/.test(normalized)
  ) {
    return "creativeBrief";
  }

  if (/\b(ideation|4rs|ideas)\b/.test(normalized)) {
    return "ideation";
  }

  if (/\b(concept|concepts|tagline|big idea)\b/.test(normalized)) {
    return "concepts";
  }

  return null;
}

export function isAutoFillContinuationPrompt(prompt: string): boolean {
  const normalized = normalizeText(prompt);
  if (!normalized) {
    return false;
  }
  return CONTINUATION_PROMPT_PATTERN.test(normalized);
}

export function resolveAutoFillStepFromPromptContext(
  prompt: string,
  previousUserPrompts: string[] = [],
): AutoFillStep | null {
  const directStep = detectAutoFillStepFromPrompt(prompt);
  if (directStep) {
    return directStep;
  }

  if (!isAutoFillContinuationPrompt(prompt)) {
    return null;
  }

  for (let index = previousUserPrompts.length - 1; index >= 0; index -= 1) {
    const inferred = detectAutoFillStepFromPrompt(previousUserPrompts[index] ?? "");
    if (inferred) {
      return inferred;
    }
  }

  return null;
}

function isReadableDriveFile(file: DriveFile): boolean {
  const extracted = String(file.extractedText || "").trim();
  if (!extracted) {
    return false;
  }
  if (BINARY_FILE_PATTERN.test(extracted)) {
    return false;
  }
  return extracted.length >= 20;
}

function buildResearchDocuments(files: DriveFile[]): ResearchDocumentInput[] {
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    type: file.mimeType,
    text: file.extractedText,
  }));
}

function pickResearchPatch(patch: Partial<CampaignData>): Partial<CampaignData> {
  const output: Partial<CampaignData> = {};
  if (patch.audiences !== undefined) output.audiences = patch.audiences;
  if (patch.behavior !== undefined) output.behavior = patch.behavior;
  if (patch.insight !== undefined) output.insight = patch.insight;
  if (patch.driver !== undefined) output.driver = patch.driver;
  if (patch.situation !== undefined) output.situation = patch.situation;
  if (patch.problem !== undefined) output.problem = patch.problem;
  if (patch.priorLearnings !== undefined) output.priorLearnings = patch.priorLearnings;
  if (patch.businessObjective !== undefined) output.businessObjective = patch.businessObjective;
  if (patch.communicationObjective !== undefined) {
    output.communicationObjective = patch.communicationObjective;
  }
  return output;
}

async function collectDriveFilesForAutoFill(
  campaignId: string,
  availableDriveFiles: DriveFile[] = [],
): Promise<DriveFile[]> {
  if (availableDriveFiles.length > 0) {
    return availableDriveFiles;
  }
  const [scopedFiles, globalFiles] = await Promise.all([
    listDriveFiles(campaignId),
    listDriveFiles(null),
  ]);
  const byId = new Map<string, DriveFile>();
  for (const file of [...scopedFiles, ...globalFiles]) {
    if (!byId.has(file.id)) {
      byId.set(file.id, file);
    }
  }
  return [...byId.values()];
}

function selectDriveFiles(
  files: DriveFile[],
  taggedDocumentIds: string[] = [],
): DriveFile[] {
  const readable = files.filter(isReadableDriveFile);
  if (taggedDocumentIds.length === 0) {
    return readable;
  }

  const taggedSet = new Set(taggedDocumentIds);
  const taggedReadable = readable.filter((file) => taggedSet.has(file.id));
  return taggedReadable.length > 0 ? taggedReadable : readable;
}

export async function executeCampaignAutoFillStep(
  input: AutoFillExecutionInput,
): Promise<AutoFillExecutionResult> {
  const { step, campaign, campaignId } = input;

  if (step === "research") {
    const files = await collectDriveFilesForAutoFill(campaignId, input.availableDriveFiles);
    const selectedFiles = selectDriveFiles(files, input.taggedDocumentIds);
    if (selectedFiles.length === 0) {
      throw new Error("No readable AI Drive documents found. Upload or tag document(s) first.");
    }

    const documents = buildResearchDocuments(selectedFiles);
    const automated = await automateCampaignFromDocumentsWithAI(campaign, documents);
    return {
      step,
      patch: pickResearchPatch(automated.patch),
      sourceCount: automated.parsed.sourceNames.length,
      sourceNames: automated.parsed.sourceNames,
    };
  }

  if (step === "communicationBrief") {
    const patch = await generateCommunicationBriefPatchWithAI(campaign);
    return {
      step,
      patch,
    };
  }

  if (step === "creativeBrief") {
    const creativeBrief = await generateCreativeBriefFromCampaignWithAI(campaign);
    return {
      step,
      patch: {
        creativeBrief,
      },
    };
  }

  if (step === "ideation") {
    const ideas = await regenerateCampaignIdeasWithAI(campaign, 6);
    return {
      step,
      patch: {
        ideas,
      },
    };
  }

  const baseIdeas =
    campaign.ideas.length > 0 ? campaign.ideas : await regenerateCampaignIdeasWithAI(campaign, 6);
  const concepts = await regenerateConceptsWithAI({
    ...campaign,
    ideas: baseIdeas,
  });
  return {
    step,
    patch: {
      ideas: campaign.ideas.length > 0 ? campaign.ideas : baseIdeas,
      concepts,
    },
  };
}

export function autoFillStepLabel(step: AutoFillStep): string {
  if (step === "research") return "Research";
  if (step === "communicationBrief") return "Communication Brief";
  if (step === "creativeBrief") return "Creative Brief";
  if (step === "ideation") return "4Rs Ideation";
  return "Concept Development";
}

export function buildAutoFillSuccessMessage(result: AutoFillExecutionResult): string {
  const stepLabel = autoFillStepLabel(result.step);
  if (result.step === "research") {
    const sourceText =
      result.sourceCount && result.sourceCount > 0
        ? ` using ${result.sourceCount} AI Drive source${result.sourceCount > 1 ? "s" : ""}`
        : "";
    return `Done. I auto-filled all ${stepLabel} fields${sourceText}.`;
  }
  return `Done. I auto-filled all ${stepLabel} fields.`;
}
