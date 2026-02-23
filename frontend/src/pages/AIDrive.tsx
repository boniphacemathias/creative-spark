import { useCallback, useEffect, useMemo, useState, type DragEventHandler } from "react";
import {
  Folder,
  FileText,
  Upload,
  Search,
  Plus,
  Trash2,
  Pencil,
  Move,
  ChevronRight,
  FolderOpen,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { DriveEntry, DriveFile, DriveFolder } from "@/lib/drive-storage";
import { useToast } from "@/components/ui/use-toast";
import { listCampaigns } from "@/lib/campaign-storage";
import { useAppRole } from "@/hooks/use-app-role";
import {
  createDriveFolder,
  deleteDriveEntry,
  getDriveBreadcrumbs,
  listDriveEntries,
  listDriveFolders,
  moveDriveEntry,
  renameDriveEntry,
  uploadDriveFile,
} from "@/lib/drive-api";

const ALLOWED_EXTENSIONS = [
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
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function isSupportedFile(name: string): boolean {
  return ALLOWED_EXTENSIONS.includes(getExtension(name));
}

type DriveBusyAction = "idle" | "uploading" | "creating-folder" | "renaming" | "moving" | "deleting";

export default function AIDrive() {
  const { toast } = useToast();
  const { permissions } = useAppRole();
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [entries, setEntries] = useState<DriveEntry[]>([]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [entryPendingDelete, setEntryPendingDelete] = useState<DriveEntry | null>(null);
  const [entryPendingRename, setEntryPendingRename] = useState<DriveEntry | null>(null);
  const [entryPendingMove, setEntryPendingMove] = useState<DriveEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveDestinationId, setMoveDestinationId] = useState("");
  const [busyAction, setBusyAction] = useState<DriveBusyAction>("idle");

  const refresh = useCallback(async () => {
    try {
      const [nextEntries, nextFolders, nextBreadcrumbs] = await Promise.all([
        listDriveEntries(currentFolderId, searchQuery, selectedCampaignId),
        listDriveFolders(selectedCampaignId),
        getDriveBreadcrumbs(currentFolderId, selectedCampaignId),
      ]);
      setEntries(nextEntries);
      setFolders(nextFolders);
      setBreadcrumbs(nextBreadcrumbs);
    } catch (error) {
      toast({
        title: "Unable to load AI Drive",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    }
  }, [currentFolderId, searchQuery, selectedCampaignId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;
    const loadCampaigns = async () => {
      const campaigns = await listCampaigns();
      if (!active) {
        return;
      }

      const options = campaigns.map((campaign) => ({
        id: campaign.campaign.id,
        name: campaign.campaign.name,
      }));
      setCampaignOptions(options);
      if (selectedCampaignId && !options.some((campaign) => campaign.id === selectedCampaignId)) {
        setSelectedCampaignId(null);
        setCurrentFolderId(null);
      }
    };

    void loadCampaigns();
    return () => {
      active = false;
    };
  }, [selectedCampaignId]);

  const uploadFiles = async (files: File[]) => {
    if (!permissions.canManageCampaign) {
      return;
    }
    if (files.length === 0) {
      return;
    }
    if (busyAction !== "idle") {
      return;
    }

    setBusyAction("uploading");
    let uploaded = 0;
    try {
      for (const file of files) {
        if (!isSupportedFile(file.name)) {
          toast({
            title: "Unsupported file type",
            description: `${file.name} was skipped.`,
            variant: "destructive",
          });
          continue;
        }

        try {
          await uploadDriveFile(file, currentFolderId, selectedCampaignId);
          uploaded += 1;
        } catch (error) {
          toast({
            title: "Upload failed",
            description: error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: Unknown error.`,
            variant: "destructive",
          });
        }
      }

      await refresh();
      toast({
        title: "Upload completed",
        description: `${uploaded} file(s) uploaded to AI Drive.`,
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const onDrop: DragEventHandler<HTMLDivElement> = async (event) => {
    event.preventDefault();
    if (!permissions.canManageCampaign) {
      return;
    }
    const files = Array.from(event.dataTransfer.files || []);
    await uploadFiles(files);
  };

  const handleCreateFolder = async () => {
    if (!permissions.canManageCampaign) {
      return;
    }
    if (busyAction !== "idle") {
      return;
    }
    setBusyAction("creating-folder");
    try {
      await createDriveFolder(newFolderName, currentFolderId, selectedCampaignId);
      setNewFolderName("");
      await refresh();
      toast({
        title: "Folder created",
        description: "New folder added to AI Drive.",
      });
    } catch (error) {
      toast({
        title: "Unable to create folder",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const handleRename = async () => {
    if (!permissions.canManageCampaign) {
      return;
    }
    if (!entryPendingRename) {
      return;
    }
    if (busyAction !== "idle") {
      return;
    }

    setBusyAction("renaming");
    try {
      await renameDriveEntry(entryPendingRename.id, renameValue, selectedCampaignId);
      await refresh();
      setEntryPendingRename(null);
      setRenameValue("");
      toast({
        title: "Entry renamed",
        description: "AI Drive entry name updated.",
      });
    } catch (error) {
      toast({
        title: "Unable to rename",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const handleMove = async () => {
    if (!permissions.canManageCampaign) {
      return;
    }
    if (!entryPendingMove) {
      return;
    }
    if (busyAction !== "idle") {
      return;
    }

    setBusyAction("moving");
    try {
      await moveDriveEntry(entryPendingMove.id, moveDestinationId || null, selectedCampaignId);
      await refresh();
      setEntryPendingMove(null);
      setMoveDestinationId("");
      toast({
        title: "Entry moved",
        description: "AI Drive entry location updated.",
      });
    } catch (error) {
      toast({
        title: "Unable to move",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const handleDelete = async () => {
    if (!permissions.canManageCampaign) {
      return;
    }
    if (!entryPendingDelete) {
      return;
    }
    if (busyAction !== "idle") {
      return;
    }

    setBusyAction("deleting");
    try {
      await deleteDriveEntry(entryPendingDelete.id, selectedCampaignId);
      await refresh();
      setEntryPendingDelete(null);
      toast({
        title: "Entry deleted",
        description: "AI Drive entry removed.",
      });
    } catch (error) {
      toast({
        title: "Unable to delete",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setBusyAction("idle");
    }
  };

  const moveFolderOptions = useMemo(() => {
    if (!entryPendingMove || entryPendingMove.type !== "folder") {
      return folders;
    }

    const excludedFolderIds = new Set<string>([entryPendingMove.id]);
    let foundChild = true;

    while (foundChild) {
      foundChild = false;
      for (const folder of folders) {
        if (folder.parentId && excludedFolderIds.has(folder.parentId) && !excludedFolderIds.has(folder.id)) {
          excludedFolderIds.add(folder.id);
          foundChild = true;
        }
      }
    }

    return folders.filter((folder) => !excludedFolderIds.has(folder.id));
  }, [entryPendingMove, folders]);

  const openEntry = (entry: DriveEntry) => {
    if (entry.type === "folder") {
      setCurrentFolderId(entry.id);
      return;
    }

    const file = entry as DriveFile;
    toast({
      title: file.name,
      description: file.extractedText.slice(0, 200) || "No extracted text available.",
    });
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-gradient-primary">AI Drive</h1>
          <p className="text-muted-foreground mt-1">Organize folders, upload campaign files, and power AI automation.</p>
          {!permissions.canManageCampaign && (
            <p className="text-xs text-muted-foreground mt-1">Viewer mode: AI Drive is read-only.</p>
          )}
        </div>
        <div className="w-full sm:w-72">
          <label className="text-xs text-muted-foreground mb-1 block" htmlFor="drive-campaign-scope">
            Scope
          </label>
          <select
            id="drive-campaign-scope"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedCampaignId ?? ""}
            onChange={(event) => {
              const nextCampaignId = event.target.value || null;
              setSelectedCampaignId(nextCampaignId);
              setCurrentFolderId(null);
            }}
          >
            <option value="">Global Workspace</option>
            {campaignOptions.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="p-4 bg-gradient-card space-y-3" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <button type="button" className="hover:text-primary" onClick={() => setCurrentFolderId(null)}>
            Root
          </button>
          {breadcrumbs.map((folder) => (
            <span key={folder.id} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button type="button" className="hover:text-primary" onClick={() => setCurrentFolderId(folder.id)}>
                {folder.name}
              </button>
            </span>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search folders, files, tags, extracted text"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="New folder"
              className="w-40"
              aria-label="New folder name"
            />
            <Button
              type="button"
              variant="outline"
              className="gap-1"
              onClick={handleCreateFolder}
              disabled={!permissions.canManageCampaign || busyAction !== "idle" || !newFolderName.trim()}
            >
              <Plus className="h-3 w-3" /> {busyAction === "creating-folder" ? "Creating..." : "Folder"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs border border-input rounded-md px-3 py-1.5 cursor-pointer">
            <Upload className="h-3.5 w-3.5" /> {busyAction === "uploading" ? "Uploading..." : "Upload Files"}
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.md,.json,.png,.jpg,.jpeg,.webp"
              onChange={async (event) => {
                const files = event.target.files ? Array.from(event.target.files) : [];
                await uploadFiles(files);
                event.target.value = "";
              }}
              disabled={!permissions.canManageCampaign || busyAction !== "idle"}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Drag and drop files anywhere in this panel to upload into the current folder.
          </p>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <Card key={entry.id} className="p-4 bg-gradient-card border-border hover:border-primary/20 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="text-left min-w-0" onClick={() => openEntry(entry)}>
                <div className="flex items-center gap-2">
                  {entry.type === "folder" ? (
                    <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                  )}
                  <p className="font-medium text-sm truncate">{entry.name}</p>
                </div>
                {entry.type === "file" && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {(entry as DriveFile).extractedText || "No extracted text available."}
                  </p>
                )}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={!permissions.canManageCampaign || busyAction !== "idle"}
                  onClick={() => {
                    setEntryPendingRename(entry);
                    setRenameValue(entry.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={!permissions.canManageCampaign || busyAction !== "idle"}
                  onClick={() => {
                    setEntryPendingMove(entry);
                    if (entry.type === "folder") {
                      setMoveDestinationId(entry.parentId ?? "");
                      return;
                    }
                    setMoveDestinationId(entry.folderId ?? "");
                  }}
                >
                  <Move className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  disabled={!permissions.canManageCampaign || busyAction !== "idle"}
                  onClick={() => setEntryPendingDelete(entry)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px]">
                {entry.type === "folder" ? "Folder" : "File"}
              </Badge>
              {entry.type === "file" && (
                <>
                  <Badge variant="secondary" className="text-[10px]">{formatBytes((entry as DriveFile).size)}</Badge>
                  <Badge variant="secondary" className="text-[10px]">{(entry as DriveFile).mimeType || "unknown"}</Badge>
                </>
              )}
            </div>
          </Card>
        ))}

        {entries.length === 0 && (
          <Card className="p-8 border-dashed border-2 text-center col-span-full">
            <Folder className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No entries found in this folder.</p>
          </Card>
        )}
      </div>

      <Dialog
        open={Boolean(entryPendingRename)}
        onOpenChange={(open) => {
          if (!open) {
            setEntryPendingRename(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename entry</DialogTitle>
            <DialogDescription>Update the name for this AI Drive item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="rename-entry-name">
              Name
            </label>
            <Input
              id="rename-entry-name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Entry name"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEntryPendingRename(null);
                setRenameValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRename}
              disabled={
                !permissions.canManageCampaign ||
                busyAction !== "idle" ||
                !renameValue.trim() ||
                renameValue.trim() === entryPendingRename?.name
              }
            >
              {busyAction === "renaming" ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(entryPendingMove)}
        onOpenChange={(open) => {
          if (!open) {
            setEntryPendingMove(null);
            setMoveDestinationId("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move entry</DialogTitle>
            <DialogDescription>
              {entryPendingMove ? `Select destination for "${entryPendingMove.name}".` : "Select destination folder."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground" htmlFor="move-entry-destination">
              Destination
            </label>
            <select
              id="move-entry-destination"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={moveDestinationId}
              onChange={(event) => setMoveDestinationId(event.target.value)}
            >
              <option value="">Root</option>
              {moveFolderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEntryPendingMove(null);
                setMoveDestinationId("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleMove}
              disabled={!permissions.canManageCampaign || busyAction !== "idle"}
            >
              {busyAction === "moving" ? "Moving..." : "Move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(entryPendingDelete)} onOpenChange={(open) => !open && setEntryPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {entryPendingDelete ? `This will permanently delete "${entryPendingDelete.name}".` : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={!permissions.canManageCampaign || busyAction !== "idle"}
            >
              {busyAction === "deleting" ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
