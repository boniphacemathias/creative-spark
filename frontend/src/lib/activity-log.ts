import { getActiveWorkspaceId } from "@/lib/workspace";

export type ActivityAction =
  | "campaign_created"
  | "campaign_deleted"
  | "campaign_duplicated"
  | "campaigns_imported"
  | "campaigns_reset"
  | "role_changed";

export interface ActivityEvent {
  id: string;
  action: ActivityAction;
  message: string;
  timestamp: string;
}

const ACTIVITY_STORAGE_KEY_PREFIX = "creative-spark-activity-events";
const ACTIVITY_CHANGE_EVENT = "creative-spark-activity-change";
const MAX_ACTIVITY_EVENTS = 200;

function getActivityStorageKey() {
  return `${ACTIVITY_STORAGE_KEY_PREFIX}:${getActiveWorkspaceId()}`;
}

function readActivityEvents(): ActivityEvent[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getActivityStorageKey());
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as ActivityEvent[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry) => entry && typeof entry.id === "string");
  } catch {
    return [];
  }
}

function writeActivityEvents(events: ActivityEvent[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(getActivityStorageKey(), JSON.stringify(events.slice(0, MAX_ACTIVITY_EVENTS)));
  window.dispatchEvent(new CustomEvent(ACTIVITY_CHANGE_EVENT));
}

export function listActivityEvents(limit = 20): ActivityEvent[] {
  return readActivityEvents().slice(0, Math.max(1, limit));
}

export function recordActivityEvent(input: Omit<ActivityEvent, "id" | "timestamp">) {
  const next: ActivityEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    action: input.action,
    message: input.message,
  };

  const existing = readActivityEvents();
  writeActivityEvents([next, ...existing]);
}

export function clearActivityEvents() {
  writeActivityEvents([]);
}

export function subscribeToActivityEvents(listener: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== getActivityStorageKey()) {
      return;
    }
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(ACTIVITY_CHANGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ACTIVITY_CHANGE_EVENT, listener);
  };
}
