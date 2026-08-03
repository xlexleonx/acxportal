import { useState } from "react";
import { invokeZabbix } from "@/lib/zabbix-invoke";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { logAudit } from "@/lib/audit";
import { Activity, AlertTriangle, RefreshCw, Boxes, LayoutDashboard, ScrollText } from "lucide-react";
import { priorityToIncident, priorityLabel } from "@/components/monitoring/monitoringUtils";

import MonitoringHosts from "@/components/monitoring/MonitoringHosts";
import MonitoringProblems from "@/components/monitoring/MonitoringProblems";
import MonitoringGraphs from "@/components/monitoring/MonitoringGraphs";
import MonitoringAutomation from "@/components/monitoring/MonitoringAutomation";
import HostManagement from "@/components/monitoring/HostManagement";
import TemplateLibrary from "@/components/monitoring/TemplateLibrary";
import ProblemsHeatmap from "@/components/monitoring/ProblemsHeatmap";
import MonitoringLogs from "@/components/monitoring/MonitoringLogs";

/* ─── Zabbix configured check ─── */
function useZabbixConfigured() {
  return useQuery({
    queryKey: ["zabbix-connections-any-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("zabbix_connections")
        .select("id")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      return !!data;
    },
    staleTime: 60000,
  });
}

/* ─── Zabbix data hook ─── */
function useZabbixData(action: string, enabled = true) {
  return useQuery({
    queryKey: ["zabbix", action],
    queryFn: async () => {
      const { data, error } = await invokeZabbix( {
        body: { action },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data?.result ?? [];
    },
    enabled,
    refetchInterval: action === "getProblems" || action === "getAlerts" ? 30000 : 60000,
    retry: 1,
  });
}

/* ════════════════════════════════════════════ */
export default function Monitoring() {
  const { toast } = useToast();
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("hosts");
  const [problemPriorityFilter, setProblemPriorityFilter] = useState("all");

  const { data: isZabbixConfigured = false } = useZabbixConfigured();

  // AP Agent agents (separate group, NOT Zabbix)
  const { data: agents = [] } = useQuery({
    queryKey: ["monitoring-agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_registrations")
        .select("id, agent_id, hostname, os_type, os_version, ip_addresses, cpu_cores, ram_total_mb, last_seen_at, is_active")
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  // Zabbix data
  const { data: hosts = [], isLoading: hostsLoading, error: hostsError, refetch: refetchHosts } = useZabbixData("getHosts", isZabbixConfigured);
  const { data: problems = [], isLoading: problemsLoading, refetch: refetchProblems } = useZabbixData("getProblems", isZabbixConfigured);
  const { data: alerts = [], isLoading: alertsLoading, refetch: refetchAlerts } = useZabbixData("getAlerts", isZabbixConfigured);
  const { data: agentProblemsResp } = useQuery({
    queryKey: ["agent-problems"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("agent-problems", { body: {} });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
  const agentProblems = agentProblemsResp?.problems ?? [];
  const { data: items = [] } = useZabbixData("getItems", isZabbixConfigured);
  const { data: graphs = [] } = useZabbixData("getGraphs", isZabbixConfigured);
  const { data: scripts = [] } = useZabbixData("getScripts", isZabbixConfigured);

  const connectionError = !isZabbixConfigured || hostsError != null;

  const handleRefresh = () => {
    refetchHosts();
    refetchProblems();
    refetchAlerts();
    queryClient.invalidateQueries({ queryKey: ["zabbix", "getItems"] });
    queryClient.invalidateQueries({ queryKey: ["zabbix", "getScripts"] });
    toast({ title: "Данные обновляются..." });
  };

  const createTicketFromProblem = async (problem: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Не авторизован");

      const severity = parseInt(problem.severity || problem.priority || "2");
      const incident = priorityToIncident(String(severity));
      const eventid = problem.eventid || problem.triggerid || null;

      const { data: ticket, error } = await supabase.from("tickets").insert({
        title: `[Мониторинг] ${problem.name || problem.description}`,
        description: `Автоматически создана из проблемы мониторинга.\n\nОписание: ${problem.name || problem.description}\nСерьёзность: ${priorityLabel(problem.severity || problem.priority)}\nВремя: ${new Date(parseInt(problem.clock || problem.lastchange) * 1000).toLocaleString("ru-RU")}${eventid ? `\nZabbix eventid: ${eventid}` : ""}`,
        priority: incident.priority as any,
        created_by: session.user.id,
        status: "open" as any,
        request_type: "incident",
      }).select("id").single();
      if (error) throw error;

      // Link Zabbix eventid → ticket via audit_logs (entity_id holds the eventid for cross-ref)
      if (eventid && ticket?.id) {
        await logAudit({
          action: "Привязка алерта к заявке",
          module: "monitoring",
          entityId: eventid,
          details: `ticket=${ticket.id}; eventid=${eventid}`,
        });
      }

      await logAudit({
        action: "Создание заявки из мониторинга",
        module: "monitoring",
        entityId: ticket?.id,
        details: problem.name || problem.description,
      });

      toast({ title: "Заявка создана", description: `Приоритет: ${incident.priority}` });
      // Refresh problems & alerts (acknowledged ↔ ticket sync handled in feed)
      refetchProblems();
      queryClient.invalidateQueries({ queryKey: ["alert-ticket-links"] });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  const acknowledgeEvent = async (eventid: string) => {
    try {
      const { data, error } = await invokeZabbix( {
        body: { action: "acknowledgeEvent", params: { eventids: [eventid], message: "Признано через портал ITEA" } },
      });
      if (error) throw error;
      toast({ title: "Проблема признана" });
      refetchProblems();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          Мониторинг и автоматизация
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Дашборды
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Обновить
          </Button>
        </div>
      </div>

      {connectionError && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-4 flex items-center justify-between">
            <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {!isZabbixConfigured
                ? "Zabbix не сконфигурирован. Добавьте подключение в разделе «Подключения»."
                : "Нет связи с сервером мониторинга. Данные могут быть неактуальны."}
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link to="/connections?tab=zabbix">Перейти к подключениям →</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="hosts">Хосты</TabsTrigger>
          <TabsTrigger value="problems">Проблемы и Алерты</TabsTrigger>
          <TabsTrigger value="heatmap">Тепловая карта</TabsTrigger>
          <TabsTrigger value="graphs">Графики</TabsTrigger>
          <TabsTrigger value="automation">Автоматизация</TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1">
            <ScrollText className="h-3.5 w-3.5" />
            Анализ логов оборудования
          </TabsTrigger>
          <TabsTrigger value="catalog" className="flex items-center gap-1">
            <Boxes className="h-3.5 w-3.5" />
            Хосты и шаблоны
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hosts">
          <MonitoringHosts
            hosts={hosts}
            alerts={alerts}
            items={items}
            hostsLoading={hostsLoading}
            onCreateTicket={createTicketFromProblem}
            isStaff={isStaff}
            agents={agents}
          />
        </TabsContent>

        <TabsContent value="problems">
          <MonitoringProblems agentProblems={agentProblems}
            problems={problems}
            alerts={alerts}
            problemsLoading={problemsLoading}
            alertsLoading={alertsLoading}
            isStaff={isStaff}
            onCreateTicket={createTicketFromProblem}
            onAcknowledge={acknowledgeEvent}
            initialPriorityFilter={problemPriorityFilter}
          />
        </TabsContent>

        <TabsContent value="heatmap">
          <ProblemsHeatmap problems={[...(problems as any[]), ...(alerts as any[])]} />
        </TabsContent>

        <TabsContent value="graphs">
          <MonitoringGraphs
            hosts={hosts}
            graphs={graphs}
            connectionError={connectionError}
          />
        </TabsContent>

        <TabsContent value="automation">
          <MonitoringAutomation
            hosts={hosts}
            scripts={scripts}
            isZabbixConfigured={isZabbixConfigured}
          />
        </TabsContent>

        <TabsContent value="logs">
          <MonitoringLogs />
        </TabsContent>

        <TabsContent value="catalog" className="space-y-6">
          <HostManagement />
          <TemplateLibrary />
        </TabsContent>
      </Tabs>
    </div>
  );
}
