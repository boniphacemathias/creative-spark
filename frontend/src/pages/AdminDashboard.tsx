import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Database,
  Download,
  FileDown,
  FileUp,
  Globe2,
  HardDrive,
  Languages,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  deleteDriveEntry,
  downloadDriveFile,
  listDriveFiles,
  uploadDriveFile,
} from "@/lib/drive-api";
import { DriveFile } from "@/lib/drive-storage";
import {
  exportCampaigns,
  getCampaignStorageStats,
  importCampaigns,
  listCampaigns,
  resetCampaigns,
} from "@/lib/campaign-storage";
import { listIncidentRecords } from "@/lib/diagnostics-api";
import { useAppRole } from "@/hooks/use-app-role";
import { useAppWorkspace } from "@/hooks/use-app-workspace";
import {
  deleteAdminTranslationLocale,
  exportAdminTranslationLocale,
  exportAdminTranslationsPack,
  getAdminLocaleMessages,
  importAdminTranslationLocale,
  importAdminTranslationsPack,
  readAdminTranslationStore,
  setAdminActiveLocale,
  upsertAdminTranslationDictionary,
} from "@/lib/admin-translations";
import useTranslation from "@/hooks/useTranslation";

const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "csv",
  "md",
  "json",
  "png",
  "jpg",
  "jpeg",
  "webp",
]);

type BusyAction =
  | "idle"
  | "refreshing"
  | "importing-campaigns"
  | "resetting-campaigns"
  | "uploading-drive-files"
  | "deleting-drive-file"
  | "saving-translations";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function normalizeTranslationKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 120);
}

function parseImportPayload(payload: string): number | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    const fromBundle =
      typeof parsed === "object" && parsed !== null && "campaigns" in parsed
        ? (parsed as { campaigns: unknown }).campaigns
        : parsed;
    if (!Array.isArray(fromBundle)) {
      return null;
    }
    return fromBundle.length;
  } catch {
    return null;
  }
}

function getFileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function isSupportedUpload(fileName: string): boolean {
  return SUPPORTED_UPLOAD_EXTENSIONS.has(getFileExtension(fileName));
}

function downloadBlob(filename: string, payload: Blob | string, mimeType = "application/octet-stream"): void {
  const blob = payload instanceof Blob ? payload : new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function AdminDashboard() {
  const { t, language, setLanguage } = useTranslation();
  const { toast } = useToast();
  const { role } = useAppRole();
  const { workspaceId, activeWorkspace } = useAppWorkspace();
  const campaignImportFileRef = useRef<HTMLInputElement | null>(null);
  const translationImportFileRef = useRef<HTMLInputElement | null>(null);
  const translationsPackImportFileRef = useRef<HTMLInputElement | null>(null);
  const driveUploadFileRef = useRef<HTMLInputElement | null>(null);

  const [busyAction, setBusyAction] = useState<BusyAction>("refreshing");
  const [campaignStats, setCampaignStats] = useState({
    total: 0,
    byStatus: { draft: 0, in_review: 0, final: 0 },
  });
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [incidentCount, setIncidentCount] = useState(0);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importPayload, setImportPayload] = useState("");

  const [translationStore, setTranslationStore] = useState(() => readAdminTranslationStore());
  const [activeLocale, setActiveLocale] = useState(() => readAdminTranslationStore().activeLocale);
  const [translationDraft, setTranslationDraft] = useState<Record<string, string>>(
    () => getAdminLocaleMessages(readAdminTranslationStore().activeLocale),
  );
  const [newLocaleCode, setNewLocaleCode] = useState("");
  const [newTranslationKey, setNewTranslationKey] = useState("");
  const [newTranslationValue, setNewTranslationValue] = useState("");
  const [translationImportMode, setTranslationImportMode] = useState<"merge" | "replace">("merge");

  const refreshDashboard = useCallback(async () => {
    setBusyAction("refreshing");
    try {
      const [campaigns, stats, files, incidents] = await Promise.all([
        listCampaigns(),
        getCampaignStorageStats(),
        listDriveFiles(selectedCampaignId),
        listIncidentRecords({ limit: 1 }),
      ]);
      setCampaignStats(stats);
      setCampaignOptions(campaigns.map((entry) => ({ id: entry.campaign.id, name: entry.campaign.name })));
      setDriveFiles(files);
      setIncidentCount(incidents.total);
    } catch (error) {
      toast({
        title: "Unable to refresh admin dashboard",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("idle");
    }
  }, [selectedCampaignId, toast]);

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    const store = readAdminTranslationStore();
    const nextLocale = store.locales[store.activeLocale] ? store.activeLocale : "en";
    setTranslationStore(store);
    setActiveLocale(nextLocale);
    setTranslationDraft(getAdminLocaleMessages(nextLocale));
  }, [workspaceId]);

  const translationLocales = useMemo(
    () => Object.keys(translationStore.locales).sort((left, right) => left.localeCompare(right)),
    [translationStore.locales],
  );
  const translationBaseKeys = useMemo(
    () => Object.keys(translationStore.locales.en || {}).sort((left, right) => left.localeCompare(right)),
    [translationStore.locales.en],
  );

  const translationCoverage = useMemo(() => {
    const localeValues = translationStore.locales[activeLocale] || {};
    if (translationBaseKeys.length === 0) {
      return 100;
    }
    const translated = translationBaseKeys.filter((key) => Boolean(localeValues[key])).length;
    return Math.round((translated / translationBaseKeys.length) * 100);
  }, [activeLocale, translationBaseKeys, translationStore.locales]);

  const totalDriveBytes = useMemo(
    () => driveFiles.reduce((sum, file) => sum + (Number(file.size) || 0), 0),
    [driveFiles],
  );
  const isBusy = busyAction !== "idle";

  const handleExportCampaigns = async () => {
    const payload = await exportCampaigns();
    if (!payload) {
      toast({
        title: "Export failed",
        description: "Could not serialize campaigns.",
        variant: "destructive",
      });
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(`campaign-backup-${stamp}.json`, payload, "application/json");
    toast({
      title: "Export complete",
      description: "Campaign backup downloaded.",
    });
  };

  const runCampaignImport = async (payload: string) => {
    const candidateCount = parseImportPayload(payload);
    if (candidateCount === null) {
      toast({
        title: "Import failed",
        description: "Payload must be valid JSON containing an array or campaigns bundle.",
        variant: "destructive",
      });
      return;
    }

    if (importMode === "replace") {
      const confirmed = window.confirm(
        `Replace all existing campaigns with ${candidateCount} imported item(s)? This cannot be undone.`,
      );
      if (!confirmed) {
        return;
      }
    }

    setBusyAction("importing-campaigns");
    try {
      const result = await importCampaigns(payload, importMode);
      if (!result) {
        throw new Error("Import did not return a valid response.");
      }
      await refreshDashboard();
      toast({
        title: "Import complete",
        description: `Imported ${result.imported}, skipped ${result.skipped} (${result.mode}).`,
      });
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Unknown import error.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const handleImportCampaignsFromText = async () => {
    if (!importPayload.trim()) {
      toast({
        title: "No payload",
        description: "Paste campaign JSON before importing.",
        variant: "destructive",
      });
      return;
    }
    await runCampaignImport(importPayload);
  };

  const handleImportCampaignsFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const payload = await file.text();
    setImportPayload(payload);
    await runCampaignImport(payload);
    event.target.value = "";
  };

  const handleResetCampaigns = async () => {
    const confirmed = window.confirm("Reset all campaigns and keep only the default sample campaign?");
    if (!confirmed) {
      return;
    }

    setBusyAction("resetting-campaigns");
    try {
      await resetCampaigns();
      await refreshDashboard();
      toast({
        title: "Workspace reset",
        description: "Campaigns were reset to the default sample.",
      });
    } catch (error) {
      toast({
        title: "Unable to reset campaigns",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const handleDriveUpload = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setBusyAction("uploading-drive-files");
    let uploadedCount = 0;
    try {
      for (const file of files) {
        if (!isSupportedUpload(file.name)) {
          toast({
            title: "Unsupported file type",
            description: `${file.name} was skipped.`,
            variant: "destructive",
          });
          continue;
        }
        try {
          await uploadDriveFile(file, null, selectedCampaignId);
          uploadedCount += 1;
        } catch (error) {
          toast({
            title: "File upload failed",
            description: error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: Unknown error.`,
            variant: "destructive",
          });
        }
      }

      await refreshDashboard();
      toast({
        title: "Upload complete",
        description: `${uploadedCount} file(s) uploaded.`,
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const handleDriveDownload = async (file: DriveFile) => {
    try {
      const payload = await downloadDriveFile(file.id, selectedCampaignId);
      downloadBlob(payload.fileName || file.name, payload.blob, payload.mimeType);
      toast({
        title: "Download started",
        description: `${file.name} is downloading.`,
      });
    } catch (error) {
      toast({
        title: "Unable to download file",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteDriveFile = async (file: DriveFile) => {
    const confirmed = window.confirm(`Delete "${file.name}" from AI Drive?`);
    if (!confirmed) {
      return;
    }
    setBusyAction("deleting-drive-file");
    try {
      await deleteDriveEntry(file.id, selectedCampaignId);
      await refreshDashboard();
      toast({
        title: "File deleted",
        description: `${file.name} was removed.`,
      });
    } catch (error) {
      toast({
        title: "Unable to delete file",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const handleLocaleSelection = (locale: string) => {
    const nextStore = setAdminActiveLocale(locale);
    setTranslationStore(nextStore);
    setActiveLocale(nextStore.activeLocale);
    setTranslationDraft(getAdminLocaleMessages(nextStore.activeLocale));
  };

  const handleCreateLocale = () => {
    const candidate = newLocaleCode.trim();
    if (!candidate) {
      return;
    }
    const nextStore = setAdminActiveLocale(candidate);
    setTranslationStore(nextStore);
    setActiveLocale(nextStore.activeLocale);
    setTranslationDraft(getAdminLocaleMessages(nextStore.activeLocale));
    setNewLocaleCode("");
    toast({
      title: "Locale created",
      description: `Now editing ${nextStore.activeLocale}.`,
    });
  };

  const handleSaveTranslations = () => {
    setBusyAction("saving-translations");
    try {
      const nextStore = upsertAdminTranslationDictionary(activeLocale, translationDraft, "replace");
      setTranslationStore(nextStore);
      setTranslationDraft(getAdminLocaleMessages(activeLocale));
      toast({
        title: "Translations saved",
        description: `Updated locale: ${activeLocale}.`,
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const handleAddTranslationEntry = () => {
    const key = normalizeTranslationKey(newTranslationKey);
    const value = newTranslationValue.trim();
    if (!key || !value) {
      return;
    }
    setTranslationDraft((previous) => ({ ...previous, [key]: value }));
    setNewTranslationKey("");
    setNewTranslationValue("");
  };

  const handleDeleteLocale = () => {
    if (activeLocale === "en") {
      toast({
        title: "Locale protected",
        description: "English is the base locale and cannot be deleted.",
      });
      return;
    }
    const confirmed = window.confirm(`Delete locale "${activeLocale}"?`);
    if (!confirmed) {
      return;
    }
    const nextStore = deleteAdminTranslationLocale(activeLocale);
    const nextLocale = nextStore.activeLocale;
    setTranslationStore(nextStore);
    setActiveLocale(nextLocale);
    setTranslationDraft(getAdminLocaleMessages(nextLocale));
    toast({
      title: "Locale deleted",
      description: `${activeLocale} was removed.`,
    });
  };

  const handleExportTranslationLocale = () => {
    const payload = exportAdminTranslationLocale(activeLocale);
    downloadBlob(`${activeLocale}-translations.json`, payload, "application/json");
    toast({
      title: "Locale exported",
      description: `${activeLocale} translation file downloaded.`,
    });
  };

  const handleExportTranslationsPack = () => {
    const payload = exportAdminTranslationsPack();
    downloadBlob("translations-pack.json", payload, "application/json");
    toast({
      title: "Language pack exported",
      description: "Full translation pack downloaded.",
    });
  };

  const handleImportTranslationLocale = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const payload = await file.text();
      const result = importAdminTranslationLocale(activeLocale, payload, translationImportMode);
      setTranslationStore(result.store);
      setTranslationDraft(getAdminLocaleMessages(activeLocale));
      toast({
        title: "Translations imported",
        description: `Imported ${result.imported}, overwritten ${result.overwritten}, skipped ${result.skipped}.`,
      });
    } catch (error) {
      toast({
        title: "Translation import failed",
        description: error instanceof Error ? error.message : "Invalid translation file.",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const handleImportTranslationsPack = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const payload = await file.text();
      const nextStore = importAdminTranslationsPack(payload, translationImportMode);
      setTranslationStore(nextStore);
      setActiveLocale(nextStore.activeLocale);
      setTranslationDraft(getAdminLocaleMessages(nextStore.activeLocale));
      setLanguage(nextStore.activeLocale);
      toast({
        title: "Language pack imported",
        description: `Updated locales: ${Object.keys(nextStore.locales).join(", ")}.`,
      });
    } catch (error) {
      toast({
        title: "Language pack import failed",
        description: error instanceof Error ? error.message : "Invalid language pack file.",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  };

  const sortedTranslationEntries = useMemo(
    () =>
      Object.entries(translationDraft).sort(([left], [right]) => left.localeCompare(right)),
    [translationDraft],
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-gradient-primary">{t("admin_dashboard")}</h1>
          <p className="text-muted-foreground mt-1">{t("centralized_controls")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("role")}: {role}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Globe2 className="h-3.5 w-3.5" />
            {activeWorkspace?.name || workspaceId}
          </Badge>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="en">{t("english")}</option>
            <option value="sw">{t("kiswahili")}</option>
          </select>
          <Button type="button" variant="outline" className="gap-2" onClick={() => void refreshDashboard()} disabled={isBusy}>
            <RefreshCw className={`h-4 w-4 ${busyAction === "refreshing" ? "animate-spin" : ""}`} />
            {t("refresh")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="data">{t("data_files")}</TabsTrigger>
          <TabsTrigger value="translations">{t("translations")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4 bg-gradient-card border-border">
              <p className="text-xs text-muted-foreground uppercase">{t("campaigns")}</p>
              <p className="text-2xl font-semibold mt-1">{campaignStats.total}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Draft {campaignStats.byStatus.draft} | Review {campaignStats.byStatus.in_review} | Final {campaignStats.byStatus.final}
              </p>
            </Card>
            <Card className="p-4 bg-gradient-card border-border">
              <p className="text-xs text-muted-foreground uppercase">{t("drive_files")}</p>
              <p className="text-2xl font-semibold mt-1">{driveFiles.length}</p>
              <p className="text-xs text-muted-foreground mt-2">{formatBytes(totalDriveBytes)} total in current scope</p>
            </Card>
            <Card className="p-4 bg-gradient-card border-border">
              <p className="text-xs text-muted-foreground uppercase">{t("incidents")}</p>
              <p className="text-2xl font-semibold mt-1">{incidentCount}</p>
              <p className="text-xs text-muted-foreground mt-2">Recent telemetry incidents across workspace</p>
            </Card>
            <Card className="p-4 bg-gradient-card border-border">
              <p className="text-xs text-muted-foreground uppercase">{t("locale_coverage")}</p>
              <p className="text-2xl font-semibold mt-1">{translationCoverage}%</p>
              <p className="text-xs text-muted-foreground mt-2">
                {activeLocale} against {translationBaseKeys.length} baseline keys
              </p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 bg-gradient-card border-border space-y-4">
              <div>
                <h2 className="text-base font-semibold">{t("admin_checklist")}</h2>
                <p className="text-sm text-muted-foreground">Recommended daily checks for operational hygiene.</p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-primary" />
                  Review diagnostics and unresolved incidents.
                </li>
                <li className="flex items-start gap-2">
                  <Database className="h-4 w-4 mt-0.5 text-primary" />
                  Export campaign backups after major updates.
                </li>
                <li className="flex items-start gap-2">
                  <Languages className="h-4 w-4 mt-0.5 text-primary" />
                  Validate translation completeness before publishing.
                </li>
                <li className="flex items-start gap-2">
                  <HardDrive className="h-4 w-4 mt-0.5 text-primary" />
                  Audit file library for outdated or duplicate assets.
                </li>
              </ul>
            </Card>

            <Card className="p-5 bg-gradient-card border-border space-y-4">
              <div>
                <h2 className="text-base font-semibold">{t("quick_admin_links")}</h2>
                <p className="text-sm text-muted-foreground">Access related control surfaces.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild variant="outline">
                  <Link to="/control-tower">Control Tower</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/activity">Activity Center</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/ai-drive">AI Drive</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/diagnostics">Diagnostics</Link>
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <Card className="p-5 bg-gradient-card border-border space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">Campaign Backup & Recovery</h2>
            </div>

            <div className="grid sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Total</p>
                <p className="text-xl font-semibold">{campaignStats.total}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Draft</p>
                <p className="text-xl font-semibold">{campaignStats.byStatus.draft}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">In Review</p>
                <p className="text-xl font-semibold">{campaignStats.byStatus.in_review}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Final</p>
                <p className="text-xl font-semibold">{campaignStats.byStatus.final}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" className="gap-2" onClick={() => void handleExportCampaigns()} disabled={isBusy}>
                <FileDown className="h-4 w-4" />
                Export Backup
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => campaignImportFileRef.current?.click()}
                disabled={isBusy}
              >
                <FileUp className="h-4 w-4" />
                Import From File
              </Button>
              <Button type="button" variant="destructive" className="gap-2" onClick={() => void handleResetCampaigns()} disabled={isBusy}>
                <Trash2 className="h-4 w-4" />
                Reset Workspace
              </Button>
              <input
                ref={campaignImportFileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportCampaignsFromFile}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={importMode}
                onChange={(event) => setImportMode(event.target.value as "merge" | "replace")}
                disabled={isBusy}
              >
                <option value="merge">Merge (upsert by ID)</option>
                <option value="replace">Replace all campaigns</option>
              </select>
              <Textarea
                value={importPayload}
                onChange={(event) => setImportPayload(event.target.value)}
                placeholder="Paste campaign JSON payload here"
                className="min-h-[120px]"
                disabled={isBusy}
              />
              <Button type="button" className="gap-2" onClick={() => void handleImportCampaignsFromText()} disabled={isBusy}>
                <Upload className="h-4 w-4" />
                Import Text
              </Button>
            </div>
          </Card>

          <Card className="p-5 bg-gradient-card border-border space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">AI Drive File Operations</h2>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedCampaignId ?? ""}
                  onChange={(event) => setSelectedCampaignId(event.target.value || null)}
                  disabled={isBusy}
                >
                  <option value="">Global Workspace</option>
                  {campaignOptions.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => driveUploadFileRef.current?.click()}
                  disabled={isBusy}
                >
                  <Upload className="h-4 w-4" />
                  Upload Files
                </Button>
                <input
                  ref={driveUploadFileRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.md,.json,.png,.jpg,.jpeg,.webp"
                  onChange={async (event) => {
                    const files = event.target.files ? Array.from(event.target.files) : [];
                    await handleDriveUpload(files);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              {driveFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)} | {file.mimeType || "unknown"} | Updated {formatDate(file.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void handleDriveDownload(file)}>
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleDeleteDriveFile(file)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              {driveFiles.length === 0 && (
                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground text-center">
                  No files in this scope.
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="translations" className="space-y-4">
          <Card className="p-5 bg-gradient-card border-border space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold">Language Packs</h2>
              </div>
              <Badge variant="secondary">Coverage {translationCoverage}%</Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-[220px_220px_auto_auto_auto]">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={activeLocale}
                onChange={(event) => handleLocaleSelection(event.target.value)}
              >
                {translationLocales.map((locale) => (
                  <option key={locale} value={locale}>
                    {locale}
                  </option>
                ))}
              </select>
              <Input
                value={newLocaleCode}
                onChange={(event) => setNewLocaleCode(event.target.value)}
                placeholder="New locale (e.g. sw)"
              />
              <Button type="button" variant="outline" className="gap-2" onClick={handleCreateLocale}>
                <Plus className="h-4 w-4" />
                Add Locale
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={handleExportTranslationLocale}>
                <FileDown className="h-4 w-4" />
                Export Locale
              </Button>
              <Button type="button" variant="destructive" className="gap-2" onClick={handleDeleteLocale}>
                <Trash2 className="h-4 w-4" />
                Delete Locale
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={translationImportMode}
                onChange={(event) => setTranslationImportMode(event.target.value as "merge" | "replace")}
              >
                <option value="merge">Import Mode: Merge</option>
                <option value="replace">Import Mode: Replace</option>
              </select>
              <Button type="button" variant="outline" className="gap-2" onClick={() => translationImportFileRef.current?.click()}>
                <FileUp className="h-4 w-4" />
                Import Locale File
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={handleExportTranslationsPack}>
                <FileDown className="h-4 w-4" />
                Export All Languages
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => translationsPackImportFileRef.current?.click()}
              >
                <FileUp className="h-4 w-4" />
                Import All Languages
              </Button>
              <input
                ref={translationImportFileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportTranslationLocale}
              />
              <input
                ref={translationsPackImportFileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportTranslationsPack}
              />
            </div>

            <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_auto]">
              <Input
                value={newTranslationKey}
                onChange={(event) => setNewTranslationKey(event.target.value)}
                placeholder="translation.key"
              />
              <Input
                value={newTranslationValue}
                onChange={(event) => setNewTranslationValue(event.target.value)}
                placeholder="Translation value"
              />
              <Button type="button" variant="outline" className="gap-2" onClick={handleAddTranslationEntry}>
                <Plus className="h-4 w-4" />
                Add Key
              </Button>
            </div>

            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {sortedTranslationEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[220px_minmax(0,1fr)_auto]"
                >
                  <code className="text-xs bg-muted rounded px-2 py-2 h-fit">{key}</code>
                  <Input
                    value={value}
                    onChange={(event) =>
                      setTranslationDraft((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() =>
                      setTranslationDraft((previous) => {
                        const next = { ...previous };
                        delete next[key];
                        return next;
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {sortedTranslationEntries.length === 0 && (
                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground text-center">
                  No translation keys for this locale yet.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Keys: {sortedTranslationEntries.length} | Missing baseline keys:{" "}
                {Math.max(0, translationBaseKeys.length - sortedTranslationEntries.length)}
              </p>
              <Button type="button" className="gap-2" onClick={handleSaveTranslations}>
                <Save className="h-4 w-4" />
                Save Locale
              </Button>
            </div>
          </Card>

          <Card className="p-5 bg-gradient-card border-border space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Translation QA Tips</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Keep key names stable, avoid deleting shared keys without migration, and export locale files before large updates.
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
