import { getActiveWorkspaceId } from "@/lib/workspace";

export type DashboardWidgetId = "priority" | "activity" | "continue";

const DASHBOARD_LAYOUT_STORAGE_PREFIX = "creative-spark-dashboard-layout";
const DEFAULT_WIDGET_ORDER: DashboardWidgetId[] = ["priority", "activity", "continue"];

function getStorageKey() {
  return `${DASHBOARD_LAYOUT_STORAGE_PREFIX}:${getActiveWorkspaceId()}`;
}

export function getDefaultWidgetOrder(): DashboardWidgetId[] {
  return [...DEFAULT_WIDGET_ORDER];
}

export function listDashboardWidgetOrder(): DashboardWidgetId[] {
  if (typeof window === "undefined") {
    return getDefaultWidgetOrder();
  }

  const raw = window.localStorage.getItem(getStorageKey());
  if (!raw) {
    return getDefaultWidgetOrder();
  }

  try {
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) {
      return getDefaultWidgetOrder();
    }

    const allowed = new Set<DashboardWidgetId>(["priority", "activity", "continue"]);
    const unique = Array.from(new Set(parsed))
      .map((entry) => String(entry || "").trim() as DashboardWidgetId)
      .filter((entry) => allowed.has(entry));

    for (const fallback of DEFAULT_WIDGET_ORDER) {
      if (!unique.includes(fallback)) {
        unique.push(fallback);
      }
    }

    return unique.slice(0, DEFAULT_WIDGET_ORDER.length);
  } catch {
    return getDefaultWidgetOrder();
  }
}

export function saveDashboardWidgetOrder(order: DashboardWidgetId[]) {
  if (typeof window === "undefined") {
    return;
  }

  const next = [...order];
  window.localStorage.setItem(getStorageKey(), JSON.stringify(next));
}
