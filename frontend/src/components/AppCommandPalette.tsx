import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, FolderKanban, Megaphone, Settings, Activity, Bell, Star, TowerControl, ClipboardCheck, FileText } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { CampaignData } from "@/types/campaign";
import { createCampaign } from "@/lib/campaign-storage";
import { useAppRole } from "@/hooks/use-app-role";
import { useAppWorkspace } from "@/hooks/use-app-workspace";
import { useCampaignFavorites } from "@/hooks/use-campaign-favorites";
import { useRecentCampaigns } from "@/hooks/use-recent-campaigns";
import { useLocation } from "react-router-dom";

interface AppCommandPaletteProps {
  campaigns: CampaignData[];
}

export function AppCommandPalette({ campaigns }: AppCommandPaletteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { permissions } = useAppRole();
  const { workspaceId } = useAppWorkspace();
  const { favoritesSet } = useCampaignFavorites(workspaceId);
  const recentVisits = useRecentCampaigns(8, workspaceId);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const routeCommands = useMemo(() => {
    const items: { label: string; path: string; icon: typeof Megaphone }[] = [
      { label: "Campaigns", path: "/", icon: Megaphone },
      { label: "AI Drive", path: "/ai-drive", icon: FolderKanban },
      { label: "Control Tower", path: "/control-tower", icon: TowerControl },
      { label: "Activity", path: "/activity", icon: Bell },
    ];

    if (permissions.canAccessDiagnostics) {
      items.push({ label: "Diagnostics", path: "/diagnostics", icon: Activity });
    }
    if (permissions.canAccessSettings) {
      items.push({ label: "Settings", path: "/settings", icon: Settings });
    }
    return items;
  }, [permissions.canAccessDiagnostics, permissions.canAccessSettings]);

  const recentCampaigns = useMemo(() => campaigns.slice(0, 8), [campaigns]);
  const starredCampaigns = useMemo(
    () => campaigns.filter((entry) => favoritesSet.has(entry.campaign.id)).slice(0, 8),
    [campaigns, favoritesSet],
  );

  const goToPath = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const activeCampaignId = useMemo(() => {
    if (!location.pathname.startsWith("/campaign/")) {
      return "";
    }
    return location.pathname.split("/")[2] || "";
  }, [location.pathname]);

  const dispatchCampaignCommand = (command: "run-preflight" | "export-report") => {
    if (!activeCampaignId) {
      return;
    }
    window.dispatchEvent(new CustomEvent("campaign-command", { detail: { campaignId: activeCampaignId, command } }));
    setOpen(false);
  };

  const createAndOpenCampaign = async () => {
    if (!permissions.canCreateCampaign) {
      return;
    }
    const created = await createCampaign();
    navigate(`/campaign/${created.campaign.id}`);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="hidden md:inline-flex h-9 min-w-56 items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <span>Search pages or campaigns</span>
        <kbd className="rounded border px-1.5 py-0.5 text-[10px]">Ctrl+K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search campaigns..." />
        <CommandList>
          <CommandEmpty>No matching commands.</CommandEmpty>

          <CommandGroup heading="Navigation">
            {routeCommands.map((command) => (
              <CommandItem key={command.path} value={`${command.label} ${command.path}`} onSelect={() => goToPath(command.path)}>
                <command.icon className="mr-2 h-4 w-4" />
                <span>{command.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => void createAndOpenCampaign()} disabled={!permissions.canCreateCampaign}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              <span>New Campaign</span>
              <CommandShortcut>Enter</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => dispatchCampaignCommand("run-preflight")} disabled={!activeCampaignId}>
              <ClipboardCheck className="mr-2 h-4 w-4" />
              <span>Run Preflight (Current Campaign)</span>
            </CommandItem>
            <CommandItem onSelect={() => dispatchCampaignCommand("export-report")} disabled={!activeCampaignId}>
              <FileText className="mr-2 h-4 w-4" />
              <span>Export Full Client Report (Current Campaign)</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Starred Campaigns">
            {starredCampaigns.length === 0 && (
              <CommandItem disabled>
                <span>No starred campaigns</span>
              </CommandItem>
            )}
            {starredCampaigns.map((entry) => (
              <CommandItem
                key={`starred-${entry.campaign.id}`}
                value={`starred ${entry.campaign.name} ${entry.campaign.country}`}
                onSelect={() => goToPath(`/campaign/${entry.campaign.id}`)}
              >
                <Star className="mr-2 h-4 w-4 text-primary" />
                <span className="truncate">{entry.campaign.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Recently Visited">
            {recentVisits.length === 0 && (
              <CommandItem disabled>
                <span>No recent visits</span>
              </CommandItem>
            )}
            {recentVisits.map((entry) => (
              <CommandItem
                key={`recent-visit-${entry.campaignId}`}
                value={`recent ${entry.campaignName}`}
                onSelect={() => goToPath(`/campaign/${entry.campaignId}`)}
              >
                <Megaphone className="mr-2 h-4 w-4" />
                <span className="truncate">{entry.campaignName}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Recent Campaigns">
            {recentCampaigns.length === 0 && (
              <CommandItem disabled>
                <span>No campaigns available</span>
              </CommandItem>
            )}
            {recentCampaigns.map((entry) => (
              <CommandItem
                key={entry.campaign.id}
                value={`${entry.campaign.name} ${entry.campaign.country}`}
                onSelect={() => goToPath(`/campaign/${entry.campaign.id}`)}
              >
                <Megaphone className="mr-2 h-4 w-4" />
                <span className="truncate">{entry.campaign.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
