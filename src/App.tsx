import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ZabbixConnectionProvider } from "@/hooks/useZabbixConnection";
import AppLayout from "@/components/layout/AppLayout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Equipment from "@/pages/Equipment";
import Tickets from "@/pages/Tickets";
import Schedules from "@/pages/Schedules";
import Protocols from "@/pages/Protocols";
import Documents from "@/pages/Documents";
import UsersAdmin from "@/pages/UsersAdmin";
import ManageKeys from "@/pages/ManageKeys";
import ProblemRules from "@/pages/ProblemRules";
import AgentReleases from "@/pages/AgentReleases";
import AuditLog from "@/pages/AuditLog";
import HelpReference from "@/pages/HelpReference";
import Monitoring from "@/pages/Monitoring";
import FleetHealth from "@/pages/FleetHealth";
import Notifications from "@/pages/Notifications";
import Organizations from "@/pages/Organizations";
import Connections from "@/pages/Connections";
import WorkScope from "@/pages/WorkScope";
import InfrastructureMaps from "@/pages/InfrastructureMaps";
import SystemReset from "@/pages/SystemReset";
import AdminMigrations from "@/pages/AdminMigrations";
import Profile from "@/pages/Profile";
import Agents from "@/pages/Agents";
import AgentDetail from "@/pages/AgentDetail";
import OAuthConsent from "@/pages/OAuthConsent";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <AppLayout />;
}

function AuthRoute() {
  const { session, loading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  const target = next && next.startsWith("/") ? next : "/";
  if (loading) return null;
  if (session) return <Navigate to={target} replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ZabbixConnectionProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            <Route element={<ProtectedRoutes />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sites" element={<Navigate to="/organizations?tab=sites" replace />} />
              <Route path="/equipment" element={<Equipment />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/agents/:id" element={<AgentDetail />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/schedules" element={<Schedules />} />
              <Route path="/protocols" element={<Protocols />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/users" element={<UsersAdmin />} />
              <Route path="/enrollment-keys" element={<ManageKeys />} />
              <Route path="/problem-rules" element={<ProblemRules />} />
              <Route path="/agent-releases" element={<AgentReleases />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/monitoring" element={<Monitoring />} />
              <Route path="/fleet-health" element={<FleetHealth />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/organizations" element={<Organizations />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/zabbix-connections" element={<Navigate to="/connections?tab=zabbix" replace />} />
              <Route path="/integrations" element={<Navigate to="/connections?tab=gitlab" replace />} />
              <Route path="/work-scope" element={<WorkScope />} />
              <Route path="/infrastructure-maps" element={<InfrastructureMaps />} />
              <Route path="/system-reset" element={<SystemReset />} />
              <Route path="/admin/migrations" element={<AdminMigrations />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/help" element={<HelpReference />} />
              <Route path="/chat" element={<Navigate to="/" replace />} />
              <Route path="/chat/:threadId" element={<Navigate to="/" replace />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ZabbixConnectionProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
