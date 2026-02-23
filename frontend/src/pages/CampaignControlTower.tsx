import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileSignature,
  GitCompare,
  GitFork,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listCampaigns, updateCampaign } from "@/lib/campaign-storage";
import { CampaignData, CampaignIssue, WorkflowStage } from "@/types/campaign";
import {
  compareCampaignSnapshots,
  createCampaignApproval,
  createCampaignIssue,
  createCampaignSnapshot,
  getCampaignHealth,
  getCampaignPreflight,
  listCampaignApprovals,
  listCampaignIssues,
  listCampaignReminders,
  listCampaignSnapshots,
  transitionCampaignStage,
  updateCampaignApproval,
  updateCampaignIssue,
} from "@/lib/campaign-enhancements-api";
import { scorePortfolio } from "@/lib/portfolio-scoring";
import { subscribeRealtimeStream } from "@/lib/realtime-api";
import { useToast } from "@/components/ui/use-toast";

const STAGE_ORDER: WorkflowStage[] = ["draft", "review", "approved", "ready_to_launch"];

function stageLabel(stage: WorkflowStage): string {
  if (stage === "ready_to_launch") {
    return "Ready to Launch";
  }
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export default function CampaignControlTower() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [health, setHealth] = useState<Awaited<ReturnType<typeof getCampaignHealth>> | null>(null);
  const [preflight, setPreflight] = useState<Awaited<ReturnType<typeof getCampaignPreflight>> | null>(null);
  const [issues, setIssues] = useState<CampaignIssue[]>([]);
  const [reminders, setReminders] = useState<Awaited<ReturnType<typeof listCampaignReminders>>>([]);
  const [snapshots, setSnapshots] = useState<Awaited<ReturnType<typeof listCampaignSnapshots>>>([]);
  const [approvals, setApprovals] = useState<Awaited<ReturnType<typeof listCampaignApprovals>>>([]);
  const [snapshotDiff, setSnapshotDiff] = useState<Awaited<ReturnType<typeof compareCampaignSnapshots>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragStage, setDragStage] = useState<WorkflowStage | null>(null);
  const [incidentDraft, setIncidentDraft] = useState({
    title: "",
    description: "",
    severity: "medium" as CampaignIssue["severity"],
    owner: "Planner",
    slaHours: "48",
  });
  const [snapshotLabel, setSnapshotLabel] = useState("Control Tower snapshot");
  const [approvalDraft, setApprovalDraft] = useState({
    role: "strategy_lead" as const,
    approver: "Planner",
    signature: "",
    note: "",
  });
  const [compareBaseId, setCompareBaseId] = useState("");
  const [compareTargetId, setCompareTargetId] = useState("");

  const activeCampaign = useMemo(
    () => campaigns.find((entry) => entry.campaign.id === activeCampaignId) || null,
    [campaigns, activeCampaignId],
  );
  const portfolioScores = useMemo(
    () => (activeCampaign ? scorePortfolio(activeCampaign).slice(0, 5) : []),
    [activeCampaign],
  );

  const loadCampaigns = useCallback(async () => {
    const items = await listCampaigns();
    setCampaigns(items);
    setActiveCampaignId((current) => {
      if (current && items.some((entry) => entry.campaign.id === current)) {
        return current;
      }
      return items[0]?.campaign.id || "";
    });
  }, []);

  const loadDetails = useCallback(async (campaignId: string) => {
    if (!campaignId) {
      return;
    }
    setLoading(true);
    try {
      const [healthRes, preflightRes, issuesRes, remindersRes, snapshotsRes, approvalsRes] = await Promise.all([
        getCampaignHealth(campaignId),
        getCampaignPreflight(campaignId),
        listCampaignIssues(campaignId),
        listCampaignReminders(campaignId),
        listCampaignSnapshots(campaignId),
        listCampaignApprovals(campaignId),
      ]);
      setHealth(healthRes);
      setPreflight(preflightRes);
      setIssues(issuesRes);
      setReminders(remindersRes);
      setSnapshots(snapshotsRes);
      setApprovals(approvalsRes);
      if (!compareBaseId && snapshotsRes[0]?.id) {
        setCompareBaseId(snapshotsRes[0].id);
      }
      if (!compareTargetId && snapshotsRes[1]?.id) {
        setCompareTargetId(snapshotsRes[1].id);
      }
    } finally {
      setLoading(false);
    }
  }, [compareBaseId, compareTargetId]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (!activeCampaignId) {
      return;
    }
    void loadDetails(activeCampaignId);
  }, [activeCampaignId, loadDetails]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (activeCampaignId) {
        void loadDetails(activeCampaignId);
      }
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [activeCampaignId, loadDetails]);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeStream({
      campaignId: activeCampaignId || undefined,
      onUpdate: (payload) => {
        if (payload.entity === "campaign" || payload.entity === "notification") {
          void loadCampaigns().then(() => {
            if (activeCampaignId) {
              return loadDetails(activeCampaignId);
            }
            return Promise.resolve();
          });
        }
      },
    });
    return () => unsubscribe();
  }, [activeCampaignId, loadCampaigns, loadDetails]);

  const handleDropStage = async (targetStage: WorkflowStage) => {
    if (!activeCampaignId || !dragStage || dragStage === targetStage) {
      return;
    }
    try {
      await transitionCampaignStage(activeCampaignId, targetStage, approvalDraft.approver || "Control Tower");
      await loadCampaigns();
      await loadDetails(activeCampaignId);
      toast({
        title: "Stage updated",
        description: `Campaign moved to ${stageLabel(targetStage)}.`,
      });
    } catch (error) {
      toast({
        title: "Stage transition blocked",
        description: error instanceof Error ? error.message : "Could not transition stage.",
        variant: "destructive",
      });
    } finally {
      setDragStage(null);
    }
  };

  const submitIncident = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeCampaignId || !incidentDraft.title.trim()) {
      return;
    }
    await createCampaignIssue(activeCampaignId, {
      title: incidentDraft.title.trim(),
      description: incidentDraft.description.trim(),
      severity: incidentDraft.severity,
      owner: incidentDraft.owner.trim() || "Planner",
      slaHours: Number(incidentDraft.slaHours) || 48,
    });
    setIncidentDraft((current) => ({ ...current, title: "", description: "" }));
    await loadDetails(activeCampaignId);
  };

  const setIssueStatus = async (issueId: string, status: CampaignIssue["status"]) => {
    if (!activeCampaignId) {
      return;
    }
    await updateCampaignIssue(activeCampaignId, issueId, { status });
    await loadDetails(activeCampaignId);
  };

  const createSnapshot = async () => {
    if (!activeCampaignId || !snapshotLabel.trim()) {
      return;
    }
    await createCampaignSnapshot(activeCampaignId, snapshotLabel.trim(), approvalDraft.approver || "Control Tower");
    await loadDetails(activeCampaignId);
  };

  const compareSnapshots = async () => {
    if (!activeCampaignId || !compareBaseId || !compareTargetId || compareBaseId === compareTargetId) {
      return;
    }
    const diff = await compareCampaignSnapshots(activeCampaignId, compareBaseId, compareTargetId);
    setSnapshotDiff(diff);
  };

  const signApproval = async () => {
    if (!activeCampaignId || !approvalDraft.approver.trim() || !approvalDraft.signature.trim()) {
      return;
    }
    await createCampaignApproval(activeCampaignId, {
      role: approvalDraft.role,
      approver: approvalDraft.approver.trim(),
      signature: approvalDraft.signature.trim(),
      note: approvalDraft.note.trim(),
      status: "approved",
    });
    setApprovalDraft((current) => ({ ...current, signature: "", note: "" }));
    await loadDetails(activeCampaignId);
  };

  const updateApprovalStatus = async (approvalId: string, status: "pending" | "approved" | "rejected") => {
    if (!activeCampaignId) {
      return;
    }
    await updateCampaignApproval(activeCampaignId, approvalId, { status });
    await loadDetails(activeCampaignId);
  };

  const updatePortfolioConfig = async (
    scenarioPreset: "balanced" | "growth" | "efficiency" | "risk_control",
    budgetCutPercent: number,
  ) => {
    if (!activeCampaignId || !activeCampaign) {
      return;
    }
    await updateCampaign(activeCampaignId, (existing) => ({
      ...existing,
      portfolio: {
        ...(existing.portfolio || activeCampaign.portfolio || {
          scenarioPreset: "balanced",
          budgetCutPercent: 20,
          weights: {
            impact: 0.3,
            feasibility: 0.2,
            strategicFit: 0.25,
            culturalFit: 0.15,
            risk: 0.1,
          },
        }),
        scenarioPreset,
        budgetCutPercent,
      },
    }));
    await loadCampaigns();
    await loadDetails(activeCampaignId);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-gradient-primary">Campaign Control Tower</h1>
          <p className="text-sm text-muted-foreground">
            Aviation-style operational view for delivery status, risks, approvals, and execution controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={activeCampaignId}
            onChange={(event) => setActiveCampaignId(event.target.value)}
          >
            {campaigns.map((entry) => (
              <option key={entry.campaign.id} value={entry.campaign.id}>
                {entry.campaign.name}
              </option>
            ))}
          </select>
          {activeCampaignId && (
            <Button variant="outline" asChild>
              <Link to={`/campaign/${activeCampaignId}`}>Open Wizard</Link>
            </Button>
          )}
        </div>
      </div>

      {!activeCampaign && <Card className="p-6 text-sm text-muted-foreground">No campaigns available.</Card>}

      {activeCampaign && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Completion</p>
              <p className="text-2xl font-semibold">{health?.completionPercent ?? 0}%</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Open Threads</p>
              <p className="text-2xl font-semibold">{health?.unresolvedComments ?? 0}</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Overdue Issues</p>
              <p className="text-2xl font-semibold">{health?.overdueIssues ?? 0}</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">Preflight Score</p>
              <p className="text-2xl font-semibold">{preflight?.score ?? 0}</p>
            </Card>
          </div>

          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">Stage Gates + WIP</h2>
              <Badge variant="outline">WIP {activeCampaign.workflow?.wipLimit || 3}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {STAGE_ORDER.map((stage) => {
                const active = (activeCampaign.workflow?.stage || "draft") === stage;
                return (
                  <div
                    key={stage}
                    className={`rounded-md border p-3 min-h-[110px] ${active ? "border-primary bg-primary/5" : "border-border"}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => void handleDropStage(stage)}
                  >
                    <p className="text-xs text-muted-foreground uppercase">{stageLabel(stage)}</p>
                    {active && (
                      <div
                        draggable
                        onDragStart={() => setDragStage(stage)}
                        className="mt-3 rounded border border-primary/40 bg-background p-2 text-sm cursor-move"
                      >
                        {activeCampaign.campaign.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h2 className="font-semibold">Risk Heatmap</h2>
              </div>
              {(health?.riskHeatmap || []).map((entry) => (
                <div key={entry.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{entry.label}</span>
                    <span>{entry.score}</span>
                  </div>
                  <div className="h-2 rounded bg-muted">
                    <div className="h-2 rounded bg-amber-500" style={{ width: `${Math.min(100, entry.score)}%` }} />
                  </div>
                </div>
              ))}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Preflight Gate</h2>
                <Badge variant={preflight?.passed ? "default" : "destructive"}>
                  {preflight?.passed ? "Pass" : "Blocked"}
                </Badge>
              </div>
              {(preflight?.checks || []).map((check) => (
                <div key={check.id} className="rounded border border-border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{check.label}</p>
                    <Badge variant={check.passed ? "secondary" : "outline"}>
                      {check.passed ? "OK" : check.severity.toUpperCase()}
                    </Badge>
                  </div>
                  {!check.passed && <p className="text-xs text-muted-foreground mt-1">{check.recommendation}</p>}
                </div>
              ))}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Incident Command</h2>
              </div>
              <form className="grid gap-2 md:grid-cols-2" onSubmit={(event) => void submitIncident(event)}>
                <Input
                  value={incidentDraft.title}
                  onChange={(event) => setIncidentDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Issue title"
                  className="md:col-span-2"
                />
                <Input
                  value={incidentDraft.description}
                  onChange={(event) => setIncidentDraft((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Issue description"
                  className="md:col-span-2"
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={incidentDraft.severity}
                  onChange={(event) =>
                    setIncidentDraft((current) => ({ ...current, severity: event.target.value as CampaignIssue["severity"] }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <Input
                  value={incidentDraft.owner}
                  onChange={(event) => setIncidentDraft((current) => ({ ...current, owner: event.target.value }))}
                  placeholder="Owner"
                />
                <Input
                  value={incidentDraft.slaHours}
                  onChange={(event) => setIncidentDraft((current) => ({ ...current, slaHours: event.target.value }))}
                  placeholder="SLA (hours)"
                />
                <Button type="submit">Create Incident</Button>
              </form>
              <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
                {issues.length === 0 && <p className="text-sm text-muted-foreground">No incidents logged.</p>}
                {issues.map((issue) => (
                  <div key={issue.id} className="rounded border border-border p-2 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{issue.title}</p>
                      <Badge variant={issue.status === "resolved" ? "secondary" : "outline"}>{issue.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{issue.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void setIssueStatus(issue.id, "in_progress")}>
                        In Progress
                      </Button>
                      <Button type="button" size="sm" onClick={() => void setIssueStatus(issue.id, "resolved")}>
                        Resolve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Lifecycle Reminders</h2>
              </div>
              <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
                {reminders.length === 0 && <p className="text-sm text-muted-foreground">No active reminders.</p>}
                {reminders.map((reminder) => (
                  <div key={reminder.id} className="rounded border border-border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <p>{reminder.message}</p>
                      <Badge variant={reminder.severity === "critical" ? "destructive" : "outline"}>
                        {reminder.severity}
                      </Badge>
                    </div>
                    {reminder.dueAt && <p className="text-xs text-muted-foreground mt-1">Due: {new Date(reminder.dueAt).toLocaleString()}</p>}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitFork className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Version Snapshots + Diff</h2>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input value={snapshotLabel} onChange={(event) => setSnapshotLabel(event.target.value)} placeholder="Snapshot label" />
                <Button type="button" variant="outline" onClick={() => void createSnapshot()}>
                  Create Snapshot
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={compareBaseId}
                  onChange={(event) => setCompareBaseId(event.target.value)}
                >
                  <option value="">Base snapshot</option>
                  {snapshots.map((entry) => (
                    <option key={`base-${entry.id}`} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={compareTargetId}
                  onChange={(event) => setCompareTargetId(event.target.value)}
                >
                  <option value="">Target snapshot</option>
                  {snapshots.map((entry) => (
                    <option key={`target-${entry.id}`} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" variant="outline" onClick={() => void compareSnapshots()} className="gap-2">
                <GitCompare className="h-4 w-4" />
                Compare Snapshots
              </Button>
              {snapshotDiff && (
                <div className="rounded border border-border p-3 space-y-2 text-sm">
                  <p className="font-medium">{snapshotDiff.summary}</p>
                  {snapshotDiff.changes.map((change) => (
                    <p key={change.key} className="text-xs">
                      <strong>{change.key}</strong>: {change.before} {"->"} {change.after}
                    </p>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Approvals + Signature Trail</h2>
              </div>
              <div className="grid gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={approvalDraft.role}
                  onChange={(event) =>
                    setApprovalDraft((current) => ({
                      ...current,
                      role: event.target.value as typeof current.role,
                    }))
                  }
                >
                  <option value="strategy_lead">Strategy Lead</option>
                  <option value="creative_lead">Creative Lead</option>
                  <option value="client_partner">Client Partner</option>
                  <option value="compliance">Compliance</option>
                </select>
                <Input
                  value={approvalDraft.approver}
                  onChange={(event) => setApprovalDraft((current) => ({ ...current, approver: event.target.value }))}
                  placeholder="Approver name"
                />
                <Input
                  value={approvalDraft.signature}
                  onChange={(event) => setApprovalDraft((current) => ({ ...current, signature: event.target.value }))}
                  placeholder="Signature"
                />
                <Input
                  value={approvalDraft.note}
                  onChange={(event) => setApprovalDraft((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Approval note"
                />
                <Button type="button" onClick={() => void signApproval()} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Sign Approval
                </Button>
              </div>
              <div className="space-y-2 max-h-[190px] overflow-auto pr-1">
                {approvals.map((approval) => (
                  <div key={approval.id} className="rounded border border-border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{approval.role}</p>
                      <Badge variant={approval.status === "approved" ? "secondary" : "outline"}>
                        {approval.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{approval.approver}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => void updateApprovalStatus(approval.id, "pending")}>
                        Pending
                      </Button>
                      <Button size="sm" onClick={() => void updateApprovalStatus(approval.id, "approved")}>
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="p-4 space-y-3">
            <h2 className="font-semibold">Portfolio Optimizer</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={activeCampaign.portfolio?.scenarioPreset || "balanced"}
                onChange={(event) =>
                  void updatePortfolioConfig(
                    event.target.value as "balanced" | "growth" | "efficiency" | "risk_control",
                    activeCampaign.portfolio?.budgetCutPercent || 20,
                  )
                }
              >
                <option value="balanced">Balanced</option>
                <option value="growth">Growth</option>
                <option value="efficiency">Efficiency</option>
                <option value="risk_control">Risk Control</option>
              </select>
              <label className="text-sm flex items-center gap-2">
                Budget Cut %
                <input
                  type="range"
                  min={0}
                  max={70}
                  value={activeCampaign.portfolio?.budgetCutPercent || 20}
                  onChange={(event) =>
                    void updatePortfolioConfig(
                      activeCampaign.portfolio?.scenarioPreset || "balanced",
                      Number(event.target.value),
                    )
                  }
                />
                <span>{activeCampaign.portfolio?.budgetCutPercent || 20}%</span>
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {portfolioScores.slice(0, 3).map((score, index) => (
                <div key={score.conceptId} className="rounded border border-border p-3">
                  <p className="text-xs text-muted-foreground">Top {index + 1}</p>
                  <p className="font-medium">{score.conceptName}</p>
                  <p className="text-sm">Score: {score.total}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {loading && <p className="text-xs text-muted-foreground">Refreshing control tower data...</p>}
    </div>
  );
}
