import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Cpu, HardDrive, RefreshCw, Search, Ticket as TicketIcon, MonitorSmartphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

// Актуальная версия агента берётся из таблицы agent_releases (is_current).
function useCurrentAgentVersion(): string | null {
  const { data } = useQuery({
    queryKey: ["current-agent-version"],
    queryFn: async () => {
      const { data } = await supabase.from("agent_releases")
        .select("version").eq("is_current", true).maybeSingle();
      return (data?.version as string) ?? null;
    },
    staleTime: 60000,
  });
  return data ?? null;
}
function cmpVer(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i]||0, y = pb[i]||0; if (x>y) return 1; if (x<y) return -1; }
  return 0;
}

function AgentVersionBadge({ version }: { version?: string | null }) {
  const current = useCurrentAgentVersion();
  if (!version) {
    return <Badge variant="secondary" className="font-mono text-[10px]">неизвестно</Badge>;
  }
  // Нет сведений об актуальной версии — нейтральный бейдж без оценки.
  if (!current) {
    return <Badge className="font-mono text-[10px] bg-muted text-foreground border-transparent">v{version}</Badge>;
  }
  const diff = cmpVer(current, version); // >0 = агент отстал
  const cur = current.replace(/^v/, "").split(".").map(Number);
  const has = version.replace(/^v/, "").split(".").map(Number);
  // насколько отстал: major/minor = сильно (красный), только patch = слегка (жёлтый)
  const behindMajorMinor = diff > 0 && ((cur[0]||0) > (has[0]||0) || (cur[1]||0) > (has[1]||0));
  let cls = "bg-green-600 hover:bg-green-600";      // на актуальной
  if (diff > 0) cls = behindMajorMinor ? "bg-red-600 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-500";
  const badge = (
    <Badge className={"font-mono text-[10px] text-white border-transparent " + cls}>v{version}</Badge>
  );
  if (diff <= 0) return badge; // на актуальной или новее — без тултипа
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
        <TooltipContent>{behindMajorMinor ? "Давно пора обновиться" : "Доступно обновление"} — актуальная v{current}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { AgentVersionBadge };

type AgentRow = {
  id: string;
  agent_id: string;
  display_name: string | null;
  hostname: string | null;
  os_type: string | null;
  os_version: string | null;
  arch: string | null;
  ip_addresses: any;
  cpu_cores: number | null;
  ram_total_mb: number | null;
  agent_version: string | null;
  last_seen_at: string | null;
  is_active: boolean;
  equipment_id: string | null;
  equipment?: { name: string } | null;
};

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

function firstIp(ips: any): string {
  if (Array.isArray(ips) && ips.length) return String(ips[0]);
  return "—";
}

export default function Agents() {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [agentToDelete, setAgentToDelete] = useState<AgentRow | null>(null);
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = hasRole("admin");

  const { data: agents = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_registrations")
        .select("*, equipment:equipment_id(name), organization:organization_id(name), enrollment_key:enrollment_key_id(label,expires_at)")
        .order("last_seen_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as AgentRow[];
    },
    refetchInterval: 30000,
  });

  const { data: latestMetrics = {} } = useQuery({
    queryKey: ["agents-latest-metrics", agents.map((a) => a.agent_id).join(",")],
    enabled: agents.length > 0,
    queryFn: async () => {
      const ids = agents.map((a) => a.agent_id);
      const { data, error } = await supabase
        .from("agent_metrics")
        .select("agent_id, cpu_usage_percent, ram_used_mb, ram_total_mb, collected_at")
        .in("agent_id", ids)
        .order("collected_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map: Record<string, any> = {};
      for (const m of data ?? []) {
        if (!map[m.agent_id]) map[m.agent_id] = m;
      }
      return map;
    },
    refetchInterval: 30000,
  });

  const orgList = useMemo(() => {
    const set = new Map<string, string>();
    for (const a of agents) if ((a as any).organization?.name) set.set((a as any).organization_id, (a as any).organization.name);
    return Array.from(set, ([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name));
  }, [agents]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = agents;
    if (orgFilter !== "all") list = list.filter((a) => (a as any).organization_id === orgFilter);
    if (!q) return list;
    return list.filter((a) =>
      [a.hostname, a.agent_id, a.os_type, a.os_version, a.equipment?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [agents, search, orgFilter]);

  const onlineCount = agents.filter((a) => isOnline(a.last_seen_at)).length;

  const deleteMutation = useMutation({
    mutationFn: async (agent: AgentRow) => {
      const { error } = await supabase
        .from("agent_registrations")
        .delete()
        .eq("id", agent.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents-list"] });
      queryClient.invalidateQueries({ queryKey: ["agents-latest-metrics"] });
      setAgentToDelete(null);
      toast({ title: "Агент удалён", description: "Запись и связанные данные удалены." });
    },
    onError: (error: Error) => {
      toast({ title: "Не удалось удалить агента", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Агенты</h1>
          <p className="text-sm text-muted-foreground">
            Установленные на серверах клиентов агенты AP Agent
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={"mr-2 h-4 w-4 " + (isFetching ? "animate-spin" : "")} />
          Обновить
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Всего агентов</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{agents.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Онлайн</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{onlineCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Оффлайн</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-muted-foreground">{agents.length - onlineCount}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по hostname, agent_id, OS, оборудованию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <select
              data-tag="orgFilter-select"
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">Все организации</option>
              {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Статус</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead>Организация</TableHead>
                <TableHead>OS</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>RAM</TableHead>
                <TableHead>Оборудование</TableHead>
                <TableHead>Версия</TableHead>
                <TableHead>Последняя активность</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Загрузка...</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Агенты не зарегистрированы</TableCell></TableRow>
              )}
              {filtered.map((a) => {
                const online = isOnline(a.last_seen_at);
                const m = latestMetrics[a.agent_id];
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge variant={online ? "default" : "secondary"} className={online ? "bg-green-600 hover:bg-green-600" : ""}>
                        {online ? "Онлайн" : "Оффлайн"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/agents/${a.id}`} className="hover:underline">
                        {a.display_name || a.hostname || a.agent_id}
                      </Link>
                      <div className="text-xs text-muted-foreground">{a.agent_id}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {(a as any).organization?.name
                        ? <span>{(a as any).organization.name}</span>
                        : <span className="text-muted-foreground">—</span>}
                      {(a as any).enrollment_key?.label && (
                        <div className="text-xs text-muted-foreground">
                          ключ: {(a as any).enrollment_key.label}
                          {(a as any).enrollment_key.expires_at && (() => {
                            const d = Math.ceil((new Date((a as any).enrollment_key.expires_at).getTime() - Date.now()) / 86400000);
                            return <span className={d <= 0 ? "text-destructive" : ""}> · {d > 0 ? `${d} дн.` : "истёк"}</span>;
                          })()}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{a.os_type || "—"}</div>
                      <div className="text-xs text-muted-foreground">{a.os_version}</div>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{firstIp(a.ip_addresses)}</TableCell>
                    <TableCell className="text-sm">
                      {m?.cpu_usage_percent != null ? `${Number(m.cpu_usage_percent).toFixed(1)}%` : "—"}
                      <div className="text-xs text-muted-foreground">{a.cpu_cores ? `${a.cpu_cores} ядер` : ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {m?.ram_used_mb && m?.ram_total_mb
                        ? `${Math.round(m.ram_used_mb / 1024)} / ${Math.round(m.ram_total_mb / 1024)} ГБ`
                        : a.ram_total_mb ? `${Math.round(a.ram_total_mb / 1024)} ГБ` : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.equipment?.name ? (
                        <Link to={`/equipment`} className="hover:underline">{a.equipment.name}</Link>
                      ) : <span className="text-muted-foreground">не привязан</span>}
                    </TableCell>
                    <TableCell><AgentVersionBadge version={a.agent_version} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.last_seen_at
                        ? formatDistanceToNow(new Date(a.last_seen_at), { addSuffix: true, locale: ru })
                        : "никогда"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <Link to={`/tickets?new=1&agent=${encodeURIComponent(a.agent_id)}`}>
                            <TicketIcon className="h-4 w-4 mr-1" /> Тикет
                          </Link>
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setAgentToDelete(a)}
                            aria-label={`Удалить агента ${a.display_name || a.hostname || a.agent_id}`}
                            title="Удалить агента"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!agentToDelete} onOpenChange={(open) => !open && setAgentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить агента?</AlertDialogTitle>
            <AlertDialogDescription>
              Будут безвозвратно удалены агент «{agentToDelete?.display_name || agentToDelete?.hostname || agentToDelete?.agent_id}» и все связанные с ним данные: метрики, события, инвентарь, процессы и команды.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (agentToDelete) deleteMutation.mutate(agentToDelete);
              }}
            >
              {deleteMutation.isPending ? "Удаление..." : "Удалить полностью"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
