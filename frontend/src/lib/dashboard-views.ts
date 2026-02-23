import { getActiveWorkspaceId } from "@/lib/workspace";

export type DashboardStatusFilter = "all" | "draft" | "in_review" | "final";
export type DashboardSortBy = "recent" | "name" | "progress_desc" | "progress_asc";

export interface DashboardViewPreset {
  id: string;
  name: string;
  searchQuery: string;
  statusFilter: DashboardStatusFilter;
  sortBy: DashboardSortBy;
  createdAt: string;
}

const DASHBOARD_VIEWS_STORAGE_KEY_PREFIX = "creative-spark-dashboard-views";

function getDashboardViewsStorageKey() {
  return `${DASHBOARD_VIEWS_STORAGE_KEY_PREFIX}:${getActiveWorkspaceId()}`;
}

function isValidStatusFilter(value: unknown): value is DashboardStatusFilter {
  return value === "all" || value === "draft" || value === "in_review" || value === "final";
}

function isValidSortBy(value: unknown): value is DashboardSortBy {
  return value === "recent" || value === "name" || value === "progress_desc" || value === "progress_asc";
}

export function listDashboardViewPresets(): DashboardViewPreset[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(getDashboardViewsStorageKey());
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as DashboardViewPreset[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry) => {
      return (
        entry &&
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        typeof entry.searchQuery === "string" &&
        isValidStatusFilter(entry.statusFilter) &&
        isValidSortBy(entry.sortBy)
      );
    });
  } catch {
    return [];
  }
}

function persistDashboardViewPresets(presets: DashboardViewPreset[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(getDashboardViewsStorageKey(), JSON.stringify(presets));
}

export function createDashboardViewPreset(input: {
  name: string;
  searchQuery: string;
  statusFilter: DashboardStatusFilter;
  sortBy: DashboardSortBy;
}) {
  const nextPreset: DashboardViewPreset = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim(),
    searchQuery: input.searchQuery,
    statusFilter: input.statusFilter,
    sortBy: input.sortBy,
    createdAt: new Date().toISOString(),
  };

  const existing = listDashboardViewPresets();
  const next = [nextPreset, ...existing].slice(0, 25);
  persistDashboardViewPresets(next);
  return {
    preset: nextPreset,
    presets: next,
  };
}

export function deleteDashboardViewPreset(id: string): DashboardViewPreset[] {
  const next = listDashboardViewPresets().filter((preset) => preset.id !== id);
  persistDashboardViewPresets(next);
  return next;
}
