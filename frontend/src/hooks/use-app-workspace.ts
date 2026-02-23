import { useEffect, useMemo, useState } from "react";
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  WorkspaceEntry,
  createWorkspace,
  getActiveWorkspaceId,
  listWorkspaces,
  setActiveWorkspaceId,
} from "@/lib/workspace";

const WORKSPACE_CHANGE_EVENT = "creative-spark-workspace-change";

function emitWorkspaceChange() {
  window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGE_EVENT));
}

export function useAppWorkspace() {
  const [workspaceId, setWorkspaceIdState] = useState<string>(() => getActiveWorkspaceId());
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>(() => listWorkspaces());

  useEffect(() => {
    const refresh = () => {
      setWorkspaces(listWorkspaces());
      setWorkspaceIdState(getActiveWorkspaceId());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== ACTIVE_WORKSPACE_STORAGE_KEY) {
        return;
      }
      refresh();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(WORKSPACE_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(WORKSPACE_CHANGE_EVENT, refresh);
    };
  }, []);

  const activeWorkspace = useMemo(
    () => workspaces.find((entry) => entry.id === workspaceId) || workspaces[0],
    [workspaceId, workspaces],
  );

  const setWorkspace = (id: string) => {
    setActiveWorkspaceId(id);
    setWorkspaceIdState(getActiveWorkspaceId());
    emitWorkspaceChange();
  };

  const addWorkspace = (name: string) => {
    const created = createWorkspace(name);
    if (!created) {
      return null;
    }
    setWorkspaces(listWorkspaces());
    setWorkspace(created.id);
    return created;
  };

  return {
    workspaceId,
    activeWorkspace,
    workspaces,
    setWorkspace,
    addWorkspace,
  };
}
