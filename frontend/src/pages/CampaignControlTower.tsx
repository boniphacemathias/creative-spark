import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Beaker,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileSignature,
  GitCompare,
  GitFork,
  Globe2,
  Layers,
  Orbit,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { listCampaigns, updateCampaign } from "@/lib/campaign-storage";
import {
  CampaignApproval,
  CampaignData,
  CampaignIssue,
  CampaignReminder,
  WorkflowStage,
} from "@/types/campaign";
import {
  compareCampaignSnapshots,
  createCampaignApproval,
  createCampaignIssue,
  createCampaignSnapshot,
  deleteCampaignApproval,
  deleteCampaignIssue,
  deleteCampaignSnapshot,
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
const APPROVAL_ROLES: CampaignApproval["role"][] = ["strategy_lead", "creative_lead", "client_partner", "compliance"];
const DEFAULT_TEMPLATE_SYSTEM = {
  selectedTemplateId: "template-awareness",
  availableTemplates: [
    {
      id: "template-awareness",
      name: "Awareness Launch",
      industry: "Brand",
      objectiveType: "awareness",
      defaultSections: ["research", "communication_brief", "creative_brief", "concept_board"],
      localizationHints: ["language", "symbols", "social_norms"],
    },
    {
      id: "template-conversion",
      name: "Behavior Conversion",
      industry: "Behavior Change",
      objectiveType: "conversion",
      defaultSections: ["research", "ideation", "concept_development", "prototype"],
      localizationHints: ["barriers", "motivators", "trusted_voices"],
    },
  ],
  localization: {
    language: "English",
    tone: "Human-centered",
    culturalMustInclude: [],
    culturalMustAvoid: [],
  },
};
const DEFAULT_DIGITAL_OPS = {
  attributionModel: "weighted_multi_touch" as const,
  channelSlaHours: [
    { channel: "WhatsApp", firstResponseHours: 1, followUpHours: 24 },
    { channel: "Email", firstResponseHours: 6, followUpHours: 48 },
    { channel: "Social", firstResponseHours: 4, followUpHours: 24 },
  ],
  channelMetrics: [],
};
const DEFAULT_CRM_LIFECYCLE = {
  memberRetentionTarget: 0.6,
  segments: [],
  automationRules: [
    {
      id: "rule-inactive-72h",
      trigger: "no_activity_72h",
      action: "send_reengagement_nudge",
      slaHours: 24,
      active: true,
    },
    {
      id: "rule-unresolved-24h",
      trigger: "unresolved_comment_24h",
      action: "notify_owner",
      slaHours: 12,
      active: true,
    },
  ],
};
const DEFAULT_EXPERIMENT_LAB = {
  experiments: [],
  promoteWinnerConceptId: "",
};
const DEFAULT_GOVERNANCE_POLICY = {
  requiredApprovalRoles: ["strategy_lead", "creative_lead", "client_partner"] as CampaignApproval["role"][],
  minApprovedCount: 2,
  requirePreflightPassForReady: true,
  requireNoCriticalIncidentsForReady: true,
};

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
  const [savingMutation, setSavingMutation] = useState(false);
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
  const [templateMustIncludeDraft, setTemplateMustIncludeDraft] = useState("");
  const [templateMustAvoidDraft, setTemplateMustAvoidDraft] = useState("");
  const [metricDraft, setMetricDraft] = useState({
    channel: "",
    metric: "",
    value: "",
    period: "",
  });
  const [segmentDraft, setSegmentDraft] = useState({
    name: "",
    lifecycleStage: "acquire" as const,
    priority: "medium" as const,
    nextAction: "",
    owner: "",
    size: "0",
    dueAt: "",
  });
  const [experimentDraft, setExperimentDraft] = useState({
    name: "",
    hypothesis: "",
    metric: "",
    baseline: "0",
    target: "0",
  });

  const activeCampaign = useMemo(
    () => campaigns.find((entry) => entry.campaign.id === activeCampaignId) || null,
    [campaigns, activeCampaignId],
  );
  const portfolioScores = useMemo(
    () => (activeCampaign ? scorePortfolio(activeCampaign).slice(0, 5) : []),
    [activeCampaign],
  );
  const reminderTypeLabels = useMemo<Record<CampaignReminder["type"], string>>(
    () => ({
      inactive_concept: "Inactive concept",
      unresolved_mention: "Unresolved mention",
      approval_pending: "Approval pending",
      overdue_issue: "Overdue issue",
      segment_due_action: "CRM segment due",
    }),
    [],
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
      setCompareBaseId((current) => {
        if (current && snapshotsRes.some((entry) => entry.id === current)) {
          return current;
        }
        return snapshotsRes[0]?.id || "";
      });
      setCompareTargetId((current) => {
        if (current && snapshotsRes.some((entry) => entry.id === current)) {
          return current;
        }
        return snapshotsRes[1]?.id || snapshotsRes[0]?.id || "";
      });
      setSnapshotDiff((current) => {
        if (!current) {
          return null;
        }
        const hasBase = snapshotsRes.some((entry) => entry.id === current.baseId);
        const hasTarget = snapshotsRes.some((entry) => entry.id === current.targetId);
        return hasBase && hasTarget ? current : null;
      });
    } catch (error) {
      toast({
        title: "Unable to refresh control tower",
        description: error instanceof Error ? error.message : "Could not load campaign control-tower data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (!activeCampaignId) {
      return;
    }
    setSnapshotDiff(null);
    setCompareBaseId("");
    setCompareTargetId("");
    void loadDetails(activeCampaignId);
  }, [activeCampaignId, loadDetails]);

  useEffect(() => {
    if (!activeCampaign) {
      setTemplateMustIncludeDraft("");
      setTemplateMustAvoidDraft("");
      return;
    }
    setTemplateMustIncludeDraft((activeCampaign.templateSystem?.localization?.culturalMustInclude || []).join("\n"));
    setTemplateMustAvoidDraft((activeCampaign.templateSystem?.localization?.culturalMustAvoid || []).join("\n"));
  }, [activeCampaign]);

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

  const runControlTowerMutation = useCallback(
    async (
      run: () => Promise<unknown>,
      options?: {
        reloadCampaigns?: boolean;
        reloadDetails?: boolean;
        successToast?: { title: string; description: string };
        errorTitle?: string;
      },
    ) => {
      setSavingMutation(true);
      try {
        await run();
        if (options?.reloadCampaigns) {
          await loadCampaigns();
        }
        if (options?.reloadDetails !== false && activeCampaignId) {
          await loadDetails(activeCampaignId);
        }
        if (options?.successToast) {
          toast(options.successToast);
        }
        return true;
      } catch (error) {
        toast({
          title: options?.errorTitle || "Update failed",
          description: error instanceof Error ? error.message : "Could not persist control tower changes.",
          variant: "destructive",
        });
        return false;
      } finally {
        setSavingMutation(false);
      }
    },
    [activeCampaignId, loadCampaigns, loadDetails, toast],
  );

  const applyCampaignUpdate = useCallback(
    async (
      updater: (existing: CampaignData) => CampaignData,
      onSuccess?: { title: string; description: string },
    ) => {
      if (!activeCampaignId) {
        return;
      }
      setSavingMutation(true);
      try {
        const updated = await updateCampaign(activeCampaignId, updater);
        if (!updated) {
          throw new Error("Campaign update failed.");
        }
        await loadCampaigns();
        await loadDetails(activeCampaignId);
        if (onSuccess) {
          toast(onSuccess);
        }
      } catch (error) {
        toast({
          title: "Update failed",
          description: error instanceof Error ? error.message : "Could not persist control tower changes.",
          variant: "destructive",
        });
      } finally {
        setSavingMutation(false);
      }
    },
    [activeCampaignId, loadCampaigns, loadDetails, toast],
  );

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
    const success = await runControlTowerMutation(
      async () => {
        await createCampaignIssue(activeCampaignId, {
          title: incidentDraft.title.trim(),
          description: incidentDraft.description.trim(),
          severity: incidentDraft.severity,
          owner: incidentDraft.owner.trim() || "Planner",
          slaHours: Number(incidentDraft.slaHours) || 48,
        });
      },
      { errorTitle: "Incident creation failed" },
    );
    if (success) {
      setIncidentDraft((current) => ({ ...current, title: "", description: "" }));
    }
  };

  const setIssueStatus = async (issueId: string, status: CampaignIssue["status"]) => {
    if (!activeCampaignId) {
      return;
    }
    await runControlTowerMutation(
      async () => {
        await updateCampaignIssue(activeCampaignId, issueId, { status });
      },
      { errorTitle: "Incident update failed" },
    );
  };

  const deleteIncident = async (issueId: string) => {
    if (!activeCampaignId) {
      return;
    }
    await runControlTowerMutation(
      async () => {
        await deleteCampaignIssue(activeCampaignId, issueId);
      },
      {
        errorTitle: "Incident delete failed",
        successToast: {
          title: "Incident removed",
          description: "The incident was removed from this campaign.",
        },
      },
    );
  };

  const createSnapshot = async () => {
    if (!activeCampaignId || !snapshotLabel.trim()) {
      return;
    }
    const success = await runControlTowerMutation(
      async () => {
        await createCampaignSnapshot(activeCampaignId, snapshotLabel.trim(), approvalDraft.approver || "Control Tower");
      },
      { errorTitle: "Snapshot creation failed" },
    );
    if (success) {
      setSnapshotLabel("Control Tower snapshot");
    }
  };

  const deleteSnapshot = async (snapshotId: string) => {
    if (!activeCampaignId) {
      return;
    }
    const success = await runControlTowerMutation(
      async () => {
        await deleteCampaignSnapshot(activeCampaignId, snapshotId);
      },
      {
        errorTitle: "Snapshot delete failed",
        successToast: {
          title: "Snapshot removed",
          description: "Snapshot history was updated.",
        },
      },
    );
    if (success) {
      setSnapshotDiff((current) => {
        if (!current) {
          return null;
        }
        return current.baseId === snapshotId || current.targetId === snapshotId ? null : current;
      });
    }
  };

  const renameSnapshot = async (snapshotId: string) => {
    if (typeof window === "undefined" || typeof window.prompt !== "function" || !activeCampaign) {
      return;
    }
    const current = snapshots.find((entry) => entry.id === snapshotId);
    if (!current) {
      return;
    }
    const nextLabel = window.prompt("Rename snapshot", current.label);
    if (!nextLabel || !nextLabel.trim() || nextLabel.trim() === current.label) {
      return;
    }
    await applyCampaignUpdate(
      (existing) => ({
        ...existing,
        snapshots: (existing.snapshots || []).map((entry) =>
          entry.id === snapshotId
            ? {
                ...entry,
                label: nextLabel.trim(),
              }
            : entry,
        ),
      }),
      {
        title: "Snapshot renamed",
        description: "Snapshot label was updated.",
      },
    );
  };

  const compareSnapshots = async () => {
    if (!activeCampaignId || !compareBaseId || !compareTargetId || compareBaseId === compareTargetId) {
      setSnapshotDiff(null);
      return;
    }
    await runControlTowerMutation(
      async () => {
        const diff = await compareCampaignSnapshots(activeCampaignId, compareBaseId, compareTargetId);
        setSnapshotDiff(diff);
      },
      { reloadDetails: false, errorTitle: "Snapshot comparison failed" },
    );
  };

  const signApproval = async () => {
    if (!activeCampaignId || !approvalDraft.approver.trim() || !approvalDraft.signature.trim()) {
      return;
    }
    const success = await runControlTowerMutation(
      async () => {
        await createCampaignApproval(activeCampaignId, {
          role: approvalDraft.role,
          approver: approvalDraft.approver.trim(),
          signature: approvalDraft.signature.trim(),
          note: approvalDraft.note.trim(),
          status: "approved",
        });
      },
      { errorTitle: "Approval signature failed" },
    );
    if (success) {
      setApprovalDraft((current) => ({ ...current, signature: "", note: "" }));
    }
  };

  const updateApprovalStatus = async (approvalId: string, status: "pending" | "approved" | "rejected") => {
    if (!activeCampaignId) {
      return;
    }
    await runControlTowerMutation(
      async () => {
        await updateCampaignApproval(activeCampaignId, approvalId, { status });
      },
      { errorTitle: "Approval update failed" },
    );
  };

  const deleteApproval = async (approvalId: string) => {
    if (!activeCampaignId) {
      return;
    }
    await runControlTowerMutation(
      async () => {
        await deleteCampaignApproval(activeCampaignId, approvalId);
      },
      {
        errorTitle: "Approval delete failed",
        successToast: {
          title: "Approval removed",
          description: "Signature trail entry was removed.",
        },
      },
    );
  };

  const updatePortfolioConfig = async (
    scenarioPreset: "balanced" | "growth" | "efficiency" | "risk_control",
    budgetCutPercent: number,
  ) => {
    if (!activeCampaign) {
      return;
    }
    await applyCampaignUpdate((existing) => ({
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
  };

  const saveTemplateLocalization = async () => {
    await applyCampaignUpdate((existing) => {
      const templateSystem = existing.templateSystem || DEFAULT_TEMPLATE_SYSTEM;
      return {
        ...existing,
        templateSystem: {
          ...templateSystem,
          localization: {
            ...(templateSystem.localization || DEFAULT_TEMPLATE_SYSTEM.localization),
            culturalMustInclude: templateMustIncludeDraft
              .split(/\r?\n/)
              .map((entry) => entry.trim())
              .filter(Boolean),
            culturalMustAvoid: templateMustAvoidDraft
              .split(/\r?\n/)
              .map((entry) => entry.trim())
              .filter(Boolean),
          },
        },
      };
    });
  };

  const updateTemplateSelection = async (selectedTemplateId: string) => {
    await applyCampaignUpdate((existing) => {
      const templateSystem = existing.templateSystem || DEFAULT_TEMPLATE_SYSTEM;
      return {
        ...existing,
        templateSystem: {
          ...templateSystem,
          selectedTemplateId,
        },
      };
    });
  };

  const updateTemplateLocalizationField = async (
    field: "language" | "tone",
    value: string,
  ) => {
    await applyCampaignUpdate((existing) => {
      const templateSystem = existing.templateSystem || DEFAULT_TEMPLATE_SYSTEM;
      return {
        ...existing,
        templateSystem: {
          ...templateSystem,
          localization: {
            ...(templateSystem.localization || DEFAULT_TEMPLATE_SYSTEM.localization),
            [field]: value,
          },
        },
      };
    });
  };

  const updateDigitalAttribution = async (
    attributionModel: "last_touch" | "first_touch" | "weighted_multi_touch" | "media_mix",
  ) => {
    await applyCampaignUpdate((existing) => {
      const digitalOps = existing.digitalOps || DEFAULT_DIGITAL_OPS;
      return {
        ...existing,
        digitalOps: {
          ...digitalOps,
          attributionModel,
        },
      };
    });
  };

  const updateDigitalSla = async (
    channel: string,
    field: "firstResponseHours" | "followUpHours",
    value: string,
  ) => {
    await applyCampaignUpdate((existing) => {
      const digitalOps = existing.digitalOps || DEFAULT_DIGITAL_OPS;
      const nextSla = (digitalOps.channelSlaHours || DEFAULT_DIGITAL_OPS.channelSlaHours).map((entry) => {
        if (entry.channel !== channel) {
          return entry;
        }
        return {
          ...entry,
          [field]: Math.max(1, Math.min(720, Number(value) || entry[field])),
        };
      });
      return {
        ...existing,
        digitalOps: {
          ...digitalOps,
          channelSlaHours: nextSla,
        },
      };
    });
  };

  const addDigitalMetric = async () => {
    if (!metricDraft.channel.trim() || !metricDraft.metric.trim()) {
      return;
    }
    await applyCampaignUpdate((existing) => {
      const digitalOps = existing.digitalOps || DEFAULT_DIGITAL_OPS;
      return {
        ...existing,
        digitalOps: {
          ...digitalOps,
          channelMetrics: [
            ...(digitalOps.channelMetrics || []),
            {
              id: `metric-${Date.now()}`,
              channel: metricDraft.channel.trim(),
              metric: metricDraft.metric.trim(),
              value: metricDraft.value.trim(),
              period: metricDraft.period.trim(),
            },
          ],
        },
      };
    });
    setMetricDraft({ channel: "", metric: "", value: "", period: "" });
  };

  const removeDigitalMetric = async (metricId: string) => {
    await applyCampaignUpdate((existing) => {
      const digitalOps = existing.digitalOps || DEFAULT_DIGITAL_OPS;
      return {
        ...existing,
        digitalOps: {
          ...digitalOps,
          channelMetrics: (digitalOps.channelMetrics || []).filter((entry) => entry.id !== metricId),
        },
      };
    });
  };

  const editDigitalMetric = async (metricId: string) => {
    if (typeof window === "undefined" || typeof window.prompt !== "function" || !activeCampaign) {
      return;
    }
    const metric = (activeCampaign.digitalOps?.channelMetrics || []).find((entry) => entry.id === metricId);
    if (!metric) {
      return;
    }
    const channel = window.prompt("Metric channel", metric.channel);
    if (channel === null) {
      return;
    }
    const metricName = window.prompt("Metric name", metric.metric);
    if (metricName === null) {
      return;
    }
    const value = window.prompt("Metric value", metric.value || "");
    if (value === null) {
      return;
    }
    const period = window.prompt("Metric period", metric.period || "");
    if (period === null) {
      return;
    }
    await applyCampaignUpdate((existing) => {
      const digitalOps = existing.digitalOps || DEFAULT_DIGITAL_OPS;
      return {
        ...existing,
        digitalOps: {
          ...digitalOps,
          channelMetrics: (digitalOps.channelMetrics || []).map((entry) =>
            entry.id === metricId
              ? {
                  ...entry,
                  channel: channel.trim(),
                  metric: metricName.trim(),
                  value: value.trim(),
                  period: period.trim(),
                }
              : entry,
          ),
        },
      };
    });
  };

  const updateRetentionTarget = async (retentionTarget: number) => {
    await applyCampaignUpdate((existing) => {
      const crmLifecycle = existing.crmLifecycle || DEFAULT_CRM_LIFECYCLE;
      return {
        ...existing,
        crmLifecycle: {
          ...crmLifecycle,
          memberRetentionTarget: Math.max(0, Math.min(1, retentionTarget)),
        },
      };
    });
  };

  const toggleAutomationRule = async (ruleId: string, nextActive: boolean) => {
    await applyCampaignUpdate((existing) => {
      const crmLifecycle = existing.crmLifecycle || DEFAULT_CRM_LIFECYCLE;
      const automationRules = (crmLifecycle.automationRules || DEFAULT_CRM_LIFECYCLE.automationRules).map((entry) =>
        entry.id === ruleId ? { ...entry, active: nextActive } : entry,
      );
      return {
        ...existing,
        crmLifecycle: {
          ...crmLifecycle,
          automationRules,
        },
      };
    });
  };

  const addCrmSegment = async () => {
    if (!segmentDraft.name.trim() || !segmentDraft.nextAction.trim()) {
      return;
    }
    await applyCampaignUpdate((existing) => {
      const crmLifecycle = existing.crmLifecycle || DEFAULT_CRM_LIFECYCLE;
      return {
        ...existing,
        crmLifecycle: {
          ...crmLifecycle,
          segments: [
            ...(crmLifecycle.segments || []),
            {
              id: `crm-${Date.now()}`,
              name: segmentDraft.name.trim(),
              lifecycleStage: segmentDraft.lifecycleStage,
              size: Math.max(0, Math.round(Number(segmentDraft.size) || 0)),
              priority: segmentDraft.priority,
              nextAction: segmentDraft.nextAction.trim(),
              dueAt: segmentDraft.dueAt ? new Date(segmentDraft.dueAt).toISOString() : new Date().toISOString(),
              owner: segmentDraft.owner.trim() || "CRM Manager",
            },
          ],
        },
      };
    });
    setSegmentDraft({
      name: "",
      lifecycleStage: "acquire",
      priority: "medium",
      nextAction: "",
      owner: "",
      size: "0",
      dueAt: "",
    });
  };

  const updateCrmSegment = async (
    segmentId: string,
    patch: Partial<{
      lifecycleStage: "acquire" | "onboard" | "retain" | "reactivate";
      priority: "high" | "medium" | "low";
      nextAction: string;
      owner: string;
    }>,
  ) => {
    await applyCampaignUpdate((existing) => {
      const crmLifecycle = existing.crmLifecycle || DEFAULT_CRM_LIFECYCLE;
      return {
        ...existing,
        crmLifecycle: {
          ...crmLifecycle,
          segments: (crmLifecycle.segments || []).map((entry) => (entry.id === segmentId ? { ...entry, ...patch } : entry)),
        },
      };
    });
  };

  const removeCrmSegment = async (segmentId: string) => {
    await applyCampaignUpdate((existing) => {
      const crmLifecycle = existing.crmLifecycle || DEFAULT_CRM_LIFECYCLE;
      return {
        ...existing,
        crmLifecycle: {
          ...crmLifecycle,
          segments: (crmLifecycle.segments || []).filter((entry) => entry.id !== segmentId),
        },
      };
    });
  };

  const addExperiment = async () => {
    if (!experimentDraft.name.trim() || !experimentDraft.metric.trim()) {
      return;
    }
    await applyCampaignUpdate((existing) => {
      const experimentLab = existing.experimentLab || DEFAULT_EXPERIMENT_LAB;
      return {
        ...existing,
        experimentLab: {
          ...experimentLab,
          experiments: [
            ...(experimentLab.experiments || []),
            {
              id: `exp-${Date.now()}`,
              name: experimentDraft.name.trim(),
              hypothesis: experimentDraft.hypothesis.trim(),
              metric: experimentDraft.metric.trim(),
              baseline: Number(experimentDraft.baseline) || 0,
              target: Number(experimentDraft.target) || 0,
              status: "planned",
              startDate: new Date().toISOString(),
            },
          ],
        },
      };
    });
    setExperimentDraft({
      name: "",
      hypothesis: "",
      metric: "",
      baseline: "0",
      target: "0",
    });
  };

  const setExperimentStatus = async (
    experimentId: string,
    status: "planned" | "running" | "completed" | "stopped",
  ) => {
    await applyCampaignUpdate((existing) => {
      const experimentLab = existing.experimentLab || DEFAULT_EXPERIMENT_LAB;
      return {
        ...existing,
        experimentLab: {
          ...experimentLab,
          experiments: (experimentLab.experiments || []).map((entry) =>
            entry.id === experimentId
              ? {
                  ...entry,
                  status,
                  endDate: status === "completed" || status === "stopped" ? new Date().toISOString() : entry.endDate,
                }
              : entry,
          ),
        },
      };
    });
  };

  const removeExperiment = async (experimentId: string) => {
    await applyCampaignUpdate((existing) => {
      const experimentLab = existing.experimentLab || DEFAULT_EXPERIMENT_LAB;
      return {
        ...existing,
        experimentLab: {
          ...experimentLab,
          experiments: (experimentLab.experiments || []).filter((entry) => entry.id !== experimentId),
        },
      };
    });
  };

  const setPromotedWinner = async (winnerConceptId: string) => {
    await applyCampaignUpdate((existing) => {
      const experimentLab = existing.experimentLab || DEFAULT_EXPERIMENT_LAB;
      return {
        ...existing,
        experimentLab: {
          ...experimentLab,
          promoteWinnerConceptId: winnerConceptId,
        },
      };
    });
  };

  const updateGovernancePolicy = async (
    patch: Partial<CampaignData["governancePolicy"]>,
  ) => {
    await applyCampaignUpdate((existing) => {
      const governancePolicy = existing.governancePolicy || DEFAULT_GOVERNANCE_POLICY;
      return {
        ...existing,
        governancePolicy: {
          ...governancePolicy,
          ...patch,
        },
      };
    });
  };

  const toggleGovernanceRole = async (
    role: CampaignApproval["role"],
    checked: boolean,
  ) => {
    if (!activeCampaign) {
      return;
    }
    const current = activeCampaign.governancePolicy?.requiredApprovalRoles || DEFAULT_GOVERNANCE_POLICY.requiredApprovalRoles;
    const next = checked ? [...new Set([...current, role])] : current.filter((entry) => entry !== role);
    await updateGovernancePolicy({
      requiredApprovalRoles: next.length > 0 ? next : [...DEFAULT_GOVERNANCE_POLICY.requiredApprovalRoles],
    });
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
                      <Button type="button" size="sm" variant="ghost" onClick={() => void deleteIncident(issue.id)}>
                        Delete
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
                    <p className="text-xs text-muted-foreground mt-1">{reminderTypeLabels[reminder.type]}</p>
                    {reminder.dueAt && <p className="text-xs text-muted-foreground mt-1">Due: {new Date(reminder.dueAt).toLocaleString()}</p>}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Global Template + Localization</h2>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={activeCampaign.templateSystem?.selectedTemplateId || DEFAULT_TEMPLATE_SYSTEM.selectedTemplateId}
                  onChange={(event) => void updateTemplateSelection(event.target.value)}
                >
                  {(activeCampaign.templateSystem?.availableTemplates || DEFAULT_TEMPLATE_SYSTEM.availableTemplates).map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.objectiveType})
                    </option>
                  ))}
                </select>
                <Input
                  value={activeCampaign.templateSystem?.localization?.language || "English"}
                  onChange={(event) => void updateTemplateLocalizationField("language", event.target.value)}
                  placeholder="Localization language"
                />
                <Input
                  className="md:col-span-2"
                  value={activeCampaign.templateSystem?.localization?.tone || ""}
                  onChange={(event) => void updateTemplateLocalizationField("tone", event.target.value)}
                  placeholder="Localized tone guidance"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Must include (one per line)</p>
                  <Textarea
                    value={templateMustIncludeDraft}
                    onChange={(event) => setTemplateMustIncludeDraft(event.target.value)}
                    className="min-h-[110px]"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Must avoid (one per line)</p>
                  <Textarea
                    value={templateMustAvoidDraft}
                    onChange={(event) => setTemplateMustAvoidDraft(event.target.value)}
                    className="min-h-[110px]"
                  />
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => void saveTemplateLocalization()}>
                Save Localization Rules
              </Button>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Orbit className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Digital Ops + Attribution</h2>
              </div>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={activeCampaign.digitalOps?.attributionModel || DEFAULT_DIGITAL_OPS.attributionModel}
                onChange={(event) =>
                  void updateDigitalAttribution(
                    event.target.value as "last_touch" | "first_touch" | "weighted_multi_touch" | "media_mix",
                  )
                }
              >
                <option value="weighted_multi_touch">Weighted Multi-touch</option>
                <option value="last_touch">Last Touch</option>
                <option value="first_touch">First Touch</option>
                <option value="media_mix">Media Mix</option>
              </select>
              <div className="space-y-2">
                {(activeCampaign.digitalOps?.channelSlaHours || DEFAULT_DIGITAL_OPS.channelSlaHours).map((entry) => (
                  <div key={entry.channel} className="grid gap-2 md:grid-cols-3 items-center">
                    <p className="text-sm">{entry.channel}</p>
                    <Input
                      type="number"
                      min={1}
                      value={entry.firstResponseHours}
                      onChange={(event) => void updateDigitalSla(entry.channel, "firstResponseHours", event.target.value)}
                    />
                    <Input
                      type="number"
                      min={1}
                      value={entry.followUpHours}
                      onChange={(event) => void updateDigitalSla(entry.channel, "followUpHours", event.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="rounded border border-border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Channel metrics</p>
                {(activeCampaign.digitalOps?.channelMetrics || []).map((metric) => (
                  <div key={metric.id} className="flex items-center justify-between text-sm gap-2">
                    <p>
                      {metric.channel}: {metric.metric} ({metric.value || "n/a"}) {metric.period ? `- ${metric.period}` : ""}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => void editDigitalMetric(metric.id)}>
                        Edit
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void removeDigitalMetric(metric.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    value={metricDraft.channel}
                    onChange={(event) => setMetricDraft((current) => ({ ...current, channel: event.target.value }))}
                    placeholder="Channel"
                  />
                  <Input
                    value={metricDraft.metric}
                    onChange={(event) => setMetricDraft((current) => ({ ...current, metric: event.target.value }))}
                    placeholder="Metric"
                  />
                  <Input
                    value={metricDraft.value}
                    onChange={(event) => setMetricDraft((current) => ({ ...current, value: event.target.value }))}
                    placeholder="Value"
                  />
                  <Input
                    value={metricDraft.period}
                    onChange={(event) => setMetricDraft((current) => ({ ...current, period: event.target.value }))}
                    placeholder="Period"
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => void addDigitalMetric()}>
                  Add Metric
                </Button>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">CRM Lifecycle Automation</h2>
              </div>
              <label className="text-sm flex items-center gap-2">
                Retention target
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((activeCampaign.crmLifecycle?.memberRetentionTarget || 0) * 100)}
                  onChange={(event) => void updateRetentionTarget(Number(event.target.value) / 100)}
                />
                <span>{Math.round((activeCampaign.crmLifecycle?.memberRetentionTarget || 0) * 100)}%</span>
              </label>
              <div className="rounded border border-border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Automation rules</p>
                {(activeCampaign.crmLifecycle?.automationRules || DEFAULT_CRM_LIFECYCLE.automationRules).map((rule) => (
                  <div key={rule.id} className="flex items-center justify-between gap-3 text-sm">
                    <p>
                      {rule.trigger} {"->"} {rule.action} (SLA {rule.slaHours}h)
                    </p>
                    <Switch checked={rule.active !== false} onCheckedChange={(checked) => void toggleAutomationRule(rule.id, checked)} />
                  </div>
                ))}
              </div>
              <div className="rounded border border-border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Segments</p>
                {(activeCampaign.crmLifecycle?.segments || []).map((segment) => (
                  <div key={segment.id} className="text-sm rounded border border-border p-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{segment.name}</p>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void removeCrmSegment(segment.id)}>
                        Remove
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{segment.nextAction}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      <select
                        aria-label={`segment-${segment.id}-lifecycle`}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={segment.lifecycleStage}
                        onChange={(event) =>
                          void updateCrmSegment(segment.id, {
                            lifecycleStage: event.target.value as "acquire" | "onboard" | "retain" | "reactivate",
                          })
                        }
                      >
                        <option value="acquire">Acquire</option>
                        <option value="onboard">Onboard</option>
                        <option value="retain">Retain</option>
                        <option value="reactivate">Reactivate</option>
                      </select>
                      <select
                        aria-label={`segment-${segment.id}-priority`}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={segment.priority}
                        onChange={(event) =>
                          void updateCrmSegment(segment.id, {
                            priority: event.target.value as "high" | "medium" | "low",
                          })
                        }
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                  </div>
                ))}
                {(activeCampaign.crmLifecycle?.segments || []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No CRM segments yet.</p>
                )}
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    value={segmentDraft.name}
                    onChange={(event) => setSegmentDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Segment name"
                  />
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={segmentDraft.lifecycleStage}
                    onChange={(event) =>
                      setSegmentDraft((current) => ({
                        ...current,
                        lifecycleStage: event.target.value as typeof current.lifecycleStage,
                      }))
                    }
                  >
                    <option value="acquire">Acquire</option>
                    <option value="onboard">Onboard</option>
                    <option value="retain">Retain</option>
                    <option value="reactivate">Reactivate</option>
                  </select>
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={segmentDraft.priority}
                    onChange={(event) =>
                      setSegmentDraft((current) => ({
                        ...current,
                        priority: event.target.value as typeof current.priority,
                      }))
                    }
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <Input
                    type="number"
                    min={0}
                    value={segmentDraft.size}
                    onChange={(event) => setSegmentDraft((current) => ({ ...current, size: event.target.value }))}
                    placeholder="Audience size"
                  />
                  <Input
                    className="md:col-span-2"
                    value={segmentDraft.nextAction}
                    onChange={(event) => setSegmentDraft((current) => ({ ...current, nextAction: event.target.value }))}
                    placeholder="Next action"
                  />
                  <Input
                    value={segmentDraft.owner}
                    onChange={(event) => setSegmentDraft((current) => ({ ...current, owner: event.target.value }))}
                    placeholder="Owner"
                  />
                  <Input
                    type="datetime-local"
                    value={segmentDraft.dueAt}
                    onChange={(event) => setSegmentDraft((current) => ({ ...current, dueAt: event.target.value }))}
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => void addCrmSegment()}>
                  Add CRM Segment
                </Button>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Beaker className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Experiment Lab</h2>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  value={experimentDraft.name}
                  onChange={(event) => setExperimentDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Experiment name"
                />
                <Input
                  value={experimentDraft.metric}
                  onChange={(event) => setExperimentDraft((current) => ({ ...current, metric: event.target.value }))}
                  placeholder="Success metric"
                />
                <Input
                  className="md:col-span-2"
                  value={experimentDraft.hypothesis}
                  onChange={(event) => setExperimentDraft((current) => ({ ...current, hypothesis: event.target.value }))}
                  placeholder="Hypothesis"
                />
                <Input
                  type="number"
                  value={experimentDraft.baseline}
                  onChange={(event) => setExperimentDraft((current) => ({ ...current, baseline: event.target.value }))}
                  placeholder="Baseline"
                />
                <Input
                  type="number"
                  value={experimentDraft.target}
                  onChange={(event) => setExperimentDraft((current) => ({ ...current, target: event.target.value }))}
                  placeholder="Target"
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void addExperiment()}>
                Add Experiment
              </Button>
              <div className="space-y-2 max-h-[200px] overflow-auto pr-1">
                {(activeCampaign.experimentLab?.experiments || []).map((experiment) => (
                  <div key={experiment.id} className="rounded border border-border p-2 text-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{experiment.name}</p>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void removeExperiment(experiment.id)}>
                        Remove
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{experiment.hypothesis}</p>
                    <div className="flex items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={experiment.status}
                        onChange={(event) =>
                          void setExperimentStatus(
                            experiment.id,
                            event.target.value as "planned" | "running" | "completed" | "stopped",
                          )
                        }
                      >
                        <option value="planned">Planned</option>
                        <option value="running">Running</option>
                        <option value="completed">Completed</option>
                        <option value="stopped">Stopped</option>
                      </select>
                      <span className="text-xs text-muted-foreground">
                        {experiment.metric}: {experiment.baseline} {"->"} {experiment.target}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Promote winner concept</p>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={activeCampaign.experimentLab?.promoteWinnerConceptId || ""}
                  onChange={(event) => void setPromotedWinner(event.target.value)}
                >
                  <option value="">No promoted winner</option>
                  {(activeCampaign.concepts || []).map((concept) => (
                    <option key={concept.id} value={concept.id}>
                      {concept.name}
                    </option>
                  ))}
                </select>
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
              <div className="rounded border border-border p-3 space-y-3">
                <p className="text-xs text-muted-foreground">Governance policy gates</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {APPROVAL_ROLES.map((role) => {
                    const selectedRoles =
                      activeCampaign.governancePolicy?.requiredApprovalRoles || DEFAULT_GOVERNANCE_POLICY.requiredApprovalRoles;
                    return (
                      <label key={role} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedRoles.includes(role)}
                          onCheckedChange={(checked) => void toggleGovernanceRole(role, Boolean(checked))}
                        />
                        {role}
                      </label>
                    );
                  })}
                </div>
                <label className="text-sm flex items-center gap-2">
                  Minimum approved signatures
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={activeCampaign.governancePolicy?.minApprovedCount ?? DEFAULT_GOVERNANCE_POLICY.minApprovedCount}
                    onChange={(event) =>
                      void updateGovernancePolicy({
                        minApprovedCount: Math.max(0, Math.min(10, Number(event.target.value) || 0)),
                      })
                    }
                    className="w-24"
                  />
                </label>
                <div className="space-y-2">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>Require preflight pass before ready-to-launch</span>
                    <Switch
                      checked={
                        activeCampaign.governancePolicy?.requirePreflightPassForReady ??
                        DEFAULT_GOVERNANCE_POLICY.requirePreflightPassForReady
                      }
                      onCheckedChange={(checked) =>
                        void updateGovernancePolicy({
                          requirePreflightPassForReady: checked,
                        })
                      }
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>Require no unresolved critical incidents</span>
                    <Switch
                      checked={
                        activeCampaign.governancePolicy?.requireNoCriticalIncidentsForReady ??
                        DEFAULT_GOVERNANCE_POLICY.requireNoCriticalIncidentsForReady
                      }
                      onCheckedChange={(checked) =>
                        void updateGovernancePolicy({
                          requireNoCriticalIncidentsForReady: checked,
                        })
                      }
                    />
                  </label>
                </div>
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

      {(loading || savingMutation) && (
        <p className="text-xs text-muted-foreground">
          {savingMutation ? "Saving control tower changes..." : "Refreshing control tower data..."}
        </p>
      )}
    </div>
  );
}
