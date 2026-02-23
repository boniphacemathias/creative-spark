export interface WorkspaceEntry {
  id: string;
  name: string;
  createdAt: string;
}

export const WORKSPACE_STORAGE_KEY = "creative-spark-workspaces";
export const ACTIVE_WORKSPACE_STORAGE_KEY = "creative-spark-active-workspace";
export const DEFAULT_WORKSPACE_ID = "main";
export const DEFAULT_WORKSPACE_NAME = "Main Workspace";

function nowIso() {
  return new Date().toISOString();
}

export function normalizeWorkspaceId(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) {
    return DEFAULT_WORKSPACE_ID;
  }
  return normalized.slice(0, 40);
}

function readWorkspaceList(): WorkspaceEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as WorkspaceEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry) => entry && typeof entry.id === "string" && typeof entry.name === "string");
  } catch {
    return [];
  }
}

function writeWorkspaceList(items: WorkspaceEntry[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(items));
}

function ensureDefaultWorkspace(list: WorkspaceEntry[]): WorkspaceEntry[] {
  if (list.some((item) => item.id === DEFAULT_WORKSPACE_ID)) {
    return list;
  }
  return [
    {
      id: DEFAULT_WORKSPACE_ID,
      name: DEFAULT_WORKSPACE_NAME,
      createdAt: nowIso(),
    },
    ...list,
  ];
}

export function listWorkspaces(): WorkspaceEntry[] {
  const list = ensureDefaultWorkspace(readWorkspaceList());
  writeWorkspaceList(list);
  return list;
}

export function getActiveWorkspaceId(): string {
  if (typeof window === "undefined") {
    return DEFAULT_WORKSPACE_ID;
  }
  const raw = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  const id = normalizeWorkspaceId(raw || DEFAULT_WORKSPACE_ID);
  const all = listWorkspaces();
  if (!all.some((entry) => entry.id === id)) {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, DEFAULT_WORKSPACE_ID);
    return DEFAULT_WORKSPACE_ID;
  }
  return id;
}

export function setActiveWorkspaceId(id: string) {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeWorkspaceId(id);
  window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, normalized);
}

export function createWorkspace(name: string): WorkspaceEntry | null {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    return null;
  }

  const idBase = normalizeWorkspaceId(trimmed);
  const existing = listWorkspaces();
  let id = idBase;
  let suffix = 2;
  while (existing.some((entry) => entry.id === id)) {
    id = `${idBase}-${suffix}`;
    suffix += 1;
  }

  const next: WorkspaceEntry = {
    id,
    name: trimmed,
    createdAt: nowIso(),
  };
  const updated = [...existing, next];
  writeWorkspaceList(updated);
  return next;
}

export function getWorkspaceNameById(id: string): string {
  const normalized = normalizeWorkspaceId(id);
  const match = listWorkspaces().find((entry) => entry.id === normalized);
  return match?.name || DEFAULT_WORKSPACE_NAME;
}
