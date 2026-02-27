import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Megaphone, Sparkles, ShieldCheck, FolderKanban, Plus, Activity, Bell, TowerControl } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { createCampaign, listCampaigns } from "@/lib/campaign-storage";
import { useToast } from "@/components/ui/use-toast";
import { CampaignData } from "@/types/campaign";
import { useAppRole } from "@/hooks/use-app-role";
import { AppRole, roleLabel } from "@/lib/rbac";
import { useAppWorkspace } from "@/hooks/use-app-workspace";
import { useCampaignFavorites } from "@/hooks/use-campaign-favorites";
import { useRecentCampaigns } from "@/hooks/use-recent-campaigns";
import { subscribeRealtimeStream } from "@/lib/realtime-api";

const navItems = [
  { title: "Campaigns", url: "/", icon: Megaphone, allowedRoles: ["admin", "operator", "viewer"] as AppRole[] },
  { title: "AI Drive", url: "/ai-drive", icon: FolderKanban, allowedRoles: ["admin", "operator", "viewer"] as AppRole[] },
  { title: "Control Tower", url: "/control-tower", icon: TowerControl, allowedRoles: ["admin", "operator", "viewer"] as AppRole[] },
  { title: "Activity", url: "/activity", icon: Bell, allowedRoles: ["admin", "operator", "viewer"] as AppRole[] },
  { title: "Diagnostics", url: "/diagnostics", icon: Activity, allowedRoles: ["admin", "operator"] as AppRole[] },
  { title: "Admin", url: "/admin", icon: ShieldCheck, allowedRoles: ["admin"] as AppRole[] },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { role, setRole, permissions } = useAppRole();
  const { workspaceId, workspaces, setWorkspace, addWorkspace } = useAppWorkspace();
  const { favoritesSet } = useCampaignFavorites(workspaceId);
  const recentVisits = useRecentCampaigns(5, workspaceId);
  const [isCreating, setIsCreating] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);

  const handleCreateCampaign = async () => {
    if (!permissions.canCreateCampaign) {
      toast({
        title: "Role permission required",
        description: "Switch to Operator or Admin to create campaigns.",
        variant: "destructive",
      });
      return;
    }
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    try {
      const created = await createCampaign();
      navigate(`/campaign/${created.campaign.id}`);
    } catch (error) {
      toast({
        title: "Unable to create campaign",
        description: error instanceof Error ? error.message : "Unknown error.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateWorkspace = () => {
    const nextName = window.prompt("Workspace name", "");
    if (!nextName || !nextName.trim()) {
      return;
    }
    const created = addWorkspace(nextName);
    if (!created) {
      return;
    }
    toast({
      title: "Workspace created",
      description: `Switched to ${created.name}.`,
    });
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      const next = await listCampaigns();
      if (active) {
        setCampaigns(next);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [location.pathname, workspaceId]);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeStream({
      onUpdate: (payload) => {
        if (payload.entity !== "campaign") {
          return;
        }
        void listCampaigns().then((next) => setCampaigns(next));
      },
    });
    return () => unsubscribe();
  }, [workspaceId]);

  const sidebarStats = useMemo(() => {
    const openIssues = campaigns.flatMap((entry) =>
      (entry.issues || [])
        .filter((issue) => issue.status !== "resolved")
        .map((issue) => ({ campaignId: entry.campaign.id, campaignName: entry.campaign.name, issue })),
    );
    return {
      total: campaigns.length,
      draft: campaigns.filter((entry) => entry.campaign.status === "draft").length,
      inReview: campaigns.filter((entry) => entry.campaign.status === "in_review").length,
      favorites: campaigns.filter((entry) => favoritesSet.has(entry.campaign.id)).slice(0, 5),
      openIssues: openIssues.slice(0, 4),
    };
  }, [campaigns, favoritesSet]);

  return (
    <Sidebar>
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-display font-bold text-gradient-primary">SBCC Builder</h1>
        </div>
        <p className="text-xs text-sidebar-foreground/50 mt-1 font-medium tracking-wide">4Rs FRAMEWORK</p>
        <div className="mt-3">
          <label className="text-[10px] text-sidebar-foreground/60 block mb-1" htmlFor="workspace-id">
            Workspace
          </label>
          <div className="flex items-center gap-1">
            <select
              id="workspace-id"
              className="h-8 w-full rounded-md border border-sidebar-border bg-sidebar px-2 text-xs"
              value={workspaceId}
              onChange={(event) => setWorkspace(event.target.value)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={handleCreateWorkspace}>
              New
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-[10px] text-sidebar-foreground/60 block mb-1" htmlFor="workspace-role">
            Workspace Role
          </label>
          <select
            id="workspace-role"
            className="h-8 w-full rounded-md border border-sidebar-border bg-sidebar px-2 text-xs"
            value={role}
            onChange={(event) => setRole(event.target.value as AppRole)}
          >
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
          <p className="text-[10px] text-sidebar-foreground/60 mt-1">Active: {roleLabel(role)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="rounded border border-sidebar-border px-2 py-1 text-center">
            <p className="text-[10px] text-sidebar-foreground/60">Total</p>
            <p className="text-xs font-semibold">{sidebarStats.total}</p>
          </div>
          <div className="rounded border border-sidebar-border px-2 py-1 text-center">
            <p className="text-[10px] text-sidebar-foreground/60">Draft</p>
            <p className="text-xs font-semibold">{sidebarStats.draft}</p>
          </div>
          <div className="rounded border border-sidebar-border px-2 py-1 text-center">
            <p className="text-[10px] text-sidebar-foreground/60">Review</p>
            <p className="text-xs font-semibold">{sidebarStats.inReview}</p>
          </div>
        </div>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                item.allowedRoles.includes(role) ? (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} end activeClassName="bg-sidebar-accent text-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <Button
              type="button"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => void handleCreateCampaign()}
              disabled={isCreating || !permissions.canCreateCampaign}
            >
              <Plus className="h-4 w-4" />
              {!permissions.canCreateCampaign ? "Restricted" : isCreating ? "Creating..." : "New Campaign"}
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Starred Campaigns</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarStats.favorites.length === 0 && (
                <SidebarMenuItem>
                  <div className="px-2 py-1.5 text-xs text-sidebar-foreground/60">No starred campaigns yet</div>
                </SidebarMenuItem>
              )}
              {sidebarStats.favorites.map((entry) => (
                <SidebarMenuItem key={`starred-${entry.campaign.id}`}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={`/campaign/${entry.campaign.id}`}
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <span className="truncate">{entry.campaign.name}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Recent Visits</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentVisits.length === 0 && (
                <SidebarMenuItem>
                  <div className="px-2 py-1.5 text-xs text-sidebar-foreground/60">No recent visits yet</div>
                </SidebarMenuItem>
              )}
              {recentVisits.map((entry) => (
                <SidebarMenuItem key={`recent-${entry.campaignId}`}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={`/campaign/${entry.campaignId}`}
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <span className="truncate">{entry.campaignName}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Incident Pulse</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarStats.openIssues.length === 0 && (
                <SidebarMenuItem>
                  <div className="px-2 py-1.5 text-xs text-sidebar-foreground/60">No open incidents</div>
                </SidebarMenuItem>
              )}
              {sidebarStats.openIssues.map((entry) => (
                <SidebarMenuItem key={`issue-${entry.issue.id}`}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/control-tower"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <span className="truncate">
                        {entry.issue.severity.toUpperCase()}: {entry.issue.title}
                      </span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
