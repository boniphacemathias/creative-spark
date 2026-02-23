import { getActiveWorkspaceId } from "@/lib/workspace";

const API_BASE_URL =
  (typeof import.meta.env.VITE_CAMPAIGN_API_BASE_URL === "string"
    ? import.meta.env.VITE_CAMPAIGN_API_BASE_URL.trim().replace(/\/$/, "")
    : "") || "http://127.0.0.1:8787";
const API_AUTH_TOKEN = (typeof import.meta.env.VITE_BACKEND_AUTH_TOKEN === "string"
  ? import.meta.env.VITE_BACKEND_AUTH_TOKEN.trim()
  : "");

export interface RealtimeEventPayload {
  entity?: "campaign" | "chat" | "notification";
  action?: string;
  campaignId?: string | null;
  timestamp?: string;
  [key: string]: unknown;
}

export function subscribeRealtimeStream(input: {
  campaignId?: string | null;
  onUpdate: (payload: RealtimeEventPayload) => void;
  onError?: () => void;
}): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  const params = new URLSearchParams();
  params.set("workspaceId", getActiveWorkspaceId());
  if (input.campaignId) {
    params.set("campaignId", input.campaignId);
  }
  if (API_AUTH_TOKEN) {
    params.set("token", API_AUTH_TOKEN);
  }

  const source = new EventSource(`${API_BASE_URL}/api/realtime/stream?${params.toString()}`);

  const onUpdateMessage = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as RealtimeEventPayload;
      input.onUpdate(payload);
    } catch {
      // no-op
    }
  };

  source.addEventListener("update", onUpdateMessage as EventListener);
  source.onerror = () => {
    input.onError?.();
  };

  return () => {
    source.removeEventListener("update", onUpdateMessage as EventListener);
    source.close();
  };
}
