import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampaignData, CreativeBriefData, CreativeBriefDeliverable, DEFAULT_CREATIVE_BRIEF } from "@/types/campaign";
import { Palette, Sparkles, Download, Trash2, RefreshCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { type ReactNode, useState } from "react";
import {
  deriveCreativeBriefFromCampaignContext,
  generateCreativeBriefFromCampaign,
  generateCreativeBriefFromCampaignWithAI,
} from "@/lib/ai-engine/campaign-automation";
import { downloadPresentationPpt } from "@/lib/presentation-ppt";
import { EvidencePanel } from "@/components/campaign/EvidencePanel";

interface Props {
  data: CampaignData;
  onChange: (d: Partial<CampaignData>) => void;
}

function BriefSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-primary/80">{title}</h4>
      {children}
    </div>
  );
}

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toHtmlList(value: string): string {
  const lines = splitLines(value);
  if (lines.length === 0) {
    return "<p>-</p>";
  }
  return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
}

function toDocumentHtml(data: CampaignData): string {
  const brief = data.creativeBrief;
  const deliverables = brief.deliverables.length > 0 ? brief.deliverables : DEFAULT_CREATIVE_BRIEF.deliverables;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Creative Brief</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.35; margin: 0; padding: 0; }
      .page {
        border: 2px solid #7f8c8d;
        margin: 16px;
        padding: 14px 18px;
        background-color: #fff;
        box-sizing: border-box;
        max-width: 100%;
        overflow: hidden;
      }
      h1 { font-size: 18pt; margin: 0 0 12px; }
      h2 { font-size: 12pt; margin: 14px 0 6px; font-weight: bold; }
      h3 { font-size: 11pt; margin: 10px 0 4px; font-weight: bold; }
      table {
        border-collapse: collapse;
        width: 100%;
        margin-top: 8px;
        max-width: 100%;
        mso-table-lspace: 0pt;
        mso-table-rspace: 0pt;
      }
      th, td {
        border: 1px solid #999;
        padding: 6px;
        vertical-align: top;
        text-align: left;
        overflow-wrap: anywhere;
        word-wrap: break-word;
        word-break: break-word;
        white-space: normal;
      }
      ul { margin: 4px 0 8px 16px; }
      p { margin: 4px 0; }
      .meta td:first-child { width: 180px; font-weight: bold; }
      .deliverables { table-layout: fixed; }
      .deliverables th:nth-child(1) { width: 17%; }
      .deliverables th:nth-child(2) { width: 15%; }
      .deliverables th:nth-child(3) { width: 12%; }
      .deliverables th:nth-child(4) { width: 16%; }
      .deliverables th:nth-child(5) { width: 13%; }
      .deliverables th:nth-child(6) { width: 11%; }
      .deliverables th:nth-child(7) { width: 16%; }
      .deliverables th, .deliverables td { font-size: 10pt; }
      .deliverables td, .deliverables th { max-width: 0; }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>CREATIVE BRIEF — ${escapeHtml(data.campaign.name)}</h1>
      <table class="meta">
        <tbody>
          <tr><td>ACTIVITY NAME</td><td>${escapeHtml(brief.activityName)}</td></tr>
          <tr><td>AGENCY NAME</td><td>${escapeHtml(brief.agencyName)}</td></tr>
          <tr><td>DATE</td><td>${escapeHtml(data.campaign.startDate)}</td></tr>
          <tr><td>OWNER</td><td>${escapeHtml(brief.owner)}</td></tr>
          <tr><td>AUDIENCE</td><td>${escapeHtml(brief.audience)}</td></tr>
          <tr><td>PURPOSE</td><td>${escapeHtml(brief.purpose)}</td></tr>
        </tbody>
      </table>

      <h2>Project Overview</h2>
      <p><strong>Project name:</strong> ${escapeHtml(brief.projectName)}</p>
      <p>${escapeHtml(brief.projectOverview)}</p>

      <h2>Background</h2>
      ${toHtmlList(brief.background)}

      <h2>Single-minded objective</h2>
      <p>${escapeHtml(brief.singleMindedObjective)}</p>

      <h2>Audience Snapshot</h2>
      <p><strong>Who are they?</strong></p>
      ${toHtmlList(brief.audienceWho)}
      <p><strong>Problem/tension</strong></p>
      ${toHtmlList(brief.audienceTension)}
      <p><strong>Desired change</strong></p>
      ${toHtmlList(brief.audienceDesiredChange)}

      <h2>The Idea</h2>
      <p><strong>SMP / Key proposition (≤12 words):</strong> ${escapeHtml(brief.keyProposition)}</p>
      <p><strong>Reasons-to-believe (RTBs)</strong></p>
      ${toHtmlList(brief.reasonsToBelieve)}
      <p><strong>Tone & personality</strong></p>
      ${toHtmlList(brief.toneAndPersonality)}
      <p><strong>Cultural cues — To Embrace</strong></p>
      ${toHtmlList(brief.culturalCuesEmbrace)}
      <p><strong>Cultural cues — To Avoid</strong></p>
      ${toHtmlList(brief.culturalCuesAvoid)}

      <h2>Mandatories & Brand Guardrails</h2>
      <p><strong>Logo usage</strong></p>
      ${toHtmlList(brief.logoUsage)}
      <p><strong>Colors/typography</strong></p>
      ${toHtmlList(brief.colorsTypography)}
      <p><strong>Legal</strong></p>
      ${toHtmlList(brief.legal)}
      <p><strong>DO examples</strong></p>
      ${toHtmlList(brief.doExamples)}
      <p><strong>DON'T examples</strong></p>
      ${toHtmlList(brief.dontExamples)}

      <h2>Deliverables (Exact Specs)</h2>
      <table class="deliverables">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Platform</th>
            <th>Format</th>
            <th>Dimensions/Duration</th>
            <th>Copy limits</th>
            <th>Language(s)</th>
            <th>Accessibility</th>
          </tr>
        </thead>
        <tbody>
          ${deliverables
            .map(
              (row) =>
                `<tr>
                  <td>${escapeHtml(row.asset) || "-"}</td>
                  <td>${escapeHtml(row.platform) || "-"}</td>
                  <td>${escapeHtml(row.format) || "-"}</td>
                  <td>${escapeHtml(row.dimensionsDuration) || "-"}</td>
                  <td>${escapeHtml(row.copyLimits) || "-"}</td>
                  <td>${escapeHtml(row.languages) || "-"}</td>
                  <td>${escapeHtml(row.accessibility) || "-"}</td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  </body>
</html>`;
}

export function CreativeBriefStep({ data, onChange }: Props) {
  const { toast } = useToast();
  const brief = data.creativeBrief;
  const activeConcept = data.concepts[0];
  const primaryAudience = data.audiences[0];
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const updateBrief = (patch: Partial<CreativeBriefData>) => {
    onChange({
      creativeBrief: {
        ...brief,
        ...patch,
      },
    });
  };

  const updateDeliverable = (
    id: string,
    field: keyof Omit<CreativeBriefDeliverable, "id">,
    value: string,
  ) => {
    updateBrief({
      deliverables: brief.deliverables.map((entry) => (entry.id === id ? { ...entry, [field]: value } : entry)),
    });
  };

  const addDeliverable = () => {
    updateBrief({
      deliverables: [
        ...brief.deliverables,
        {
          id: `creative-deliverable-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          asset: "",
          platform: "",
          format: "",
          dimensionsDuration: "",
          copyLimits: "",
          languages: "",
          accessibility: "",
        },
      ],
    });
  };

  const removeDeliverable = (id: string) => {
    updateBrief({
      deliverables: brief.deliverables.filter((entry) => entry.id !== id),
    });
  };

  const syncFromPreviousSteps = () => {
    const syncedBrief = deriveCreativeBriefFromCampaignContext(data);
    onChange({ creativeBrief: syncedBrief });
    toast({
      title: "Creative brief synced",
      description: "Aligned with setup, research, communication brief, and concept selections.",
    });
  };

  const generateDraft = async () => {
    if (isGeneratingDraft) {
      return;
    }

    setIsGeneratingDraft(true);
    try {
      const contextSyncedData: CampaignData = {
        ...data,
        creativeBrief: deriveCreativeBriefFromCampaignContext(data),
      };
      const next: CreativeBriefData = await generateCreativeBriefFromCampaignWithAI(contextSyncedData);
      if (primaryAudience && !hasText(next.audienceWho)) {
        next.audienceWho = primaryAudience.segmentName;
      }
      if (activeConcept && !hasText(next.keyProposition)) {
        next.keyProposition = activeConcept.tagline || activeConcept.smp;
      }

      onChange({ creativeBrief: next });
      toast({
        title: "Draft generated",
        description: "Creative brief fields were AI-generated from campaign context.",
      });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const exportBrief = () => {
    const exportData: CampaignData = {
      ...data,
      creativeBrief: generateCreativeBriefFromCampaign(data),
    };
    const payload = toDocumentHtml(exportData);
    const blob = new Blob([payload], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportData.campaign.name.toLowerCase().replace(/\s+/g, "-")}-creative-brief.doc`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPresentation = () => {
    const exportData: CampaignData = {
      ...data,
      creativeBrief: generateCreativeBriefFromCampaign(data),
    };
    const exportBriefData = exportData.creativeBrief;

    downloadPresentationPpt({
      filename: `${exportData.campaign.name}-creative-brief`,
      title: "Creative Brief",
      subtitle: "What we are making and why it will work",
      campaignName: exportData.campaign.name,
      complianceTag: `${(exportData.approvals || []).filter((entry) => entry.status === "approved").length} approval(s) signed`,
      slides: [
        {
          heading: "Project Overview",
          paragraphs: [
            `Project: ${exportBriefData.projectName || "Untitled project"}`,
            exportBriefData.projectOverview || "No overview provided.",
          ],
          bullets: [
            `Single-minded objective: ${exportBriefData.singleMindedObjective || "Not provided."}`,
            `Purpose: ${exportBriefData.purpose || "Not provided."}`,
          ],
        },
        {
          heading: "Audience Snapshot",
          bullets: [
            `Who: ${exportBriefData.audienceWho || "Not provided."}`,
            `Tension: ${exportBriefData.audienceTension || "Not provided."}`,
            `Desired Change: ${exportBriefData.audienceDesiredChange || "Not provided."}`,
          ],
        },
        {
          heading: "Creative Proposition",
          bullets: [
            `Key Proposition: ${exportBriefData.keyProposition || "Not provided."}`,
            `Reasons to Believe: ${exportBriefData.reasonsToBelieve || "Not provided."}`,
            `Tone and Personality: ${exportBriefData.toneAndPersonality || "Not provided."}`,
          ],
        },
        {
          heading: "Brand Guardrails",
          bullets: [
            `Logo Usage: ${exportBriefData.logoUsage || "Not provided."}`,
            `Colors / Typography: ${exportBriefData.colorsTypography || "Not provided."}`,
            `Do: ${exportBriefData.doExamples || "Not provided."}`,
            `Don't: ${exportBriefData.dontExamples || "Not provided."}`,
          ],
        },
        {
          heading: "Deliverables",
          table: {
            headers: ["Asset", "Platform", "Format", "Dimensions/Duration", "Copy Limits", "Languages"],
            rows:
              exportBriefData.deliverables.length > 0
                ? exportBriefData.deliverables.map((item) => [
                    item.asset || "-",
                    item.platform || "-",
                    item.format || "-",
                    item.dimensionsDuration || "-",
                    item.copyLimits || "-",
                    item.languages || "-",
                  ])
                : [["-", "-", "-", "-", "-", "-"]],
          },
        },
      ],
    });

    toast({
      title: "PPT exported",
      description: "Creative Brief presentation downloaded.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Palette className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">Creative Brief</h2>
            <p className="text-sm text-muted-foreground">What we are making and why it will work</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={syncFromPreviousSteps}>
            <RefreshCcw className="h-3 w-3" /> Sync Context
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => void generateDraft()} disabled={isGeneratingDraft}>
            <Sparkles className="h-3 w-3" /> {isGeneratingDraft ? "Generating..." : "Generate Draft"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={exportPresentation}>
            <Download className="h-3 w-3" /> Export PPT
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={exportBrief}>
            <Download className="h-3 w-3" /> Export DOC
          </Button>
        </div>
      </div>

      <EvidencePanel
        data={data}
        onChange={onChange}
        section="creative_brief"
        title="Evidence Registry (Creative)"
      />

      <Card className="p-6 bg-gradient-card space-y-6">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <span className="text-muted-foreground text-xs">Activity Name</span>
            <Input
              value={brief.activityName}
              onChange={(event) => updateBrief({ activityName: event.target.value })}
              placeholder="Get to Know Us"
            />
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Agency Name</span>
            <Input
              value={brief.agencyName}
              onChange={(event) => updateBrief({ agencyName: event.target.value })}
              placeholder="CLEARKAMO"
            />
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Owner</span>
            <Input
              value={brief.owner}
              onChange={(event) => updateBrief({ owner: event.target.value })}
              placeholder="Brand/Creative"
            />
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Audience</span>
            <Input
              value={brief.audience}
              onChange={(event) => updateBrief({ audience: event.target.value })}
              placeholder="Designers, writers, producers, editors"
            />
          </div>
          <div className="md:col-span-2">
            <span className="text-muted-foreground text-xs">Purpose</span>
            <Input
              value={brief.purpose}
              onChange={(event) => updateBrief({ purpose: event.target.value })}
              placeholder="What We're Making & Why It'll Work"
            />
          </div>
        </div>

        <BriefSection title="Project Overview">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <span className="text-muted-foreground text-xs">Project name</span>
              <Input
                value={brief.projectName}
                onChange={(event) => updateBrief({ projectName: event.target.value })}
                placeholder="Project name"
              />
            </div>
            <div className="md:col-span-2">
              <span className="text-muted-foreground text-xs">Overview summary</span>
              <Textarea
                value={brief.projectOverview}
                onChange={(event) => updateBrief({ projectOverview: event.target.value })}
                className="min-h-[88px]"
                placeholder="Project overview"
              />
            </div>
          </div>
        </BriefSection>

        <BriefSection title="Background">
          <Textarea
            value={brief.background}
            onChange={(event) => updateBrief({ background: event.target.value })}
            className="min-h-[110px]"
            placeholder="What's happening; link to strategic context"
          />
        </BriefSection>

        <BriefSection title="Single-Minded Objective">
          <Textarea
            value={brief.singleMindedObjective}
            onChange={(event) => updateBrief({ singleMindedObjective: event.target.value })}
            className="min-h-[80px]"
            placeholder="One action from one audience"
          />
        </BriefSection>

        <BriefSection title="Audience Snapshot">
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-3 bg-background/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Who are they?</span>
              <Textarea
                value={brief.audienceWho}
                onChange={(event) => updateBrief({ audienceWho: event.target.value })}
                className="mt-2 min-h-[120px]"
                placeholder="Persona, region, life stage"
              />
            </Card>
            <Card className="p-3 bg-background/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Problem / Tension</span>
              <Textarea
                value={brief.audienceTension}
                onChange={(event) => updateBrief({ audienceTension: event.target.value })}
                className="mt-2 min-h-[120px]"
                placeholder="What's in their way?"
              />
            </Card>
            <Card className="p-3 bg-background/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Desired Change</span>
              <Textarea
                value={brief.audienceDesiredChange}
                onChange={(event) => updateBrief({ audienceDesiredChange: event.target.value })}
                className="mt-2 min-h-[120px]"
                placeholder="After seeing the work"
              />
            </Card>
          </div>
        </BriefSection>

        <BriefSection title="The Idea">
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-3 bg-primary/5 border-primary/20">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">SMP / Key proposition</span>
              <Input
                value={brief.keyProposition}
                onChange={(event) => updateBrief({ keyProposition: event.target.value })}
                className="mt-2"
                placeholder="<= 12 words"
              />
              {activeConcept && (
                <Badge variant="outline" className="mt-2 text-[10px]">
                  From concept: {activeConcept.name}
                </Badge>
              )}
            </Card>
            <Card className="p-3 bg-background/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Tone & Personality</span>
              <Textarea
                value={brief.toneAndPersonality}
                onChange={(event) => updateBrief({ toneAndPersonality: event.target.value })}
                className="mt-2 min-h-[90px]"
                placeholder="Practical, confident, Afrocentric, modern..."
              />
            </Card>
            <div className="md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Reasons-to-believe (RTBs)</span>
              <Textarea
                value={brief.reasonsToBelieve}
                onChange={(event) => updateBrief({ reasonsToBelieve: event.target.value })}
                className="mt-2 min-h-[110px]"
                placeholder="Data, testimonials, demos, guarantees"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Cultural cues — To Embrace</span>
              <Textarea
                value={brief.culturalCuesEmbrace}
                onChange={(event) => updateBrief({ culturalCuesEmbrace: event.target.value })}
                className="mt-2 min-h-[120px]"
                placeholder="Language notes, symbols to embrace"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Cultural cues — To Avoid</span>
              <Textarea
                value={brief.culturalCuesAvoid}
                onChange={(event) => updateBrief({ culturalCuesAvoid: event.target.value })}
                className="mt-2 min-h-[120px]"
                placeholder="Symbols/wording to avoid"
              />
            </div>
          </div>
        </BriefSection>

        <BriefSection title="Mandatories & Brand Guardrails">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Logo Usage</span>
              <Textarea
                value={brief.logoUsage}
                onChange={(event) => updateBrief({ logoUsage: event.target.value })}
                className="mt-2 min-h-[110px]"
                placeholder="Formats, clear space, restrictions"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Colors / Typography</span>
              <Textarea
                value={brief.colorsTypography}
                onChange={(event) => updateBrief({ colorsTypography: event.target.value })}
                className="mt-2 min-h-[110px]"
                placeholder="HEX/CMYK and font rules"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Legal</span>
              <Textarea
                value={brief.legal}
                onChange={(event) => updateBrief({ legal: event.target.value })}
                className="mt-2 min-h-[100px]"
                placeholder="Disclaimers and licenses"
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">DO Examples</span>
              <Textarea
                value={brief.doExamples}
                onChange={(event) => updateBrief({ doExamples: event.target.value })}
                className="mt-2 min-h-[100px]"
                placeholder="What to do"
              />
            </div>
            <div className="md:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">DON'T Examples</span>
              <Textarea
                value={brief.dontExamples}
                onChange={(event) => updateBrief({ dontExamples: event.target.value })}
                className="mt-2 min-h-[100px]"
                placeholder="What to avoid"
              />
            </div>
          </div>
        </BriefSection>

        <BriefSection title="Deliverables (Exact Specs)">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={addDeliverable}>
              Add Deliverable
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table className="!w-max min-w-[1250px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[220px]">Asset</TableHead>
                  <TableHead className="text-xs w-[210px]">Platform</TableHead>
                  <TableHead className="text-xs w-[140px]">Format</TableHead>
                  <TableHead className="text-xs w-[220px]">Dimensions / Duration</TableHead>
                  <TableHead className="text-xs w-[170px]">Copy limits</TableHead>
                  <TableHead className="text-xs w-[150px]">Language(s)</TableHead>
                  <TableHead className="text-xs w-[170px]">Accessibility</TableHead>
                  <TableHead className="text-xs w-[52px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brief.deliverables.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-xs text-muted-foreground">
                      No deliverables yet. Add one to start.
                    </TableCell>
                  </TableRow>
                )}
                {brief.deliverables.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="align-top">
                      <Textarea
                        value={row.asset}
                        onChange={(event) => updateDeliverable(row.id, "asset", event.target.value)}
                        className="min-h-[76px] min-w-[200px] !w-auto max-w-none resize overflow-auto text-xs"
                        style={{ width: "220px" }}
                        placeholder="Asset"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        value={row.platform}
                        onChange={(event) => updateDeliverable(row.id, "platform", event.target.value)}
                        className="min-h-[76px] min-w-[190px] !w-auto max-w-none resize overflow-auto text-xs"
                        style={{ width: "210px" }}
                        placeholder="Platform"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        value={row.format}
                        onChange={(event) => updateDeliverable(row.id, "format", event.target.value)}
                        className="min-h-[76px] min-w-[120px] !w-auto max-w-none resize overflow-auto text-xs"
                        style={{ width: "140px" }}
                        placeholder="Format"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        value={row.dimensionsDuration}
                        onChange={(event) => updateDeliverable(row.id, "dimensionsDuration", event.target.value)}
                        className="min-h-[76px] min-w-[200px] !w-auto max-w-none resize overflow-auto text-xs"
                        style={{ width: "220px" }}
                        placeholder="Dimensions or duration"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        value={row.copyLimits}
                        onChange={(event) => updateDeliverable(row.id, "copyLimits", event.target.value)}
                        className="min-h-[76px] min-w-[150px] !w-auto max-w-none resize overflow-auto text-xs"
                        style={{ width: "170px" }}
                        placeholder="Copy limits"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        value={row.languages}
                        onChange={(event) => updateDeliverable(row.id, "languages", event.target.value)}
                        className="min-h-[76px] min-w-[130px] !w-auto max-w-none resize overflow-auto text-xs"
                        style={{ width: "150px" }}
                        placeholder="Language(s)"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Textarea
                        value={row.accessibility}
                        onChange={(event) => updateDeliverable(row.id, "accessibility", event.target.value)}
                        className="min-h-[76px] min-w-[150px] !w-auto max-w-none resize overflow-auto text-xs"
                        style={{ width: "170px" }}
                        placeholder="Accessibility"
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove deliverable"
                        onClick={() => removeDeliverable(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </BriefSection>
      </Card>
    </div>
  );
}
