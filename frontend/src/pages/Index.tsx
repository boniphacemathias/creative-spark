import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Megaphone,
  Calendar,
  Globe,
  ChevronRight,
  Trash2,
  Copy,
  BarChart3,
  Search,
  Clock3,
  AlertTriangle,
  Star,
  ArrowLeft,
  ArrowRight,
  Eye,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { CampaignData } from "@/types/campaign";
import {
  createCampaign,
  deleteCampaign,
  duplicateCampaign,
  listCampaigns,
  upsertCampaign,
} from "@/lib/campaign-storage";
import { getCampaignProgress } from "./campaign/wizard-validation";
import { useAppRole } from "@/hooks/use-app-role";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import { useAppWorkspace } from "@/hooks/use-app-workspace";
import { useRecentCampaigns } from "@/hooks/use-recent-campaigns";
import {
  DashboardSortBy,
  DashboardStatusFilter,
  DashboardViewPreset,
  createDashboardViewPreset,
  deleteDashboardViewPreset,
  listDashboardViewPresets,
} from "@/lib/dashboard-views";
import { useCampaignFavorites } from "@/hooks/use-campaign-favorites";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  DashboardWidgetId,
  getDefaultWidgetOrder,
  listDashboardWidgetOrder,
  saveDashboardWidgetOrder,
} from "@/lib/dashboard-layout";
import { subscribeRealtimeStream } from "@/lib/realtime-api";

const STEP_LABELS = [
  "Campaign Foundations",
  "Research & Strategic Inputs",
  "Communication Brief",
  "Creative Brief",
  "Ideation Engine",
  "Concept Development",
  "Concept Board",
];

function formatRelativeTime(value: string) {
  const timestamp = new Date(value);
  const diffMs = Date.now() - timestamp.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { permissions } = useAppRole();
  const { workspaceId } = useAppWorkspace();
  const { favoritesSet, toggleFavorite, setFavorite } = useCampaignFavorites(workspaceId);
  const activityItems = useActivityFeed(8, workspaceId);
  const recentVisits = useRecentCampaigns(5, workspaceId);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [campaignPendingDelete, setCampaignPendingDelete] = useState<CampaignData | null>(null);
  const [campaignPreview, setCampaignPreview] = useState<{
    campaignData: CampaignData;
    progress: ReturnType<typeof getCampaignProgress>;
  } | null>(null);
  const [previewInitialSnapshot, setPreviewInitialSnapshot] = useState<string | null>(null);
  const [isPreviewSaving, setIsPreviewSaving] = useState(false);
  const [previewLastSavedAt, setPreviewLastSavedAt] = useState<string | null>(null);
  const [previewSaveError, setPreviewSaveError] = useState<string | null>(null);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>("all");
  const [sortBy, setSortBy] = useState<DashboardSortBy>("recent");
  const [savedViews, setSavedViews] = useState<DashboardViewPreset[]>([]);
  const [activeViewId, setActiveViewId] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState<DashboardWidgetId[]>(() => getDefaultWidgetOrder());
  const [draggedWidgetId, setDraggedWidgetId] = useState<DashboardWidgetId | null>(null);

  const refreshCampaigns = useCallback(async () => {
    const next = await listCampaigns();
    setCampaigns(next);
  }, []);

  useEffect(() => {
    void refreshCampaigns();
  }, [refreshCampaigns, workspaceId]);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeStream({
      onUpdate: (payload) => {
        if (payload.entity === "campaign") {
          void refreshCampaigns();
        }
      },
    });
    return () => unsubscribe();
  }, [refreshCampaigns, workspaceId]);

  useEffect(() => {
    setSavedViews(listDashboardViewPresets());
    setActiveViewId("");
    setWidgetOrder(listDashboardWidgetOrder());
  }, [workspaceId]);

  useEffect(() => {
    const matched = savedViews.find((view) => {
      return (
        view.searchQuery === searchQuery &&
        view.statusFilter === statusFilter &&
        view.sortBy === sortBy
      );
    });
    setActiveViewId(matched?.id || "");
  }, [savedViews, searchQuery, sortBy, statusFilter]);

  const handleCreateCampaign = async () => {
    if (!permissions.canCreateCampaign) {
      return;
    }
    const created = await createCampaign();
    await refreshCampaigns();
    navigate(`/campaign/${created.campaign.id}`);
  };

  const handleDeleteCampaign = async () => {
    if (!permissions.canManageCampaign) {
      return;
    }
    if (!campaignPendingDelete) {
      return;
    }

    const deletedCampaign = campaignPendingDelete;
    await deleteCampaign(campaignPendingDelete.campaign.id);
    await refreshCampaigns();
    setCampaignPendingDelete(null);

    let restored = false;
    toast({
      title: "Campaign deleted",
      description: `"${deletedCampaign.campaign.name}" was removed.`,
      action: (
        <ToastAction
          altText="Undo delete campaign"
          onClick={async () => {
            if (restored) {
              return;
            }
            restored = true;
            await upsertCampaign(deletedCampaign);
            await refreshCampaigns();
            toast({
              title: "Campaign restored",
              description: `"${deletedCampaign.campaign.name}" is back.`,
            });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  const handleDuplicateCampaign = async (id: string) => {
    if (!permissions.canManageCampaign) {
      return;
    }
    const duplicated = await duplicateCampaign(id);
    if (!duplicated) {
      return;
    }

    await refreshCampaigns();
  };

  const openCampaignPreview = (campaignData: CampaignData, progress: ReturnType<typeof getCampaignProgress>) => {
    setCampaignPreview({ campaignData, progress });
    setPreviewInitialSnapshot(JSON.stringify(campaignData));
    setPreviewLastSavedAt(null);
    setPreviewSaveError(null);
  };

  const previewValidation = useMemo(() => {
    if (!campaignPreview) {
      return {
        isValid: true,
        errors: {
          name: "",
          startDate: "",
          endDate: "",
        },
      };
    }

    const errors = {
      name: "",
      startDate: "",
      endDate: "",
    };

    const name = campaignPreview.campaignData.campaign.name.trim();
    const startDate = campaignPreview.campaignData.campaign.startDate;
    const endDate = campaignPreview.campaignData.campaign.endDate;

    if (!name) {
      errors.name = "Campaign name is required.";
    }
    if (!startDate) {
      errors.startDate = "Start date is required.";
    }
    if (!endDate) {
      errors.endDate = "End date is required.";
    }
    if (startDate && endDate && startDate > endDate) {
      errors.endDate = "End date must be on or after the start date.";
    }

    return {
      isValid: !errors.name && !errors.startDate && !errors.endDate,
      errors,
    };
  }, [campaignPreview]);

  const savePreview = useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    if (!permissions.canManageCampaign || !campaignPreview) {
      return false;
    }
    if (!previewValidation.isValid) {
      if (!silent) {
        toast({
          title: "Cannot save campaign",
          description: "Please fix validation errors in the preview form.",
        });
      }
      return false;
    }

    const previewToSave = campaignPreview;
    setIsPreviewSaving(true);
    setPreviewSaveError(null);
    try {
      await upsertCampaign(previewToSave.campaignData);
      await refreshCampaigns();
      const nextProgress = getCampaignProgress(previewToSave.campaignData);
      setCampaignPreview((current) =>
        current
          ? {
              campaignData: previewToSave.campaignData,
              progress: nextProgress,
            }
          : null,
      );
      setPreviewInitialSnapshot(JSON.stringify(previewToSave.campaignData));
      setPreviewLastSavedAt(new Date().toISOString());
      if (!silent) {
        toast({
          title: "Campaign updated",
          description: `"${previewToSave.campaignData.campaign.name}" was saved.`,
        });
      }
      return true;
    } catch {
      setPreviewSaveError("Save failed. Check backend connection and try again.");
      if (!silent) {
        toast({
          title: "Save failed",
          description: "Could not persist campaign changes.",
        });
      }
      return false;
    } finally {
      setIsPreviewSaving(false);
    }
  }, [campaignPreview, permissions.canManageCampaign, previewValidation.isValid, refreshCampaigns, toast]);

  const handleSavePreview = useCallback(async () => {
    await savePreview({ silent: false });
  }, [savePreview]);

  const previewIsDirty = useMemo(() => {
    if (!campaignPreview || !previewInitialSnapshot) {
      return false;
    }
    return JSON.stringify(campaignPreview.campaignData) !== previewInitialSnapshot;
  }, [campaignPreview, previewInitialSnapshot]);

  const attemptClosePreview = () => {
    if (previewIsDirty) {
      const shouldDiscard = window.confirm("You have unsaved changes. Discard them and close preview?");
      if (!shouldDiscard) {
        return;
      }
    }
    setCampaignPreview(null);
    setPreviewInitialSnapshot(null);
    setPreviewLastSavedAt(null);
    setPreviewSaveError(null);
  };

  const handleToggleCampaignSelection = (campaignId: string) => {
    setSelectedCampaignIds((current) =>
      current.includes(campaignId)
        ? current.filter((id) => id !== campaignId)
        : [...current, campaignId],
    );
  };

  const handleBulkDuplicate = async () => {
    if (!permissions.canManageCampaign || selectedCampaignIds.length === 0) {
      return;
    }
    for (const id of selectedCampaignIds) {
      await duplicateCampaign(id);
    }
    await refreshCampaigns();
  };

  const handleBulkFavorite = (shouldBeFavorite: boolean) => {
    for (const id of selectedCampaignIds) {
      setFavorite(id, shouldBeFavorite);
    }
  };

  const handleBulkDelete = async () => {
    if (!permissions.canManageCampaign || selectedCampaignIds.length === 0) {
      return;
    }

    const deletedCampaigns = campaigns.filter((entry) => selectedCampaignIds.includes(entry.campaign.id));
    for (const id of selectedCampaignIds) {
      await deleteCampaign(id);
    }
    setSelectedCampaignIds([]);
    setBulkDeleteOpen(false);
    await refreshCampaigns();

    if (deletedCampaigns.length > 0) {
      let restored = false;
      toast({
        title: "Campaigns deleted",
        description: `${deletedCampaigns.length} campaign(s) were removed.`,
        action: (
          <ToastAction
            altText="Undo bulk delete campaigns"
            onClick={async () => {
              if (restored) {
                return;
              }
              restored = true;
              for (const campaign of deletedCampaigns) {
                await upsertCampaign(campaign);
              }
              await refreshCampaigns();
              toast({
                title: "Campaigns restored",
                description: `${deletedCampaigns.length} campaign(s) were restored.`,
              });
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    }
  };

  const handleSaveView = () => {
    const suggestedName = `View ${savedViews.length + 1}`;
    const nextName = window.prompt("Name this dashboard view", suggestedName);
    if (!nextName || !nextName.trim()) {
      return;
    }

    const result = createDashboardViewPreset({
      name: nextName,
      searchQuery,
      statusFilter,
      sortBy,
    });
    setSavedViews(result.presets);
    setActiveViewId(result.preset.id);
  };

  const handleApplyView = (id: string) => {
    const preset = savedViews.find((entry) => entry.id === id);
    if (!preset) {
      return;
    }
    setSearchQuery(preset.searchQuery);
    setStatusFilter(preset.statusFilter);
    setSortBy(preset.sortBy);
    setActiveViewId(preset.id);
  };

  const handleDeleteView = () => {
    if (!activeViewId) {
      return;
    }
    const next = deleteDashboardViewPreset(activeViewId);
    setSavedViews(next);
    setActiveViewId("");
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setSortBy("recent");
    setFavoritesOnly(false);
  };

  const moveWidget = (widgetId: DashboardWidgetId, direction: "left" | "right") => {
    setWidgetOrder((current) => {
      const next = [...current];
      const index = next.indexOf(widgetId);
      if (index < 0) {
        return current;
      }

      const targetIndex = direction === "left" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) {
        return current;
      }

      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      saveDashboardWidgetOrder(next);
      return next;
    });
  };

  const reorderWidgets = (sourceId: DashboardWidgetId, targetId: DashboardWidgetId) => {
    if (sourceId === targetId) {
      return;
    }

    setWidgetOrder((current) => {
      const next = [...current];
      const sourceIndex = next.indexOf(sourceId);
      const targetIndex = next.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return current;
      }

      next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, sourceId);
      saveDashboardWidgetOrder(next);
      return next;
    });
  };

  const campaignRows = useMemo(() => {
    const rows = campaigns.map((campaignData) => ({
      campaignData,
      progress: getCampaignProgress(campaignData),
    }));

    const query = searchQuery.trim().toLowerCase();
    const filtered = rows.filter(({ campaignData }) => {
      if (statusFilter !== "all" && campaignData.campaign.status !== statusFilter) {
        return false;
      }
      if (favoritesOnly && !favoritesSet.has(campaignData.campaign.id)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${campaignData.campaign.name} ${campaignData.campaign.country} ${campaignData.problem}`.toLowerCase();
      return haystack.includes(query);
    });

    filtered.sort((a, b) => {
      if (sortBy === "name") {
        return a.campaignData.campaign.name.localeCompare(b.campaignData.campaign.name);
      }
      if (sortBy === "progress_desc") {
        return b.progress.completionRatio - a.progress.completionRatio;
      }
      if (sortBy === "progress_asc") {
        return a.progress.completionRatio - b.progress.completionRatio;
      }
      return b.campaignData.campaign.startDate.localeCompare(a.campaignData.campaign.startDate);
    });

    return filtered;
  }, [campaigns, favoritesOnly, favoritesSet, searchQuery, sortBy, statusFilter]);

  const visibleCampaignIds = useMemo(
    () => campaignRows.map((row) => row.campaignData.campaign.id),
    [campaignRows],
  );

  const selectedVisibleCount = useMemo(
    () => selectedCampaignIds.filter((id) => visibleCampaignIds.includes(id)).length,
    [selectedCampaignIds, visibleCampaignIds],
  );

  const allVisibleSelected = visibleCampaignIds.length > 0 && selectedVisibleCount === visibleCampaignIds.length;

  const anySelectionHasNonFavorite = selectedCampaignIds.some((id) => !favoritesSet.has(id));
  const anySelectionHasFavorite = selectedCampaignIds.some((id) => favoritesSet.has(id));

  const dashboardStats = useMemo(() => {
    const total = campaigns.length;
    const byStatus = {
      draft: campaigns.filter((entry) => entry.campaign.status === "draft").length,
      inReview: campaigns.filter((entry) => entry.campaign.status === "in_review").length,
      final: campaigns.filter((entry) => entry.campaign.status === "final").length,
    };
    const averageProgress =
      total === 0
        ? 0
        : Math.round(
            campaigns.reduce((sum, entry) => sum + getCampaignProgress(entry).completionRatio, 0) / total * 100,
          );

    return { total, byStatus, averageProgress };
  }, [campaigns]);

  const priorityTasks = useMemo(() => {
    return campaigns
      .map((campaignData) => {
        const progress = getCampaignProgress(campaignData);
        const nextStepIndex = progress.stepCompletion.findIndex((isDone) => !isDone);
        return {
          campaignData,
          progress,
          nextStepIndex,
        };
      })
      .filter((item) => item.nextStepIndex >= 0)
      .sort((a, b) => {
        if (a.progress.completionRatio !== b.progress.completionRatio) {
          return a.progress.completionRatio - b.progress.completionRatio;
        }
        return a.campaignData.campaign.startDate.localeCompare(b.campaignData.campaign.startDate);
      })
      .slice(0, 5);
  }, [campaigns]);

  useEffect(() => {
    const visible = new Set(visibleCampaignIds);
    setSelectedCampaignIds((current) => current.filter((id) => visible.has(id)));
  }, [visibleCampaignIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
          return;
        }
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key === "Escape" && selectedCampaignIds.length > 0) {
        setSelectedCampaignIds([]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCampaignIds.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!campaignPreview) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!isPreviewSaving && permissions.canManageCampaign && previewValidation.isValid) {
          void savePreview({ silent: false });
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        attemptClosePreview();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    attemptClosePreview,
    campaignPreview,
    isPreviewSaving,
    permissions.canManageCampaign,
    previewValidation.isValid,
    savePreview,
  ]);

  useEffect(() => {
    if (!campaignPreview || !permissions.canManageCampaign || !previewIsDirty || !previewValidation.isValid || isPreviewSaving) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void savePreview({ silent: true });
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [
    campaignPreview,
    isPreviewSaving,
    permissions.canManageCampaign,
    previewIsDirty,
    previewValidation.isValid,
    savePreview,
  ]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-gradient-primary">Campaigns</h1>
          <p className="text-muted-foreground mt-1">Build evidence-based SBCC campaigns with the 4Rs Framework</p>
        </div>
        <Button className="shadow-amber gap-2" onClick={handleCreateCampaign} disabled={!permissions.canCreateCampaign}>
          <Plus className="h-4 w-4" /> New Campaign
        </Button>
      </div>
      {!permissions.canManageCampaign && (
        <p className="text-xs text-muted-foreground mb-3">
          Viewer mode is active. Campaign creation and editing actions are restricted.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-4 mb-6">
        <Card className="p-4 bg-gradient-card border-border">
          <p className="text-xs text-muted-foreground">Total Campaigns</p>
          <p className="text-2xl font-semibold">{dashboardStats.total}</p>
        </Card>
        <Card className="p-4 bg-gradient-card border-border">
          <p className="text-xs text-muted-foreground">Draft</p>
          <p className="text-2xl font-semibold">{dashboardStats.byStatus.draft}</p>
        </Card>
        <Card className="p-4 bg-gradient-card border-border">
          <p className="text-xs text-muted-foreground">In Review</p>
          <p className="text-2xl font-semibold">{dashboardStats.byStatus.inReview}</p>
        </Card>
        <Card className="p-4 bg-gradient-card border-border">
          <p className="text-xs text-muted-foreground">Average Progress</p>
          <p className="text-2xl font-semibold inline-flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> {dashboardStats.averageProgress}%
          </p>
        </Card>
      </div>

      <Card className="p-4 bg-gradient-card border-border mb-6">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
                placeholder="Search campaigns by name, country, or problem"
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as DashboardStatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="in_review">In Review</option>
              <option value="final">Final</option>
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as DashboardSortBy)}
            >
              <option value="recent">Sort: Most Recent</option>
              <option value="name">Sort: Name</option>
              <option value="progress_desc">Sort: Progress High-Low</option>
              <option value="progress_asc">Sort: Progress Low-High</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
              value={activeViewId}
              onChange={(event) => handleApplyView(event.target.value)}
            >
              <option value="">Saved views</option>
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={handleSaveView}>
              Save current view
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleDeleteView} disabled={!activeViewId}>
              Delete view
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleResetFilters}>
              Reset
            </Button>
            <Button
              type="button"
              variant={favoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setFavoritesOnly((value) => !value)}
            >
              <Star className="h-3.5 w-3.5 mr-1" />
              Favorites
            </Button>
          </div>
        </div>
      </Card>

      {selectedCampaignIds.length > 0 && (
        <Card className="p-3 bg-gradient-card border-border mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium pr-1">{selectedCampaignIds.length} selected</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedCampaignIds([])}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBulkDuplicate}
              disabled={!permissions.canManageCampaign}
            >
              Duplicate Selected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleBulkFavorite(true)}
              disabled={!anySelectionHasNonFavorite}
            >
              Star Selected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleBulkFavorite(false)}
              disabled={!anySelectionHasFavorite}
            >
              Unstar Selected
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={!permissions.canManageCampaign}
            >
              Delete Selected
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        {widgetOrder.map((widgetId, widgetIndex) => (
          <Card
            key={widgetId}
            draggable
            onDragStart={(event) => {
              setDraggedWidgetId(widgetId);
              event.dataTransfer.setData("text/dashboard-widget", widgetId);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDragEnd={() => setDraggedWidgetId(null)}
            onDrop={(event) => {
              event.preventDefault();
              const source = (event.dataTransfer.getData("text/dashboard-widget") || draggedWidgetId) as DashboardWidgetId;
              if (!source) {
                return;
              }
              reorderWidgets(source, widgetId);
              setDraggedWidgetId(null);
            }}
            className={`p-4 bg-gradient-card border-border ${
              draggedWidgetId === widgetId ? "opacity-60 border-primary/40" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {widgetId === "priority" && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                {widgetId === "activity" && <Clock3 className="h-4 w-4 text-muted-foreground" />}
                {widgetId === "continue" && <Clock3 className="h-4 w-4 text-muted-foreground" />}
                <h2 className="text-sm font-semibold">
                  {widgetId === "priority" && "Priority Tasks"}
                  {widgetId === "activity" && "Activity Timeline"}
                  {widgetId === "continue" && "Continue Working"}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => moveWidget(widgetId, "left")}
                  disabled={widgetIndex === 0}
                  aria-label="Move widget left"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => moveWidget(widgetId, "right")}
                  disabled={widgetIndex === widgetOrder.length - 1}
                  aria-label="Move widget right"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {widgetId === "priority" && (
              <div className="space-y-2">
                {priorityTasks.length === 0 && (
                  <p className="text-xs text-muted-foreground">All campaigns are complete. No pending tasks.</p>
                )}
                {priorityTasks.map((item) => (
                  <button
                    key={item.campaignData.campaign.id}
                    type="button"
                    className="w-full rounded-md border border-border px-3 py-2 text-left hover:border-primary/40 transition-colors"
                    onClick={() => navigate(`/campaign/${item.campaignData.campaign.id}`)}
                  >
                    <p className="text-sm font-medium truncate">{item.campaignData.campaign.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Next: {STEP_LABELS[item.nextStepIndex]} · {Math.round(item.progress.completionRatio * 100)}% complete
                    </p>
                  </button>
                ))}
              </div>
            )}

            {widgetId === "activity" && (
              <div className="space-y-2">
                {activityItems.length === 0 && (
                  <p className="text-xs text-muted-foreground">No recent activity yet.</p>
                )}
                {activityItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-border px-3 py-2">
                    <p className="text-sm leading-5">{item.message}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatRelativeTime(item.timestamp)}</p>
                  </div>
                ))}
              </div>
            )}

            {widgetId === "continue" && (
              <div className="space-y-2">
                {recentVisits.length === 0 && (
                  <p className="text-xs text-muted-foreground">No recent campaign visits yet.</p>
                )}
                {recentVisits.map((entry) => (
                  <button
                    key={`continue-${entry.campaignId}`}
                    type="button"
                    className="w-full rounded-md border border-border px-3 py-2 text-left hover:border-primary/40 transition-colors"
                    onClick={() => navigate(`/campaign/${entry.campaignId}`)}
                  >
                    <p className="text-sm font-medium truncate">{entry.campaignName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatRelativeTime(entry.lastVisitedAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between mb-3">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(event) => {
              if (event.target.checked) {
                setSelectedCampaignIds((current) =>
                  Array.from(new Set([...current, ...visibleCampaignIds])),
                );
              } else {
                setSelectedCampaignIds((current) =>
                  current.filter((id) => !visibleCampaignIds.includes(id)),
                );
              }
            }}
          />
          Select all visible ({visibleCampaignIds.length})
        </label>
        {selectedVisibleCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedVisibleCount} of {visibleCampaignIds.length} visible selected
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaignRows.map(({ campaignData, progress }, index) => {
          const campaign = campaignData.campaign;
          return (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
            >
              <Card className="bg-gradient-card border-border hover:border-primary/30 transition-all duration-300 hover:shadow-amber group">
                <button
                  type="button"
                  className="w-full text-left p-5 cursor-pointer"
                  onClick={() => navigate(`/campaign/${campaign.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Megaphone className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedCampaignIds.includes(campaign.id)}
                        onChange={(event) => {
                          event.stopPropagation();
                          handleToggleCampaignSelection(campaign.id);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Select ${campaign.name}`}
                      />
                      <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                        {campaign.status}
                      </Badge>
                    </div>
                  </div>
                  <h3 className="text-lg font-display font-semibold mb-1 group-hover:text-primary transition-colors">
                    {campaign.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{campaignData.problem}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {campaign.country}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {campaign.startDate}
                    </span>
                  </div>
                </button>

                <div className="px-5 pb-4 border-t border-border flex items-center justify-between">
                  <div className="flex gap-1 pt-3">
                    {progress.stepCompletion.map((isDone, stepIndex) => (
                      <div
                        key={`${campaign.id}-step-${stepIndex}`}
                        className={`w-6 h-1.5 rounded-full ${isDone ? "bg-primary" : "bg-muted"}`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1 pt-2">
                    <span className="text-[10px] text-muted-foreground pr-1">
                      {Math.round(progress.completionRatio * 100)}%
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => toggleFavorite(campaign.id)}
                      aria-label={`Toggle favorite for ${campaign.name}`}
                    >
                      <Star
                        className={`h-4 w-4 ${favoritesSet.has(campaign.id) ? "fill-primary text-primary" : ""}`}
                      />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openCampaignPreview(campaignData, progress)}
                      aria-label={`Preview ${campaign.name}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleDuplicateCampaign(campaign.id)}
                      aria-label={`Duplicate ${campaign.name}`}
                      disabled={!permissions.canManageCampaign}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setCampaignPendingDelete(campaignData)}
                      aria-label={`Delete ${campaign.name}`}
                      disabled={!permissions.canManageCampaign}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => navigate(`/campaign/${campaign.id}`)}
                      aria-label={`Open ${campaign.name}`}
                    >
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}

        {permissions.canCreateCampaign && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card
              className="border-dashed border-2 border-border hover:border-primary/20 transition-colors cursor-pointer h-full flex items-center justify-center min-h-[200px]"
              onClick={handleCreateCampaign}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleCreateCampaign();
                }
              }}
            >
              <div className="text-center p-5">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">Create new campaign</p>
              </div>
            </Card>
          </motion.div>
        )}
      </div>
      {campaignRows.length === 0 && (
        <Card className="p-8 border-dashed border-2 text-center mt-4">
          <p className="text-sm text-muted-foreground">No campaigns found for current search/filters.</p>
        </Card>
      )}

      <AlertDialog open={Boolean(campaignPendingDelete)} onOpenChange={(open) => !open && setCampaignPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              {campaignPendingDelete
                ? `This will permanently delete "${campaignPendingDelete.campaign.name}" and all associated data.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteCampaign}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected campaigns?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedCampaignIds.length} selected campaign(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleBulkDelete}
            >
              Delete Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(campaignPreview)}
        onOpenChange={(open) => {
          if (!open) {
            attemptClosePreview();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{campaignPreview?.campaignData.campaign.name || "Campaign Preview"}</DialogTitle>
            <DialogDescription>
              {campaignPreview
                ? `Progress: ${Math.round(campaignPreview.progress.completionRatio * 100)}% complete`
                : "Campaign details preview"}
            </DialogDescription>
          </DialogHeader>

          {campaignPreview && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-3 bg-gradient-card border-border">
                  <p className="text-[11px] text-muted-foreground">Status</p>
                  <select
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm capitalize"
                    value={campaignPreview.campaignData.campaign.status}
                    onChange={(event) =>
                      setCampaignPreview((current) => {
                        if (!current) {
                          return current;
                        }
                        return {
                          ...current,
                          campaignData: {
                            ...current.campaignData,
                            campaign: {
                              ...current.campaignData.campaign,
                              status: event.target.value as CampaignData["campaign"]["status"],
                            },
                          },
                        };
                      })
                    }
                    disabled={!permissions.canManageCampaign}
                  >
                    <option value="draft">Draft</option>
                    <option value="in_review">In Review</option>
                    <option value="final">Final</option>
                  </select>
                </Card>
                <Card className="p-3 bg-gradient-card border-border">
                  <p className="text-[11px] text-muted-foreground">Country</p>
                  <Input
                    className="mt-1 h-8"
                    value={campaignPreview.campaignData.campaign.country}
                    onChange={(event) =>
                      setCampaignPreview((current) => {
                        if (!current) {
                          return current;
                        }
                        return {
                          ...current,
                          campaignData: {
                            ...current.campaignData,
                            campaign: {
                              ...current.campaignData.campaign,
                              country: event.target.value,
                            },
                          },
                        };
                      })
                    }
                    placeholder="Country"
                    disabled={!permissions.canManageCampaign}
                  />
                </Card>
                <Card className="p-3 bg-gradient-card border-border">
                  <p className="text-[11px] text-muted-foreground">Date Range</p>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      className={`h-8 ${previewValidation.errors.startDate ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      value={campaignPreview.campaignData.campaign.startDate}
                      onChange={(event) =>
                        setCampaignPreview((current) => {
                          if (!current) {
                            return current;
                          }
                          return {
                            ...current,
                            campaignData: {
                              ...current.campaignData,
                              campaign: {
                                ...current.campaignData.campaign,
                                startDate: event.target.value,
                              },
                            },
                          };
                        })
                      }
                      disabled={!permissions.canManageCampaign}
                      aria-invalid={Boolean(previewValidation.errors.startDate)}
                    />
                    <Input
                      type="date"
                      className={`h-8 ${previewValidation.errors.endDate ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      value={campaignPreview.campaignData.campaign.endDate}
                      onChange={(event) =>
                        setCampaignPreview((current) => {
                          if (!current) {
                            return current;
                          }
                          return {
                            ...current,
                            campaignData: {
                              ...current.campaignData,
                              campaign: {
                                ...current.campaignData.campaign,
                                endDate: event.target.value,
                              },
                            },
                          };
                        })
                      }
                      disabled={!permissions.canManageCampaign}
                      aria-invalid={Boolean(previewValidation.errors.endDate)}
                    />
                  </div>
                  {previewValidation.errors.startDate && (
                    <p className="mt-1 text-[11px] text-destructive">{previewValidation.errors.startDate}</p>
                  )}
                  {!previewValidation.errors.startDate && previewValidation.errors.endDate && (
                    <p className="mt-1 text-[11px] text-destructive">{previewValidation.errors.endDate}</p>
                  )}
                </Card>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Campaign Name</p>
                <Input
                  className={previewValidation.errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
                  value={campaignPreview.campaignData.campaign.name}
                  onChange={(event) =>
                    setCampaignPreview((current) => {
                      if (!current) {
                        return current;
                      }
                      return {
                        ...current,
                        campaignData: {
                          ...current.campaignData,
                          campaign: {
                            ...current.campaignData.campaign,
                            name: event.target.value,
                          },
                        },
                      };
                    })
                  }
                  placeholder="Campaign name"
                  disabled={!permissions.canManageCampaign}
                  aria-invalid={Boolean(previewValidation.errors.name)}
                />
                {previewValidation.errors.name && (
                  <p className="mt-1 text-[11px] text-destructive">{previewValidation.errors.name}</p>
                )}
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Problem Statement</p>
                <textarea
                  className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
                  value={campaignPreview.campaignData.problem}
                  onChange={(event) =>
                    setCampaignPreview((current) => {
                      if (!current) {
                        return current;
                      }
                      return {
                        ...current,
                        campaignData: {
                          ...current.campaignData,
                          problem: event.target.value,
                        },
                      };
                    })
                  }
                  placeholder="Describe the problem this campaign addresses"
                  disabled={!permissions.canManageCampaign}
                />
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Step Progress</p>
                <div className="space-y-2">
                  {campaignPreview.progress.stepCompletion.map((isDone, stepIndex) => (
                    <div key={`preview-${campaignPreview.campaignData.campaign.id}-${stepIndex}`} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs truncate">{STEP_LABELS[stepIndex]}</p>
                        <span className="text-[11px] text-muted-foreground">{isDone ? "Done" : "Pending"}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className={`h-full rounded-full ${isDone ? "bg-primary w-full" : "bg-muted-foreground/35 w-0"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <p className="mr-auto text-[11px] text-muted-foreground">
              {isPreviewSaving && (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving changes...
                </span>
              )}
              {!isPreviewSaving && previewSaveError}
              {!isPreviewSaving && !previewSaveError && previewIsDirty && "Unsaved changes"}
              {!isPreviewSaving &&
                !previewSaveError &&
                !previewIsDirty &&
                previewLastSavedAt &&
                `Last saved at ${new Date(previewLastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
              {!isPreviewSaving && !previewSaveError && !previewIsDirty && !previewLastSavedAt && "No pending changes"}
            </p>
            <Button type="button" variant="outline" onClick={attemptClosePreview}>
              Close
            </Button>
            {campaignPreview && permissions.canManageCampaign && (
              <Button
                type="button"
                variant="outline"
                onClick={handleSavePreview}
                disabled={isPreviewSaving || !previewValidation.isValid}
              >
                {isPreviewSaving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            )}
            {campaignPreview && permissions.canManageCampaign && previewSaveError && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleSavePreview}
                disabled={isPreviewSaving || !previewValidation.isValid}
              >
                Retry Save
              </Button>
            )}
            {campaignPreview && (
              <Button
                type="button"
                onClick={() => {
                  navigate(`/campaign/${campaignPreview.campaignData.campaign.id}`);
                  setCampaignPreview(null);
                  setPreviewInitialSnapshot(null);
                  setPreviewLastSavedAt(null);
                  setPreviewSaveError(null);
                }}
              >
                Open Campaign
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
