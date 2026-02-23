import { sampleCampaignData } from "@/data/sampleCampaign";
import { CampaignError } from "@/domain/campaign/errors";
import { parseCampaignData } from "@/domain/campaign/schema";
import {
  CampaignRepository,
  LocalCampaignRepository,
} from "@/repositories/campaign-repository";
import { LocalStorageKV } from "@/lib/storage/local-storage-kv";
import { CampaignData } from "@/types/campaign";

function cloneCampaign(data: CampaignData): CampaignData {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }

  return JSON.parse(JSON.stringify(data)) as CampaignData;
}

function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function createCampaignId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `campaign-${crypto.randomUUID()}`;
  }

  return `campaign-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export interface CreateCampaignOptions {
  name?: string;
  country?: string;
  languages?: string[];
}

export interface CampaignImportResult {
  imported: number;
  skipped: number;
  mode: "merge" | "replace";
}

export interface CampaignStorageStats {
  total: number;
  byStatus: Record<CampaignData["campaign"]["status"], number>;
}

export class CampaignService {
  constructor(
    private readonly repository: CampaignRepository,
    private readonly sampleFactory: () => CampaignData,
  ) {}

  listCampaigns(): CampaignData[] {
    this.seedDefaultIfEmpty();
    return this.repository.list().map((record) => cloneCampaign(record.data));
  }

  getCampaignById(id: string): CampaignData | null {
    const record = this.repository.getById(id);
    return record ? cloneCampaign(record.data) : null;
  }

  createCampaign(options: CreateCampaignOptions = {}): CampaignData {
    this.seedDefaultIfEmpty();

    const base = this.sampleFactory();
    const now = new Date();
    const startDate = nowDate();
    const endDate = addMonths(now, 6).toISOString().slice(0, 10);
    const id = createCampaignId();

    const created = parseCampaignData({
      ...base,
      campaign: {
        ...base.campaign,
        id,
        name: options.name ?? "Untitled Campaign",
        country: options.country ?? base.campaign.country,
        languages: options.languages ?? base.campaign.languages,
        startDate,
        endDate,
        status: "draft",
      },
      ideas: base.ideas.map((idea) => ({ ...idea, selected: false })),
      concepts: [],
      collaboration: {
        members: base.collaboration.members,
        messages: [],
      },
    });

    return cloneCampaign(this.repository.create(created).data);
  }

  saveCampaign(data: CampaignData): CampaignData {
    this.seedDefaultIfEmpty();
    return cloneCampaign(this.repository.upsert(data).data);
  }

  updateCampaign(id: string, updater: (existing: CampaignData) => CampaignData): CampaignData {
    const current = this.getCampaignById(id);
    if (!current) {
      throw new CampaignError("NOT_FOUND", `Campaign not found: ${id}`);
    }

    const next = parseCampaignData(updater(cloneCampaign(current)));
    return cloneCampaign(this.repository.update(id, next).data);
  }

  deleteCampaign(id: string): boolean {
    return this.repository.delete(id);
  }

  duplicateCampaign(id: string): CampaignData {
    const source = this.getCampaignById(id);
    if (!source) {
      throw new CampaignError("NOT_FOUND", `Campaign not found: ${id}`);
    }

    const duplicated = parseCampaignData({
      ...source,
      campaign: {
        ...source.campaign,
        id: createCampaignId(),
        name: `${source.campaign.name} (Copy)`,
        status: "draft",
      },
      concepts: source.concepts.map((concept) => ({
        ...concept,
        id: `${concept.id}-copy-${Date.now()}`,
        status: "draft",
      })),
    });

    return cloneCampaign(this.repository.create(duplicated).data);
  }

  replaceAll(campaigns: CampaignData[]): CampaignData[] {
    return this.repository.replaceAll(campaigns).map((record) => cloneCampaign(record.data));
  }

  exportCampaigns(): string {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      campaigns: this.listCampaigns(),
    } as const;

    return JSON.stringify(payload, null, 2);
  }

  importCampaigns(raw: string, mode: "merge" | "replace" = "merge"): CampaignImportResult {
    const parsed = JSON.parse(raw) as unknown;
    const fromBundle =
      typeof parsed === "object" && parsed !== null && "campaigns" in parsed
        ? (parsed as { campaigns: unknown }).campaigns
        : parsed;

    const candidates = Array.isArray(fromBundle) ? fromBundle : [];
    const validCampaigns: CampaignData[] = [];
    let skipped = 0;

    for (const candidate of candidates) {
      try {
        validCampaigns.push(parseCampaignData(candidate));
      } catch {
        skipped += 1;
      }
    }

    if (mode === "replace") {
      this.replaceAll(validCampaigns);
      return { imported: validCampaigns.length, skipped, mode };
    }

    for (const campaign of validCampaigns) {
      this.repository.upsert(campaign);
    }

    return { imported: validCampaigns.length, skipped, mode };
  }

  resetToDefaultSample(): CampaignData[] {
    const seed = parseCampaignData(this.sampleFactory());
    return this.replaceAll([seed]);
  }

  getStorageStats(): CampaignStorageStats {
    const campaigns = this.listCampaigns();
    const byStatus: CampaignStorageStats["byStatus"] = {
      draft: 0,
      in_review: 0,
      final: 0,
    };

    for (const campaign of campaigns) {
      byStatus[campaign.campaign.status] += 1;
    }

    return {
      total: campaigns.length,
      byStatus,
    };
  }

  private seedDefaultIfEmpty(): void {
    if (this.repository.list().length > 0) {
      return;
    }

    const seed = parseCampaignData(this.sampleFactory());
    this.repository.create(seed);
  }
}

let singleton: CampaignService | null = null;

export function getCampaignService(): CampaignService {
  if (!singleton) {
    singleton = new CampaignService(new LocalCampaignRepository(new LocalStorageKV()), () => cloneCampaign(sampleCampaignData));
  }

  return singleton;
}

export function resetCampaignServiceForTests(service?: CampaignService): void {
  singleton = service ?? null;
}
