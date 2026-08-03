import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useZabbixConnection } from "@/hooks/useZabbixConnection";
import { invokeZabbix } from "@/lib/zabbix-invoke";
import { cn } from "@/lib/utils";
import {
  Server, AlertTriangle, Bell, Ticket, MessageSquare, UserPlus, Sparkles,
  FolderArchive, Download, RefreshCw, Upload, Loader2, CheckCircle2, XCircle, X,
  MonitorSmartphone,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useIslandTasks, dismissIslandTask, type IslandTask, type IslandTaskKind,
} from "@/lib/island-tasks";

/**
 * Global Dynamic Island: a sticky pill at the top-right of every page.
 * Combines:
 *  • live clock (HH:MM:SS) + weekday/date tooltip
 *  • Zabbix collector heartbeat (hosts / active problems)
 *  • rotating ticker of recent notifications (tickets, mentions, alerts, users)
 *  • realtime "burst" expand when a brand-new notification arrives
 */

const WEEKDAYS = ["Воскресенье","Понедельник","Вторник","Среда","Четверг","Пятница","Суббота"];
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const pad = (n: number) => n.toString().padStart(2, "0");

type NotifRow = {
  id: string;
  title: string | null;
  body: string | null;
  event_type: string | null;
  created_at: string;
  is_read: boolean | null;
};

function iconFor(eventType: string | null) {
  const t = (eventType || "").toLowerCase();
  if (t.includes("ticket")) return Ticket;
  if (t.includes("mention") || t.includes("comment") || t.includes("message")) return MessageSquare;
  if (t.includes("alert") || t.includes("problem") || t.includes("incident")) return AlertTriangle;
  if (t.includes("user")) return UserPlus;
  return Bell;
}

function taskIcon(kind: IslandTaskKind) {
  switch (kind) {
    case "seafile": return FolderArchive;
    case "export":  return Download;
    case "sync":    return RefreshCw;
    case "import":  return Upload;
    default:        return Loader2;
  }
}

export function DynamicIsland() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { active } = useZabbixConnection();

  // --- live clock ---
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateShort = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}`;
  const dateLong = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  // --- zabbix status ---
  const { data: zbx, isError: zbxErr, isFetching: zbxFetching } = useQuery({
    enabled: !!active?.id,
    queryKey: ["island-zabbix", active?.id],
    refetchInterval: 30_000,
    staleTime: 25_000,
    queryFn: async () => {
      const [h, p] = await Promise.all([
        invokeZabbix({ body: { action: "getHosts" } }),
        invokeZabbix({ body: { action: "getProblems" } }),
      ]);
      const hostList = ((h.data?.result as any[]) ?? []);
      // status='0' — хост включён в мониторинг (не отключён вручную).
      // available у интерфейса: '2' явно недоступен, '0' ещё не проверен, '1' доступен.
      // "Онлайн" для шторки = включённые хосты, у которых нет интерфейса в явном '2'.
      const enabled = hostList.filter((x: any) => String(x.status) === "0");
      const offline = enabled.filter((x: any) =>
        Array.isArray(x.interfaces) && x.interfaces.length > 0 &&
        x.interfaces.every((i: any) => String(i.available) === "2")).length;
      const hosts = enabled.length;
      const online = hosts - offline;
      return {
        hosts,
        online,
        problems: ((p.data?.result as unknown[]) ?? []).length,
      };
    },
  });
  const zbxOffline = !!active && (zbxErr || !zbx);
  const zbxConnecting = !!active && zbxFetching && !zbx && !zbxErr;
  const dotColor = !active
    ? "bg-muted-foreground/40"
    : zbxConnecting ? "bg-yellow-500"
    : zbxOffline ? "bg-red-500"
    : "bg-emerald-500";

  // --- agents online status ---
  const { data: agentStats } = useQuery({
    enabled: !!user,
    queryKey: ["island-agents", user?.id],
    refetchInterval: 30_000,
    staleTime: 25_000,
    queryFn: async () => {
      // RLS сам ограничит выборку: оператор видит весь парк, заказчик — свою орг
      const { data } = await supabase
        .from("agent_registrations")
        .select("last_seen_at, is_active");
      const list = (data ?? []) as { last_seen_at: string | null; is_active: boolean | null }[];
      const cutoff = Date.now() - 10 * 60_000; // 10 минут — порог онлайна
      const total = list.length;
      const online = list.filter((a) => a.is_active !== false && a.last_seen_at && new Date(a.last_seen_at).getTime() >= cutoff).length;
      return { total, online };
    },
  });

  // --- recent notifications (rotating ticker) ---
  const { data: notifs = [] } = useQuery<NotifRow[]>({
    enabled: !!user,
    queryKey: ["island-notifications", user?.id],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("notification_log")
        .select("id, title, body, event_type, created_at, is_read")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []) as NotifRow[];
    },
  });
  const unread = useMemo(() => notifs.filter((n) => !n.is_read), [notifs]);
  const ticker = unread.length ? unread : notifs.slice(0, 5);
  const [tickIdx, setTickIdx] = useState(0);
  useEffect(() => {
    if (ticker.length < 2) return;
    const id = setInterval(() => setTickIdx((i) => (i + 1) % ticker.length), 7000);
    return () => clearInterval(id);
  }, [ticker.length]);
  useEffect(() => { setTickIdx(0); }, [ticker.length]);

  // --- realtime "burst": when a fresh notification arrives, briefly expand ---
  const [burst, setBurst] = useState<NotifRow | null>(null);
  const burstTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`island-notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_log", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as NotifRow;
          setBurst(row);
          if (burstTimer.current) window.clearTimeout(burstTimer.current);
          burstTimer.current = window.setTimeout(() => setBurst(null), 6000);
          qc.invalidateQueries({ queryKey: ["island-notifications", user.id] });
          qc.invalidateQueries({ queryKey: ["sidebar-unread-notifications", user.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (burstTimer.current) window.clearTimeout(burstTimer.current);
    };
  }, [user, qc]);

  const current = burst ?? ticker[tickIdx] ?? null;
  const Icon = current ? iconFor(current.event_type) : Sparkles;

  // --- global background tasks (Seafile uploads, exports, syncs…) ---
  const islandTasks = useIslandTasks();
  const hasTasks = islandTasks.length > 0;

  return (
    <div className="pointer-events-none sticky top-2 z-40 flex justify-center px-4 lg:px-6">
      <div
        className={cn(
          "pointer-events-auto flex items-stretch gap-0 rounded-full border border-border/60",
          "bg-background/70 backdrop-blur-xl shadow-lg shadow-black/20",
          "transition-[max-width,box-shadow,background] duration-500 ease-out overflow-hidden max-w-full",
          burst ? "ring-2 ring-primary/70 shadow-primary/30 island-ambient" : "",
          hasTasks ? "ring-1 ring-primary/40" : "",
        )}
      >
        {/* Clock segment */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="flex items-center gap-3 px-5 h-11 hover:bg-muted/40 transition-colors"
              aria-label="Текущее время"
            >
              <span className="font-heading font-bold tabular-nums text-base leading-none">
                {time}
              </span>
              <span className="hidden md:inline-flex items-center gap-1.5 leading-none">
                <span className="text-xs uppercase tracking-wide text-primary font-semibold">
                  {WEEKDAYS[now.getDay()]}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {dateShort}
                </span>
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{dateLong}</TooltipContent>
        </Tooltip>

        {/* Agents segment */}
        {agentStats && agentStats.total > 0 && (
          <>
            <span className="w-px bg-border/60 my-2" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navigate("/agents")}
                  className="flex items-center gap-2 px-3 h-10 hover:bg-muted/40 transition-colors text-xs font-medium"
                >
                  <span className="relative flex h-2 w-2 items-center justify-center">
                    {agentStats.online > 0 && (
                      <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-emerald-500" />
                    )}
                    <span className={cn("relative inline-flex rounded-full h-2 w-2", agentStats.online > 0 ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                  </span>
                  <span className="text-muted-foreground hidden sm:inline">Агенты</span>
                  <span className="inline-flex items-center gap-1">
                    <MonitorSmartphone className="h-3 w-3 opacity-70" />
                    <span className={cn(agentStats.online < agentStats.total && "text-amber-500")}>
                      {agentStats.online}/{agentStats.total}
                    </span>
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {`Онлайн ${agentStats.online} из ${agentStats.total} · порог 10 мин`}
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Zabbix segment */}
        {active && (
          <>
            <span className="w-px bg-border/60 my-2" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navigate(zbx && zbx.problems > 0 ? "/monitoring?tab=problems" : "/monitoring")}
                  className="flex items-center gap-2 px-3 h-10 hover:bg-muted/40 transition-colors text-xs font-medium"
                >
                  <span className="relative flex h-2 w-2 items-center justify-center">
                    {zbxConnecting ? (
                      <span className={cn(
                        "absolute inline-block h-3.5 w-3.5 rounded-full border-2 border-yellow-500/70 animate-spin",
                        "border-t-transparent",
                      )} />
                    ) : !zbxOffline ? (
                      <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping", dotColor)} />
                    ) : null}
                    <span className={cn("relative inline-flex rounded-full h-2 w-2", dotColor)} />
                  </span>
                  <span className="text-muted-foreground hidden sm:inline">Zabbix</span>
                  {zbx && !zbxOffline ? (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <Server className="h-3 w-3 opacity-70" />
                        <span className={cn(zbx.online < zbx.hosts && "text-amber-500")}>
                          {zbx.online}/{zbx.hosts}
                        </span>
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1",
                        zbx.problems > 0 ? "text-red-500" : "text-muted-foreground/70",
                      )}>
                        <AlertTriangle className="h-3 w-3" />{zbx.problems}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground hidden sm:inline">
                      {zbxConnecting ? "…" : "офлайн"}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {zbxConnecting ? "Подключение к Zabbix…"
                  : zbxOffline ? "Коллектор Zabbix недоступен"
                  : `Подключено · ${zbx?.online ?? 0} из ${zbx?.hosts ?? 0} хостов онлайн · ${zbx?.problems ?? 0} активных проблем`}
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Notification ticker segment */}
        <span className="w-px bg-border/60 my-2" />
        <button
          type="button"
          onClick={() => navigate("/notifications")}
          className={cn(
            "flex items-center gap-2 px-3 h-10 hover:bg-muted/40 transition-colors min-w-0",
            "max-w-[140px] sm:max-w-[220px] md:max-w-[320px]",
            burst && "bg-primary/15 island-ambient-glow",
          )}
          title={current ? (current.title ?? "") : "Уведомления"}
        >
          <span className="relative shrink-0">
            <Icon className={cn("h-4 w-4", burst ? "text-primary animate-pulse" : "text-muted-foreground")} />
            {unread.length > 0 && !burst && (
              <span className="absolute -top-1 -right-1 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </span>
          {current ? (
            <span
              key={burst ? `b-${burst.id}` : `t-${current.id}-${tickIdx}`}
              className="text-xs truncate animate-island-ticker"
            >
              {current.title || current.body || "Уведомление"}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground hidden sm:inline">Тихо</span>
          )}
          {unread.length > 0 && (
            <span className="ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground tabular-nums">
              {unread.length}
            </span>
          )}
        </button>

        {/* Background task segments (Seafile uploads, exports, syncs…) */}
        {islandTasks.map((task) => {
          const TIcon = taskIcon(task.kind);
          const pct = task.total && task.total > 0
            ? Math.min(100, Math.round((task.done / task.total) * 100))
            : null;
          const isDone = task.status !== "running";
          const isErr = task.status === "error";
          return (
            <div key={task.id} className="flex items-stretch animate-fade-in">
              <span className="w-px bg-border/60 my-2" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => task.href && navigate(task.href)}
                    className={cn(
                      "relative flex items-center gap-2 px-3 h-10 transition-colors min-w-0 max-w-[260px]",
                      "hover:bg-muted/40",
                      isErr ? "text-red-500" : isDone ? "text-emerald-500" : "text-foreground",
                    )}
                  >
                    <span className="relative shrink-0 inline-flex items-center justify-center">
                      {task.status === "running" ? (
                        pct == null ? (
                          <TIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <TIcon className="h-4 w-4 text-primary" />
                        )
                      ) : isErr ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                    </span>
                    <span className="flex flex-col items-start min-w-0 leading-tight">
                      <span className="text-xs font-medium truncate max-w-[200px]">
                        {task.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[200px] tabular-nums">
                        {task.status === "running"
                          ? (pct != null
                              ? `${pct}% · ${task.done}/${task.total}${task.message ? ` · ${task.message}` : ""}`
                              : (task.message ?? "выполняется…"))
                          : (task.message ?? (isErr ? "ошибка" : "готово"))}
                      </span>
                    </span>
                    {pct != null && task.status === "running" && (
                      <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-muted overflow-hidden">
                        <span
                          className="block h-full bg-primary transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    )}
                    {isDone && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); dismissIslandTask(task.id); }}
                        className="ml-1 shrink-0 rounded-full p-0.5 hover:bg-muted text-muted-foreground"
                        aria-label="Скрыть"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {task.label}{task.message ? ` — ${task.message}` : ""}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}