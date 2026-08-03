import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invokeZabbix } from "@/lib/zabbix-invoke";
import { Link } from "react-router-dom";
import { format, subDays } from "date-fns";
import { ru } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell,
  LineChart, Line, Legend, AreaChart, Area, RadialBarChart, RadialBar,
} from "recharts";
import {
  Building2, Server, Ticket, ClipboardList, CheckCircle2, Clock, ExternalLink,
  Star, Activity, AlertTriangle, ShieldCheck, LineChart as LineChartIcon, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";
import FavoriteMetricsWidget from "@/components/monitoring/FavoriteMetricsWidget";
import GraphChart from "@/components/monitoring/GraphChart";
import QuickReportWidget from "@/components/dashboard/widgets/QuickReportWidget";
import { useEquipmentHealth } from "@/hooks/useEquipmentHealth";
import { HEALTH_GRADE_CONFIG } from "@/lib/health-score";
import { HealthIndicator } from "@/components/equipment/HealthIndicator";
import { Sparkline } from "@/components/ui/sparkline";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function EquipmentHealthWidget() {
  const { data: equipment = [] } = useQuery({
    queryKey: ["equipment-health-widget"],
    queryFn: async () => {
      const { data } = await supabase.from("equipment").select("id, name, status, created_at, sites(name)").limit(500);
      return data ?? [];
    },
  });
  const { data: healthMap = {} } = useEquipmentHealth(equipment as any[]);

  const sorted = (equipment as any[])
    .map((e) => ({ eq: e, h: healthMap[e.id] }))
    .filter((x) => x.h)
    .sort((a, b) => a.h!.score - b.h!.score)
    .slice(0, 5);

  if (sorted.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Нет данных</div>;
  }
  return (
    <div className="p-3 space-y-2 h-full overflow-y-auto">
      {sorted.map(({ eq, h }) => {
        const cfg = HEALTH_GRADE_CONFIG[h!.grade];
        const main = h!.factors.sort((a, b) => a.impact - b.impact)[0];
        return (
          <Link to="/equipment" key={eq.id} className="block rounded-lg border p-2.5 hover:bg-muted/40 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{eq.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{eq.sites?.name ?? "—"}</div>
              </div>
              <HealthIndicator result={h!} compact />
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${h!.score}%`, background: cfg.color }} />
            </div>
            {main && (
              <div className="text-[11px] text-muted-foreground mt-1.5 truncate">
                <span className="font-medium text-foreground">{main.name}:</span> {main.description}
              </div>
            )}
          </Link>
        );
      })}
      <Link to="/equipment" className="block text-xs text-primary hover:underline text-center py-1">Все устройства →</Link>
    </div>
  );
}


function AgentProblemsWidget({ config, onConfigChange }: any = {}) {
  const [orgFilter, setOrgFilterState] = useState<string>(config?.orgFilter ?? "all");
  const setOrgFilter = (v: string) => { setOrgFilterState(v); onConfigChange?.({ orgFilter: v }); };
  const { data } = useQuery({
    queryKey: ["agent-problems-widget"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("agent-problems", { body: {} });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs-min-widget"],
    queryFn: async () => (await supabase.from("organizations").select("id, name").order("name")).data ?? [],
  });
  const orgName = (id: string | null) => (orgs as any[]).find((o) => o.id === id)?.name ?? "—";
  const all: any[] = data?.problems ?? [];
  // организации, в которых есть проблемы (для селекта; показываем если >1)
  const orgIds = Array.from(new Set(all.map((p) => p.organization_id).filter(Boolean)));
  const problems = orgFilter === "all" ? all : all.filter((p) => p.organization_id === orgFilter);
  const high = problems.filter((p) => p.severity === "high").length;
  const avg = problems.filter((p) => p.severity === "average").length;
  return (
    <div className="h-full flex flex-col">
      <div className="dashboard-drag-handle flex items-center gap-2 px-3 py-2 border-b shrink-0 cursor-move">
        <AlertTriangle className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Проблемы агентов</span>
      </div>
      <div className="p-3 flex-1 flex flex-col min-h-0">
      {orgIds.length > 1 && (
        <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}
          className="mb-2 h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="all">Все организации ({all.length})</option>
          {orgIds.map((id: any) => (
            <option key={id} value={id}>{orgName(id)} ({all.filter((p) => p.organization_id === id).length})</option>
          ))}
        </select>
      )}
      <div className="flex gap-2 mb-2">
        <div className="flex-1 rounded-lg border p-2 text-center">
          <div className="text-2xl font-bold text-destructive">{high}</div>
          <div className="text-[11px] text-muted-foreground">критичных</div>
        </div>
        <div className="flex-1 rounded-lg border p-2 text-center">
          <div className="text-2xl font-bold text-orange-500">{avg}</div>
          <div className="text-[11px] text-muted-foreground">предупреждений</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {problems.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">Проблем нет</div>
        ) : problems.slice(0, 12).map((p, i) => (
          <Link to={`/monitoring?tab=problems`} key={i} className="block rounded-md border p-2 hover:bg-muted/40 transition-colors">
            <div className="flex items-start gap-2">
              <span className={cn("mt-1 h-2 w-2 rounded-full shrink-0", p.severity === "high" ? "bg-destructive" : "bg-orange-500")} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {p.hostname} · {p.detail}{orgFilter === "all" && orgIds.length > 1 ? ` · ${orgName(p.organization_id)}` : ""}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Link to="/monitoring?tab=problems" className="block text-xs text-primary hover:underline text-center py-1 mt-1">Все проблемы →</Link>
      </div>
    </div>
  );
}
function OrgOverviewWidget({ config, onConfigChange }: any = {}) {
  const [orgId, setOrgIdState] = useState<string>(config?.orgId ?? "");
  const setOrgId = (v: string) => { setOrgIdState(v); onConfigChange?.({ orgId: v }); };
  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs-overview"],
    queryFn: async () => (await supabase.from("organizations").select("id, name, is_demo, demo_expires_at").order("name")).data ?? [],
  });
  const org = (orgs as any[]).find((o) => o.id === orgId);
  const { data: sum } = useQuery({
    queryKey: ["org-overview-sum", orgId],
    enabled: !!orgId,
    refetchInterval: 60000,
    queryFn: async () => {
      const [agents, tickets, equip, keys, probResp] = await Promise.all([
        supabase.from("agent_registrations").select("agent_id, last_seen_at").eq("organization_id", orgId),
        supabase.from("tickets").select("status").eq("organization_id", orgId),
        supabase.from("equipment").select("id").eq("organization_id", orgId),
        supabase.from("agent_enrollment_keys").select("tariff, is_active, expires_at").eq("organization_id", orgId).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
        supabase.functions.invoke("agent-problems", { body: {} }),
      ]);
      const now = Date.now();
      const ag = agents.data ?? [];
      const online = ag.filter((a: any) => a.last_seen_at && (now - new Date(a.last_seen_at).getTime()) < 600000).length;
      const tk = tickets.data ?? [];
      const openT = tk.filter((t: any) => !["resolved", "closed", "cancelled"].includes(t.status)).length;
      const probs = (probResp.data?.problems ?? []).filter((p: any) => p.organization_id === orgId);
      return {
        agentsTotal: ag.length, agentsOnline: online,
        ticketsOpen: openT, ticketsTotal: tk.length,
        equipment: (equip.data ?? []).length,
        tariff: keys.data?.[0]?.tariff ?? null,
        high: probs.filter((p: any) => p.severity === "high").length,
        avg: probs.filter((p: any) => p.severity === "average").length,
      };
    },
  });
  const TARIFF: Record<string, string> = { demo: "Демо", basic: "Базовая", extended: "Расширенная" };
  return (
    <div className="h-full flex flex-col">
      <div className="dashboard-drag-handle flex items-center gap-2 px-3 py-2 border-b shrink-0 cursor-move">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold truncate">{org ? org.name : "Обзор организации"}</span>
      </div>
      <div className="p-3 flex-1 flex flex-col min-h-0">
      <select value={orgId} onChange={(e) => setOrgId(e.target.value)}
        className="mb-3 h-9 rounded-md border border-input bg-background px-2 text-sm font-medium">
        <option value="">Выберите организацию…</option>
        {(orgs as any[]).map((o) => <option key={o.id} value={o.id}>{o.name}{o.is_demo ? " (демо)" : ""}</option>)}
      </select>
      {!orgId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Выберите организацию для сводки</div>
      ) : !sum ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Загрузка…</div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {sum.tariff && <Badge variant="secondary">{TARIFF[sum.tariff] ?? sum.tariff}</Badge>}
            {org?.is_demo && <Badge variant="outline" className="border-cyan-500 text-cyan-500">Демо{org.demo_expires_at ? ` · до ${format(new Date(org.demo_expires_at), "dd.MM.yy")}` : ""}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-2">
              <div className="text-lg font-bold">{sum.agentsOnline}<span className="text-sm text-muted-foreground">/{sum.agentsTotal}</span></div>
              <div className="text-[11px] text-muted-foreground">агентов онлайн</div>
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-lg font-bold">{sum.equipment}</div>
              <div className="text-[11px] text-muted-foreground">оборудование</div>
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-lg font-bold">{sum.ticketsOpen}<span className="text-sm text-muted-foreground">/{sum.ticketsTotal}</span></div>
              <div className="text-[11px] text-muted-foreground">заявок открыто</div>
            </div>
            <div className="rounded-lg border p-2">
              <div className="text-lg font-bold">
                {sum.high > 0 && <span className="text-destructive">{sum.high}</span>}
                {sum.high > 0 && sum.avg > 0 && <span className="text-muted-foreground"> · </span>}
                {sum.avg > 0 && <span className="text-orange-500">{sum.avg}</span>}
                {sum.high === 0 && sum.avg === 0 && <span className="text-green-500">0</span>}
              </div>
              <div className="text-[11px] text-muted-foreground">крит · предупр</div>
            </div>
          </div>
          <Link to="/monitoring?tab=problems" className="block text-xs text-primary hover:underline text-center py-1">Проблемы организации →</Link>
        </div>
      )}
      </div>
    </div>
  );
}
function FleetHealthWidget({ config, onConfigChange }: any = {}) {
  const [orgFilter, setOrgFilterState] = useState<string>(config?.orgFilter ?? "all");
  const setOrgFilter = (v: string) => { setOrgFilterState(v); onConfigChange?.({ orgFilter: v }); };
  const { data } = useQuery({
    queryKey: ["fleet-health-widget"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("agent-problems", { body: {} });
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });
  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs-min-fleet"],
    queryFn: async () => (await supabase.from("organizations").select("id, name").order("name")).data ?? [],
  });
  const orgName = (id: string | null) => (orgs as any[]).find((o) => o.id === id)?.name ?? "—";
  const all: any[] = data?.problems ?? [];
  const orgIds = Array.from(new Set(all.map((p) => p.organization_id).filter(Boolean)));
  // только предиктивные виды (прогноз отказа железа)
  const PRED = new Set(["ssd_wear", "disk_degrading", "temp_trend", "smart", "disk_fill"]);
  const preds = all.filter((p) => PRED.has(p.kind) && (orgFilter === "all" || p.organization_id === orgFilter));
  // сгруппировать по хосту, худший severity вверх
  const byHost: Record<string, any[]> = {};
  for (const p of preds) (byHost[p.hostname] ||= []).push(p);
  const rank: Record<string, number> = { high: 3, average: 2, warning: 1 };
  const hosts = Object.entries(byHost)
    .map(([host, list]) => ({ host, list, org: list[0].organization_id, worst: Math.max(...list.map((x) => rank[x.severity] || 0)) }))
    .sort((a, b) => b.worst - a.worst);
  return (
    <div className="h-full flex flex-col">
      <div className="dashboard-drag-handle flex items-center gap-2 px-3 py-2 border-b shrink-0 cursor-move">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Здоровье парка · прогноз отказов</span>
      </div>
      <div className="p-3 flex-1 flex flex-col min-h-0">
        {orgIds.length > 1 && (
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}
            className="mb-2 h-8 rounded-md border border-input bg-background px-2 text-xs">
            <option value="all">Все организации</option>
            {orgIds.map((id: any) => <option key={id} value={id}>{orgName(id)}</option>)}
          </select>
        )}
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {hosts.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Рисков отказа не выявлено</div>
          ) : hosts.map((h) => (
            <Link to="/monitoring?tab=problems" key={h.host} className="block rounded-md border p-2 hover:bg-muted/40 transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn("h-2 w-2 rounded-full shrink-0", h.worst >= 3 ? "bg-destructive" : "bg-orange-500")} />
                <span className="text-sm font-medium truncate flex-1">{h.host}</span>
                {orgFilter === "all" && orgIds.length > 1 && <span className="text-[10px] text-muted-foreground truncate">{orgName(h.org)}</span>}
              </div>
              {h.list.slice(0, 3).map((p, i) => (
                <div key={i} className="text-[11px] text-muted-foreground truncate pl-4">• {p.name} — {p.detail}</div>
              ))}
            </Link>
          ))}
        </div>
        <Link to="/monitoring?tab=problems" className="block text-xs text-primary hover:underline text-center py-1 mt-1">Все прогнозы →</Link>
      </div>
    </div>
  );
}
/* ============ Types ============ */
export type ChartType = "bar" | "pie" | "donut" | "line" | "area" | "radial" | "list";

export interface WidgetMeta {
  type: string;
  title: string;
  description: string;
  category: "Заявки" | "Протоколы" | "Оборудование" | "Мониторинг" | "Сводка";
  icon: LucideIcon;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  supportedCharts?: ChartType[]; // если не задан — визуализация фиксирована
  defaultChart?: ChartType;
  hasConfig?: boolean; // true → виджет требует выбор сохранённого графика и т.п.
  Component: React.FC<{ chartType?: ChartType; config?: Record<string, unknown> }>;
}

/* ============ Colors / config ============ */
const STATUS_COLORS = [
  "hsl(217 91% 60%)", "hsl(38 92% 50%)", "hsl(262 83% 58%)",
  "hsl(0 72% 51%)", "hsl(142 71% 45%)", "hsl(160 84% 39%)",
];
const PRIORITY_COLORS = ["hsl(0 72% 51%)", "hsl(25 95% 53%)", "hsl(38 92% 50%)", "hsl(217 91% 60%)"];
const EQUIPMENT_STATUS_COLOR_MAP: Record<string, string> = {
  active: "hsl(152 82% 30%)", maintenance: "hsl(38 92% 50%)",
  decommissioned: "hsl(220 9% 46%)", faulty: "hsl(0 72% 51%)",
};
const EQUIPMENT_FALLBACK = "hsl(199 89% 48%)";
const PROTOCOL_COLORS = ["hsl(38 92% 50%)", "hsl(217 91% 60%)", "hsl(160 84% 39%)", "hsl(0 72% 51%)"];
const activityConfig: ChartConfig = {
  tickets: { label: "Заявки", color: "hsl(217 91% 60%)" },
  protocols: { label: "Протоколы", color: "hsl(160 84% 39%)" },
};
const baseConfig: ChartConfig = { count: { label: "Кол-во" } };

/* ============ Wrapper ============ */
function WidgetShell({ title, action, children, icon: Icon }: {
  title: string; action?: React.ReactNode; children: React.ReactNode; icon?: LucideIcon;
}) {
  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="dashboard-drag-handle flex flex-row items-center justify-between pb-2 shrink-0 cursor-move">
        <CardTitle className="text-base flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex-1 overflow-auto" onMouseDown={(e) => e.stopPropagation()}>{children}</CardContent>
    </Card>
  );
}

/* ============ Generic categorical renderer ============ */
function CategoricalChart({ data, colors, chartType = "bar" }: {
  data: Array<{ label: string; count: number }>;
  colors: string[];
  chartType?: ChartType;
}) {
  if (!data?.some((d) => d.count > 0)) {
    return <p className="text-sm text-muted-foreground text-center py-10">Нет данных</p>;
  }
  if (chartType === "list") {
    const total = data.reduce((s, d) => s + d.count, 0);
    return (
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={d.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                {d.label}
              </span>
              <span className="font-medium tabular-nums">{d.count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${total ? (d.count / total) * 100 : 0}%`, background: colors[i % colors.length] }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ChartContainer config={baseConfig} className="h-full w-full">
      {chartType === "pie" || chartType === "donut" ? (
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
          <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="45%"
               outerRadius={75} innerRadius={chartType === "donut" ? 40 : 0}
               label={({ count }) => (count > 0 ? count : "")}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Pie>
          <Legend payload={data.map((d, i) => ({ value: d.label, type: "circle" as const, color: colors[i % colors.length] }))}
                  wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      ) : chartType === "radial" ? (
        <RadialBarChart innerRadius="20%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <RadialBar dataKey="count" background>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </RadialBar>
          <Legend iconSize={8} payload={data.map((d, i) => ({ value: `${d.label} (${d.count})`, type: "circle" as const, color: colors[i % colors.length] }))}
                  wrapperStyle={{ fontSize: 11 }} />
        </RadialBarChart>
      ) : chartType === "area" ? (
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area type="monotone" dataKey="count" stroke={colors[0]} fill={colors[0]} fillOpacity={0.3} />
        </AreaChart>
      ) : chartType === "line" ? (
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey="count" stroke={colors[0]} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      ) : (
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Bar>
        </BarChart>
      )}
    </ChartContainer>
  );
}

/* ============ Summary tiles ============ */
const SummaryWidget: WidgetMeta["Component"] = () => {
  const { data: summary } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const [sites, equipment, openTickets, activeProtocols] = await Promise.all([
        supabase.from("sites").select("*", { count: "exact", head: true }),
        supabase.from("equipment").select("*", { count: "exact", head: true }),
        supabase.from("tickets").select("*", { count: "exact", head: true })
          .in("status", ["open", "in_progress", "waiting", "overdue"]),
        supabase.from("maintenance_protocols").select("*", { count: "exact", head: true })
          .in("status", ["pending", "in_progress"]),
      ]);
      return {
        sites: sites.count ?? 0,
        equipment: equipment.count ?? 0,
        openTickets: openTickets.count ?? 0,
        activeProtocols: activeProtocols.count ?? 0,
      };
    },
  });
  const stats = [
    { label: "ЦОД", value: summary?.sites ?? 0, icon: Building2, color: "text-primary", to: "/sites" },
    { label: "Оборудование", value: summary?.equipment ?? 0, icon: Server, color: "text-accent", to: "/equipment" },
    { label: "Открытые заявки", value: summary?.openTickets ?? 0, icon: Ticket, color: "text-destructive", to: "/tickets" },
    { label: "Активные протоколы", value: summary?.activeProtocols ?? 0, icon: ClipboardList, color: "text-primary", to: "/protocols" },
  ];
  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="dashboard-drag-handle pb-2 shrink-0 cursor-move">
        <CardTitle className="text-base">Сводка</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3" onMouseDown={(e) => e.stopPropagation()}>
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="block">
            <div className="rounded-lg border p-3 hover:border-primary/40 hover:shadow-md transition-all h-full">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className={cn("h-4 w-4", s.color)} />
              </div>
              <div className="text-2xl font-heading font-bold mt-1">{s.value}</div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
};

/* ============ KPI trends with sparklines ============ */
function buildDayBuckets(days: number) {
  const arr: { date: Date; key: string }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(new Date(), i);
    arr.push({ date: d, key: format(d, "yyyy-MM-dd") });
  }
  return arr;
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function KpiCard({
  label, value, series, delta, lowerIsBetter, accent,
}: {
  label: string; value: number; series: number[]; delta: number | null;
  lowerIsBetter?: boolean; accent: string;
}) {
  const trendDir: "up" | "down" | "neutral" =
    delta == null || delta === 0 ? "neutral" : delta > 0 ? "up" : "down";
  const isGood =
    delta == null
      ? null
      : lowerIsBetter
        ? delta < 0
        : delta > 0;
  const TrendIcon = trendDir === "up" ? TrendingUp : trendDir === "down" ? TrendingDown : Minus;
  return (
    <div className="rounded-xl border bg-card p-4 flex flex-col gap-2 hover:border-primary/40 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-full",
            isGood == null && "bg-muted text-muted-foreground",
            isGood === true && "bg-emerald-500/15 text-emerald-500",
            isGood === false && "bg-red-500/15 text-red-500",
          )}
          title="Изменение к прошлой неделе"
        >
          <TrendIcon className="h-3 w-3" />
          {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div
          className="text-3xl font-heading font-bold leading-none"
          style={{ color: accent }}
        >
          {value}
        </div>
        <Sparkline data={series} trend={trendDir} width={88} height={28} />
      </div>
    </div>
  );
}

const KpiTrendsWidget: WidgetMeta["Component"] = () => {
  const { data } = useQuery({
    queryKey: ["dashboard-kpi-trends"],
    queryFn: async () => {
      const since = subDays(new Date(), 13).toISOString();
      const sinceDate = subDays(new Date(), 13);
      const [ticketsCreated, ticketsClosed, openTicketsRes, protocolsCompleted, protocolsActive] =
        await Promise.all([
          supabase.from("tickets").select("created_at").gte("created_at", since),
          supabase
            .from("tickets")
            .select("updated_at,status")
            .gte("updated_at", since)
            .in("status", ["resolved", "closed"]),
          supabase
            .from("tickets")
            .select("*", { count: "exact", head: true })
            .in("status", ["open", "in_progress", "waiting", "overdue"]),
          supabase
            .from("maintenance_protocols")
            .select("completed_at")
            .gte("completed_at", since)
            .not("completed_at", "is", null),
          supabase
            .from("maintenance_protocols")
            .select("*", { count: "exact", head: true })
            .in("status", ["pending", "in_progress"]),
        ]);

      const buckets = buildDayBuckets(14);
      const bucketIndex = new Map(buckets.map((b, i) => [b.key, i]));

      const seriesCreated = new Array(14).fill(0);
      (ticketsCreated.data ?? []).forEach((t) => {
        const k = format(new Date(t.created_at as string), "yyyy-MM-dd");
        const i = bucketIndex.get(k);
        if (i != null) seriesCreated[i] += 1;
      });
      const seriesClosed = new Array(14).fill(0);
      (ticketsClosed.data ?? []).forEach((t) => {
        const k = format(new Date(t.updated_at as string), "yyyy-MM-dd");
        const i = bucketIndex.get(k);
        if (i != null) seriesClosed[i] += 1;
      });
      const seriesProtocols = new Array(14).fill(0);
      (protocolsCompleted.data ?? []).forEach((p) => {
        if (!p.completed_at) return;
        const k = format(new Date(p.completed_at as string), "yyyy-MM-dd");
        const i = bucketIndex.get(k);
        if (i != null) seriesProtocols[i] += 1;
      });

      const sumLast = (a: number[]) => a.slice(7).reduce((s, n) => s + n, 0);
      const sumPrev = (a: number[]) => a.slice(0, 7).reduce((s, n) => s + n, 0);

      const createdLast = sumLast(seriesCreated);
      const createdPrev = sumPrev(seriesCreated);
      const closedLast = sumLast(seriesClosed);
      const closedPrev = sumPrev(seriesClosed);
      const protocolsLast = sumLast(seriesProtocols);
      const protocolsPrev = sumPrev(seriesProtocols);

      // Open tickets sparkline = cumulative net change derived from created/closed
      const currentOpen = openTicketsRes.count ?? 0;
      let running = currentOpen;
      const seriesOpen: number[] = new Array(14).fill(0);
      for (let i = 13; i >= 0; i--) {
        seriesOpen[i] = running;
        running = running - seriesCreated[i] + seriesClosed[i];
      }
      const openLast = currentOpen;
      const openPrev = seriesOpen[6] ?? currentOpen;

      void sinceDate; // referenced for clarity

      return {
        cards: [
          {
            label: "Открытые заявки",
            value: openLast,
            series: seriesOpen,
            delta: deltaPercent(openLast, openPrev),
            lowerIsBetter: true,
            accent: "hsl(0 72% 55%)",
          },
          {
            label: "Новые за 7 дней",
            value: createdLast,
            series: seriesCreated,
            delta: deltaPercent(createdLast, createdPrev),
            lowerIsBetter: true,
            accent: "hsl(217 91% 60%)",
          },
          {
            label: "Закрыто за 7 дней",
            value: closedLast,
            series: seriesClosed,
            delta: deltaPercent(closedLast, closedPrev),
            lowerIsBetter: false,
            accent: "hsl(142 71% 45%)",
          },
          {
            label: "Протоколов завершено",
            value: protocolsLast,
            series: seriesProtocols,
            delta: deltaPercent(protocolsLast, protocolsPrev),
            lowerIsBetter: false,
            accent: "hsl(160 84% 39%)",
          },
        ],
        activeProtocols: protocolsActive.count ?? 0,
      };
    },
  });

  return (
    <WidgetShell title="KPI · тренды недели" icon={Activity}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 h-full content-start">
        {(data?.cards ?? new Array(4).fill(null)).map((c, i) =>
          c ? (
            <KpiCard key={c.label} {...c} />
          ) : (
            <div key={i} className="rounded-xl border bg-card/40 h-[110px] animate-pulse" />
          ),
        )}
      </div>
    </WidgetShell>
  );
};

/* ============ Tickets by status ============ */
const TicketsByStatusWidget: WidgetMeta["Component"] = ({ chartType }) => {
  const { data } = useQuery({
    queryKey: ["dashboard-tickets-status"],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("status");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
      const labels: Record<string, string> = {
        open: "Открыта", in_progress: "В работе", waiting: "Ожидание",
        overdue: "Просрочена", resolved: "Решена", closed: "Закрыта",
      };
      return Object.entries(labels).map(([key, label]) => ({ status: key, label, count: counts[key] || 0 }));
    },
  });
  return (
    <WidgetShell title="Заявки по статусам" icon={Ticket}>
      <CategoricalChart data={data ?? []} colors={STATUS_COLORS} chartType={chartType ?? "bar"} />
    </WidgetShell>
  );
};

/* ============ Tickets by priority ============ */
const TicketsByPriorityWidget: WidgetMeta["Component"] = ({ chartType }) => {
  const { data } = useQuery({
    queryKey: ["dashboard-tickets-priority"],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("priority")
        .in("status", ["open", "in_progress", "waiting", "overdue"]);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((t) => { counts[t.priority] = (counts[t.priority] || 0) + 1; });
      const labelMap: Record<string, string> = { P1: "P1 — Критический", P2: "P2 — Высокий", P3: "P3 — Средний", P4: "P4 — Низкий" };
      return ["P1", "P2", "P3", "P4"].map((p) => ({ status: p, label: labelMap[p], count: counts[p] || 0 }));
    },
  });
  return (
    <WidgetShell title="Открытые заявки по приоритету" icon={AlertTriangle}>
      <CategoricalChart data={data ?? []} colors={PRIORITY_COLORS} chartType={chartType ?? "donut"} />
    </WidgetShell>
  );
};

/* ============ Closed tickets stats ============ */
const ClosedStatsWidget: WidgetMeta["Component"] = () => {
  const { data } = useQuery({
    queryKey: ["dashboard-closed-tickets-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("tickets")
        .select("id, priority, created_at, first_response_at, resolved_at")
        .in("status", ["resolved", "closed"]);
      const rows = data ?? [];
      const byPriority: Record<string, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
      let sum = 0, cnt = 0;
      rows.forEach((t) => {
        byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
        if (t.first_response_at) {
          const diff = new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime();
          if (diff > 0) { sum += diff; cnt++; }
        }
      });
      return { total: rows.length, byPriority, avgResponseMs: cnt ? sum / cnt : null };
    },
  });
  function formatDuration(ms: number) {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} мин`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} ч ${min % 60 ? `${min % 60} мин` : ""}`.trim();
    const d = Math.floor(h / 24);
    return `${d} д ${h % 24 ? `${h % 24} ч` : ""}`.trim();
  }
  return (
    <WidgetShell title="Закрытые заявки" icon={CheckCircle2}>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground">Всего закрыто</p>
          <p className="text-3xl font-heading font-bold flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            {data?.total ?? 0}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Среднее время первого реагирования</p>
          <p className="text-base font-heading font-semibold">
            {data?.avgResponseMs ? (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {formatDuration(data.avgResponseMs)}
              </span>
            ) : <span className="text-muted-foreground text-sm">Нет данных</span>}
          </p>
        </div>
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-2">По приоритетам</p>
          <div className="space-y-1">
            {["P1", "P2", "P3", "P4"].map((p, i) => (
              <div key={p} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[i] }} />
                  <span className="text-muted-foreground">
                    {p === "P1" ? "Критический" : p === "P2" ? "Высокий" : p === "P3" ? "Средний" : "Низкий"}
                  </span>
                </div>
                <span className="font-medium">{data?.byPriority[p] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WidgetShell>
  );
};

/* ============ Protocols by status ============ */
const ProtocolsByStatusWidget: WidgetMeta["Component"] = ({ chartType }) => {
  const { data } = useQuery({
    queryKey: ["dashboard-protocols-status"],
    queryFn: async () => {
      const { data } = await supabase.from("maintenance_protocols").select("status");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
      const labels: Record<string, string> = {
        pending: "Ожидает", in_progress: "В работе", completed: "Завершён", overdue: "Просрочен",
      };
      return Object.entries(labels).map(([key, label]) => ({ status: key, label, count: counts[key] || 0 }));
    },
  });
  return (
    <WidgetShell title="Протоколы по статусам" icon={ClipboardList}>
      <CategoricalChart data={data ?? []} colors={PROTOCOL_COLORS} chartType={chartType ?? "bar"} />
    </WidgetShell>
  );
};

/* ============ Equipment by status ============ */
const EquipmentByStatusWidget: WidgetMeta["Component"] = ({ chartType }) => {
  const { data } = useQuery({
    queryKey: ["dashboard-equipment-status"],
    queryFn: async () => {
      const { data } = await supabase.from("equipment").select("status");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((e) => { const s = e.status || "active"; counts[s] = (counts[s] || 0) + 1; });
      const labels: Record<string, string> = {
        active: "Активно", maintenance: "На обслуживании",
        decommissioned: "Выведено", faulty: "Неисправно",
      };
      const all = [...new Set([...Object.keys(labels), ...Object.keys(counts)])];
      return all.map((status) => ({ status, label: labels[status] || status, count: counts[status] || 0 }));
    },
  });
  const colors = (data ?? []).map((d) => EQUIPMENT_STATUS_COLOR_MAP[d.status] ?? EQUIPMENT_FALLBACK);
  return (
    <WidgetShell title="Оборудование по статусу" icon={Server}>
      <CategoricalChart data={data ?? []} colors={colors.length ? colors : STATUS_COLORS} chartType={chartType ?? "donut"} />
    </WidgetShell>
  );
};

/* ============ Activity ============ */
const ActivityWidget: WidgetMeta["Component"] = ({ chartType }) => {
  const { data } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => {
      const since = subDays(new Date(), 13);
      const [t, p] = await Promise.all([
        supabase.from("tickets").select("created_at").gte("created_at", since.toISOString()),
        supabase.from("maintenance_protocols").select("created_at").gte("created_at", since.toISOString()),
      ]);
      const days: Record<string, { tickets: number; protocols: number }> = {};
      for (let i = 0; i < 14; i++) {
        const d = format(subDays(new Date(), 13 - i), "yyyy-MM-dd");
        days[d] = { tickets: 0, protocols: 0 };
      }
      (t.data ?? []).forEach((x) => { const d = format(new Date(x.created_at), "yyyy-MM-dd"); if (days[d]) days[d].tickets++; });
      (p.data ?? []).forEach((x) => { const d = format(new Date(x.created_at), "yyyy-MM-dd"); if (days[d]) days[d].protocols++; });
      return Object.entries(days).map(([date, v]) => ({
        date, label: format(new Date(date), "dd MMM", { locale: ru }),
        tickets: v.tickets, protocols: v.protocols,
      }));
    },
  });
  const empty = !data || !data.some((d) => d.tickets > 0 || d.protocols > 0);
  return (
    <WidgetShell title="Активность за 14 дней" icon={Activity}>
      {empty ? (
        <p className="text-sm text-muted-foreground text-center py-10">Нет активности</p>
      ) : (
        <ChartContainer config={activityConfig} className="h-full w-full">
          {chartType === "bar" ? (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="tickets" fill="hsl(217 91% 60%)" name="Заявки" radius={[3, 3, 0, 0]} />
              <Bar dataKey="protocols" fill="hsl(160 84% 39%)" name="Протоколы" radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : chartType === "area" ? (
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="tickets" stroke="hsl(217 91% 60%)" fill="hsl(217 91% 60%)" fillOpacity={0.25} name="Заявки" />
              <Area type="monotone" dataKey="protocols" stroke="hsl(160 84% 39%)" fill="hsl(160 84% 39%)" fillOpacity={0.25} name="Протоколы" />
            </AreaChart>
          ) : (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="tickets" stroke="hsl(217 91% 60%)" strokeWidth={2} dot={{ r: 3 }} name="Заявки" />
              <Line type="monotone" dataKey="protocols" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={{ r: 3 }} name="Протоколы" />
            </LineChart>
          )}
        </ChartContainer>
      )}
    </WidgetShell>
  );
};

/* ============ Recent tickets ============ */
const RecentTicketsWidget: WidgetMeta["Component"] = () => {
  const { data } = useQuery({
    queryKey: ["dashboard-recent-tickets"],
    queryFn: async () => {
      const { data } = await supabase.from("tickets")
        .select("id, title, status, priority, created_at, site_id, sites(name)")
        .order("created_at", { ascending: false }).limit(8);
      return data ?? [];
    },
  });
  const priorityVariant: Record<string, "destructive" | "default" | "secondary" | "outline"> = {
    P1: "destructive", P2: "default", P3: "secondary", P4: "outline",
  };
  const statusLabels: Record<string, string> = {
    open: "Открыта", in_progress: "В работе", waiting: "Ожидание",
    overdue: "Просрочена", resolved: "Решена", closed: "Закрыта",
  };
  return (
    <WidgetShell
      title="Последние заявки"
      icon={Ticket}
      action={
        <Link to="/tickets" className="text-sm text-primary hover:underline flex items-center gap-1">
          Все <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      }
    >
      {data && data.length > 0 ? (
        <div className="space-y-2">
          {data.map((t) => (
            <Link key={t.id} to={`/tickets?id=${t.id}`}
              className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(t as { sites?: { name?: string } }).sites?.name ?? "—"} · {format(new Date(t.created_at), "dd MMM", { locale: ru })}
                </p>
              </div>
              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                <Badge variant={priorityVariant[t.priority] ?? "outline"} className="text-xs">{t.priority}</Badge>
                <Badge variant="outline" className="text-xs">{statusLabels[t.status] ?? t.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      ) : (<p className="text-sm text-muted-foreground text-center py-10">Нет заявок</p>)}
    </WidgetShell>
  );
};

/* ============ Monitoring: Hosts by device type ============ */
const MonitoringHostsWidget: WidgetMeta["Component"] = ({ chartType }) => {
  const { data } = useQuery({
    queryKey: ["dashboard-monitored-hosts"],
    queryFn: async () => {
      const { data } = await supabase.from("monitored_hosts").select("device_type, enabled");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((h: any) => {
        const s = h.enabled ? (h.device_type || "other") : "disabled";
        counts[s] = (counts[s] || 0) + 1;
      });
      const labels: Record<string, string> = {
        server: "Серверы", bmc: "BMC", switch: "Коммутаторы", router: "Маршрутизаторы",
        storage: "СХД", firewall: "Файрволы", ups: "ИБП", other: "Прочее", disabled: "Отключены",
      };
      const keys = [...new Set([...Object.keys(labels), ...Object.keys(counts)])];
      return keys
        .map((s) => ({ status: s, label: labels[s] || s, count: counts[s] || 0 }))
        .filter((d) => d.count > 0 || ["server", "switch", "router"].includes(d.status));
    },
  });
  return (
    <WidgetShell title="Хосты мониторинга по типу" icon={Server}>
      <CategoricalChart data={data ?? []} colors={STATUS_COLORS} chartType={chartType ?? "donut"} />
    </WidgetShell>
  );
};

/* ============ Monitoring: TZ coverage ============ */
const TZCoverageWidget: WidgetMeta["Component"] = ({ chartType }) => {
  const { data } = useQuery({
    queryKey: ["dashboard-tz-coverage"],
    queryFn: async () => {
      const [reqs, cov] = await Promise.all([
        supabase.from("tz_requirements").select("id"),
        supabase.from("tz_coverage").select("requirement_id,status"),
      ]);
      const total = (reqs.data ?? []).length;
      const map = new Map<string, string>();
      (cov.data ?? []).forEach((c: any) => map.set(c.requirement_id, c.status));
      let covered = 0, partial = 0;
      map.forEach((s) => { if (s === "covered") covered++; else if (s === "partial") partial++; });
      const none = total - covered - partial;
      return [
        { status: "covered", label: "Покрыто", count: covered },
        { status: "partial", label: "Частично", count: partial },
        { status: "none", label: "Не покрыто", count: Math.max(0, none) },
      ];
    },
  });
  return (
    <WidgetShell title="Покрытие регламента мониторингом" icon={ShieldCheck}>
      <CategoricalChart data={data ?? []}
        colors={["hsl(152 82% 30%)", "hsl(38 92% 50%)", "hsl(220 9% 46%)"]}
        chartType={chartType ?? "donut"} />
    </WidgetShell>
  );
};

/* ============ Monitoring: Active problems (Zabbix) ============ */
const RecentEventsWidget: WidgetMeta["Component"] = () => {
  const { data, isError } = useQuery({
    queryKey: ["dashboard-zbx-problems"],
    queryFn: async () => {
      const { data, error } = await invokeZabbix( {
        body: { action: "getProblems" },
      });
      if (error) throw error;
      return ((data?.result as any[]) || []).slice(0, 10);
    },
    refetchInterval: 60000,
    retry: 0,
  });
  const sevMap: Record<string, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
    "5": { label: "Disaster", variant: "destructive" },
    "4": { label: "High", variant: "destructive" },
    "3": { label: "Average", variant: "default" },
    "2": { label: "Warning", variant: "default" },
    "1": { label: "Info", variant: "secondary" },
    "0": { label: "Not class", variant: "outline" },
  };
  return (
    <WidgetShell title="Активные проблемы Zabbix" icon={AlertTriangle}
      action={<Link to="/monitoring" className="text-sm text-primary hover:underline flex items-center gap-1">Все <ExternalLink className="h-3.5 w-3.5" /></Link>}>
      {isError ? (
        <p className="text-sm text-muted-foreground text-center py-10">Мониторинг не настроен</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Активных проблем нет</p>
      ) : (
        <div className="space-y-1.5">
          {data.map((p: any) => {
            const sev = sevMap[p.severity] ?? sevMap["0"];
            const host = p.hosts?.[0]?.name ?? "—";
            return (
              <div key={p.eventid} className="flex items-start gap-2 p-2 rounded border text-xs">
                <Badge variant={sev.variant} className="text-[10px] shrink-0">{sev.label}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-muted-foreground">
                    {host} · {format(new Date(Number(p.clock) * 1000), "dd MMM HH:mm", { locale: ru })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
};

/* ============ Favorite metrics (re-uses existing) ============ */
const FavoriteMetricsWrap: WidgetMeta["Component"] = () => <FavoriteMetricsWidget />;

/* ============ Saved graphs (library shortcuts) ============ */
const SavedGraphsWidget: WidgetMeta["Component"] = () => {
  const { data } = useQuery({
    queryKey: ["dashboard-saved-graphs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("saved_graphs")
        .select("id,name,description,chart_type,is_template,is_shared,updated_at")
        .order("updated_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });
  return (
    <WidgetShell
      title="Сохранённые графики"
      icon={LineChartIcon}
      action={
        <Link to="/monitoring" className="text-sm text-primary hover:underline flex items-center gap-1">
          В раздел <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      }
    >
      {!data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          Графики не сохранены. Откройте раздел «Мониторинг → Графики», чтобы создать.
        </p>
      ) : (
        <div className="space-y-1.5">
          {data.map((g) => (
            <Link
              key={g.id}
              to={`/monitoring?graph=${g.id}`}
              className="flex items-center justify-between gap-2 p-2 rounded-md border hover:bg-muted/50 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{g.name}</p>
                {g.description && (
                  <p className="text-xs text-muted-foreground truncate">{g.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline" className="text-[10px]">{g.chart_type}</Badge>
                {g.is_template && <Badge variant="secondary" className="text-[10px]">шаблон</Badge>}
                {g.is_shared && <Badge variant="secondary" className="text-[10px]">общий</Badge>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </WidgetShell>
  );
};

/* ============ Registry ============ */
export const WIDGET_REGISTRY: Record<string, WidgetMeta> = {
  "fleet-health": {
    type: "fleet-health", title: "Здоровье парка (прогноз)",
    description: "Железо по близости к отказу: износ SSD, деградация дисков, перегрев, заполнение — худшие сверху.",
    category: "Мониторинг", icon: ShieldCheck, defaultW: 4, defaultH: 6, minW: 3, minH: 5,
    Component: FleetHealthWidget,
  },

  "org-overview": {
    type: "org-overview", title: "Обзор организации",
    description: "Сводка по одной организации: тариф, демо-статус, агенты, оборудование, заявки, проблемы.",
    category: "Мониторинг", icon: Building2, defaultW: 4, defaultH: 6, minW: 3, minH: 5,
    Component: OrgOverviewWidget,
  },

  "agent-problems": {
    type: "agent-problems", title: "Проблемы агентов",
    description: "Сводка проблем от агентов: критичные и предупреждения, топ-список.",
    category: "Мониторинг", icon: AlertTriangle, defaultW: 4, defaultH: 6, minW: 3, minH: 4,
    Component: AgentProblemsWidget,
  },
  "summary": {
    type: "summary", title: "Сводка", description: "Ключевые показатели: ЦОД, оборудование, заявки, протоколы.",
    category: "Сводка", icon: Building2, defaultW: 12, defaultH: 3, minW: 4, minH: 3,
    Component: SummaryWidget,
  },
  "kpi-trends": {
    type: "kpi-trends",
    title: "KPI · тренды недели",
    description: "Открытые заявки, новые за неделю, закрытые, протоколы — со спарклайнами и сравнением к прошлой неделе.",
    category: "Сводка", icon: Activity, defaultW: 12, defaultH: 4, minW: 4, minH: 4,
    Component: KpiTrendsWidget,
  },
  "tickets-by-status": {
    type: "tickets-by-status", title: "Заявки по статусам", description: "Распределение всех заявок по статусам.",
    category: "Заявки", icon: Ticket, defaultW: 4, defaultH: 7, minW: 3, minH: 4,
    supportedCharts: ["bar", "pie", "donut", "radial", "list"], defaultChart: "bar",
    Component: TicketsByStatusWidget,
  },
  "tickets-by-priority": {
    type: "tickets-by-priority", title: "Открытые заявки по приоритету", description: "Активные заявки в разрезе P1–P4.",
    category: "Заявки", icon: AlertTriangle, defaultW: 4, defaultH: 7, minW: 3, minH: 4,
    supportedCharts: ["donut", "pie", "bar", "radial", "list"], defaultChart: "donut",
    Component: TicketsByPriorityWidget,
  },
  "closed-stats": {
    type: "closed-stats", title: "Закрытые заявки", description: "Сводка закрытых заявок и среднее время реагирования.",
    category: "Заявки", icon: CheckCircle2, defaultW: 4, defaultH: 7, minW: 3, minH: 5,
    Component: ClosedStatsWidget,
  },
  "recent-tickets": {
    type: "recent-tickets", title: "Последние заявки", description: "Список 8 самых свежих заявок.",
    category: "Заявки", icon: Ticket, defaultW: 12, defaultH: 7, minW: 4, minH: 5,
    Component: RecentTicketsWidget,
  },
  "protocols-by-status": {
    type: "protocols-by-status", title: "Протоколы по статусам", description: "Распределение протоколов ТО.",
    category: "Протоколы", icon: ClipboardList, defaultW: 6, defaultH: 7, minW: 3, minH: 4,
    supportedCharts: ["bar", "pie", "donut", "radial", "list"], defaultChart: "bar",
    Component: ProtocolsByStatusWidget,
  },
  "equipment-by-status": {
    type: "equipment-by-status", title: "Оборудование по статусу", description: "Состояние парка оборудования.",
    category: "Оборудование", icon: Server, defaultW: 6, defaultH: 7, minW: 3, minH: 4,
    supportedCharts: ["donut", "pie", "bar", "radial", "list"], defaultChart: "donut",
    Component: EquipmentByStatusWidget,
  },
  "activity": {
    type: "activity", title: "Активность за 14 дней", description: "Динамика заявок и протоколов.",
    category: "Сводка", icon: Activity, defaultW: 12, defaultH: 7, minW: 4, minH: 5,
    supportedCharts: ["line", "area", "bar"], defaultChart: "line",
    Component: ActivityWidget,
  },
  "monitoring-hosts": {
    type: "monitoring-hosts", title: "Хосты мониторинга", description: "Состояние всех хостов под мониторингом.",
    category: "Мониторинг", icon: Server, defaultW: 6, defaultH: 7, minW: 3, minH: 4,
    supportedCharts: ["donut", "pie", "bar", "radial", "list"], defaultChart: "donut",
    Component: MonitoringHostsWidget,
  },
  "monitoring-events": {
    type: "monitoring-events", title: "События мониторинга", description: "Свежие события и проблемы.",
    category: "Мониторинг", icon: AlertTriangle, defaultW: 6, defaultH: 7, minW: 3, minH: 5,
    Component: RecentEventsWidget,
  },
  "tz-coverage": {
    type: "tz-coverage", title: "Покрытие регламента", description: "Сколько требований ТЗ покрыто мониторингом.",
    category: "Мониторинг", icon: ShieldCheck, defaultW: 4, defaultH: 7, minW: 3, minH: 4,
    supportedCharts: ["donut", "pie", "bar", "radial", "list"], defaultChart: "donut",
    Component: TZCoverageWidget,
  },
  "favorite-metrics": {
    type: "favorite-metrics", title: "Избранные метрики", description: "Последние значения избранных метрик Zabbix.",
    category: "Мониторинг", icon: Star, defaultW: 6, defaultH: 8, minW: 3, minH: 5,
    Component: FavoriteMetricsWrap,
  },
  "saved-graphs": {
    type: "saved-graphs", title: "Сохранённые графики",
    description: "Быстрый доступ к графикам из библиотеки. Клик — переход к разделу Графики.",
    category: "Мониторинг", icon: LineChartIcon, defaultW: 6, defaultH: 7, minW: 3, minH: 4,
    Component: SavedGraphsWidget,
  },
  "equipment-health": {
    type: "equipment-health", title: "Здоровье инфраструктуры",
    description: "Топ-5 устройств с наихудшим Health Score и главные риски.",
    category: "Оборудование", icon: Activity, defaultW: 4, defaultH: 5, minW: 3, minH: 4,
    Component: EquipmentHealthWidget,
  },
  "quick-report": {
    type: "quick-report",
    title: "Быстрый отчёт",
    description: "Одним кликом создать все регламентные протоколы за сегодня со статусом «всё OK».",
    category: "Протоколы",
    icon: Zap,
    defaultW: 3, defaultH: 4, minW: 3, minH: 3,
    Component: QuickReportWidget,
  },
};

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: "Столбцы",
  pie: "Круговая",
  donut: "Кольцевая",
  line: "Линейная",
  area: "Областная",
  radial: "Радиальная",
  list: "Список",
};

/* ============ Live Graph widget (renders saved graph live with refresh) ============ */
const LiveGraphWidget: WidgetMeta["Component"] = ({ config }) => {
  const savedGraphId = config?.savedGraphId as string | undefined;
  const refreshSec = (config?.refreshInterval as number) ?? 60;

  const { data: graph } = useQuery({
    queryKey: ["live-graph-meta", savedGraphId],
    queryFn: async () => {
      if (!savedGraphId) return null;
      const { data } = await supabase
        .from("saved_graphs")
        .select("*")
        .eq("id", savedGraphId)
        .maybeSingle();
      return data;
    },
    enabled: !!savedGraphId,
  });

  if (!savedGraphId) {
    return (
      <WidgetShell title="Живой график" icon={LineChartIcon}>
        <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-8">
          <LineChartIcon className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">График не выбран</p>
          <p className="text-xs text-muted-foreground">Нажмите ⋯ → «Настроить» в правом верхнем углу виджета</p>
        </div>
      </WidgetShell>
    );
  }

  if (!graph) {
    return (
      <WidgetShell title="Живой график" icon={LineChartIcon}>
        <p className="text-sm text-muted-foreground text-center py-8">Загрузка…</p>
      </WidgetShell>
    );
  }

  const items = Array.isArray(graph.item_keys) ? (graph.item_keys as Array<Record<string, unknown>>) : [];

  return (
    <WidgetShell
      title={graph.name as string}
      icon={LineChartIcon}
      action={
        <Link to="/monitoring" className="text-xs text-primary hover:underline flex items-center gap-1">
          В раздел <ExternalLink className="h-3 w-3" />
        </Link>
      }
    >
      <GraphChart
        series={items.map((it) => ({
          hostid: it.hostid as string,
          hostName: it.hostName as string,
          itemid: it.itemid as string,
          itemName: it.name as string,
          units: it.units as string,
          color: it.color as string,
          ip: it.ip as string,
          hostGroup: it.hostGroup as string,
        }))}
        timeRange={(graph.time_range as string) || "1h"}
        chartType={(graph.chart_type as "line" | "area" | "bar") || "line"}
        aggregation={((graph.aggregation as "avg" | "min" | "max") || "avg")}
        height={200}
        graphName={graph.name as string}
        refetchInterval={refreshSec * 1000}
        showHostMeta={false}
      />
    </WidgetShell>
  );
};
LiveGraphWidget.displayName = "LiveGraphWidget";

// Register live-graph widget after declaration to avoid forward reference
WIDGET_REGISTRY["live-graph"] = {
  type: "live-graph",
  title: "Живой график",
  description: "Лайв-визуализация сохранённого графика. Настраиваемая частота обновления и переход к источнику.",
  category: "Мониторинг",
  icon: LineChartIcon,
  defaultW: 6, defaultH: 8, minW: 4, minH: 5,
  hasConfig: true,
  Component: LiveGraphWidget,
};
