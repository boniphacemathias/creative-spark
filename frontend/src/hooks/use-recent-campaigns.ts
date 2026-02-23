import { useEffect, useState } from "react";
import {
  RecentCampaignVisit,
  listRecentCampaignVisits,
  subscribeRecentCampaignVisits,
} from "@/lib/recent-campaigns";

export function useRecentCampaigns(limit = 8, scopeKey = "default") {
  const [items, setItems] = useState<RecentCampaignVisit[]>(() => listRecentCampaignVisits(limit));

  useEffect(() => {
    const refresh = () => setItems(listRecentCampaignVisits(limit));
    refresh();
    return subscribeRecentCampaignVisits(refresh);
  }, [limit, scopeKey]);

  return items;
}
