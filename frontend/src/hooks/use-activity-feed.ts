import { useEffect, useState } from "react";
import { ActivityEvent, listActivityEvents, subscribeToActivityEvents } from "@/lib/activity-log";

export function useActivityFeed(limit = 20, scopeKey = "default") {
  const [items, setItems] = useState<ActivityEvent[]>(() => listActivityEvents(limit));

  useEffect(() => {
    const refresh = () => setItems(listActivityEvents(limit));
    refresh();
    return subscribeToActivityEvents(refresh);
  }, [limit, scopeKey]);

  return items;
}
