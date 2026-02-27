import { useCallback, useEffect, useState } from "react";
import { listWorkspaceNotifications, WorkspaceNotification } from "@/lib/campaign-enhancements-api";
import { subscribeRealtimeStream } from "@/lib/realtime-api";
import { useAppWorkspace } from "@/hooks/use-app-workspace";

export function useWorkspaceNotifications(limit = 20) {
  const { workspaceId } = useAppWorkspace();
  const [items, setItems] = useState<WorkspaceNotification[]>([]);

  const load = useCallback(async () => {
    const next = await listWorkspaceNotifications().catch(() => []);
    setItems(next.slice(0, limit));
  }, [limit]);

  useEffect(() => {
    void load();
  }, [load, workspaceId]);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeStream({
      onUpdate: (payload) => {
        if (payload.entity !== "notification" && payload.entity !== "campaign") {
          return;
        }
        void load();
      },
    });
    return () => unsubscribe();
  }, [load, workspaceId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void load();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  return items;
}
