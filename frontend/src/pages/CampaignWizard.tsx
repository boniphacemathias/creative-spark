import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, CircleAlert, CircleCheck, Download, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WizardStepper } from "@/components/WizardStepper";
import { CampaignData, TeamMessage } from "@/types/campaign";
import { CampaignSetup } from "./campaign/CampaignSetup";
import { ResearchInputs } from "./campaign/ResearchInputs";
import { CommunicationBriefStep } from "./campaign/CommunicationBriefStep";
import { CreativeBriefStep } from "./campaign/CreativeBriefStep";
import { IdeationEngine } from "./campaign/IdeationEngine";
import { ConceptDevelopment } from "./campaign/ConceptDevelopment";
import { ConceptBoard } from "./campaign/ConceptBoard";
import { TeamChatPanel } from "./campaign/TeamChatPanel";
import { motion, AnimatePresence } from "framer-motion";
import { useBeforeUnload, useNavigate, useParams } from "react-router-dom";
import { getCampaignById, upsertCampaign } from "@/lib/campaign-storage";
import { useToast } from "@/components/ui/use-toast";
import { validateWizardStep } from "./campaign/wizard-validation";
import { FieldAIAssistPopup } from "@/components/ai-chat/FieldAIAssistPopup";
import { useAppRole } from "@/hooks/use-app-role";
import { CAMPAIGN_PATCH_APPLIED_EVENT, CampaignPatchAppliedDetail } from "@/lib/campaign-events";
import { subscribeRealtimeStream } from "@/lib/realtime-api";
import { downloadClientReportDoc } from "@/lib/client-report";
import { runPreflightChecks } from "@/lib/preflight";

const MAX_STEP = 6;
const STANDARD_AUTOSAVE_DELAY_MS = 350;
const COLLABORATION_AUTOSAVE_DELAY_MS = 80;
const LIVE_SYNC_POLL_INTERVAL_MS = 2000;
const IS_TEST_RUNTIME =
  typeof import.meta !== "undefined" &&
  typeof import.meta.env === "object" &&
  import.meta.env.MODE === "test";

type SaveState = "idle" | "saving" | "saved" | "error";

function mergeTeamMessages(localMessages: TeamMessage[], remoteMessages: TeamMessage[]): TeamMessage[] {
  const byId = new Map<string, TeamMessage>();
  for (const message of localMessages) {
    byId.set(message.id, message);
  }
  for (const message of remoteMessages) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
}

function mergeCollaborationState(local: CampaignData["collaboration"], remote: CampaignData["collaboration"]) {
  const members: string[] = [];
  for (const name of [...local.members, ...remote.members]) {
    if (!members.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      members.push(name);
    }
  }
  return {
    members,
    messages: mergeTeamMessages(local.messages, remote.messages),
  };
}

export default function CampaignWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { permissions } = useAppRole();

  const [step, setStep] = useState(0);
  const [data, setData] = useState<CampaignData | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [lastLiveSyncAt, setLastLiveSyncAt] = useState<Date | null>(null);

  const persistedSnapshotRef = useRef<string>("");
  const saveTimerRef = useRef<number | null>(null);
  const fieldAssistScopeRef = useRef<HTMLDivElement | null>(null);
  const prioritizeFastSaveRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const toastRef = useRef(toast);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const updateData = (partial: Partial<CampaignData>) => {
    if (!permissions.canManageCampaign) {
      return;
    }
    if (partial.collaboration) {
      prioritizeFastSaveRef.current = true;
    }
    setData((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const syncCampaignFromServer = useCallback(async (force = false) => {
    if (!id) {
      return;
    }

    if (!force && typeof document !== "undefined" && document.hidden) {
      return;
    }

    if (syncInFlightRef.current) {
      pendingSyncRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    try {
      const remote = await getCampaignById(id);
      if (!remote) {
        return;
      }

      setData((previous) => {
        if (!previous || previous.campaign.id !== id) {
          return previous;
        }

        const hasUnsavedLocalChanges =
          JSON.stringify(previous) !== persistedSnapshotRef.current;
        if (!hasUnsavedLocalChanges) {
          const remoteSnapshot = JSON.stringify(remote);
          if (remoteSnapshot === JSON.stringify(previous)) {
            return previous;
          }
          persistedSnapshotRef.current = remoteSnapshot;
          return remote;
        }

        const mergedCollaboration = mergeCollaborationState(
          previous.collaboration,
          remote.collaboration,
        );
        if (JSON.stringify(previous.collaboration) === JSON.stringify(mergedCollaboration)) {
          return previous;
        }

        return {
          ...previous,
          collaboration: mergedCollaboration,
        };
      });
      setLastLiveSyncAt(new Date());
    } catch {
      // Silent live-sync failure: local editing should not be interrupted.
    } finally {
      syncInFlightRef.current = false;
      if (pendingSyncRef.current) {
        pendingSyncRef.current = false;
        void syncCampaignFromServer(force);
      }
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      navigate("/");
      return;
    }

    let active = true;
    const load = async () => {
      const campaign = await getCampaignById(id);
      if (!campaign) {
        toastRef.current({
          title: "Campaign not found",
          description: "The campaign may have been deleted.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      if (!active) {
        return;
      }

      setStep(0);
      setData(campaign);
      persistedSnapshotRef.current = JSON.stringify(campaign);
      setSaveState("idle");
      setLastLiveSyncAt(new Date());
    };

    void load();
    return () => {
      active = false;
    };
  }, [id, navigate]);

  useEffect(() => {
    if (!id) {
      return;
    }
    if (IS_TEST_RUNTIME) {
      return;
    }

    void syncCampaignFromServer(true);
    const unsubscribe = subscribeRealtimeStream({
      campaignId: id,
      onUpdate: (payload) => {
        if (!payload || typeof payload !== "object") {
          return;
        }
        if (
          payload.entity === "campaign" &&
          payload.action === "deleted" &&
          payload.campaignId === id
        ) {
          toast({
            title: "Campaign deleted",
            description: "This campaign was removed in another session.",
            variant: "destructive",
          });
          navigate("/");
          return;
        }
        if (payload.entity === "campaign" || payload.entity === "chat") {
          void syncCampaignFromServer(true);
        }
      },
      onError: () => {
        // Non-blocking: view remains usable even if realtime stream reconnects.
      },
    });

    return () => unsubscribe();
  }, [id, navigate, syncCampaignFromServer, toast]);

  useEffect(() => {
    if (!id) {
      return;
    }
    if (IS_TEST_RUNTIME) {
      return;
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const pollId = window.setInterval(() => {
      void syncCampaignFromServer(false);
    }, LIVE_SYNC_POLL_INTERVAL_MS);

    const onFocus = () => {
      void syncCampaignFromServer(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncCampaignFromServer(true);
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [id, syncCampaignFromServer]);

  useEffect(() => {
    const onPatchApplied = (event: Event) => {
      const customEvent = event as CustomEvent<CampaignPatchAppliedDetail>;
      if (!customEvent.detail || customEvent.detail.campaignId !== id) {
        return;
      }

      const patch = customEvent.detail.patch;
      setData((prev) => (prev ? { ...prev, ...patch } : prev));
    };

    window.addEventListener(CAMPAIGN_PATCH_APPLIED_EVENT, onPatchApplied);
    return () => {
      window.removeEventListener(CAMPAIGN_PATCH_APPLIED_EVENT, onPatchApplied);
    };
  }, [id]);

  const persistNow = useCallback(async () => {
    if (!permissions.canManageCampaign) {
      return true;
    }
    if (!id || !data || data.campaign.id !== id) {
      return false;
    }

    const nextSnapshot = JSON.stringify(data);
    if (nextSnapshot === persistedSnapshotRef.current) {
      return true;
    }

    setSaveState("saving");
    try {
      const campaigns = await upsertCampaign(data);
      const saved = campaigns.find((entry) => entry.campaign.id === id) ?? data;
      persistedSnapshotRef.current = JSON.stringify(saved);
      setSaveState("saved");
      setLastSavedAt(new Date());
      return true;
    } catch {
      setSaveState("error");
      toastRef.current({
        title: "Save failed",
        description: "Your latest changes could not be persisted.",
        variant: "destructive",
      });
      return false;
    }
  }, [data, id, permissions.canManageCampaign]);

  useEffect(() => {
    if (!id || !data || data.campaign.id !== id) {
      return;
    }

    const nextSnapshot = JSON.stringify(data);
    if (nextSnapshot === persistedSnapshotRef.current) {
      return;
    }

    setSaveState("saving");
    const saveDelay = prioritizeFastSaveRef.current
      ? COLLABORATION_AUTOSAVE_DELAY_MS
      : STANDARD_AUTOSAVE_DELAY_MS;
    prioritizeFastSaveRef.current = false;
    saveTimerRef.current = window.setTimeout(() => {
      void persistNow();
      saveTimerRef.current = null;
    }, saveDelay);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [data, id, persistNow]);

  const hasUnsavedChanges =
    Boolean(data) && JSON.stringify(data) !== persistedSnapshotRef.current;
  const preflightReport = useMemo(
    () => (IS_TEST_RUNTIME ? null : data ? runPreflightChecks(data) : null),
    [data],
  );
  const shouldWarnOnLeave = hasUnsavedChanges || saveState === "saving";

  useBeforeUnload((event) => {
    if (!shouldWarnOnLeave) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        if (!permissions.canManageCampaign) {
          return;
        }
        event.preventDefault();
        void persistNow();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [permissions.canManageCampaign, persistNow]);

  const handleBack = () => {
    if (shouldWarnOnLeave) {
      const confirmed = window.confirm("You have unsaved changes. Leave this page anyway?");
      if (!confirmed) {
        return;
      }
    }

    navigate("/");
  };

  const exportClientReport = () => {
    if (!data) {
      return;
    }
    if (preflightReport && !preflightReport.passed) {
      toast({
        title: "Preflight gate blocked export",
        description: `Score ${preflightReport.score}/${preflightReport.passThreshold}. Resolve critical checks before export.`,
        variant: "destructive",
      });
      return;
    }
    downloadClientReportDoc(data, { mode: "technical" });
    toast({
      title: "Client report exported",
      description: "Full campaign report downloaded.",
    });
  };

  useEffect(() => {
    if (IS_TEST_RUNTIME) {
      return;
    }
    const onCampaignCommand = (event: Event) => {
      const customEvent = event as CustomEvent<{ campaignId?: string; command?: string }>;
      if (!id || !customEvent.detail || customEvent.detail.campaignId !== id) {
        return;
      }

      if (customEvent.detail.command === "run-preflight") {
        toast({
          title: "Preflight report",
          description: preflightReport
            ? `Score ${preflightReport.score}/${preflightReport.passThreshold}. ${
                preflightReport.passed ? "Ready for export." : "Submission blocked until fixes are complete."
              }`
            : "Preflight data unavailable.",
        });
        return;
      }

      if (customEvent.detail.command === "export-report") {
        exportClientReport();
      }
    };

    window.addEventListener("campaign-command", onCampaignCommand);
    return () => window.removeEventListener("campaign-command", onCampaignCommand);
  }, [id, preflightReport, toast]);

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading campaign...</div>;
  }

  const validation = validateWizardStep(step, data);

  const handleStepClick = (targetStep: number) => {
    const boundedStep = Math.max(0, Math.min(MAX_STEP, targetStep));

    if (boundedStep <= step) {
      setStep(boundedStep);
      return;
    }

    if (!permissions.canManageCampaign) {
      setStep(boundedStep);
      return;
    }

    for (let cursor = 0; cursor < boundedStep; cursor += 1) {
      const check = validateWizardStep(cursor, data);
      if (!check.isValid) {
        setStep(cursor);
        toast({
          title: "Complete required fields",
          description: check.issues[0],
          variant: "destructive",
        });
        return;
      }
    }

    setStep(boundedStep);
  };

  const handleNext = () => {
    if (!permissions.canManageCampaign) {
      setStep((currentStep) => Math.min(MAX_STEP, currentStep + 1));
      return;
    }
    const check = validateWizardStep(step, data);
    if (!check.isValid) {
      toast({
        title: "Complete required fields",
        description: check.issues[0],
        variant: "destructive",
      });
      return;
    }

    setStep((currentStep) => Math.min(MAX_STEP, currentStep + 1));
  };

  const stepComponents = [
    <CampaignSetup key="setup" data={data} onChange={updateData} />,
    <ResearchInputs key="research" data={data} onChange={updateData} />,
    <CommunicationBriefStep key="comm" data={data} onChange={updateData} />,
    <CreativeBriefStep key="creative" data={data} onChange={updateData} />,
    <IdeationEngine key="ideation" data={data} onChange={updateData} />,
    <ConceptDevelopment key="concepts" data={data} onChange={updateData} />,
    <ConceptBoard key="board" data={data} onChange={updateData} />,
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 flex items-center gap-4 shrink-0 bg-background/50">
        <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={handleBack}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <div className="h-5 w-px bg-border" />
        <h2 className="font-display font-semibold text-foreground truncate">{data.campaign.name}</h2>
        <div className="ml-auto text-xs text-muted-foreground flex items-center gap-2">
          {preflightReport && (
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${
                preflightReport.passed
                  ? "border-primary/40 text-primary"
                  : "border-destructive/40 text-destructive"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Preflight {preflightReport.score}
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={exportClientReport}
          >
            <Download className="h-3.5 w-3.5" />
            Export Full Report
          </Button>
          {!permissions.canManageCampaign && (
            <span className="text-amber-600">Read-only mode</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={persistNow}
            disabled={!permissions.canManageCampaign || !hasUnsavedChanges || saveState === "saving"}
          >
            Save Now
          </Button>
          {saveState === "saving" && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>}
          {saveState === "saved" && <><CircleCheck className="h-3.5 w-3.5 text-primary" /> Saved{lastSavedAt ? ` ${lastSavedAt.toLocaleTimeString()}` : ""}</>}
          {saveState === "error" && <><CircleAlert className="h-3.5 w-3.5 text-destructive" /> Save failed</>}
          {lastLiveSyncAt && <span>Live sync {lastLiveSyncAt.toLocaleTimeString()}</span>}
        </div>
      </div>

      <div className="border-b border-border px-4 py-2 shrink-0 bg-background/30 space-y-2">
        <WizardStepper currentStep={step} onStepClick={handleStepClick} />
        {!validation.isValid && (
          <p className="text-xs text-destructive">{validation.issues[0]}</p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 lg:p-6" ref={fieldAssistScopeRef}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className={
              IS_TEST_RUNTIME
                ? "max-w-6xl mx-auto"
                : "max-w-6xl mx-auto grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"
            }
          >
            <div className="min-w-0">{stepComponents[step]}</div>
            {!IS_TEST_RUNTIME && (
              <div className="min-w-0">
                <TeamChatPanel data={data} onChange={updateData} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {permissions.canManageCampaign && <FieldAIAssistPopup campaign={data} scopeRef={fieldAssistScopeRef} />}

      <div className="border-t border-border px-4 py-3 flex items-center justify-between shrink-0 bg-background/80 backdrop-blur-sm">
        <Button variant="outline" onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))} disabled={step === 0} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground">Step {step + 1} of 7</span>
        <Button onClick={handleNext} disabled={step === MAX_STEP} className="gap-1 shadow-amber">
          Next <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
