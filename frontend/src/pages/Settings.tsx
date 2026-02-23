import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Download, Settings as SettingsIcon, Upload, RefreshCw, Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  exportCampaigns,
  getCampaignStorageStats,
  importCampaigns,
  resetCampaigns,
} from "@/lib/campaign-storage";

function downloadJson(filename: string, payload: string): void {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

export default function Settings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importPayload, setImportPayload] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    byStatus: { draft: 0, in_review: 0, final: 0 },
  });

  const refreshStats = async () => {
    const next = await getCampaignStorageStats();
    setStats(next);
  };

  useEffect(() => {
    void refreshStats();
  }, []);

  const handleExport = async () => {
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
    downloadJson(`campaign-backup-${stamp}.json`, payload);

    toast({
      title: "Export complete",
      description: "Campaign backup downloaded.",
    });
  };

  const parseImportPayload = (payload: string): number | null => {
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
  };

  const runImport = async (payload: string) => {
    const candidateCount = parseImportPayload(payload);
    if (candidateCount === null) {
      toast({
        title: "Import failed",
        description: "Payload must be valid JSON containing an array or a campaigns bundle.",
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

    const result = await importCampaigns(payload, importMode);
    if (!result) {
      toast({
        title: "Import failed",
        description: "Invalid payload or storage error.",
        variant: "destructive",
      });
      return;
    }

    await refreshStats();
    toast({
      title: "Import complete",
      description: `Imported ${result.imported}, skipped ${result.skipped} (${result.mode}).`,
    });
  };

  const handleImportFromText = async () => {
    if (!importPayload.trim()) {
      toast({
        title: "No payload",
        description: "Paste campaign JSON before importing.",
        variant: "destructive",
      });
      return;
    }

    await runImport(importPayload);
  };

  const handleImportFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const payload = await file.text();
    setImportPayload(payload);
    await runImport(payload);

    event.target.value = "";
  };

  const handleReset = async () => {
    const confirmed = window.confirm("Reset all campaigns and keep only the default sample campaign?");
    if (!confirmed) {
      return;
    }

    await resetCampaigns();
    await refreshStats();
    toast({
      title: "Workspace reset",
      description: "Campaigns were reset to the default sample.",
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <SettingsIcon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Data operations, backup, and recovery controls.</p>
        </div>
      </div>

      <Card className="p-6 bg-gradient-card space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database className="h-4 w-4" /> Storage Stats
        </div>
        <div className="grid sm:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-border p-3">
            <p className="text-muted-foreground">Total</p>
            <p className="text-xl font-semibold">{stats.total}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-muted-foreground">Draft</p>
            <p className="text-xl font-semibold">{stats.byStatus.draft}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-muted-foreground">In Review</p>
            <p className="text-xl font-semibold">{stats.byStatus.in_review}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-muted-foreground">Final</p>
            <p className="text-xl font-semibold">{stats.byStatus.final}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-gradient-card space-y-4">
        <h2 className="text-sm font-medium">Backup and Export</h2>
        <Button className="gap-2" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export Campaign Data
        </Button>
      </Card>

      <Card className="p-6 bg-gradient-card space-y-4">
        <h2 className="text-sm font-medium">Import Campaign Data</h2>

        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground" htmlFor="import-mode">
            Mode
          </label>
          <select
            id="import-mode"
            value={importMode}
            onChange={(event) => setImportMode(event.target.value as "merge" | "replace")}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="merge">Merge (upsert by ID)</option>
            <option value="replace">Replace all campaigns</option>
          </select>
        </div>

        <Textarea
          value={importPayload}
          onChange={(event) => setImportPayload(event.target.value)}
          placeholder="Paste exported campaign JSON here"
          className="min-h-[180px]"
        />

        <div className="flex flex-wrap gap-2">
          <Button className="gap-2" onClick={handleImportFromText}>
            <Upload className="h-4 w-4" /> Import From Text
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import From File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportFromFile}
          />
        </div>
      </Card>

      <Card className="p-6 bg-gradient-card space-y-4">
        <h2 className="text-sm font-medium">Recovery</h2>
        <Button variant="destructive" className="gap-2" onClick={handleReset}>
          <RefreshCw className="h-4 w-4" /> Reset to Default Sample
        </Button>
      </Card>
    </div>
  );
}
