export type AppRole = "admin" | "operator" | "viewer";

export interface RolePermissions {
  canCreateCampaign: boolean;
  canManageCampaign: boolean;
  canAccessAIDrive: boolean;
  canAccessDiagnostics: boolean;
  canAccessSettings: boolean;
}

export const ROLE_STORAGE_KEY = "creative-spark-app-role";

export function normalizeRole(value: unknown): AppRole {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "operator" || normalized === "viewer") {
    return normalized;
  }
  return "admin";
}

export function getDefaultRole(): AppRole {
  return normalizeRole(import.meta.env.VITE_DEFAULT_ROLE || "admin");
}

export function getRolePermissions(role: AppRole): RolePermissions {
  if (role === "admin") {
    return {
      canCreateCampaign: true,
      canManageCampaign: true,
      canAccessAIDrive: true,
      canAccessDiagnostics: true,
      canAccessSettings: true,
    };
  }

  if (role === "operator") {
    return {
      canCreateCampaign: true,
      canManageCampaign: true,
      canAccessAIDrive: true,
      canAccessDiagnostics: true,
      canAccessSettings: false,
    };
  }

  return {
    canCreateCampaign: false,
    canManageCampaign: false,
    canAccessAIDrive: true,
    canAccessDiagnostics: false,
    canAccessSettings: false,
  };
}

export function isRoleAuthorized(role: AppRole, allowedRoles: AppRole[]): boolean {
  return allowedRoles.includes(role);
}

export function roleLabel(role: AppRole): string {
  if (role === "admin") {
    return "Admin";
  }
  if (role === "operator") {
    return "Operator";
  }
  return "Viewer";
}
