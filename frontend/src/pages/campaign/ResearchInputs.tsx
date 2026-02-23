import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampaignData, DRIVER_MOTIVES, DriverMotive } from "@/types/campaign";
import { BookOpen, Users, Brain, Zap, LucideIcon, Upload, Database } from "lucide-react";
import { ReactNode, useState, type ChangeEvent } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  automateCampaignFromDocumentsWithAI,
} from "@/lib/ai-engine/campaign-automation";
import { ResearchDocumentInput } from "@/lib/ai-engine/research-parser";
import { listDriveFiles, uploadDriveFile } from "@/lib/drive-api";
import { downloadPresentationPpt } from "@/lib/presentation-ppt";
import { EvidencePanel } from "@/components/campaign/EvidencePanel";

interface Props { data: CampaignData; onChange: (d: Partial<CampaignData>) => void; }

const DRIVER_MOTIVE_LABELS: Record<DriverMotive, string> = {
  hoard: "Hoard",
  create: "Create",
  fear: "Fear",
  disgust: "Disgust",
  hunger: "Hunger",
  comfort: "Comfort",
  lust: "Lust",
  attract: "Attract",
  love: "Love",
  nurture: "Nurture",
  curiosity: "Curiosity",
  play: "Play",
  affiliate: "Affiliate",
  status: "Status",
  justice: "Justice",
};

const DRIVER_TEXT_PREFIX = "Selected motives:";

function isTextLikeDocument(file: File): boolean {
  const mimeType = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("csv") ||
    name.endsWith(".txt") ||
    name.endsWith(".csv") ||
    name.endsWith(".json") ||
    name.endsWith(".md")
  );
}

function hasUsableExtractedText(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  return !/^binary file uploaded:/i.test(normalized);
}

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function ResearchInputs({ data, onChange }: Props) {
  const { toast } = useToast();
  const [automationStatus, setAutomationStatus] = useState<string>("");
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const readFileAsText = (file: File): Promise<string> => {
    if (typeof file.text === "function") {
      return file.text();
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Failed to read uploaded file."));
      reader.readAsText(file);
    });
  };

  const mergeDriverTextWithMotives = (currentText: string, motiveLabels: string[]) => {
    const [firstLine, ...restLines] = currentText.split(/\r?\n/);
    const existingNotes = firstLine.startsWith(DRIVER_TEXT_PREFIX)
      ? restLines.join("\n").trim()
      : currentText.trim();

    if (motiveLabels.length === 0) {
      return existingNotes;
    }

    const motiveLine = `${DRIVER_TEXT_PREFIX} ${motiveLabels.join(", ")}`;
    return existingNotes ? `${motiveLine}\n${existingNotes}` : motiveLine;
  };

  const updateAudience = (id: string, updates: Partial<(typeof data.audiences)[number]>) => {
    onChange({
      audiences: data.audiences.map((audience) =>
        audience.id === id ? { ...audience, ...updates } : audience,
      ),
    });
  };

  const addAudience = () => {
    onChange({
      audiences: [
        ...data.audiences,
        {
          id: `aud-${Date.now()}`,
          priority: "secondary",
          segmentName: "New Audience",
          description: "",
          barriers: "",
          motivators: "",
          desiredAction: "",
        },
      ],
    });
  };

  const removeAudience = (id: string) => {
    onChange({
      audiences: data.audiences.filter((audience) => audience.id !== id),
    });
  };

  const toggleDriverMotive = (motive: DriverMotive) => {
    const selected = data.driver.driverTypes;
    const next = selected.includes(motive)
      ? selected.filter((item) => item !== motive)
      : [...selected, motive];
    const nextMotiveLabels = next.map((item) => DRIVER_MOTIVE_LABELS[item]);
    const nextDriverText = mergeDriverTextWithMotives(data.driver.driverText, nextMotiveLabels);

    onChange({
      driver: {
        ...data.driver,
        driverTypes: next,
        driverText: nextDriverText,
      },
    });
  };

  const selectedMotiveLabels = data.driver.driverTypes.map((motive) => DRIVER_MOTIVE_LABELS[motive]);
  const driverTextPlaceholder =
    selectedMotiveLabels.length > 0
      ? `Selected motives: ${selectedMotiveLabels.join(", ")}. Describe how these motives drive behavior change.`
      : "Select one or more motives above, then describe how they drive behavior change.";

  const applyAutomation = async (documents: ResearchDocumentInput[]) => {
    setIsAutoFilling(true);
    try {
      const { patch, parsed } = await automateCampaignFromDocumentsWithAI(data, documents);
      onChange(patch);
      setAutomationStatus(
        parsed.warnings.length > 0
          ? `Auto-populated with ${parsed.warnings.length} warning(s): ${parsed.warnings.join(" ")}`
          : `Auto-populated from ${parsed.sourceNames.length || 1} source(s).`,
      );
      toast({
        title: "Research auto-populated",
        description: parsed.warnings.length > 0
          ? "Automation completed with fallbacks for missing fields."
          : "Campaign fields were auto-generated from uploaded research.",
      });
    } catch (error) {
      setAutomationStatus("AI analysis failed. Please retry or upload clearer document content.");
      toast({
        title: "Automation failed",
        description: error instanceof Error ? error.message : "Unable to analyze uploaded research.",
        variant: "destructive",
      });
    } finally {
      setIsAutoFilling(false);
    }
  };

  const handleUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) {
      return;
    }

    const docs: ResearchDocumentInput[] = [];
    const uploadIssues: string[] = [];
    for (const file of files) {
      try {
        const uploaded = await uploadDriveFile(file, null, data.campaign.id ?? null);
        const extracted = uploaded.extractedText || "";
        let text = extracted;

        if (!hasUsableExtractedText(extracted) && isTextLikeDocument(file)) {
          text = await readFileAsText(file);
        }

        docs.push({
          id: uploaded.id,
          name: uploaded.name || file.name,
          type: uploaded.mimeType || file.type || "application/octet-stream",
          text,
        });
      } catch (error) {
        uploadIssues.push(file.name);
        const fallbackText = isTextLikeDocument(file) ? await readFileAsText(file).catch(() => "") : "";
        docs.push({
          name: file.name,
          type: file.type || "application/octet-stream",
          text: fallbackText,
        });
        if (error instanceof Error) {
          setAutomationStatus(`Upload warning: ${error.message}`);
        }
      }
    }

    if (uploadIssues.length > 0) {
      toast({
        title: "Some files could not be fully processed",
        description: `Fallback parsing used for: ${uploadIssues.join(", ")}`,
        variant: "destructive",
      });
    }

    await applyAutomation(docs);
    event.target.value = "";
  };

  const handleImportFromDrive = async () => {
    try {
      const [scopedFiles, globalFiles] = await Promise.all([
        listDriveFiles(data.campaign.id ?? null),
        listDriveFiles(null),
      ]);
      const uniqueById = new Map(
        [...scopedFiles, ...globalFiles].map((file) => [file.id, file]),
      );
      const driveFiles = [...uniqueById.values()];

      if (driveFiles.length === 0) {
        setAutomationStatus("No AI Drive files available to import.");
        toast({
          title: "No AI Drive files",
          description: "Upload files in AI Drive first, then import.",
          variant: "destructive",
        });
        return;
      }

      await applyAutomation(
        driveFiles.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.mimeType,
          text: file.extractedText,
        })),
      );
    } catch (error) {
      setAutomationStatus("Unable to load AI Drive files from backend.");
      toast({
        title: "AI Drive unavailable",
        description: error instanceof Error ? error.message : "Failed to load AI Drive files.",
        variant: "destructive",
      });
    }
  };

  const exportPresentation = () => {
    const audienceBullets =
      data.audiences.length > 0
        ? data.audiences.map(
            (aud) =>
              `${aud.segmentName} (${aud.priority}) - Action: ${aud.desiredAction || "Not set"} | Barrier: ${aud.barriers || "N/A"}`,
          )
        : ["No audience segments defined yet."];

    downloadPresentationPpt({
      filename: `${data.campaign.name}-research-inputs`,
      title: "Research Inputs",
      subtitle: "Situation, audience, insight, and behavior-change drivers",
      campaignName: data.campaign.name,
      complianceTag: `${(data.approvals || []).filter((entry) => entry.status === "approved").length} approval(s) signed`,
      slides: [
        {
          heading: "Situation & Problem",
          paragraphs: [
            `Situation: ${data.situation || "Not provided yet."}`,
            `Problem: ${data.problem || "Not provided yet."}`,
            `Prior Learnings: ${data.priorLearnings || "Not provided yet."}`,
          ],
        },
        {
          heading: "Objectives",
          bullets: [
            `Business Objective: ${data.businessObjective || "Not provided."}`,
            `Communication Objective: ${data.communicationObjective || "Not provided."}`,
          ],
        },
        {
          heading: "Audience Segments",
          bullets: audienceBullets,
        },
        {
          heading: "Insight & Driver",
          paragraphs: [
            `Insight: ${data.insight.insightText || "Not provided."}`,
            `Evidence Source: ${data.insight.evidenceSource || "Not provided."}`,
            `Confidence: ${data.insight.confidenceLevel}`,
            `Driver Motives: ${data.driver.driverTypes.length > 0 ? data.driver.driverTypes.join(", ") : "None selected"}`,
            `Driver Narrative: ${data.driver.driverText || "Not provided."}`,
          ],
        },
        {
          heading: "Behavior Change Framing",
          bullets: [
            `Behavior Statement: ${data.behavior.behaviorStatement || "Not provided."}`,
            `Current Behavior: ${data.behavior.currentBehavior || "Not provided."}`,
            `Desired Behavior: ${data.behavior.desiredBehavior || "Not provided."}`,
            `Context: ${data.behavior.context || "Not provided."}`,
          ],
        },
      ],
    });

    toast({
      title: "PPT exported",
      description: "Research presentation deck downloaded.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><BookOpen className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="text-xl font-display font-bold">Research Inputs</h2>
            <p className="text-sm text-muted-foreground">Situation analysis, audiences, insights & drivers</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={exportPresentation}>
          Export PPT
        </Button>
      </div>

      <EvidencePanel
        data={data}
        onChange={onChange}
        section="research"
        title="Evidence Registry (Research)"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={Upload} title="Automation Input">
          <Card className="p-4 bg-gradient-card border-primary/20 space-y-3">
            <Label htmlFor="research-upload" className="text-xs text-muted-foreground uppercase tracking-wider">
              Upload Research Data
            </Label>
            <input
              id="research-upload"
              type="file"
              multiple
              accept=".txt,.csv,.md,.json,.pdf,.doc,.docx,.xls,.xlsx,image/*"
              onChange={handleUploadChange}
              aria-label="Upload research documents"
              disabled={isAutoFilling}
              className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => void handleImportFromDrive()}
                disabled={isAutoFilling}
              >
                <Database className="h-3 w-3" /> Auto-populate from AI Drive
              </Button>
            </div>
            {automationStatus && (
              <p className="text-xs text-muted-foreground">{automationStatus}</p>
            )}
            {isAutoFilling && (
              <p className="text-xs text-primary">AI is analyzing uploaded research...</p>
            )}
          </Card>
        </Section>

        <Section icon={BookOpen} title="Situation & Problem">
          <Card className="p-4 bg-gradient-card space-y-3">
            <div>
              <Label htmlFor="research-situation" className="text-xs text-muted-foreground uppercase tracking-wider">Business Situation</Label>
              <Textarea
                id="research-situation"
                value={data.situation}
                onChange={e => onChange({ situation: e.target.value })}
                onBlur={(event) => onChange({ situation: event.target.value.trim() })}
                className="mt-1 bg-background/50 min-h-[80px]"
              />
            </div>
            <div>
              <Label htmlFor="research-problem" className="text-xs text-muted-foreground uppercase tracking-wider">Problem / Opportunity</Label>
              <Textarea
                id="research-problem"
                value={data.problem}
                onChange={e => onChange({ problem: e.target.value })}
                onBlur={(event) => onChange({ problem: event.target.value.trim() })}
                className="mt-1 bg-background/50 min-h-[60px]"
              />
            </div>
            <div>
              <Label htmlFor="research-prior-learnings" className="text-xs text-muted-foreground uppercase tracking-wider">Prior Learnings</Label>
              <Textarea
                id="research-prior-learnings"
                value={data.priorLearnings}
                onChange={e => onChange({ priorLearnings: e.target.value })}
                onBlur={(event) => onChange({ priorLearnings: event.target.value.trim() })}
                className="mt-1 bg-background/50 min-h-[60px]"
              />
            </div>
          </Card>
        </Section>

        <Section icon={BookOpen} title="Objectives">
          <Card className="p-4 bg-gradient-card space-y-3">
            <div>
              <Label htmlFor="research-business-objective" className="text-xs text-muted-foreground uppercase tracking-wider">Business Objective (SMART)</Label>
              <Textarea
                id="research-business-objective"
                value={data.businessObjective}
                onChange={e => onChange({ businessObjective: e.target.value })}
                onBlur={(event) => onChange({ businessObjective: event.target.value.trim() })}
                className="mt-1 bg-background/50 min-h-[60px]"
              />
            </div>
            <div>
              <Label htmlFor="research-communication-objective" className="text-xs text-muted-foreground uppercase tracking-wider">Communication Objective (Think / Feel / Do)</Label>
              <Textarea
                id="research-communication-objective"
                value={data.communicationObjective}
                onChange={e => onChange({ communicationObjective: e.target.value })}
                onBlur={(event) => onChange({ communicationObjective: event.target.value.trim() })}
                className="mt-1 bg-background/50 min-h-[60px]"
              />
            </div>
          </Card>
        </Section>
      </div>

      <Section icon={Users} title="Audience Segments">
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={addAudience}>
            Add Audience
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.audiences.map(aud => (
            <Card key={aud.id} className="p-4 bg-gradient-card space-y-2">
              <div className="flex items-center justify-between">
                <input
                  value={aud.segmentName}
                  onChange={(event) => updateAudience(aud.id, { segmentName: event.target.value })}
                  onBlur={(event) => updateAudience(aud.id, { segmentName: event.target.value.trim() || "Untitled Audience" })}
                  placeholder="e.g. Head of Household, Government, Enterprises"
                  className="font-display font-semibold text-sm bg-transparent border-0 p-0 outline-none w-full mr-2"
                  aria-label="Audience Name"
                />
                <select
                  value={aud.priority}
                  onChange={(event) => updateAudience(aud.id, { priority: event.target.value as "primary" | "secondary" })}
                  className="text-[10px] rounded border border-input bg-background px-1.5 py-0.5"
                  aria-label="Audience Priority"
                >
                  <option value="primary">primary</option>
                  <option value="secondary">secondary</option>
                </select>
              </div>
              <Textarea
                value={aud.description}
                onChange={(event) => updateAudience(aud.id, { description: event.target.value })}
                className="min-h-[60px] text-xs bg-background/50"
                placeholder="Audience description"
              />
              <div className="pt-2 space-y-1.5">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Barriers:</span>
                  <Textarea
                    value={aud.barriers}
                    onChange={(event) => updateAudience(aud.id, { barriers: event.target.value })}
                    className="text-xs text-muted-foreground bg-background/50 min-h-[52px] mt-1"
                    placeholder="What blocks this audience?"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Motivators:</span>
                  <Textarea
                    value={aud.motivators}
                    onChange={(event) => updateAudience(aud.id, { motivators: event.target.value })}
                    className="text-xs text-muted-foreground bg-background/50 min-h-[52px] mt-1"
                    placeholder="What drives this audience?"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Desired Action:</span>
                  <Textarea
                    value={aud.desiredAction}
                    onChange={(event) => updateAudience(aud.id, { desiredAction: event.target.value })}
                    className="text-xs text-foreground font-medium bg-background/50 min-h-[52px] mt-1"
                    placeholder="Desired audience behavior"
                  />
                </div>
              </div>
              <div className="pt-1">
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeAudience(aud.id)}>
                  Remove Audience
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={Brain} title="Insight">
          <Card className="p-4 bg-gradient-card border-primary/20 space-y-2">
            <Label htmlFor="research-insight-text" className="text-[10px] text-muted-foreground/60 uppercase">Insight</Label>
            <Textarea
              id="research-insight-text"
              value={data.insight.insightText}
              onChange={e => onChange({ insight: { ...data.insight, insightText: e.target.value } })}
              onBlur={(event) => onChange({ insight: { ...data.insight, insightText: event.target.value.trim() } })}
              className="bg-background/50 min-h-[80px] text-sm"
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="research-insight-source" className="text-[10px] text-muted-foreground/60 uppercase">Source</Label>
              <Textarea
                id="research-insight-source"
                value={data.insight.evidenceSource}
                onChange={(event) => onChange({ insight: { ...data.insight, evidenceSource: event.target.value } })}
                className="bg-background/50 min-h-[56px] text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="research-insight-confidence" className="text-[10px] text-muted-foreground/60 uppercase">Confidence</Label>
              <select
                id="research-insight-confidence"
                value={data.insight.confidenceLevel}
                onChange={(event) =>
                  onChange({
                    insight: {
                      ...data.insight,
                      confidenceLevel: event.target.value as "low" | "medium" | "high",
                    },
                  })
                }
                className="h-8 rounded border border-input bg-background px-2 text-xs"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
              <Badge variant="secondary" className="text-[10px]">Confidence: {data.insight.confidenceLevel}</Badge>
            </div>
          </Card>
        </Section>

        <Section icon={Zap} title="Driver / Motive">
          <Card className="p-4 bg-gradient-card border-primary/20 space-y-2">
            <div className="space-y-2">
              <Label className="text-[10px] text-muted-foreground/60 uppercase">Driver Motives</Label>
              <div className="grid grid-cols-2 gap-2">
                {DRIVER_MOTIVES.map((motive) => (
                  <label key={motive} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={data.driver.driverTypes.includes(motive)}
                      onChange={() => toggleDriverMotive(motive)}
                      aria-label={`Driver motive ${DRIVER_MOTIVE_LABELS[motive]}`}
                    />
                    <span>{DRIVER_MOTIVE_LABELS[motive]}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {data.driver.driverTypes.length === 0 && (
                  <Badge variant="outline" className="text-[10px]">No motive selected</Badge>
                )}
                {data.driver.driverTypes.map((motive) => (
                  <Badge key={motive} variant="secondary" className="text-[10px]">
                    {DRIVER_MOTIVE_LABELS[motive]}
                  </Badge>
                ))}
              </div>
            </div>
            <Textarea
              value={data.driver.driverText}
              onChange={e => onChange({ driver: { ...data.driver, driverText: e.target.value } })}
              onBlur={(event) => onChange({ driver: { ...data.driver, driverText: event.target.value.trim() } })}
              placeholder={driverTextPlaceholder}
              className="bg-background/50 min-h-[60px] text-sm"
            />
            <div>
              <Label htmlFor="research-driver-why-now" className="text-[10px] text-muted-foreground/60 uppercase">Why now</Label>
              <Textarea
                id="research-driver-why-now"
                value={data.driver.whyNow}
                onChange={(event) => onChange({ driver: { ...data.driver, whyNow: event.target.value } })}
                className="bg-background/50 min-h-[52px] mt-1 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="research-driver-tension" className="text-[10px] text-muted-foreground/60 uppercase">Tension</Label>
              <Textarea
                id="research-driver-tension"
                value={data.driver.tension}
                onChange={(event) => onChange({ driver: { ...data.driver, tension: event.target.value } })}
                className="bg-background/50 min-h-[52px] mt-1 text-xs"
              />
            </div>
          </Card>
        </Section>
      </div>
    </div>
  );
}
