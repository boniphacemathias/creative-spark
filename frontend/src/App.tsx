import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ThemeProvider } from "./components/theme-provider";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { GlobalErrorToaster } from "./components/GlobalErrorToaster";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Index from "./pages/Index";
import CampaignWizard from "./pages/CampaignWizard";
import AdminDashboard from "./pages/AdminDashboard";
import AIDrive from "./pages/AIDrive";
import Diagnostics from "./pages/Diagnostics";
import ActivityCenter from "./pages/ActivityCenter";
import CampaignControlTower from "./pages/CampaignControlTower";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="creative-spark-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <GlobalErrorToaster />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Index />} />
                <Route
                  path="/campaign/:id"
                  element={
                    <ProtectedRoute allowedRoles={["admin", "operator", "viewer"]}>
                      <CampaignWizard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/ai-drive"
                  element={
                    <ProtectedRoute allowedRoles={["admin", "operator", "viewer"]}>
                      <AIDrive />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/diagnostics"
                  element={
                    <ProtectedRoute allowedRoles={["admin", "operator"]}>
                      <Diagnostics />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/activity"
                  element={
                    <ProtectedRoute allowedRoles={["admin", "operator", "viewer"]}>
                      <ActivityCenter />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/control-tower"
                  element={
                    <ProtectedRoute allowedRoles={["admin", "operator", "viewer"]}>
                      <CampaignControlTower />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allowedRoles={["admin"]}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute allowedRoles={["admin"]}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
