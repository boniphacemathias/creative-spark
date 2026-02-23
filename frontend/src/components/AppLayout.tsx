import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { listCampaigns } from "@/lib/campaign-storage";
import { AIChatDock } from "@/components/ai-chat/AIChatDock";
import { CampaignData } from "@/types/campaign";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppCommandPalette } from "@/components/AppCommandPalette";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import { useAppWorkspace } from "@/hooks/use-app-workspace";
import { recordCampaignVisit } from "@/lib/recent-campaigns";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog";
import { useWorkspaceNotifications } from "@/hooks/use-workspace-notifications";

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

export function AppLayout() {
  const location = useLocation();
  const { workspaceId, activeWorkspace } = useAppWorkspace();
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const activityItems = useActivityFeed(10, workspaceId);
  const notifications = useWorkspaceNotifications(8);
  const activeCampaignId = location.pathname.startsWith("/campaign/")
    ? location.pathname.split("/")[2] || undefined
    : undefined;
  const activeCampaign = useMemo(
    () => campaigns.find((entry) => entry.campaign.id === activeCampaignId),
    [campaigns, activeCampaignId],
  );

  const breadcrumbItems = useMemo(() => {
    if (location.pathname === "/") {
      return [{ label: "Campaigns", href: "/" }];
    }
    if (location.pathname.startsWith("/campaign/")) {
      return [
        { label: "Campaigns", href: "/" },
        { label: activeCampaign?.campaign.name || "Campaign", href: location.pathname },
      ];
    }
    if (location.pathname === "/ai-drive") {
      return [{ label: "AI Drive", href: "/ai-drive" }];
    }
    if (location.pathname === "/activity") {
      return [{ label: "Activity", href: "/activity" }];
    }
    if (location.pathname === "/control-tower") {
      return [{ label: "Control Tower", href: "/control-tower" }];
    }
    if (location.pathname === "/diagnostics") {
      return [{ label: "Diagnostics", href: "/diagnostics" }];
    }
    if (location.pathname === "/settings") {
      return [{ label: "Settings", href: "/settings" }];
    }
    return [{ label: "Workspace", href: location.pathname }];
  }, [activeCampaign?.campaign.name, location.pathname]);

  useEffect(() => {
    let active = true;
    const loadCampaigns = async () => {
      const next = await listCampaigns();
      if (active) {
        setCampaigns(next);
      }
    };

    void loadCampaigns();
    return () => {
      active = false;
    };
  }, [location.pathname, workspaceId]);

  useEffect(() => {
    if (!activeCampaignId || !activeCampaign?.campaign?.name) {
      return;
    }
    recordCampaignVisit({
      campaignId: activeCampaignId,
      campaignName: activeCampaign.campaign.name,
    });
  }, [activeCampaign?.campaign?.name, activeCampaignId]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between gap-3 border-b border-border px-4 shrink-0 bg-background/80 backdrop-blur-sm">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger />
              <Breadcrumb className="hidden md:block">
                <BreadcrumbList>
                  {breadcrumbItems.map((item, index) => (
                    <BreadcrumbItem key={`${item.href}-${index}`}>
                      {index === breadcrumbItems.length - 1 ? (
                        <BreadcrumbPage className="truncate max-w-[220px]">{item.label}</BreadcrumbPage>
                      ) : (
                        <>
                          <BreadcrumbLink asChild>
                            <Link to={item.href}>{item.label}</Link>
                          </BreadcrumbLink>
                          <BreadcrumbSeparator />
                        </>
                      )}
                    </BreadcrumbItem>
                  ))}
                </BreadcrumbList>
              </Breadcrumb>
              <span className="hidden lg:inline-flex rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {activeWorkspace?.name || "Workspace"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AppCommandPalette campaigns={campaigns} />
              <KeyboardShortcutsDialog />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {(activityItems.length > 0 || notifications.length > 0) && (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
                    )}
                    <span className="sr-only">Open activity feed</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  {notifications.length > 0 && (
                    <DropdownMenuItem disabled className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Reminders
                    </DropdownMenuItem>
                  )}
                  {notifications.map((item) => (
                    <DropdownMenuItem key={item.id} className="items-start gap-2 py-2">
                      <Clock3 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <p className="text-sm leading-5">{item.message}</p>
                        <p className="text-[11px] text-muted-foreground">{formatRelativeTime(item.createdAt)}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  {activityItems.length > 0 && (
                    <DropdownMenuItem disabled className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Activity
                    </DropdownMenuItem>
                  )}
                  {activityItems.map((item) => (
                    <DropdownMenuItem key={item.id} className="items-start gap-2 py-2">
                      <Clock3 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="space-y-0.5">
                        <p className="text-sm leading-5">{item.message}</p>
                        <p className="text-[11px] text-muted-foreground">{formatRelativeTime(item.timestamp)}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  {activityItems.length === 0 && notifications.length === 0 && (
                    <DropdownMenuItem disabled>No recent activity</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </main>
        <AIChatDock campaigns={campaigns} activeCampaignId={activeCampaignId} />
      </div>
    </SidebarProvider>
  );
}
