import { useState, useMemo, useEffect, Fragment } from "react";
import { invokeZabbix } from "@/lib/zabbix-invoke";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CheckCircle2, MessageSquarePlus, Check, X, Loader2, Trash2, Eye, BellOff, Bell, ArrowUp, ArrowDown, ArrowUpDown, Download, Layers } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { logAudit } from "@/lib/audit";
import { priorityColor, priorityLabel, priorityToIncident, duration } from "./monitoringUtils";
import { ProblemFlagBadge } from "./ProblemFlagBadge";
import { invokeZabbix as invokeZbx } from "@/lib/zabbix-invoke";

const LS_KEY = "monitoring.problems.filters.v2";
type SortBy = "time" | "severity" | "host" | "source";
type SortDir = "asc" | "desc";

const SEVERITY_ORDER: Array<{ value: string; label: string; short: string; cls: string }> = [
  { value: "5", label: "Катастрофа",   short: "Кат.",  cls: "bg-red-600/15 text-red-600 border-red-600/30" },
  { value: "4", label: "Высокий",      short: "Выс.",  cls: "bg-orange-600/15 text-orange-600 border-orange-600/30" },
  { value: "3", label: "Средний",      short: "Ср.",   cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" },
  { value: "2", label: "Предупр.",     short: "Пред.", cls: "bg-amber-500/10 text-amber-600 border-amber-500/25" },
  { value: "1", label: "Информация",   short: "Инф.",  cls: "bg-sky-500/10 text-sky-600 border-sky-500/25" },
  { value: "0", label: "Не классиф.",  short: "н/к",   cls: "bg-muted text-muted-foreground border-border" },
];

function loadLS(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function saveLS(v: Record<string, any>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* noop */ }
}
function csvEscape(v: any): string {
  const s = v == null ? "" : String(v);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface Props {
  problems: any[];
  alerts: any[];
  problemsLoading: boolean;
  alertsLoading: boolean;
  isStaff: boolean;
  onCreateTicket: (problem: any) => void;
  onAcknowledge: (eventid: string) => void;
  initialPriorityFilter?: string;
}

export default function MonitoringProblems({
  problems, alerts, problemsLoading, alertsLoading,
  isStaff, onCreateTicket, onAcknowledge, initialPriorityFilter,
  agentProblems = [],
}: Props & { agentProblems?: any[] }) {
  const { toast } = useToast();
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole("admin");
  const qc = useQueryClient();
  const persisted = loadLS();
  const [priorityFilter, setPriorityFilter] = useState<string>(initialPriorityFilter || persisted.priorityFilter || "all");
  const [hostFilter, setHostFilter] = useState<string>(persisted.hostFilter || "");
  const [viewMode, setViewMode] = useState<"active" | "disabled">("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState<boolean>(!!persisted.showDismissed);
  const [onlyUnack, setOnlyUnack] = useState<boolean>(!!persisted.onlyUnack);
  const [groupByHost, setGroupByHost] = useState<boolean>(!!persisted.groupByHost);
  const [sortBy, setSortBy] = useState<SortBy>((persisted.sortBy as SortBy) || "time");
  const [sortDir, setSortDir] = useState<SortDir>((persisted.sortDir as SortDir) || "desc");

  useEffect(() => {
    saveLS({ priorityFilter, hostFilter, showDismissed, onlyUnack, groupByHost, sortBy, sortDir });
  }, [priorityFilter, hostFilter, showDismissed, onlyUnack, groupByHost, sortBy, sortDir]);

  const toggleSort = (col: SortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir(col === "host" || col === "source" ? "asc" : "desc"); }
  };
  const SortIcon = ({ col }: { col: SortBy }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 inline ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 inline ml-1" />
      : <ArrowDown className="h-3 w-3 inline ml-1" />;
  };

  const { data: disabledTriggers = [], isLoading: disabledLoading, refetch: refetchDisabled } = useQuery({
    queryKey: ["zabbix", "getDisabledTriggers"],
    queryFn: async () => {
      const { data } = await invokeZbx({ body: { action: "getDisabledTriggers" } });
      const list = (data as any)?.result ?? (data as any)?.data ?? [];
      return Array.isArray(list) ? list : [];
    },
    enabled: viewMode === "disabled",
    staleTime: 30000,
  });

  const enableTriggerMutation = useMutation({
    mutationFn: async (triggerid: string) => {
      const { data, error } = await invokeZabbix({
        body: { action: "setTriggerStatus", params: { triggerids: [triggerid], disabled: false } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onMutate: async (triggerid: string) => {
      // Optimistic: remove from disabled list immediately
      await qc.cancelQueries({ queryKey: ["zabbix", "getDisabledTriggers"] });
      const prev = qc.getQueryData<any[]>(["zabbix", "getDisabledTriggers"]);
      qc.setQueryData<any[]>(["zabbix", "getDisabledTriggers"], (old) =>
        Array.isArray(old) ? old.filter((t: any) => t.triggerid !== triggerid) : old,
      );
      return { prev };
    },
    onSuccess: async (_d, triggerid) => {
      await logAudit({ action: "Включение триггера Zabbix", module: "monitoring", details: `triggerid=${triggerid}` });
      toast({ title: "Триггер снова включён" });
      qc.invalidateQueries({ queryKey: ["zabbix", "getDisabledTriggers"] });
      qc.invalidateQueries({ queryKey: ["zabbix", "getProblems"] });
      qc.invalidateQueries({ queryKey: ["zabbix", "getAlerts"] });
      refetchDisabled();
    },
    onError: (e: Error, _triggerid, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["zabbix", "getDisabledTriggers"], ctx.prev);
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    },
  });

  const problemsArr = Array.isArray(problems) ? problems : [];
  const alertsArr = Array.isArray(alerts) ? alerts : [];

  const { data: dismissed = [] } = useQuery({
    queryKey: ["dismissed-alerts", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("dismissed_alerts").select("eventid").eq("user_id", user.id);
      return (data || []).map((r: any) => r.eventid as string);
    },
    enabled: !!user?.id,
  });
  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);

  // Merge problems + active triggers (alerts) into a single list keyed by triggerid.
  // Problems have richer data (eventid, acknowledge state); alerts fill gaps where
  // Zabbix has an active trigger but no open problem event.
  // pre-priority list — used for severity counters (so numbers reflect all matches
  // regardless of active priority chip, but respect host filter + dismissed toggle).
  const mergedRaw = useMemo(() => {
    const byTrigger = new Map<string, any>();
    for (const a of alertsArr) {
      const tid = a.triggerid;
      if (!tid) continue;
      byTrigger.set(tid, {
        triggerid: tid,
        eventid: null,
        host: a.hosts?.[0]?.name || "—",
        hostid: a.hosts?.[0]?.hostid || null,
        name: a.description,
        severity: a.priority,
        clock: a.lastchange,
        acknowledged: false,
        source: "trigger" as const,
      });
    }
    for (const p of problemsArr) {
      const tid = p.objectid;
      const existing = tid ? byTrigger.get(tid) : null;
      const hostName = p.hosts?.[0]?.name || existing?.host || "—";
      const hostId = p.hosts?.[0]?.hostid || existing?.hostid || null;
      const row = {
        triggerid: tid,
        eventid: p.eventid,
        host: hostName,
        hostid: hostId,
        name: p.name,
        severity: p.severity,
        clock: p.clock,
        acknowledged: p.acknowledged === "1" || (p.acknowledges && p.acknowledges.length > 0),
        raw: p,
        source: "problem" as const,
      };
      if (tid) byTrigger.set(tid, row);
      else byTrigger.set(`ev-${p.eventid}`, row);
    }
    const SEV_AGENT: Record<string,string> = { high: "4", average: "3", warning: "2" };
    const agentRows = (agentProblems || []).map((ap: any, i: number) => ({
      triggerid: null,
      eventid: null,
      host: ap.hostname,
      hostid: null,
      name: ap.name + (ap.detail ? ` — ${ap.detail}` : ""),
      severity: SEV_AGENT[ap.severity] || "3",
      clock: ap.clock ? String(Math.floor(new Date(ap.clock).getTime() / 1000)) : null,
      acknowledged: false,
      source: "agent" as const,
      agent_id: ap.agent_id,
      _key: `agent-${ap.agent_id}-${ap.kind}-${i}`,
    }));
    let list = [...agentRows, ...Array.from(byTrigger.values())];
    if (!showDismissed) {
      list = list.filter((r) => !r.eventid || !dismissedSet.has(r.eventid));
    }
    if (hostFilter) {
      const q = hostFilter.toLowerCase();
      list = list.filter((r) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.host || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [problemsArr, alertsArr, hostFilter, dismissedSet, showDismissed, agentProblems]);

  const severityCounts = useMemo(() => {
    const c: Record<string, number> = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const r of mergedRaw) {
      const s = String(parseInt(r.severity || "0"));
      if (c[s] !== undefined) c[s]++;
    }
    return c;
  }, [mergedRaw]);

  const mergedActive = useMemo(() => {
    let list = mergedRaw;
    if (priorityFilter !== "all") list = list.filter((r) => String(r.severity) === priorityFilter);
    if (onlyUnack) list = list.filter((r) => !r.acknowledged);
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "time") cmp = parseInt(a.clock || "0") - parseInt(b.clock || "0");
      else if (sortBy === "severity") cmp = parseInt(a.severity || "0") - parseInt(b.severity || "0");
      else if (sortBy === "host") cmp = (a.host || "").localeCompare(b.host || "", "ru");
      else if (sortBy === "source") cmp = (a.source || "").localeCompare(b.source || "");
      if (cmp === 0) cmp = parseInt(a.clock || "0") - parseInt(b.clock || "0");
      return dir * cmp;
    });
    return list;
  }, [mergedRaw, priorityFilter, onlyUnack, sortBy, sortDir]);

  const groupedActive = useMemo(() => {
    if (!groupByHost) return null;
    const map = new Map<string, any[]>();
    for (const r of mergedActive) {
      const key = r.host || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [mergedActive, groupByHost]);

  const exportCsv = () => {
    const header = ["Хост", "Описание", "Серьёзность", "Источник", "Время", "Длительность", "Подтверждено", "eventid", "triggerid"];
    const rows = mergedActive.map((r) => [
      r.host,
      r.name,
      priorityLabel(r.severity),
      r.source === "problem" ? "Проблема" : "Триггер",
      r.clock ? new Date(parseInt(r.clock) * 1000).toLocaleString("ru-RU") : "",
      r.clock ? duration(r.clock) : "",
      r.acknowledged ? "да" : "нет",
      r.eventid || "",
      r.triggerid || "",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `problems_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const closeMutation = useMutation({
    mutationFn: async (eventid: string) => {
      const { data, error } = await invokeZabbix( {
        body: { action: "closeEvent", params: { eventids: [eventid] } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (data: any, eventid) => {
      await logAudit({ action: "Закрытие события Zabbix", module: "monitoring", details: `eventid=${eventid}` });
      if (data?.partial) {
        toast({ title: "Событие подтверждено", description: data.message, duration: 7000 });
      } else {
        toast({ title: "Событие закрыто" });
      }
      qc.invalidateQueries({ queryKey: ["zabbix", "getProblems"] });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const disableTriggerMutation = useMutation({
    mutationFn: async ({ triggerid, eventid }: { triggerid: string; eventid?: string | null }) => {
      const { data, error } = await invokeZabbix({
        body: { action: "setTriggerStatus", params: { triggerids: [triggerid], disabled: true } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Also close linked event so the row leaves the active list immediately.
      if (eventid) {
        try {
          await invokeZabbix({
            body: { action: "closeEvent", params: { eventids: [eventid] } },
          });
        } catch (_) {
          // Non-fatal: trigger is disabled; event will roll off shortly.
        }
      }
      return data;
    },
    onSuccess: async (_data, { triggerid }) => {
      await logAudit({
        action: "Отключение триггера Zabbix",
        module: "monitoring",
        details: `triggerid=${triggerid}`,
      });
      toast({ title: "Триггер отключён в Zabbix" });
      qc.invalidateQueries({ queryKey: ["zabbix", "getProblems"] });
      qc.invalidateQueries({ queryKey: ["zabbix", "getAlerts"] });
      qc.invalidateQueries({ queryKey: ["zabbix", "getDisabledTriggers"] });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const toggleSel = (id: string) => setSelected((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const clearSel = () => setSelected(new Set());

  const massAck = useMutation({
    mutationFn: async (close: boolean) => {
      const eventids = Array.from(selected);
      if (!eventids.length) return;
      const { data, error } = await invokeZabbix({
        body: { action: "massAcknowledge", params: { eventids, close } },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await logAudit({
        action: close ? "Массовое закрытие алертов Zabbix" : "Массовое подтверждение алертов",
        module: "monitoring",
        details: `count=${eventids.length}`,
      });
    },
    onSuccess: () => {
      toast({ title: "Готово", description: `Обработано: ${selected.size}` });
      clearSel();
      qc.invalidateQueries({ queryKey: ["zabbix", "getProblems"] });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const rows = Array.from(selected).map((eventid) => ({ user_id: user.id, eventid }));
      const { error } = await supabase.from("dismissed_alerts").upsert(rows, { onConflict: "user_id,eventid" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Скрыто из списка" });
      clearSel();
      qc.invalidateQueries({ queryKey: ["dismissed-alerts", user?.id] });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const undismissAll = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase.from("dismissed_alerts").delete().eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Скрытые возвращены" });
      qc.invalidateQueries({ queryKey: ["dismissed-alerts", user?.id] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="active">Активные проблемы и триггеры</TabsTrigger>
            {isStaff && (
              <TabsTrigger value="disabled">
                <BellOff className="h-3.5 w-3.5 mr-1" /> Отключённые
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Все приоритеты" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все приоритеты</SelectItem>
            <SelectItem value="5">П1 — Катастрофа</SelectItem>
            <SelectItem value="4">П1 — Высокий</SelectItem>
            <SelectItem value="3">П2 — Средний</SelectItem>
            <SelectItem value="2">П3 — Предупреждение</SelectItem>
            <SelectItem value="1">П4 — Информация</SelectItem>
            <SelectItem value="0">П4 — Не классиф.</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Фильтр по хосту / описанию..."
            value={hostFilter}
            onChange={(e) => setHostFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        {dismissed.length > 0 && viewMode === "active" && (
          <Button size="sm" variant="ghost" onClick={() => setShowDismissed((v) => !v)}>
            <Eye className="h-4 w-4 mr-1" />
            {showDismissed ? "Скрыть удалённые" : `Показать скрытые (${dismissed.length})`}
          </Button>
        )}
        {showDismissed && dismissed.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => undismissAll.mutate()}>
            Вернуть все
          </Button>
        )}
        {viewMode === "active" && (
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={mergedActive.length === 0} title="Экспорт текущего списка">
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
        )}
      </div>

      {viewMode === "active" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={priorityFilter === "all" ? "default" : "outline"}
            className="h-7 px-2"
            onClick={() => setPriorityFilter("all")}
          >
            Все <span className="ml-1.5 opacity-80">{mergedRaw.length}</span>
          </Button>
          {SEVERITY_ORDER.map((s) => {
            const active = priorityFilter === s.value;
            const count = severityCounts[s.value] || 0;
            return (
              <Button
                key={s.value}
                size="sm"
                variant="outline"
                className={`h-7 px-2 border ${s.cls} ${active ? "ring-2 ring-offset-1 ring-current" : "opacity-90"}`}
                onClick={() => setPriorityFilter(active ? "all" : s.value)}
                title={s.label}
              >
                {s.short} <span className="ml-1.5 font-semibold">{count}</span>
              </Button>
            );
          })}
          <div className="mx-2 h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Switch id="only-unack" checked={onlyUnack} onCheckedChange={setOnlyUnack} />
            <Label htmlFor="only-unack" className="text-xs cursor-pointer">Только неподтверждённые</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="group-host" checked={groupByHost} onCheckedChange={setGroupByHost} />
            <Label htmlFor="group-host" className="text-xs cursor-pointer flex items-center gap-1">
              <Layers className="h-3 w-3" />Группировать по хосту
            </Label>
          </div>
        </div>
      )}

      {isStaff && selected.size > 0 && viewMode === "active" && (
        <div className="sticky top-2 z-10 flex items-center gap-2 rounded-md border bg-background/95 backdrop-blur p-2 shadow-sm">
          <span className="text-sm font-medium px-2">Выбрано: {selected.size}</span>
          <Button size="sm" variant="outline" onClick={() => massAck.mutate(false)} disabled={massAck.isPending}>
            <Check className="h-4 w-4 mr-1" />Подтвердить
          </Button>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => massAck.mutate(true)} disabled={massAck.isPending}>
              <X className="h-4 w-4 mr-1" />Закрыть в Zabbix
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => dismissMutation.mutate()} disabled={dismissMutation.isPending}>
            <Trash2 className="h-4 w-4 mr-1" />Убрать из списка
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSel}>Снять выделение</Button>
        </div>
      )}

      {viewMode === "active" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Активные проблемы и триггеры ({mergedActive.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {problemsLoading || alertsLoading ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : mergedActive.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
                <p className="text-muted-foreground">Активных проблем нет</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {isStaff && (
                      <TableHead className="w-8">
                        <Checkbox
                          checked={
                            mergedActive.filter((r) => r.eventid).length > 0 &&
                            mergedActive.filter((r) => r.eventid).every((r) => selected.has(r.eventid!))
                          }
                          onCheckedChange={(c) => {
                            if (c) setSelected(new Set(mergedActive.filter((r) => r.eventid).map((r) => r.eventid!)));
                            else clearSel();
                          }}
                        />
                      </TableHead>
                    )}
                    <TableHead>Категория</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("host")}>Хост<SortIcon col="host" /></TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("severity")}>Серьёзность<SortIcon col="severity" /></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("source")}>Источник<SortIcon col="source" /></TableHead>
                    <TableHead>Метка</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("time")}>Время<SortIcon col="time" /></TableHead>
                    <TableHead>Длительность</TableHead>
                    <TableHead>Подтверждено</TableHead>
                    {isStaff && <TableHead className="text-right">Действия</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const renderRow = (r: any) => {
                      const incident = priorityToIncident(r.severity);
                      const isAcknowledged = !!r.acknowledged;
                      const isDismissed = r.eventid ? dismissedSet.has(r.eventid) : false;
                      const rowKey = r.eventid || `t-${r.triggerid}`;
                      const ticketPayload = r.raw || {
                        name: r.name,
                        description: r.name,
                        severity: r.severity,
                        priority: r.severity,
                        lastchange: r.clock,
                        clock: r.clock,
                        triggerid: r.triggerid,
                        hosts: [{ name: r.host, hostid: r.hostid }],
                      };
                      return (
                        <TableRow key={rowKey} className={isDismissed ? "opacity-50" : undefined}>
                          {isStaff && (
                          <TableCell>
                            {r.eventid ? (
                              <Checkbox
                                checked={selected.has(r.eventid)}
                                onCheckedChange={() => toggleSel(r.eventid!)}
                              />
                            ) : null}
                          </TableCell>
                        )}
                        <TableCell>
                          <span className={`text-xs font-medium ${incident.color}`}>{incident.label}</span>
                        </TableCell>
                          <TableCell className="font-medium">
                            <button
                              type="button"
                              className="hover:underline text-left"
                              onClick={() => setHostFilter(r.host || "")}
                              title="Фильтровать по этому хосту"
                            >
                              {r.host}
                            </button>
                          </TableCell>
                        <TableCell className="max-w-[300px]">{r.name}</TableCell>
                        <TableCell>
                          <Badge variant={priorityColor(r.severity) as any}>{priorityLabel(r.severity)}</Badge>
                        </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${r.source === "agent" ? "border-cyan-500 text-cyan-500" : ""}`}>
                              {r.source === "agent" ? "Агент" : r.source === "problem" ? "Проблема" : "Триггер"}
                            </Badge>
                          </TableCell>
                        <TableCell>
                          <ProblemFlagBadge
                            eventid={r.eventid || undefined}
                            triggerid={r.triggerid}
                            host={r.host || null}
                            canEdit={isStaff}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.clock ? new Date(parseInt(r.clock) * 1000).toLocaleString("ru-RU") : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.clock ? duration(r.clock) : "—"}</TableCell>
                        <TableCell>
                          {isAcknowledged ? (
                            <Badge variant="outline" className="text-green-600">
                              <Check className="h-3 w-3 mr-1" />Да
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Нет</span>
                          )}
                        </TableCell>
                        {isStaff && (
                          <TableCell className="text-right space-x-1">
                            {!isAcknowledged && r.eventid && (
                              <Button size="sm" variant="ghost" title="Подтвердить" onClick={() => onAcknowledge(r.eventid!)}>
                                <Check className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" title="Создать заявку" onClick={() => onCreateTicket(ticketPayload)}>
                              <MessageSquarePlus className="h-4 w-4" />
                            </Button>
                            {isAdmin && r.eventid && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Закрыть событие (admin)"
                                onClick={() => closeMutation.mutate(r.eventid!)}
                                disabled={closeMutation.isPending}
                                className="text-destructive hover:text-destructive"
                              >
                                {closeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                              </Button>
                            )}
                            {isAdmin && r.triggerid && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Отключить триггер в Zabbix (admin)"
                                onClick={() => {
                                  if (window.confirm(`Отключить триггер «${r.name}» в Zabbix? Он перестанет генерировать события до повторного включения.`)) {
                                    disableTriggerMutation.mutate({ triggerid: r.triggerid, eventid: r.eventid });
                                  }
                                }}
                                disabled={disableTriggerMutation.isPending}
                                className="text-orange-500 hover:text-orange-500"
                              >
                                <BellOff className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                      );
                    };

                    const colspan = isStaff ? 10 : 9;
                    if (groupedActive) {
                      return groupedActive.map(([host, rows]) => (
                        <Fragment key={`g-${host}`}>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={colspan} className="py-1.5 text-xs font-semibold text-muted-foreground">
                              {host} <span className="ml-2 opacity-70">· {rows.length}</span>
                            </TableCell>
                          </TableRow>
                          {rows.map(renderRow)}
                        </Fragment>
                      ));
                    }
                    return mergedActive.map(renderRow);
                  })()}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      {viewMode === "disabled" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Отключённые триггеры ({disabledTriggers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {disabledLoading ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : disabledTriggers.length === 0 ? (
              <div className="text-center py-8">
                <BellOff className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">Отключённых триггеров нет</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Хост</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead>Приоритет</TableHead>
                    <TableHead>Метка</TableHead>
                    {isStaff && <TableHead className="text-right">Действия</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disabledTriggers.map((t: any) => (
                    <TableRow key={t.triggerid} className="opacity-80">
                      <TableCell className="font-medium">{t.hosts?.[0]?.name || "—"}</TableCell>
                      <TableCell className="max-w-[400px]">{t.description}</TableCell>
                      <TableCell>
                        <Badge variant={priorityColor(t.priority) as any}>{priorityLabel(t.priority)}</Badge>
                      </TableCell>
                      <TableCell>
                        <ProblemFlagBadge
                          triggerid={t.triggerid}
                          host={t.hosts?.[0]?.name || null}
                          canEdit={isStaff}
                        />
                      </TableCell>
                      {isStaff && (
                        <TableCell className="text-right">
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Включить триггер в Zabbix"
                              onClick={() => {
                                if (window.confirm(`Включить триггер «${t.description}» обратно?`)) {
                                  enableTriggerMutation.mutate(t.triggerid);
                                }
                              }}
                              disabled={enableTriggerMutation.isPending}
                              className="text-emerald-600 hover:text-emerald-600"
                            >
                              <Bell className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
