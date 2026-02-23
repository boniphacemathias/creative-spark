import { CampaignData } from "@/types/campaign";
import { DriveFile } from "@/lib/drive-storage";

export interface DocumentCitation {
  id: string;
  label: string;
  excerpt: string;
}

export interface ChatContextBundle {
  campaignSummary: string;
  documentSummary: string;
  citations: DocumentCitation[];
}

function compact(value: string, maxLength = 220): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function scoreFile(file: DriveFile, query: string): number {
  const q = query.toLowerCase();
  const haystack = `${file.name} ${file.tags.join(" ")} ${file.extractedText}`.toLowerCase();

  if (!q) {
    return 0;
  }

  let score = 0;
  if (haystack.includes(q)) {
    score += 5;
  }

  const terms = q.split(/\s+/).filter(Boolean);
  for (const term of terms) {
    if (haystack.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function uniqueById(files: DriveFile[]): DriveFile[] {
  const seen = new Set<string>();
  const unique: DriveFile[] = [];

  for (const file of files) {
    if (seen.has(file.id)) {
      continue;
    }
    seen.add(file.id);
    unique.push(file);
  }

  return unique;
}

export function buildDocumentContext(
  campaign: CampaignData | null,
  files: DriveFile[],
  query: string,
  taggedDocumentIds: string[] = [],
  limit = 4,
): ChatContextBundle {
  const normalizedTaggedIds = Array.from(
    new Set(
      taggedDocumentIds
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  );
  const fileById = new Map(files.map((file) => [file.id, file]));
  const taggedFiles = normalizedTaggedIds
    .map((id) => fileById.get(id))
    .filter((file): file is DriveFile => Boolean(file));

  const rankedFiles = [...files]
    .filter((file) => !normalizedTaggedIds.includes(file.id))
    .map((file) => ({ file, score: scoreFile(file, query) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.file);
  const mergedFiles = uniqueById([...taggedFiles, ...rankedFiles]);
  const boundedFiles = mergedFiles.slice(0, Math.max(limit, taggedFiles.length, 1));

  const citations: DocumentCitation[] = boundedFiles.map((file) => ({
    id: file.id,
    label: file.name,
    excerpt: compact(file.extractedText || "No extracted text available.", 200),
  }));

  const campaignSummary = campaign
    ? compact(
        `${campaign.campaign.name} in ${campaign.campaign.country}. Insight: ${campaign.insight.insightText}. Desired behavior: ${campaign.behavior.desiredBehavior}. Driver: ${campaign.driver.driverText}.`,
        320,
      )
    : "No campaign selected.";

  const documentSummary = citations.length > 0
    ? citations.map((citation, index) => `[${index + 1}] ${citation.label}: ${citation.excerpt}`).join("\n")
    : "No relevant AI Drive documents found.";

  return {
    campaignSummary,
    documentSummary,
    citations,
  };
}
