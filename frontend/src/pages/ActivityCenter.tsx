import { useMemo, useState } from "react";
import { Bell, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActivityFeed } from "@/hooks/use-activity-feed";
import { useAppWorkspace } from "@/hooks/use-app-workspace";
import { ActivityAction } from "@/lib/activity-log";

const ACTION_LABELS: Record<ActivityAction | "all", string> = {
  all: "All actions",
  campaign_created: "Campaign created",
  campaign_deleted: "Campaign deleted",
  campaign_duplicated: "Campaign duplicated",
  campaigns_imported: "Campaigns imported",
  campaigns_reset: "Campaigns reset",
  role_changed: "Role changed",
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

export default function ActivityCenter() {
  const { workspaceId } = useAppWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<ActivityAction | "all">("all");
  const items = useActivityFeed(200, workspaceId);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (actionFilter !== "all" && item.action !== actionFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return item.message.toLowerCase().includes(query);
    });
  }, [actionFilter, items, searchQuery]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-gradient-primary">Activity Center</h1>
          <p className="text-muted-foreground mt-1">Filter and review workspace changes across campaigns and roles.</p>
        </div>
      </div>

      <Card className="p-4 bg-gradient-card border-border mb-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search activity messages"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value as ActivityAction | "all")}
          >
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid gap-3">
        {filteredItems.length === 0 && (
          <Card className="p-8 border-dashed border-2 text-center">
            <p className="text-sm text-muted-foreground">No activity matches your filters.</p>
          </Card>
        )}

        {filteredItems.map((item) => (
          <Card key={item.id} className="p-4 bg-gradient-card border-border">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-primary/10 p-2">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{item.message}</p>
                  <span className="inline-flex items-center rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <Filter className="mr-1 h-3 w-3" /> {ACTION_LABELS[item.action]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatTimestamp(item.timestamp)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
