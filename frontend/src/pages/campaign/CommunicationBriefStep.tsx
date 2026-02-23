import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampaignData, DEFAULT_QA_CHECKLIST } from "@/types/campaign";
import { FileText, Sparkles, Download, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { type ReactNode, useState } from "react";
import { generateCommunicationBriefPatchWithAI } from "@/lib/ai-engine/campaign-automation";
import { downloadPresentationPpt } from "@/lib/presentation-ppt";
import { EvidencePanel } from "@/components/campaign/EvidencePanel";

interface Props {
  data: CampaignData;
  onChange: (d: Partial<CampaignData>) => void;
}

function BriefSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-primary/80">{title}</h4>
      {children}
    </div>
  );
}

function hasText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function toHtmlMultiline(value: string): string {
  return splitLines(value).map((line) => `<p>${line}</p>`).join("");
}

function toHtmlList(value: string): string {
  const lines = splitLines(value);
  if (lines.length === 0) {
    return "<p>-</p>";
  }
  return `<ul>${lines.map((line) => `<li>${line}</li>`).join("")}</ul>`;
}

function toDocumentHtml(data: CampaignData): string {
  const byCategory = {
    paid: data.channelRoles.filter((entry) => entry.category === "paid"),
    owned: data.channelRoles.filter((entry) => entry.category === "owned"),
    earned: data.channelRoles.filter((entry) => entry.category === "earned"),
  };
  const mediaPlanRows =
    data.mediaPlanRows.length > 0
      ? data.mediaPlanRows
      : [
          {
            id: "empty",
            channel: "",
            targeting: "",
            flighting: "",
            budget: "",
            kpi: "",
            benchmark: "",
          },
        ];
  const qaChecklist = data.qaChecklist.length > 0 ? data.qaChecklist : DEFAULT_QA_CHECKLIST;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Communication Brief</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.35; margin: 0; padding: 0; }
      .page {
        position: relative;
        border: 2px solid #7f8c8d;
        margin: 16px;
        padding: 14px 18px;
        background-color: #fff;
      }
      h1 { font-size: 18pt; margin: 0 0 12px; }
      h2 { font-size: 12pt; margin: 14px 0 6px; font-weight: bold; }
      table { border-collapse: collapse; width: 100%; margin-top: 8px; }
      th, td { border: 1px solid #999; padding: 6px; vertical-align: top; text-align: left; }
      ul { margin: 4px 0 8px 16px; }
      p { margin: 4px 0; }
      .meta td:first-child { width: 160px; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="page">
    <h1>COMMUNICATION BRIEF — ${data.campaign.name}</h1>
    <table class="meta">
      <tbody>
        <tr><td>ACTIVITY NAME</td><td>Communication Brief</td></tr>
        <tr><td>AGENCY NAME</td><td>CLEARKAMO</td></tr>
        <tr><td>DATE</td><td>${data.campaign.startDate}</td></tr>
        <tr><td>OWNER</td><td>Marketing/PR/SE</td></tr>
        <tr><td>AUDIENCE</td><td>Media planners, channel owners, growth/CRM</td></tr>
        <tr><td>PURPOSE</td><td>Plan what to say, to whom, where, and how we’ll measure</td></tr>
      </tbody>
    </table>

    <h2>• Background | Context</h2>
    <p><strong>Business Situation:</strong> ${data.situation}</p>
    <p><strong>Problem / Opportunity:</strong> ${data.problem}</p>
    <p><strong>Prior Learnings:</strong> ${data.priorLearnings}</p>

    <h2>• OBJECTIVES | ultimate impact?</h2>
    <p><strong>Business Objective (SMART):</strong> ${data.businessObjective}</p>
    <p><strong>Communication Objective:</strong> ${data.communicationObjective}</p>

    <h2>• AUDIENCES SEGMENTATION</h2>
    ${data.audiences
      .map((audience) => `<p><strong>${audience.segmentName}</strong> (${audience.priority}) — ${audience.desiredAction}</p>`)
      .join("")}

    <h2>• Insights & Idea</h2>
    <p><strong>Human Insight / Tension:</strong> ${data.insight.insightText}</p>
    <p><strong>Driver:</strong> ${data.driver.driverText}</p>

    <h2>• Message Map (by audience)</h2>
    <table>
      <thead>
        <tr>
          <th>Audience</th>
          <th>Key Message</th>
          <th>Support/RTBs</th>
          <th>CTA</th>
        </tr>
      </thead>
      <tbody>
        ${data.audiences
          .map(
            (audience) =>
              `<tr><td>${audience.segmentName}</td><td>${audience.keyMessage ?? ""}</td><td>${audience.supportRtb ?? ""}</td><td>${audience.cta ?? ""}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <h2>• Channels & Roles</h2>
    <p><strong>Paid</strong></p>
    <ul>${byCategory.paid.map((entry) => `<li>${entry.channel}</li>`).join("")}</ul>
    <p><strong>Role:</strong> ${byCategory.paid.map((entry) => entry.role).join(" | ") || "-"}</p>
    <p><strong>Owned</strong></p>
    <ul>${byCategory.owned.map((entry) => `<li>${entry.channel}</li>`).join("")}</ul>
    <p><strong>Role:</strong> ${byCategory.owned.map((entry) => entry.role).join(" | ") || "-"}</p>
    <p><strong>Earned</strong></p>
    <ul>${byCategory.earned.map((entry) => `<li>${entry.channel}</li>`).join("")}</ul>
    <p><strong>Role:</strong> ${byCategory.earned.map((entry) => entry.role).join(" | ") || "-"}</p>

    <h2>• Media/Activation Plan & Budget</h2>
    <table>
      <thead><tr><th>Channel</th><th>Targeting</th><th>Flighting</th><th>Budget</th><th>KPI</th><th>Benchmark</th></tr></thead>
      <tbody>
        ${mediaPlanRows
          .map(
            (row) =>
              `<tr><td>${row.channel || "-"}</td><td>${row.targeting || "-"}</td><td>${row.flighting || "-"}</td><td>${row.budget || "-"}</td><td>${row.kpi || "-"}</td><td>${row.benchmark || "-"}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <h2>• Content Themes & Calendar</h2>
    ${toHtmlList(data.contentThemesAndCalendar)}

    <h2>• Deliverables Needed (to request from Creative)</h2>
    ${toHtmlList(data.deliverablesNeeded)}

    <h2>• Measurement & Learning Plan</h2>
    ${toHtmlList(data.measurementAndLearningPlan)}

    <h2>• Governance, Risks & Approvals</h2>
    ${toHtmlList(data.governanceRisksAndApprovals)}

    <h2>• Timeline</h2>
    ${toHtmlMultiline(data.timelineDetails) || `<p>Start: ${data.campaign.startDate} — End: ${data.campaign.endDate}</p>`}

    <h2>• Appendices</h2>
    ${toHtmlList(data.appendices)}

    <h2>Communication Brief QA Checklist</h2>
    <ul>
      ${qaChecklist.map((item) => `<li>[${item.checked ? "x" : " "}] ${item.label}</li>`).join("")}
    </ul>
    </div>
  </body>
</html>`;
}

export function CommunicationBriefStep({ data, onChange }: Props) {
  const { toast } = useToast();
  const conceptChannels = Array.from(new Set(data.concepts.flatMap((concept) => concept.channels).filter(Boolean)));
  const qaChecklist = data.qaChecklist.length > 0 ? data.qaChecklist : DEFAULT_QA_CHECKLIST;
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const updateAudienceField = (audienceId: string, field: "keyMessage" | "supportRtb" | "cta", value: string) => {
    onChange({
      audiences: data.audiences.map((audience) =>
        audience.id === audienceId ? { ...audience, [field]: value } : audience,
      ),
    });
  };

  const updateBriefField = (
    field:
      | "contentThemesAndCalendar"
      | "deliverablesNeeded"
      | "measurementAndLearningPlan"
      | "governanceRisksAndApprovals"
      | "timelineDetails"
      | "appendices",
    value: string,
  ) => {
    onChange({ [field]: value });
  };

  const updateQaChecklistItem = (id: string, checked: boolean) => {
    onChange({
      qaChecklist: qaChecklist.map((item) => (item.id === id ? { ...item, checked } : item)),
    });
  };

  const addChannelRole = () => {
    onChange({
      channelRoles: [
        ...data.channelRoles,
        {
          id: `channel-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          category: "paid",
          channel: "",
          role: "",
        },
      ],
    });
  };

  const updateChannelRole = (id: string, field: "category" | "channel" | "role", value: string) => {
    onChange({
      channelRoles: data.channelRoles.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              [field]: field === "category" ? (value as "paid" | "owned" | "earned") : value,
            }
          : entry,
      ),
    });
  };

  const removeChannelRole = (id: string) => {
    onChange({
      channelRoles: data.channelRoles.filter((entry) => entry.id !== id),
    });
  };

  const addMediaPlanRow = () => {
    onChange({
      mediaPlanRows: [
        ...data.mediaPlanRows,
        {
          id: `media-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
          channel: "",
          targeting: "",
          flighting: "",
          budget: "",
          kpi: "",
          benchmark: "",
        },
      ],
    });
  };

  const updateMediaPlanRow = (
    id: string,
    field: "channel" | "targeting" | "flighting" | "budget" | "kpi" | "benchmark",
    value: string,
  ) => {
    onChange({
      mediaPlanRows: data.mediaPlanRows.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    });
  };

  const removeMediaPlanRow = (id: string) => {
    onChange({
      mediaPlanRows: data.mediaPlanRows.filter((row) => row.id !== id),
    });
  };

  const generateDraft = async () => {
    if (isGeneratingDraft) {
      return;
    }

    setIsGeneratingDraft(true);
    try {
      const automationPatch = await generateCommunicationBriefPatchWithAI(data);
      const derivedChannels = (automationPatch.channelRoles ?? []).length > 0
        ? automationPatch.channelRoles
        : conceptChannels.map((channel, index) => ({
            id: `concept-channel-${index}`,
            category: "owned" as const,
            channel,
            role: "Engage and nurture audiences toward conversion.",
          }));
      const derivedMediaRows = (automationPatch.mediaPlanRows ?? []).length > 0
        ? automationPatch.mediaPlanRows
        : conceptChannels.slice(0, 3).map((channel, index) => ({
            id: `concept-media-${index}`,
            channel,
            targeting: "",
            flighting: "",
            budget: "",
            kpi: "",
            benchmark: "",
          }));

      onChange({
        ...automationPatch,
        channelRoles: derivedChannels,
        mediaPlanRows: derivedMediaRows,
        qaChecklist,
      });

      toast({
        title: "Draft generated",
        description: "AI drafted message-map and channel-role fields with campaign context.",
      });
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const exportBrief = () => {
    const payload = toDocumentHtml(data);
    const blob = new Blob([payload], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.campaign.name.toLowerCase().replace(/\s+/g, "-")}-communication-brief.doc`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPresentation = () => {
    const channelRows = data.channelRoles.length > 0
      ? data.channelRoles.map((entry) => [entry.category, entry.channel || "-", entry.role || "-"])
      : [["-", "No channel roles defined", "-"]];
    const mediaRows = data.mediaPlanRows.length > 0
      ? data.mediaPlanRows.map((row) => [row.channel || "-", row.targeting || "-", row.budget || "-", row.kpi || "-"])
      : [["-", "-", "-", "-"]];

    downloadPresentationPpt({
      filename: `${data.campaign.name}-communication-brief`,
      title: "Communication Brief",
      subtitle: "Message strategy, channels, and activation plan",
      campaignName: data.campaign.name,
      complianceTag: `${(data.approvals || []).filter((entry) => entry.status === "approved").length} approval(s) signed`,
      slides: [
        {
          heading: "Context & Objectives",
          bullets: [
            `Situation: ${data.situation || "Not provided."}`,
            `Problem: ${data.problem || "Not provided."}`,
            `Business Objective: ${data.businessObjective || "Not provided."}`,
            `Communication Objective: ${data.communicationObjective || "Not provided."}`,
          ],
        },
        {
          heading: "Audience Segmentation",
          bullets:
            data.audiences.length > 0
              ? data.audiences.map(
                  (audience) =>
                    `${audience.segmentName} (${audience.priority}) | Action: ${audience.desiredAction || "N/A"}`,
                )
              : ["No audience segments defined."],
        },
        {
          heading: "Message Map",
          table: {
            headers: ["Audience", "Key Message", "Support / RTBs", "CTA"],
            rows:
              data.audiences.length > 0
                ? data.audiences.map((audience) => [
                    audience.segmentName || "-",
                    audience.keyMessage || "-",
                    audience.supportRtb || "-",
                    audience.cta || "-",
                  ])
                : [["-", "-", "-", "-"]],
          },
        },
        {
          heading: "Channels & Roles",
          table: {
            headers: ["Category", "Channel", "Role"],
            rows: channelRows,
          },
        },
        {
          heading: "Media Plan",
          table: {
            headers: ["Channel", "Targeting", "Budget", "KPI"],
            rows: mediaRows,
          },
        },
      ],
    });

    toast({
      title: "PPT exported",
      description: "Communication Brief presentation downloaded.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="text-xl font-display font-bold">Communication Brief</h2>
            <p className="text-sm text-muted-foreground">Strategic foundation document</p>
          </div>
        </div>
        <div className="flex gap-2">
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
        section="communication_brief"
        title="Evidence Registry (Communication)"
      />

      <Card className="p-6 bg-gradient-card space-y-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground text-xs">Activity:</span><p className="font-medium">{data.campaign.name}</p></div>
          <div><span className="text-muted-foreground text-xs">Date:</span><p className="font-medium">{data.campaign.startDate}</p></div>
          <div><span className="text-muted-foreground text-xs">Agency:</span><p className="font-medium">CLEARKAMO</p></div>
          <div><span className="text-muted-foreground text-xs">Owner:</span><p className="font-medium">Marketing/PR/SE</p></div>
          <div className="col-span-2"><span className="text-muted-foreground text-xs">Audience:</span><p className="font-medium">Media planners, channel owners, growth/CRM</p></div>
          <div className="col-span-2"><span className="text-muted-foreground text-xs">Purpose:</span><p className="font-medium">Plan what to say, to whom, where, and how we’ll measure.</p></div>
        </div>

        <BriefSection title="Background & Context">
          <p className="text-sm text-muted-foreground">{data.situation}</p>
        </BriefSection>

        <BriefSection title="Problem / Opportunity">
          <p className="text-sm text-muted-foreground">{data.problem}</p>
        </BriefSection>

        <BriefSection title="Objectives">
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-3 bg-background/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Business Objective</span>
              <p className="text-sm mt-1">{data.businessObjective}</p>
            </Card>
            <Card className="p-3 bg-background/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Communication Objective</span>
              <p className="text-sm mt-1">{data.communicationObjective}</p>
            </Card>
          </div>
        </BriefSection>

        <BriefSection title="Audience Segmentation">
          {data.audiences.map((audience) => (
            <Card key={audience.id} className="p-3 bg-background/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">{audience.segmentName}</span>
                <Badge variant="outline" className="text-[10px]">{audience.priority}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{audience.desiredAction}</p>
            </Card>
          ))}
        </BriefSection>

        <BriefSection title="Human Insight">
          <Card className="p-3 bg-primary/5 border-primary/20">
            <p className="text-sm italic">"{data.insight.insightText}"</p>
          </Card>
        </BriefSection>

        <BriefSection title="Message Map">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Audience</TableHead>
                <TableHead className="text-xs">Key Message</TableHead>
                <TableHead className="text-xs">Support / RTBs</TableHead>
                <TableHead className="text-xs">CTA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.audiences.map((audience) => (
                <TableRow key={audience.id}>
                  <TableCell className="text-xs font-medium align-top">{audience.segmentName}</TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={audience.keyMessage ?? ""}
                      onChange={(event) => updateAudienceField(audience.id, "keyMessage", event.target.value)}
                      className="min-h-[64px] text-xs"
                      placeholder="Core message for this audience"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={audience.supportRtb ?? ""}
                      onChange={(event) => updateAudienceField(audience.id, "supportRtb", event.target.value)}
                      className="min-h-[64px] text-xs"
                      placeholder="Reasons to believe / proof points"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={audience.cta ?? ""}
                      onChange={(event) => updateAudienceField(audience.id, "cta", event.target.value)}
                      className="min-h-[64px] text-xs"
                      placeholder="Call to action"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </BriefSection>

        <BriefSection title="Channels & Roles">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={addChannelRole}>
              Add Channel Role
            </Button>
          </div>
          <div className="space-y-2">
            {data.channelRoles.length === 0 && (
              <p className="text-xs text-muted-foreground">No channel-role entries yet.</p>
            )}
            {data.channelRoles.map((entry) => (
              <div key={entry.id} className="grid gap-2 md:grid-cols-[120px_1fr_1fr_auto] items-start">
                <select
                  value={entry.category}
                  onChange={(event) => updateChannelRole(entry.id, "category", event.target.value)}
                  className="h-9 rounded border border-input bg-background px-2 text-xs"
                  aria-label="Channel category"
                >
                  <option value="paid">paid</option>
                  <option value="owned">owned</option>
                  <option value="earned">earned</option>
                </select>
                <Textarea
                  value={entry.channel}
                  onChange={(event) => updateChannelRole(entry.id, "channel", event.target.value)}
                  placeholder="Channel name (e.g. Sponsored LinkedIn campaigns)"
                  className="min-h-[60px] text-xs"
                />
                <Textarea
                  value={entry.role}
                  onChange={(event) => updateChannelRole(entry.id, "role", event.target.value)}
                  placeholder="Role in funnel (e.g. Reach and create word of mouth at scale.)"
                  className="min-h-[60px] text-xs"
                />
                <Button type="button" size="icon" variant="ghost" onClick={() => removeChannelRole(entry.id)} aria-label="Remove channel role">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          {conceptChannels.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">Suggested from Concepts</p>
              <div className="flex flex-wrap gap-2">
                {conceptChannels.map((channel) => (
                  <Badge key={channel} variant="secondary" className="text-xs">{channel}</Badge>
                ))}
              </div>
            </div>
          )}
        </BriefSection>

        <BriefSection title="Media/Activation Plan & Budget">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={addMediaPlanRow}>
              Add Media Row
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Channel</TableHead>
                <TableHead className="text-xs">Targeting</TableHead>
                <TableHead className="text-xs">Flighting</TableHead>
                <TableHead className="text-xs">Budget</TableHead>
                <TableHead className="text-xs">KPI</TableHead>
                <TableHead className="text-xs">Benchmark</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.mediaPlanRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-xs text-muted-foreground">
                    No media rows yet. Add one to define channel, targeting, budget, and KPI benchmarks.
                  </TableCell>
                </TableRow>
              )}
              {data.mediaPlanRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="align-top">
                    <Textarea
                      value={row.channel}
                      onChange={(event) => updateMediaPlanRow(row.id, "channel", event.target.value)}
                      className="min-h-[56px] text-xs"
                      placeholder="Channel (e.g., Radio)"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={row.targeting}
                      onChange={(event) => updateMediaPlanRow(row.id, "targeting", event.target.value)}
                      className="min-h-[56px] text-xs"
                      placeholder="Targeting (regions/segments)"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={row.flighting}
                      onChange={(event) => updateMediaPlanRow(row.id, "flighting", event.target.value)}
                      className="min-h-[56px] text-xs"
                      placeholder="Flighting (dates)"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={row.budget}
                      onChange={(event) => updateMediaPlanRow(row.id, "budget", event.target.value)}
                      className="min-h-[56px] text-xs"
                      placeholder="Budget"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <Textarea
                      value={row.kpi}
                      onChange={(event) => updateMediaPlanRow(row.id, "kpi", event.target.value)}
                      className="min-h-[56px] text-xs"
                      placeholder="KPI (e.g., Reach/CTR)"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex gap-1">
                      <Textarea
                        value={row.benchmark}
                        onChange={(event) => updateMediaPlanRow(row.id, "benchmark", event.target.value)}
                        className="min-h-[56px] text-xs"
                        placeholder="Benchmark target"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeMediaPlanRow(row.id)}
                        aria-label="Remove media row"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </BriefSection>

        <BriefSection title="Content Themes & Calendar">
          <Textarea
            value={data.contentThemesAndCalendar}
            onChange={(event) => updateBriefField("contentThemesAndCalendar", event.target.value)}
            placeholder="Add themes and publishing cadence"
            className="min-h-[120px] text-xs"
          />
        </BriefSection>

        <BriefSection title="Deliverables Needed (to request from Creative)">
          <Textarea
            value={data.deliverablesNeeded}
            onChange={(event) => updateBriefField("deliverablesNeeded", event.target.value)}
            placeholder="List creative deliverables required"
            className="min-h-[110px] text-xs"
          />
        </BriefSection>

        <BriefSection title="Measurement & Learning Plan">
          <Textarea
            value={data.measurementAndLearningPlan}
            onChange={(event) => updateBriefField("measurementAndLearningPlan", event.target.value)}
            placeholder="Define KPIs, benchmarks, and learning loops"
            className="min-h-[110px] text-xs"
          />
        </BriefSection>

        <BriefSection title="Governance, Risks & Approvals">
          <Textarea
            value={data.governanceRisksAndApprovals}
            onChange={(event) => updateBriefField("governanceRisksAndApprovals", event.target.value)}
            placeholder="Capture approvers, risks, and compliance guardrails"
            className="min-h-[110px] text-xs"
          />
        </BriefSection>

        <BriefSection title="Timeline">
          <Textarea
            value={data.timelineDetails}
            onChange={(event) => updateBriefField("timelineDetails", event.target.value)}
            placeholder="Outline campaign phases, milestones, and dates"
            className="min-h-[88px] text-xs"
          />
        </BriefSection>

        <BriefSection title="Appendices">
          <Textarea
            value={data.appendices}
            onChange={(event) => updateBriefField("appendices", event.target.value)}
            placeholder="Add appendix references and supporting links/files"
            className="min-h-[88px] text-xs"
          />
        </BriefSection>

        <BriefSection title="QA Checklist">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {qaChecklist.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(event) => updateQaChecklistItem(item.id, event.target.checked)}
                  aria-label={item.label}
                  className="h-4 w-4 rounded border border-input"
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </BriefSection>
      </Card>
    </div>
  );
}
