import { useState, useMemo } from "react";
import { invokeZabbix } from "@/lib/zabbix-invoke";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ArrowLeft, Settings2, RefreshCw, Loader2, Activity , ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import HostItemsView from "./HostItemsView";
import HostDetailDialog from "./HostDetailDialog";
import {
  hostGroupType, groupTypeConfig, availabilityBadge,
  priorityColor, priorityLabel, duration,
} from "./monitoringUtils";
import { formatItemValue, isStale, ageLabel } from "./formatMetric";
import { AgentVersionBadge } from "@/pages/Agents";

interface Props {
  hosts: any[];
  alerts: any[];
  items: any[];
  hostsLoading: boolean;
  onCreateTicket: (problem: any) => void;
  isStaff: boolean;
  agents?: any[];
}

type SortKey = "name" | "ip" | "group" | "availability" | "problems";

export default function MonitoringHosts({ hosts, alerts, hostsLoading, onCreateTicket, isStaff, agents = [] }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedHost, setSelectedHost] = useState<any>(null);
  const [detailHost, setDetailHost] = useState<{ id: string; name: string } | null>(null);

  const hostsArr = Array.isArray(hosts) ? hosts : [];
  const alertsArr = Array.isArray(alerts) ? alerts : [];

  const handleSync = () => {
    qc.invalidateQueries({ queryKey: ["zabbix", "getHosts"] });
    qc.invalidateQueries({ queryKey: ["zabbix", "getAlerts"] });
    qc.invalidateQueries({ queryKey: ["zabbix", "getProblems"] });
    toast({ title: "Синхронизация с Zabbix..." });
  };

  const sortHosts = (list: any[]): any[] => {
    const sorted = [...list].sort((a: any, b: any) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return (a.name || "").localeCompare(b.name || "") * dir;
      if (sortKey === "ip") return (a.interfaces?.[0]?.ip || "").localeCompare(b.interfaces?.[0]?.ip || "") * dir;
      if (sortKey === "group") return (a.groups?.[0]?.name || "").localeCompare(b.groups?.[0]?.name || "") * dir;
      if (sortKey === "availability") return ((a.available || "0").localeCompare(b.available || "0")) * dir;
      if (sortKey === "problems") {
        const ap = alertsArr.filter((al: any) => al.hosts?.[0]?.hostid === a.hostid).length;
        const bp = alertsArr.filter((al: any) => al.hosts?.[0]?.hostid === b.hostid).length;
        return (ap - bp) * dir;
      }
      return 0;
    });
    return sorted;
  };

  const groupedHosts = useMemo(() => {
    let filtered = hostsArr;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((h: any) =>
        h.name.toLowerCase().includes(q) ||
        (h.interfaces?.[0]?.ip || "").includes(q) ||
        (h.groups || []).some((g: any) => (g.name || "").toLowerCase().includes(q))
      );
    }
    if (groupFilter !== "all") {
      filtered = filtered.filter((h: any) => hostGroupType(h.groups) === groupFilter);
    }
    filtered = sortHosts(filtered);
    const groups: Record<string, any[]> = {};
    for (const h of filtered) {
      const type = hostGroupType(h.groups);
      if (!groups[type]) groups[type] = [];
      groups[type].push(h);
    }
    return groups;
  }, [hostsArr, search, groupFilter, sortKey, sortDir, alertsArr]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  if (selectedHost) {
    return (
      <HostDetailView
        host={selectedHost}
        isStaff={isStaff}
        onBack={() => setSelectedHost(null)}
        onCreateTicket={onCreateTicket}
      />
    );
  }

  const q = search.trim().toLowerCase();
  const filteredAgents = q
    ? agents.filter((a: any) =>
        (a.hostname || "").toLowerCase().includes(q) ||
        (a.agent_id || "").toLowerCase().includes(q)
      )
    : agents;

  const pickAgentIp = (ips: any): string => {
    if (!Array.isArray(ips)) return "—";
    const ip = ips.find((x: any) => typeof x === "string" && !x.startsWith("169.254.") && !x.startsWith("fe80:"));
    return ip || "—";
  };

  const isAgentOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    return Date.now() - new Date(lastSeen).getTime() < 3 * 60 * 1000;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени, IP, группе..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Все типы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {Object.entries(groupTypeConfig).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={`${sortKey}:${sortDir}`} onValueChange={(v) => {
          const [k, d] = v.split(":") as [SortKey, "asc" | "desc"];
          setSortKey(k); setSortDir(d);
        }}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name:asc">Имя ↑</SelectItem>
            <SelectItem value="name:desc">Имя ↓</SelectItem>
            <SelectItem value="ip:asc">IP ↑</SelectItem>
            <SelectItem value="ip:desc">IP ↓</SelectItem>
            <SelectItem value="group:asc">Группа ↑</SelectItem>
            <SelectItem value="problems:desc">Проблемы (макс.)</SelectItem>
            <SelectItem value="availability:desc">Доступность</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleSync}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Синхронизация
        </Button>
      </div>

      {hostsLoading ? (
        <div className="space-y-3 py-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : hostsArr.length === 0 ? (
        filteredAgents.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Нет данных о хостах. Проверьте подключение к Zabbix.
            </CardContent>
          </Card>
        ) : null
      ) : null}

      {!hostsLoading && filteredAgents.length > 0 && (
        <Card>
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="w-full group/apcol">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=closed]/apcol:-rotate-90" />
                  <Activity className="h-4 w-4" />
                  Агенты AP Agent ({filteredAgents.length})
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>ОС</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Источник</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((a: any) => {
                  const online = isAgentOnline(a.last_seen_at);
                  return (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <Link to={`/agents/${a.id}`} className="block">
                          <div className="font-medium text-primary hover:underline">{a.hostname || a.agent_id}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">{a.agent_id}</div>
                          <div className="mt-0.5"><AgentVersionBadge version={a.agent_version} /></div>
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {pickAgentIp(a.ip_addresses)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {[a.os_type, a.os_version].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell>
                        {online ? (
                          <Badge variant="success">Онлайн</Badge>
                        ) : (
                          <Badge variant="secondary">Оффлайн</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-blue-600 text-white hover:bg-blue-600/80 border-transparent">Агент</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {!hostsLoading && hostsArr.length > 0 && (
        <>
        {Object.entries(groupedHosts).map(([type, hostList]) => {
          const cfg = groupTypeConfig[type] || groupTypeConfig.other;
          const Icon = cfg.icon;
          return (
            <Card key={type}>
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="w-full group/col">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=closed]/col:-rotate-90" />
                      <Icon className="h-4 w-4" />
                      {cfg.label} ({hostList.length})
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                        Имя хоста {sortKey === "name" && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("ip")}>
                        IP {sortKey === "ip" && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("group")}>
                        Группа {sortKey === "group" && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead>Доступность</TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("problems")}>
                        Проблемы {sortKey === "problems" && (sortDir === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead className="w-32 text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hostList.map((host: any) => {
                      const hAlerts = alertsArr.filter((a: any) => a.hosts?.[0]?.hostid === host.hostid);
                      const avail = availabilityBadge(host.available);
                      return (
                        <TableRow
                          key={host.hostid}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedHost(host)}
                        >
                          <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                            {host.name}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {host.interfaces?.[0]?.ip || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{host.groups?.[0]?.name || "—"}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={avail.variant as any}>{avail.label}</Badge>
                          </TableCell>
                          <TableCell>
                            {hAlerts.length > 0 ? (
                              <div className="flex gap-1">
                                {hAlerts.slice(0, 3).map((a: any, i: number) => (
                                  <Badge key={i} variant={priorityColor(a.priority) as any} className="text-xs">
                                    {priorityLabel(a.priority)}
                                  </Badge>
                                ))}
                                {hAlerts.length > 3 && <Badge variant="outline">+{hAlerts.length - 3}</Badge>}
                              </div>
                            ) : (
                              <span className="text-xs text-emerald-500">✓</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDetailHost({ id: host.hostid, name: host.name })}
                            >
                              <Settings2 className="h-3.5 w-3.5 mr-1" />
                              Подробнее
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
        </>
      )}

      <HostDetailDialog
        open={!!detailHost}
        onOpenChange={(o) => !o && setDetailHost(null)}
        zabbixHostId={detailHost?.id ?? null}
        hostName={detailHost?.name}
      />
    </div>
  );
}

/* ─── Per-host detail view (Overview / Problems / Items) ─── */
function HostDetailView({
  host, isStaff, onBack, onCreateTicket,
}: { host: any; isStaff: boolean; onBack: () => void; onCreateTicket: (p: any) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const avail = availabilityBadge(host.available);

  const { data: hostItems = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ["zabbix-host-items-detail", host.hostid],
    queryFn: async () => {
      const { data, error } = await invokeZabbix( {
        body: { action: "getItemsByHost", params: { hostid: host.hostid } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.result ?? []) as any[];
    },
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: hostProblems = [], isLoading: problemsLoading, refetch: refetchProblems } = useQuery({
    queryKey: ["zabbix-host-problems", host.hostid],
    queryFn: async () => {
      const { data, error } = await invokeZabbix( {
        body: { action: "getActiveProblemsByHost", params: { hostid: host.hostid } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.result ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: localHost } = useQuery({
    queryKey: ["monitored-host-by-zbx", host.hostid],
    queryFn: async () => {
      const { data } = await supabase
        .from("monitored_hosts").select("id").eq("zabbix_host_id", host.hostid).maybeSingle();
      return data;
    },
  });

  const handleSync = () => {
    refetchItems();
    refetchProblems();
    qc.invalidateQueries({ queryKey: ["zabbix"] });
    toast({ title: "Обновление данных хоста..." });
  };

  // Robust metric matchers (key OR name)
  const findItem = (patterns: RegExp[]): any | null => {
    for (const p of patterns) {
      const found = hostItems.find((i: any) => p.test(i.key_ || "") || p.test(i.name || ""));
      if (found) return found;
    }
    return null;
  };

  const cpuItem = findItem([
    /system\.cpu\.util/i, /cpu.*util/i, /processor.*load/i, /перегрузка.*процесс/i, /cpu.*usage/i,
  ]);
  const memItem = findItem([
    /vm\.memory\.util/i, /memory.*pused/i, /mem.*util/i, /память.*использ/i, /memory.*usage/i,
  ]);
  const diskItem = findItem([
    /vfs\.fs\.pused/i, /disk.*pused/i, /storage.*used/i, /диск.*заполн/i,
  ]);
  const upItem = findItem([/system\.uptime/i, /uptime/i, /агент.*время.*работы/i]);
  const pingItem = findItem([/icmpping/i, /agent\.ping/i]);

  // Хост недоступен по данным Zabbix?
  const hostOffline = host.available === "2";

  // Если хост offline ИЛИ конкретная метрика «протухла» — показываем N/A.
  const fmtPercent = (it: any | null) => {
    if (!it || hostOffline || isStale(it)) return "N/A";
    return formatItemValue({ ...it, units: "%" });
  };
  const fmtUptime = (it: any | null) => {
    if (!it || hostOffline || isStale(it)) return "N/A";
    return formatItemValue({ ...it, units: "uptime" });
  };
  const fmtPing = (it: any | null) => {
    if (!it || hostOffline || isStale(it)) return "N/A";
    return parseFloat(it.lastvalue) > 0 ? "🟢 OK" : "🔴 нет";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Назад к списку
        </Button>
        <Button variant="outline" size="sm" onClick={handleSync}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Обновить из Zabbix
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              {host.name}
              <Badge variant={avail.variant as any}>{avail.label}</Badge>
            </CardTitle>
            <span className="text-sm text-muted-foreground font-mono">
              {host.interfaces?.[0]?.ip || "—"}
            </span>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="problems">
            Активные проблемы ({hostProblems.length})
          </TabsTrigger>
          <TabsTrigger value="items">Метрики ({hostItems.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {itemsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "CPU", item: cpuItem },
                { label: "Память", item: memItem },
                { label: "Диск", item: diskItem },
                { label: "Uptime", item: upItem, isUptime: true },
                { label: "ICMP ping", item: pingItem, isPing: true },
              ].map(({ label, item, isUptime, isPing }) => (
                <Card key={label}>
                  <CardContent className="py-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="text-2xl font-heading font-bold">
                      {isUptime ? fmtUptime(item) : isPing ? fmtPing(item) : fmtPercent(item)}
                    </p>
                    {item && !hostOffline && !isStale(item) && (
                      <p className="text-[10px] text-muted-foreground mt-1 truncate" title={item.name}>
                        {item.name}
                      </p>
                    )}
                    {item && (hostOffline || isStale(item)) && (
                      <p className="text-[10px] text-amber-500 mt-1 truncate" title={`Последнее значение ${ageLabel(item)}`}>
                        {hostOffline ? "Хост недоступен" : `Устарело (${ageLabel(item)})`}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Группы хоста</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2 flex-wrap">
              {host.groups?.map((g: any) => (
                <Badge key={g.groupid} variant="outline">{g.name}</Badge>
              )) || <span className="text-muted-foreground text-sm">—</span>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="problems">
          {problemsLoading ? (
            <Skeleton className="h-32" />
          ) : hostProblems.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Нет активных проблем для этого хоста
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Описание</TableHead>
                      <TableHead>Серьёзность</TableHead>
                      <TableHead>Время</TableHead>
                      <TableHead>Длительность</TableHead>
                      {isStaff && <TableHead className="text-right">Действия</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hostProblems.map((p: any) => (
                      <TableRow key={p.eventid}>
                        <TableCell className="max-w-[400px]">{p.name}</TableCell>
                        <TableCell>
                          <Badge variant={priorityColor(p.severity) as any}>{priorityLabel(p.severity)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(parseInt(p.clock) * 1000).toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{duration(p.clock)}</TableCell>
                        {isStaff && (
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => onCreateTicket({
                              ...p, hosts: [{ name: host.name, hostid: host.hostid }],
                            })}>
                              Создать заявку
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="items">
          {itemsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <HostItemsView
              hostId={localHost?.id || ""}
              zabbixHostId={host.hostid}
              items={hostItems}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
