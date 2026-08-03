import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { invokeZabbix } from "@/lib/zabbix-invoke";
import { Plus, Pencil, Trash2, Loader2, Server, Monitor, HardDrive, Network, Shield, Zap, Router, Link2, Power, PowerOff, X, Download, MonitorCog, DatabaseBackup, PlugZap, Thermometer } from "lucide-react";
import { deviceTypeConfig, getDeviceTypeConfig } from "./deviceTypes";
import { HostFormDialog } from "./HostFormDialog";
import { HostWizardDialog } from "./HostWizardDialog";
import CMDBSyncDialog from "./CMDBSyncDialog";
import { toastWithUndo } from "@/lib/toast-undo";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type MonitoredHost = {
  id: string;
  name: string;
  ip_address: string;
  device_type: string;
  protocol: string;
  port: number | null;
  snmp_community: string | null;
  credentials_login: string | null;
  credentials_password: string | null;
  site_id: string | null;
  enabled: boolean;
  zabbix_host_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};



export default function HostManagement() {
  const { toast } = useToast();
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [cmdbSyncOpen, setCmdbSyncOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<MonitoredHost | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const { data: hosts, isLoading } = useQuery({
    queryKey: ["monitored-hosts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_hosts")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as MonitoredHost[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monitored_hosts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitored-hosts"] });
      toast({ title: "Хост удалён" });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const [importing, setImporting] = useState(false);
  const importFromZabbix = async () => {
    setImporting(true);
    try {
      const { data, error } = await invokeZabbix({ body: { action: "getHosts" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const zhosts = (data?.result ?? []) as any[];
      if (!zhosts.length) { toast({ title: "Zabbix не вернул хостов" }); return; }
      const seen = new Set<string>();
      const rows = zhosts.map((zh) => {
        const ip = (zh.interfaces ?? []).map((i: any) => i.ip).find((x: string) => x) || "0.0.0.0";
        return {
          name: zh.name || zh.host || ip,
          ip_address: ip,
          zabbix_host_id: String(zh.hostid),
          device_type: "other" as any,
          protocol: "Agent" as any,
          enabled: true,
        };
      }).filter((r) => {
        // дедуп по zabbix_host_id — ON CONFLICT падает на повторе в одной пачке
        if (seen.has(r.zabbix_host_id)) return false;
        seen.add(r.zabbix_host_id);
        return true;
      });
      // upsert по уникальному zabbix_host_id — существующие не дублируются,
      // device_type НЕ перезаписываем у уже размеченных (onConflict ignoreDuplicates)
      const { error: upErr } = await supabase
        .from("monitored_hosts")
        .upsert(rows, { onConflict: "zabbix_host_id", ignoreDuplicates: true });
      if (upErr) throw upErr;
      queryClient.invalidateQueries({ queryKey: ["monitored-hosts"] });
      toast({ title: `Импортировано из Zabbix: ${rows.length}`, description: "Новые хосты добавлены с типом «Другое» — проставьте тип" });
    } catch (e: any) {
      toast({ title: "Ошибка импорта", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const bulkSetType = async (deviceType: string) => {
    const ids = [...selected];
    if (!ids.length) return;
    const { error } = await supabase.from("monitored_hosts").update({ device_type: deviceType as any }).in("id", ids);
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["monitored-hosts"] });
    toast({ title: `Тип проставлен: ${ids.length}` });
    setSelected(new Set());
  };
  const bulkToggle = async (enabled: boolean) => {
    const ids = [...selected];
    if (!ids.length) return;
    const { error } = await supabase.from("monitored_hosts").update({ enabled }).in("id", ids);
    if (error) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["monitored-hosts"] });
    toast({ title: enabled ? `Включено: ${ids.length}` : `Отключено: ${ids.length}` });
    setSelected(new Set());
  };

  const bulkDelete = () => {
    const ids = [...selected];
    if (!ids.length) return;
    const snapshot = (hosts ?? []).filter((h) => ids.includes(h.id));
    setSelected(new Set());
    setBulkDeleteOpen(false);
    // Optimistic remove
    queryClient.setQueryData<MonitoredHost[]>(["monitored-hosts"], (old) =>
      (old ?? []).filter((h) => !ids.includes(h.id)),
    );
    toastWithUndo({
      message: `Удалено хостов: ${ids.length}`,
      onCommit: async () => {
        const { error } = await supabase.from("monitored_hosts").delete().in("id", ids);
        if (error) {
          toast({ title: "Ошибка удаления", description: error.message, variant: "destructive" });
          queryClient.setQueryData<MonitoredHost[]>(["monitored-hosts"], (old) => [...(old ?? []), ...snapshot]);
        }
        queryClient.invalidateQueries({ queryKey: ["monitored-hosts"] });
      },
      onUndo: () => {
        queryClient.setQueryData<MonitoredHost[]>(["monitored-hosts"], (old) => {
          const cur = old ?? [];
          const merged = [...cur, ...snapshot.filter((s) => !cur.some((c) => c.id === s.id))];
          return merged.sort((a, b) => a.name.localeCompare(b.name));
        });
      },
    });
  };

  const toggleAll = (checked: boolean) => {
    if (!hosts) return;
    setSelected(checked ? new Set(hosts.map((h) => h.id)) : new Set());
  };

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEdit = (host: MonitoredHost) => {
    setEditingHost(host);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingHost(null);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="h-4 w-4" />
          Настройка хостов мониторинга
        </CardTitle>
        {isStaff && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={importFromZabbix} disabled={importing}>
              <Download className="h-4 w-4 mr-1.5" />
              {importing ? "Импорт…" : "Импорт из Zabbix"}
            </Button>
            <Button size="sm" variant="default" onClick={() => setCmdbSyncOpen(true)}>
              <Link2 className="h-4 w-4 mr-1.5" />
              Синхронизировать с CMDB
            </Button>
            <Button size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Мастер добавления
            </Button>
            <Button size="sm" variant="ghost" onClick={handleAdd}>
              <Pencil className="h-4 w-4 mr-1.5" />
              Быстрое добавление
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isStaff && selected.size > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-md border bg-accent/30 px-3 py-2">
            <span className="text-sm font-medium">Выбрано: {selected.size}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <Select onValueChange={bulkSetType}>
                <SelectTrigger className="h-8 w-[170px]"><SelectValue placeholder="Проставить тип" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(deviceTypeConfig).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => bulkToggle(true)}>
                <Power className="h-3.5 w-3.5 mr-1" /> Включить
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkToggle(false)}>
                <PowerOff className="h-3.5 w-3.5 mr-1" /> Отключить
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Удалить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hosts || hosts.length === 0 ? (
          <p className="text-center py-10 text-muted-foreground">
            Нет настроенных хостов. Добавьте первый хост для мониторинга.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {isStaff && (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={hosts.length > 0 && selected.size === hosts.length}
                      onCheckedChange={(v) => toggleAll(!!v)}
                      aria-label="Выбрать все"
                    />
                  </TableHead>
                )}
                <TableHead>Имя</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Протокол</TableHead>
                <TableHead>Статус</TableHead>
                {isStaff && <TableHead className="text-right">Действия</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {hosts.map((host) => {
                const cfg = getDeviceTypeConfig(host.device_type);
                const Icon = cfg.icon;
                return (
                  <TableRow key={host.id} data-state={selected.has(host.id) ? "selected" : undefined}>
                    {isStaff && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(host.id)}
                          onCheckedChange={() => toggleOne(host.id)}
                          aria-label={`Выбрать ${host.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                      {host.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {host.ip_address}{host.port ? `:${host.port}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{cfg.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{host.protocol}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={host.enabled ? "default" : "outline"}>
                        {host.enabled ? "Активен" : "Отключён"}
                      </Badge>
                    </TableCell>
                    {isStaff && (
                      <TableCell className="text-right space-x-1">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(host)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteId(host.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <HostFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        host={editingHost}
      />

      <HostWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />

      <CMDBSyncDialog
        open={cmdbSyncOpen}
        onOpenChange={setCmdbSyncOpen}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить хост?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Хост будет удалён из системы мониторинга.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить выбранные хосты?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет удалено: {selected.size}. У вас будет 5 секунд, чтобы отменить действие.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={bulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
