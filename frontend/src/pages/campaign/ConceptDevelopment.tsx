import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CampaignData, Concept } from "@/types/campaign";
import { Layers, Plus, ArrowRight, Trash2, Sparkles, RefreshCw, Workflow, Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ConceptCreativeMode,
  evaluateConceptQuality,
  generateConceptFromCampaignWithAI,
  hydrateConceptWithBoardData,
  measureConceptSimilarity,
} from "@/lib/ai-engine/concept-generator";
import { useToast } from "@/components/ui/use-toast";
import { downloadPresentationPpt } from "@/lib/presentation-ppt";
import { EvidencePanel } from "@/components/campaign/EvidencePanel";

interface Props {
  data: CampaignData;
  onChange: (d: Partial<CampaignData>) => void;
}

const ROBUST_CONCEPT_COUNT = 4;
const METHOD_MODE_MAP = {
  Revolution: "bold",
  RelatedWorlds: "pragmatic",
  "Re-expression": "cultural",
  RandomLinks: "balanced",
} as const satisfies Record<CampaignData["ideas"][number]["method"], ConceptCreativeMode>;

function scoreIdeaForConcept(idea: CampaignData["ideas"][number]): number {
  return (
    idea.strategicFitScore * 0.32 +
    idea.originalityScore * 0.28 +
    idea.feasibilityScore * 0.24 +
    idea.culturalFitScore * 0.16
  );
}

function buildRobustLeadIdeaPool(data: CampaignData, count = ROBUST_CONCEPT_COUNT) {
  const selected = data.ideas.filter((idea) => idea.selected);
  const basePool = selected.length > 0 ? selected : data.ideas;
  const ranked = [...basePool].sort((a, b) => scoreIdeaForConcept(b) - scoreIdeaForConcept(a));

  const byMethod = new Map<CampaignData["ideas"][number]["method"], CampaignData["ideas"][number][]>();
  for (const idea of ranked) {
    const current = byMethod.get(idea.method) ?? [];
    current.push(idea);
    byMethod.set(idea.method, current);
  }

  const diversified: CampaignData["ideas"] = [];
  for (const method of ["Revolution", "RelatedWorlds", "Re-expression", "RandomLinks"] as const) {
    const candidate = byMethod.get(method)?.[0];
    if (candidate) {
      diversified.push(candidate);
    }
  }

  for (const idea of ranked) {
    if (diversified.length >= count) {
      break;
    }
    if (!diversified.some((entry) => entry.id === idea.id)) {
      diversified.push(idea);
    }
  }

  return diversified.slice(0, count);
}

function QualityPill({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-md border border-primary/20 bg-background/40 px-2 py-1 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-1 font-semibold">{score}/100</span>
    </div>
  );
}

export function ConceptDevelopment({ data, onChange }: Props) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMode, setGenerationMode] = useState<ConceptCreativeMode>("balanced");
  const [leadIdeaId, setLeadIdeaId] = useState<string>("");
  const selectedIdeas = data.ideas.filter((idea) => idea.selected);
  const robustLeadIdeas = useMemo(() => buildRobustLeadIdeaPool(data, ROBUST_CONCEPT_COUNT), [data]);
  const leadIdeaCandidates = selectedIdeas.length > 0 ? selectedIdeas : data.ideas.slice(0, 6);
  const concept = data.concepts[0];
  const insightPreview = data.insight.insightText || "Add insight in Research Inputs.";
  const driverPreview =
    data.driver.driverTypes.length > 0
      ? data.driver.driverTypes.join(", ")
      : data.driver.driverText || "Add motive/driver in Research Inputs.";
  const actionPreview = data.behavior.desiredBehavior || "Define desired behavior in Research Inputs.";
  const objectivePreview = data.communicationObjective || data.businessObjective || "Define communication objective.";
  const channelPreview = data.channelRoles.map((entry) => entry.channel).filter(Boolean).slice(0, 4);

  const conceptModeLabelMap: Record<ConceptCreativeMode, string> = {
    balanced: "Balanced",
    bold: "Bold",
    pragmatic: "Pragmatic",
    cultural: "Cultural",
  };

  const leadIdeaLabelMap = useMemo(
    () =>
      Object.fromEntries(data.ideas.map((idea) => [idea.id, `${idea.title} (${idea.method})`])) as Record<
        string,
        string
      >,
    [data.ideas],
  );
  const conceptQuality = useMemo(
    () => (concept ? evaluateConceptQuality(concept, data) : null),
    [concept, data],
  );
  const closestSimilarity = useMemo(() => {
    if (!concept || data.concepts.length <= 1) {
      return 0;
    }
    const otherConcepts = data.concepts.filter((item) => item.id !== concept.id);
    if (otherConcepts.length === 0) {
      return 0;
    }
    return Math.round(
      Math.max(...otherConcepts.map((item) => measureConceptSimilarity(concept, item))) * 100,
    );
  }, [concept, data.concepts]);
  const ideationCoverage = useMemo(() => {
    if (robustLeadIdeas.length === 0) {
      return 0;
    }
    const linkedIdeaIds = new Set(data.concepts.flatMap((entry) => entry.selectedIdeaIds));
    const matched = robustLeadIdeas.filter((idea) => linkedIdeaIds.has(idea.id)).length;
    return Math.round((matched / robustLeadIdeas.length) * 100);
  }, [data.concepts, robustLeadIdeas]);
  const isIdeationSynced = robustLeadIdeas.length > 0 && ideationCoverage >= 75;

  useEffect(() => {
    if (leadIdeaCandidates.length === 0) {
      if (leadIdeaId !== "") {
        setLeadIdeaId("");
      }
      return;
    }

    const stillValid = leadIdeaCandidates.some((idea) => idea.id === leadIdeaId);
    if (!stillValid) {
      setLeadIdeaId(leadIdeaCandidates[0].id);
    }
  }, [leadIdeaCandidates, leadIdeaId]);

  const createConcept = async () => {
    if (isGenerating) {
      return;
    }

    setIsGenerating(true);
    try {
      const nextConcept = await generateConceptFromCampaignWithAI(data, {
        mode: generationMode,
        leadIdeaId: leadIdeaId || undefined,
        existingConcepts: data.concepts,
      });
      const hydrated = hydrateConceptWithBoardData(data, nextConcept);
      onChange({ concepts: [hydrated, ...data.concepts] });
      const quality = evaluateConceptQuality(hydrated, data);
      const leadIdeaName = nextConcept.selectedIdeaIds[0]
        ? leadIdeaLabelMap[nextConcept.selectedIdeaIds[0]] || "selected idea"
        : "campaign context";
      toast({
        title: "Concept generated",
        description: `Built in ${conceptModeLabelMap[generationMode]} mode from ${leadIdeaName}. Quality ${quality.total}/100.`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const syncFromIdeation = useCallback(async () => {
    if (isGenerating) {
      return;
    }
    if (robustLeadIdeas.length === 0) {
      toast({
        title: "No ideation input",
        description: "Generate or select 4Rs ideas first to automate robust concepts.",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const generatedConcepts: Concept[] = [];

      for (const leadIdea of robustLeadIdeas) {
        const mode = METHOD_MODE_MAP[leadIdea.method] ?? generationMode;
        const conceptSource: CampaignData = {
          ...data,
          concepts: generatedConcepts,
          ideas: data.ideas,
        };

        const generated = await generateConceptFromCampaignWithAI(conceptSource, {
          mode,
          leadIdeaId: leadIdea.id,
          existingConcepts: generatedConcepts,
        });
        generatedConcepts.push(hydrateConceptWithBoardData(data, generated));
      }

      onChange({ concepts: generatedConcepts });
      const averageQuality = Math.round(
        generatedConcepts.reduce((sum, entry) => sum + evaluateConceptQuality(entry, data).total, 0) /
          Math.max(1, generatedConcepts.length),
      );

      toast({
        title: "Concept pack synchronized",
        description: `${generatedConcepts.length} robust concepts generated from 4Rs ideation. Avg quality ${averageQuality}/100.`,
      });
    } finally {
      setIsGenerating(false);
    }
  }, [data, generationMode, isGenerating, onChange, robustLeadIdeas, toast]);

  const regeneratePrimaryConcept = async () => {
    if (isGenerating) {
      return;
    }

    setIsGenerating(true);
    try {
      const regenerated = await generateConceptFromCampaignWithAI(data, {
        mode: generationMode,
        leadIdeaId: leadIdeaId || undefined,
        existingConcepts: data.concepts,
      });
      const hydrated = hydrateConceptWithBoardData(data, regenerated);
      const nextConcepts = data.concepts.length > 0
        ? [hydrated, ...data.concepts.slice(1)]
        : [hydrated];

      onChange({ concepts: nextConcepts });
      const quality = evaluateConceptQuality(hydrated, data);
      toast({
        title: "Primary concept regenerated",
        description: `Updated with ${conceptModeLabelMap[generationMode]} concept direction. Quality ${quality.total}/100.`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const setPrimaryConcept = (conceptId: string) => {
    const selected = data.concepts.find((item) => item.id === conceptId);
    if (!selected) {
      return;
    }

    onChange({
      concepts: [selected, ...data.concepts.filter((item) => item.id !== conceptId)],
    });
  };

  const setStatus = (conceptId: string, status: Concept["status"]) => {
    onChange({
      concepts: data.concepts.map((item) => (item.id === conceptId ? { ...item, status } : item)),
    });
  };

  const deleteConcept = (conceptId: string) => {
    onChange({
      concepts: data.concepts.filter((item) => item.id !== conceptId),
    });
  };

  const exportPresentation = () => {
    downloadPresentationPpt({
      filename: `${data.campaign.name}-concept-development`,
      title: "Concept Development",
      subtitle: "From ideation signals to campaign-ready concepts",
      campaignName: data.campaign.name,
      complianceTag: `${(data.approvals || []).filter((entry) => entry.status === "approved").length} approval(s) signed`,
      slides: [
        {
          heading: "Concept Inputs",
          bullets: [
            `Insight: ${insightPreview}`,
            `Driver: ${driverPreview}`,
            `Desired behavior: ${actionPreview}`,
            `Objective: ${objectivePreview}`,
            `4Rs sync coverage: ${ideationCoverage}%`,
          ],
        },
        ...data.concepts.slice(0, 8).map((entry, index) => {
          const quality = evaluateConceptQuality(entry, data);
          return {
            heading: `${index + 1}. ${entry.name}`,
            bullets: [
              `Status: ${entry.status}`,
              `SMP: ${entry.smp || "Not provided."}`,
              `Key Promise: ${entry.keyPromise || "Not provided."}`,
              `Big Idea: ${entry.bigIdea || "Not provided."}`,
              `Quality: ${quality.total}/100`,
              `Channels: ${entry.channels.join(", ") || "None listed"}`,
            ],
          };
        }),
      ],
    });

    toast({
      title: "PPT exported",
      description: "Concept Development presentation downloaded.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Layers className="h-5 w-5 text-primary" /></div>
          <div>
            <h2 className="text-xl font-display font-bold">Concept Development</h2>
            <p className="text-sm text-muted-foreground">Auto-generated concepts from insight + motive + selected 4Rs ideas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Mode</span>
            <select
              aria-label="Concept generation mode"
              className="h-9 rounded border border-input bg-background px-2 text-xs text-foreground"
              value={generationMode}
              onChange={(event) => setGenerationMode(event.target.value as ConceptCreativeMode)}
            >
              {Object.entries(conceptModeLabelMap).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Lead Idea</span>
            <select
              aria-label="Concept lead idea"
              className="h-9 min-w-[240px] rounded border border-input bg-background px-2 text-xs text-foreground"
              value={leadIdeaId}
              onChange={(event) => setLeadIdeaId(event.target.value)}
            >
              {leadIdeaCandidates.length > 0 ? (
                leadIdeaCandidates.map((idea) => (
                  <option key={idea.id} value={idea.id}>
                    {idea.title} ({idea.method})
                  </option>
                ))
              ) : (
                <option value="">No ideas available</option>
              )}
            </select>
          </label>
          <Button
            className="gap-1"
            variant="secondary"
            onClick={() => void syncFromIdeation()}
            disabled={isGenerating}
          >
            <Workflow className="h-3 w-3" /> {isGenerating ? "Generating..." : "Sync from 4Rs"}
          </Button>
          <Button className="gap-1 shadow-amber" onClick={() => void createConcept()} disabled={isGenerating}>
            <Plus className="h-3 w-3" /> {isGenerating ? "Generating..." : "New Concept"}
          </Button>
          <Button className="gap-1" variant="outline" onClick={() => void regeneratePrimaryConcept()} disabled={isGenerating}>
            <RefreshCw className="h-3 w-3" /> {isGenerating ? "Generating..." : "Regenerate"}
          </Button>
          <Button className="gap-1" variant="outline" onClick={exportPresentation}>
            <Download className="h-3 w-3" /> Export PPT
          </Button>
        </div>
      </div>

      <EvidencePanel
        data={data}
        onChange={onChange}
        section="concept_development"
        title="Evidence Registry (Concept Development)"
      />

      <Card className="p-4 bg-gradient-card space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary/80">Concept Catalyst Context</h4>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 text-xs">
          <div>
            <p className="text-muted-foreground mb-1">Insight</p>
            <p className="font-medium">{insightPreview}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Driver / Motive</p>
            <p className="font-medium">{driverPreview}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Desired Behavior</p>
            <p className="font-medium">{actionPreview}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1">Objective</p>
            <p className="font-medium">{objectivePreview}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {robustLeadIdeas.length > 0 && (
            <Badge variant={isIdeationSynced ? "secondary" : "outline"} className="text-[10px]">
              4Rs Sync Coverage: {ideationCoverage}%
            </Badge>
          )}
          {robustLeadIdeas.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              Robust concept queue: {robustLeadIdeas.length}
            </Badge>
          )}
          {channelPreview.length > 0 ? (
            channelPreview.map((channel) => (
              <Badge key={channel} variant="outline" className="text-[10px]">
                {channel}
              </Badge>
            ))
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Add channels in Communication Brief
            </Badge>
          )}
        </div>
      </Card>

      {selectedIdeas.length > 0 && (
        <Card className="p-4 bg-gradient-card">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Selected Ideas ({selectedIdeas.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {selectedIdeas.map((idea) => (
              <Badge key={idea.id} variant="outline" className="text-xs border-primary/30">
                {idea.title}
                <span className="ml-1 text-muted-foreground/50">({idea.method})</span>
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {robustLeadIdeas.length > 0 && (
        <Card className="p-4 bg-gradient-card space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Robust Concept Queue (from 4Rs)
          </h4>
          <div className="grid gap-2 md:grid-cols-2">
            {robustLeadIdeas.map((idea, index) => (
              <div key={idea.id} className="rounded-md border border-border/70 p-2 text-xs bg-background/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{index + 1}. {idea.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {METHOD_MODE_MAP[idea.method]} mode
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1">{idea.method} • Score {Math.round(scoreIdeaForConcept(idea) * 10) / 10}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.concepts.length > 1 && (
        <Card className="p-4 bg-gradient-card space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Concepts ({data.concepts.length})</h4>
          <div className="grid gap-2 md:grid-cols-2">
            {data.concepts.map((item, index) => (
              <Card key={item.id} className="p-3 bg-background/30">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.smp}</p>
                    {index !== 0 && concept && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Similarity to active: {Math.round(measureConceptSimilarity(concept, item) * 100)}%
                      </p>
                    )}
                  </div>
                  <Badge variant={index === 0 ? "default" : "outline"} className="text-[10px]">
                    {index === 0 ? "Active" : item.status}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {index !== 0 && (
                    <Button size="sm" variant="outline" onClick={() => setPrimaryConcept(item.id)}>
                      Use in Brief
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.id, "shortlisted")}>Shortlist</Button>
                  <Button size="sm" variant="outline" onClick={() => setStatus(item.id, "final")}>Final</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteConcept(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}

      {concept && (
        <Card className="p-6 bg-gradient-card border-primary/20 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Badge variant="outline" className="text-[10px] mb-2 border-primary/30">{concept.status}</Badge>
              <h3 className="text-lg font-display font-bold">{concept.name}</h3>
              {concept.tagline && <p className="text-sm text-primary/90 mt-1">{concept.tagline}</p>}
            </div>
            <Badge variant="secondary" className="text-[10px] gap-1"><Sparkles className="h-3 w-3" /> AI-generated</Badge>
          </div>

          <div className="flex flex-wrap gap-1">
            {concept.selectedIdeaIds.slice(0, 3).map((ideaId) => (
              <Badge key={ideaId} variant="outline" className="text-[10px]">
                {leadIdeaLabelMap[ideaId] || ideaId}
              </Badge>
            ))}
            {conceptQuality && (
              <Badge variant={conceptQuality.passes ? "secondary" : "outline"} className="text-[10px]">
                Quality {conceptQuality.total}/100
              </Badge>
            )}
            {closestSimilarity > 0 && (
              <Badge variant={closestSimilarity >= 78 ? "outline" : "secondary"} className="text-[10px]">
                Closest similarity: {closestSimilarity}%
              </Badge>
            )}
          </div>

          <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Big Idea</span>
            <p className="text-sm mt-1 italic">"{concept.bigIdea}"</p>
          </div>

          {conceptQuality && (
            <Card className="p-3 bg-background/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Concept Quality Checkpoint
                </span>
                <Badge variant={conceptQuality.passes ? "secondary" : "outline"} className="text-[10px]">
                  {conceptQuality.passes ? "Ready" : "Needs refinement"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <QualityPill label="Scalable" score={conceptQuality.scalable} />
                <QualityPill label="Universal" score={conceptQuality.universal} />
                <QualityPill label="Memorable" score={conceptQuality.memorable} />
                <QualityPill label="Simple" score={conceptQuality.simple} />
                <QualityPill label="Unexpected+Relevant" score={conceptQuality.unexpectedRelevant} />
              </div>
              {!conceptQuality.passes && conceptQuality.suggestions.length > 0 && (
                <p className="text-[11px] text-amber-700">{conceptQuality.suggestions[0]}</p>
              )}
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">SMP</span>
              <p className="text-lg font-display font-bold text-gradient-primary mt-1">"{concept.smp}"</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Key Promise</span>
              <p className="text-sm mt-1">{concept.keyPromise}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Support Points</span>
              <ul className="mt-1 space-y-1">
                {concept.supportPoints.map((sp, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>{sp}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Channels</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {concept.channels.map((ch) => (
                  <Badge key={ch} variant="secondary" className="text-[10px]">{ch}</Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Key Visual</span>
              <p className="text-xs mt-1 text-muted-foreground">{concept.keyVisualDescription || "Auto-generated from selected idea."}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Execution Rationale</span>
              <p className="text-xs mt-1 text-muted-foreground">{concept.executionRationale || "Aligns motive, insight, and action."}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Behavior Trigger</span>
              <p className="text-xs mt-1 text-muted-foreground">{concept.behaviorTrigger || "Prompt with explicit CTA."}</p>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Risks & Mitigations</span>
            <ul className="mt-1 space-y-1">
              {concept.risks.map((r, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="text-destructive mt-0.5">!</span>{r}
                </li>
              ))}
            </ul>
          </div>

          <div className="pt-2">
            <Button className="gap-1" variant="outline">
              Proceed to Board <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
