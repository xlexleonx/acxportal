import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { moduleLabels } from "@/lib/license-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Cpu, HardDrive, Network, ShieldAlert, Pencil, Trash2, Save, X } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { formatDistanceToNow, format } from "date-fns";
import { ru } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { AgentProcesses } from "@/components/agent/AgentProcesses";
import { AgentInventory } from "@/components/agent/AgentInventory";
import { AgentEvents } from "@/components/agent/AgentEvents";
import { AgentVersionBadge } from "@/pages/Agents";

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [noteVal, setNoteVal] = useState("");

  const { data: agent } = useQuery({
    queryKey: ["agent", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_registrations")
        .select("*, equipment:equipment_id(id, name), organization:organization_id(id, name), site:site_id(id, name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 30000,
  });

  const { data: metrics = [] } = useQuery({
    queryKey: ["agent-metrics", agent?.agent_id],
    enabled: !!agent?.agent_id,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from("agent_metrics")
        .select("*")
        .eq("agent_id", agent.agent_id)
        .gte("collected_at", since)
        .order("collected_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: prognosis } = useQuery({
    queryKey: ["agent-prognosis", agent?.agent_id],
    enabled: !!agent?.agent_id,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("agent-problems", { body: {} });
      if (error) throw error;
      return (data?.problems ?? []).filter((p: any) => p.agent_id === agent.agent_id);
    },
  });

  // Изменения состава железа (замена/добавление/извлечение компонентов) — только неразобранные.
  const { data: hwChanges = [] } = useQuery({
    queryKey: ["agent-hw-changes", agent?.agent_id],
    enabled: !!agent?.agent_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_hw_changes")
        .select("*").eq("agent_id", agent.agent_id).eq("status", "new")
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const reviewHwMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("agent_hw_changes")
        .update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-hw-changes", agent?.agent_id] }),
  });
  const { data: orgOptions = [] } = useQuery({
    queryKey: ["orgs-min-detail"],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("id, name").order("name");
      return data ?? [];
    },
  });
  const { data: equipmentList = [] } = useQuery({
    queryKey: ["equipment-min"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("equipment").select("id, name").order("name");
      return data ?? [];
    },
  });

  const latest = metrics[metrics.length - 1] as any;

  const chartData = useMemo(() => {
    return metrics.map((m: any) => ({
      t: format(new Date(m.collected_at), "HH:mm"),
      cpu: m.cpu_usage_percent != null ? Number(m.cpu_usage_percent) : null,
      ramPct: m.ram_used_mb && m.ram_total_mb ? Math.round((Number(m.ram_used_mb) / Number(m.ram_total_mb)) * 100) : null,
    }));
  }, [metrics]);

  const orgMut = useMutation({
    mutationFn: async (organization_id: string) => {
      // ключ того же тенанта (для отображения «чей ключ/срок»), если есть
      const { data: k } = await supabase.from("agent_enrollment_keys")
        .select("id").eq("organization_id", organization_id).eq("is_active", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const { error } = await supabase.from("agent_registrations")
        .update({ organization_id, enrollment_key_id: k?.id ?? null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-detail", id] }),
  });
  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("agent_registrations")
        .update({ display_name: nameVal.trim() || null, notes: noteVal.trim() || null })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent", id] });
      setEditing(false);
      toast({ title: "Сохранено" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: async (hard: boolean) => {
      if (hard) {
        const { error } = await supabase.from("agent_registrations").delete().eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("agent_registrations")
          .update({ is_active: false }).eq("id", id!);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      toast({ title: "Агент удалён" });
      navigate("/agents");
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });
  const linkMut = useMutation({
    mutationFn: async (equipment_id: string | null) => {
      const { error } = await supabase
        .from("agent_registrations")
        .update({ equipment_id })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent", id] });
      toast({ title: "Привязка обновлена" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  if (!agent) {
    return <div className="p-8 text-muted-foreground">Загрузка...</div>;
  }

  const online = isOnline(agent.last_seen_at);
  const disks: any[] = Array.isArray(latest?.disk_metrics) ? latest.disk_metrics : [];
  const diskForecast: any[] = Array.isArray(latest?.disk_forecast) ? latest.disk_forecast : [];
  const fcByDevice = (dev: string) => diskForecast.find((f: any) => f.device === dev);
  const networksRaw: any[] = Array.isArray(latest?.network_metrics) ? latest.network_metrics : [];

  const pickIp = (n: any): string | null => {
    const ips: string[] = Array.isArray(n?.ip_addresses)
      ? n.ip_addresses
      : Array.isArray(n?.ips)
      ? n.ips
      : n?.ip
      ? [n.ip]
      : [];
    const good = ips.find(
      (ip) => ip && !ip.toLowerCase().startsWith("fe80") && !ip.startsWith("169.254"),
    );
    return good ?? null;
  };

  const fmtBytes = (v: any): string => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "0 Б";
    const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
    let i = 0;
    let val = n;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${val.toFixed(val >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const networks = networksRaw
    .map((n) => ({
      ...n,
      _ip: pickIp(n),
      _rx: Number(n?.bytes_recv ?? n?.rx_bytes ?? n?.rx ?? 0) || 0,
      _tx: Number(n?.bytes_sent ?? n?.tx_bytes ?? n?.tx ?? 0) || 0,
    }))
    .filter((n) => n._ip || n._rx > 0 || n._tx > 0)
    .sort((a, b) => b._rx + b._tx - (a._rx + a._tx));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/agents"><ArrowLeft className="h-4 w-4 mr-1" /> К списку</Link>
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {editing && isAdmin ? (
            <div className="space-y-2 max-w-md">
              <Input value={nameVal} onChange={(e) => setNameVal(e.target.value)} placeholder={agent.hostname || agent.agent_id} />
              <Textarea value={noteVal} onChange={(e) => setNoteVal(e.target.value)} placeholder="Комментарий оператора (например: серверная 2 этаж, отв. Иванов)" rows={2} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}><Save className="h-3.5 w-3.5 mr-1" />Сохранить</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5 mr-1" />Отмена</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">{agent.display_name || agent.hostname || agent.agent_id}</h1>
                <AgentVersionBadge version={agent.agent_version} />
                {isAdmin && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setNameVal(agent.display_name || ""); setNoteVal(agent.notes || ""); setEditing(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground font-mono">{agent.agent_id}</p>
              {agent.display_name && agent.hostname && <p className="text-xs text-muted-foreground">хост: {agent.hostname}</p>}
              {agent.notes && <p className="text-sm mt-1 text-muted-foreground italic">{agent.notes}</p>}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={online ? "default" : "secondary"} className={online ? "bg-green-600 hover:bg-green-600" : ""}>
            {online ? "Онлайн" : "Оффлайн"}
          </Badge>
          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1" />Удалить</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить агента?</AlertDialogTitle>
                  <AlertDialogDescription>
                    «Скрыть» — агент помечается неактивным, все данные и история сохраняются (можно восстановить). «Удалить полностью» — запись и метрики стираются безвозвратно.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMut.mutate(false)}>Скрыть (мягко)</AlertDialogAction>
                  <AlertDialogAction onClick={() => deleteMut.mutate(true)} className="bg-destructive hover:bg-destructive/90">Удалить полностью</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">OS</CardTitle></CardHeader>
          <CardContent><div className="text-sm">{agent.os_type} {agent.os_version}</div><div className="text-xs text-muted-foreground">{agent.arch}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">CPU</CardTitle></CardHeader>
          <CardContent><div className="text-sm">{agent.cpu_model || "—"}</div><div className="text-xs text-muted-foreground">{agent.cpu_cores} ядер</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">RAM</CardTitle></CardHeader>
          <CardContent><div className="text-sm">{agent.ram_total_mb ? `${Math.round(agent.ram_total_mb / 1024)} ГБ` : "—"}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Последняя активность</CardTitle></CardHeader>
          <CardContent><div className="text-sm">{agent.last_seen_at ? formatDistanceToNow(new Date(agent.last_seen_at), { addSuffix: true, locale: ru }) : "—"}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Лицензия</CardTitle></CardHeader>
          <CardContent>
            {agent.license_valid
              ? <><div className="text-sm text-green-600 font-medium">{agent.license_note || "Активна"}</div><div className="text-xs text-muted-foreground">{Array.isArray(agent.license_modules) && agent.license_modules.length > 0 ? moduleLabels(agent.license_modules) : "базовый доступ"}</div>{agent.license_expires && <div className="text-xs text-muted-foreground">до {agent.license_expires}</div>}</>
              : agent.license_expired
                ? <div className="text-sm text-amber-600 font-medium">Истекла</div>
                : <div className="text-sm text-muted-foreground">Нет лицензии</div>}
          </CardContent></Card>
      </div>

      {hwChanges.length > 0 && (
        <Card className="border-amber-500/40">
          <CardHeader><CardTitle className="text-base flex items-center gap-2">⚠️ Изменения оборудования <span className="text-xs font-normal text-muted-foreground">требуют проверки</span></CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {hwChanges.map((c: any) => (
              <div key={c.id} className="rounded-md border p-3 space-y-2">
                <div className="text-sm">{c.detail}</div>
                <div className="text-xs text-muted-foreground">Обнаружено: {new Date(c.detected_at).toLocaleString("ru-RU")}</div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="text-green-600 border-green-600/40"
                    onClick={() => reviewHwMut.mutate({ id: c.id, status: "approved" })}>Подтвердить (плановая замена)</Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-600/40"
                    onClick={() => reviewHwMut.mutate({ id: c.id, status: "flagged" })}>Тревога (без согласования)</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {agent.os_type === "bmc" && latest?.bmc_hardware && (
        <Card>
          <CardHeader><CardTitle className="text-base">Сервер (BMC)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-muted-foreground text-xs">Вендор</div><div>{latest.bmc_hardware.vendor || "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Модель</div><div>{latest.bmc_hardware.model || "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Serial</div><div className="font-mono text-xs">{latest.bmc_hardware.serial_number || "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Питание</div><div>{latest.bmc_hardware.power_state || "—"}</div></div>
            </div>
            {Array.isArray(latest.bmc_hardware.temperatures) && latest.bmc_hardware.temperatures.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Температуры</div>
                <div className="flex flex-wrap gap-2">
                  {latest.bmc_hardware.temperatures.map((s: any, i: number) => (
                    <Badge key={i} variant={s.health === "Critical" ? "destructive" : s.health === "Warning" ? "secondary" : "outline"}>{s.name}: {s.value}°C</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-4 text-sm">
              {Array.isArray(latest.bmc_hardware.fans) && <div><span className="text-muted-foreground">Вентиляторы:</span> {latest.bmc_hardware.fans.length}</div>}
              {Array.isArray(latest.bmc_hardware.psus) && <div><span className="text-muted-foreground">БП:</span> {latest.bmc_hardware.psus.filter((p: any) => p.health === "OK").length}/{latest.bmc_hardware.psus.length} исправны</div>}
              {Array.isArray(latest.bmc_hardware.drives) && <div><span className="text-muted-foreground">Диски:</span> {latest.bmc_hardware.drives.length}</div>}
            </div>
          </CardContent>
        </Card>
      )}
      {agent.os_type === "snmp" && (
        <Card>
          <CardHeader><CardTitle className="text-base">SNMP-устройство</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Имя (sysName):</span> {latest?.snmp_sys_name || "—"}</div>
            <div><span className="text-muted-foreground">Описание (sysDescr):</span> <span className="text-xs">{latest?.snmp_sys_descr || "—"}</span></div>
            <div><span className="text-muted-foreground">Интерфейсов:</span> {networksRaw.length}</div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">Привязка</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Организация</div>
              <div className="flex items-center gap-2 mt-1">
                <select
                  defaultValue={agent.organization?.id || ""}
                  onChange={(e) => e.target.value && orgMut.mutate(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">— не привязан —</option>
                  {orgOptions.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {orgMut.isPending && <span className="text-xs text-muted-foreground">сохранение…</span>}
              </div>
            </div>
            <div><div className="text-muted-foreground">ЦОД</div><div>{agent.site?.name || "—"}</div></div>
            <div>
              <div className="text-muted-foreground">Оборудование</div>
              {isAdmin ? (
                <Select
                  value={agent.equipment_id ?? "none"}
                  onValueChange={(v) => linkMut.mutate(v === "none" ? null : v)}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не привязано</SelectItem>
                    {(equipmentList as any[]).map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div>{agent.equipment?.name || "—"}</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4" /> CPU за 24 часа</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="t" />
                <YAxis domain={[0, 100]} />
                <RTooltip />
                <Line type="monotone" dataKey="cpu" stroke="hsl(var(--primary))" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">RAM за 24 часа (%)</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="t" />
                <YAxis domain={[0, 100]} />
                <RTooltip />
                <Line type="monotone" dataKey="ramPct" stroke="hsl(var(--primary))" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

<Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Прогноз состояния</CardTitle></CardHeader>
        <CardContent>
          {!prognosis || prognosis.length === 0 ? (
            <div className="text-sm text-muted-foreground">Рисков отказа не выявлено</div>
          ) : (
            <div className="space-y-2">
              {prognosis.filter((p: any) => ["ssd_wear","disk_degrading","temp_trend","smart","disk_fill","disk","offline","cpu"].includes(p.kind)).map((p: any, i: number) => (
                <div key={i} className="flex items-start gap-2 rounded-md border p-2">
                  <span className={"mt-1 h-2 w-2 rounded-full shrink-0 " + (p.severity === "high" ? "bg-destructive" : "bg-orange-500")} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><HardDrive className="h-4 w-4" /> Диски</CardTitle></CardHeader>
        <CardContent>
          {disks.length === 0 ? (
            <div className="text-sm text-muted-foreground">Нет данных</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Точка</TableHead><TableHead>Всего</TableHead>
                <TableHead>Свободно</TableHead><TableHead>Заполненность</TableHead>
              <TableHead>Прогноз</TableHead></TableRow></TableHeader>
              <TableBody>
                {disks.map((d: any, i: number) => {
                  const total = Number(d.total_gb ?? d.total ?? 0) || 0;
                  const free = Number(d.free_gb ?? d.free ?? 0) || 0;
                  const usedPct = Number.isFinite(Number(d.used_percent))
                    ? Math.round(Number(d.used_percent))
                    : total
                    ? Math.round(((total - free) / total) * 100)
                    : 0;
                  const mount = d.mount_point || d.mount || d.device || d.path || d.name || "—";
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{mount}</TableCell>
                      <TableCell>{total.toFixed(1)} ГБ</TableCell>
                      <TableCell>{free.toFixed(1)} ГБ</TableCell>
                      <TableCell>
                        <Badge
                          variant={usedPct >= 90 ? "destructive" : "default"}
                          className={usedPct >= 75 && usedPct < 90 ? "bg-orange-500 hover:bg-orange-500 text-white" : ""}
                        >
                          {usedPct}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(() => {
                          const fc = fcByDevice(mount);
                          if (!fc || Number(fc.days_left) < 0 || Number(fc.trend_gb_per_day) <= 0.001) return <span className="opacity-60">тренд не определён</span>;
                          const d = Math.round(Number(fc.days_left));
                          const crit = d <= 14;
                          return <span className={crit ? "text-destructive font-medium" : ""}>≈{d} дн. · {Number(fc.trend_gb_per_day).toFixed(1)} ГБ/сут{fc.full_date ? ` · ${fc.full_date}` : ""}</span>;
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4" /> Сетевые интерфейсы</CardTitle></CardHeader>
        <CardContent>
          {networks.length === 0 ? (
            <div className="text-sm text-muted-foreground">Нет активных интерфейсов</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Интерфейс</TableHead><TableHead>IP</TableHead>
                <TableHead>RX</TableHead><TableHead>TX</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {networks.map((n: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{n.interface || n.name || n.iface || "—"}</TableCell>
                    <TableCell className="font-mono">{n._ip || "—"}</TableCell>
                    <TableCell>{fmtBytes(n._rx)}</TableCell>
                    <TableCell>{fmtBytes(n._tx)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">История метрик ({metrics.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Время</TableHead><TableHead>CPU %</TableHead>
                <TableHead>RAM (МБ)</TableHead><TableHead>Uptime</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {[...metrics].reverse().slice(0, 100).map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{format(new Date(m.collected_at), "dd.MM HH:mm:ss")}</TableCell>
                    <TableCell>{m.cpu_usage_percent != null ? Number(m.cpu_usage_percent).toFixed(1) : "—"}</TableCell>
                    <TableCell>{m.ram_used_mb ?? "—"} / {m.ram_total_mb ?? "—"}</TableCell>
                    <TableCell>{m.uptime_seconds ? `${Math.floor(m.uptime_seconds / 3600)} ч` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {agent.agent_id && <AgentProcesses agentId={agent.agent_id} />}

      {agent.agent_id && <AgentInventory agentId={agent.agent_id} />}

      {agent.agent_id && <AgentEvents agentId={agent.agent_id} />}
    </div>
  );
}