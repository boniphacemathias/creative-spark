import { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppRole } from "@/hooks/use-app-role";
import { AppRole, isRoleAuthorized, roleLabel } from "@/lib/rbac";

interface ProtectedRouteProps {
  allowedRoles: AppRole[];
  children: ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const { role } = useAppRole();

  if (isRoleAuthorized(role, allowedRoles)) {
    return <>{children}</>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <Card className="p-6 bg-gradient-card border-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-destructive/10">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Access Restricted</h1>
            <p className="text-sm text-muted-foreground">
              Your current role is <span className="font-medium">{roleLabel(role)}</span>. This page requires additional permissions.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => navigate("/")}>
          Back to Dashboard
        </Button>
      </Card>
    </div>
  );
}
