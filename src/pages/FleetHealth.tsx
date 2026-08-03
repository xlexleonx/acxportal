import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, RefreshCw, HardDrive, Thermometer, Activity, AlertTriangle,
  ChevronRight, Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Предиктивные виды проблем (прогноз отказа железа). offline/cpu/event сюда НЕ входят —
// это текущее состояние, а не прогноз.
const PRED_KINDS: Record<string, { label: string; icon: any }> = {
  ssd_wear: { label: "Износ SSD", icon: HardDrive },
  disk_degrading: { label: "Деградация диска", icon: HardDrive },
  smart: { label: "S.M.A.R.T.", icon: HardDrive },
  disk_fill: { label: "Заполнение диска", icon: HardDrive },
  temp_trend: { label: "Перегрев (тренд)", icon: Thermometer },
  stability: { label: "Стабильность", icon: Activity },
};
const PRED = new Set(Object.keys(PRED_KINDS));
const RANK: Record<string, number> = { high: 3, average: 2, warning: 1 };
const SEV_LABEL: Record<string, string> = { high: "критично", average: "внимание", warning: "предупреждение" };

export default function FleetHealth() {
  const [orgFilter, setOrgFilter] = useState<string>("all");

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["fleet-health-page"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("agent-problems", { body: {} });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs-min-fleet-page"],
    queryFn: async () => (await supabase.from("organizations").select("id, name").order("name")).data ?? [],
  });
  const orgName = (id: string | null) => (orgs as any[]).find((o) => o.id === id)?.name ?? "—";

  const all: any[] = data?.problems ?? [];
  const orgIds = useMemo(
    () => Array.from(new Set(all.map((p) => p.organization_id).filter(Boolean))),
    [all]
  );

  const preds = useMemo(
    () => all.filter((p) => PRED.has(p.kind) && (orgFilter === "all" || p.organization_id === orgFilter)),
    [all, orgFilter]
  );

  const byKind = useMemo(() => {
    const m: Record<string, { high: number; total: number }> = {};
    for (const p of preds) {
      (m[p.kind] ||= { high: 0, total: 0 });
      m[p.kind].total++;
      if (p.severity === "high") m[p.kind].high++;
    }
    return m;
  }, [preds]);

  const hosts = useMemo(() => {
    const byHost: Record<string, any[]> = {};
    for (const p of preds) (byHost[p.hostname] ||= []).push(p);
    return Object.entries(byHost)
      .map(([host, list]) => ({
        host,
        list: list.sort((a, b) => (RANK[b.severity] || 0) - (RANK[a.severity] || 0)),
        org: list[0].organization_id,
        agentId: list[0].agent_id,
        worst: Math.max(...list.map((x) => RANK[x.severity] || 0)),
      }))
      .sort((a, b) => b.worst - a.worst || b.list.length - a.list.length);
  }, [preds]);

  const highCount = preds.filter((p) => p.severity === "high").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="font-heading text-xl">Здоровье парка</h1>
            <p className="text-sm text-muted-foreground">Прогноз отказов оборудования по всему парку — худшие сверху</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {orgIds.length > 1 && (
            <Select value={orgFilter} onValueChange={setOrgFilter}>
              <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все организации</SelectItem>
                {orgIds.map((id: any) => <SelectItem key={id} value={id}>{orgName(id)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} /> Обновить
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Оборудование в зоне риска</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{hosts.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Критичных рисков</CardTitle></CardHeader>
          <CardContent><div className={cn("text-2xl font-semibold", highCount > 0 && "text-destructive")}>{highCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Всего прогнозов</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{preds.length}</div></CardContent>
        </Card>
      </div>

      {Object.keys(byKind).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byKind)
            .sort((a, b) => b[1].high - a[1].high || b[1].total - a[1].total)
            .map(([kind, v]) => {
              const meta = PRED_KINDS[kind];
              const Icon = meta?.icon ?? AlertTriangle;
              return (
                <div key={kind} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                  <Icon className={cn("h-4 w-4", v.high > 0 ? "text-destructive" : "text-orange-500")} />
                  <span>{meta?.label ?? kind}</span>
                  <Badge variant={v.high > 0 ? "destructive" : "secondary"}>{v.total}</Badge>
                </div>
              );
            })}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {hosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <ShieldCheck className="h-10 w-10 text-emerald-500" />
              <div className="text-sm">Рисков отказа оборудования не выявлено</div>
            </div>
          ) : (
            <div className="divide-y">
              {hosts.map((h) => (
                <Link
                  key={h.host}
                  to={h.agentId ? `/agents/${h.agentId}` : "/monitoring?tab=problems"}
                  className="flex items-start gap-3 p-3 hover:bg-muted/40 transition-colors"
                >
                  <span className={cn("mt-1 h-2.5 w-2.5 rounded-full shrink-0", h.worst >= 3 ? "bg-destructive" : "bg-orange-500")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{h.host}</span>
                      {orgFilter === "all" && orgIds.length > 1 && (
                        <span className="text-xs text-muted-foreground truncate">· {orgName(h.org)}</span>
                      )}
                      <Badge variant={h.worst >= 3 ? "destructive" : "secondary"} className="ml-auto shrink-0">
                        {h.list.length} {h.list.length === 1 ? "риск" : "рисков"}
                      </Badge>
                    </div>
                    <div className="mt-1.5 space-y-1">
                      {h.list.map((p, i) => {
                        const meta = PRED_KINDS[p.kind];
                        const Icon = meta?.icon ?? AlertTriangle;
                        return (
                          <div key={i} className="flex items-start gap-2 text-sm pl-6">
                            <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", p.severity === "high" ? "text-destructive" : "text-orange-500")} />
                            <span className="min-w-0">
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground"> — {p.detail}</span>
                              <span className={cn("ml-1.5 text-xs", p.severity === "high" ? "text-destructive" : "text-orange-500")}>
                                ({SEV_LABEL[p.severity] ?? p.severity})
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
