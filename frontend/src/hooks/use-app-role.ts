import { useEffect, useMemo, useState } from "react";
import {
  AppRole,
  ROLE_STORAGE_KEY,
  getDefaultRole,
  getRolePermissions,
  normalizeRole,
} from "@/lib/rbac";
import { recordActivityEvent } from "@/lib/activity-log";

const ROLE_CHANGE_EVENT = "creative-spark-role-change";

function readRole(): AppRole {
  if (typeof window === "undefined") {
    return getDefaultRole();
  }
  const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
  return normalizeRole(stored || getDefaultRole());
}

function writeRole(role: AppRole) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ROLE_STORAGE_KEY, role);
  window.dispatchEvent(new CustomEvent(ROLE_CHANGE_EVENT, { detail: role }));
}

export function useAppRole() {
  const [role, setRoleState] = useState<AppRole>(() => readRole());

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== ROLE_STORAGE_KEY) {
        return;
      }
      setRoleState(readRole());
    };
    const onRoleChanged = () => setRoleState(readRole());

    window.addEventListener("storage", onStorage);
    window.addEventListener(ROLE_CHANGE_EVENT, onRoleChanged);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ROLE_CHANGE_EVENT, onRoleChanged);
    };
  }, []);

  const setRole = (nextRole: AppRole) => {
    const normalized = normalizeRole(nextRole);
    if (normalized !== role) {
      recordActivityEvent({
        action: "role_changed",
        message: `Workspace role switched to ${normalized}.`,
      });
    }
    writeRole(normalized);
    setRoleState(normalized);
  };

  const permissions = useMemo(() => getRolePermissions(role), [role]);

  return {
    role,
    setRole,
    permissions,
  };
}
