import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Server, CalendarCheck, Ticket, Users, LogOut, UserCircle, MonitorSmartphone,
  ClipboardList, FileArchive, ScrollText, HelpCircle, Activity, Bell, Briefcase,
  Plug, ChevronDown, ChevronRight, Network, ShieldAlert, DoorOpen, ListChecks, Database,
  MessageSquare, PanelLeftClose, PanelLeftOpen, KeyRound, SlidersHorizontal , ShieldCheck , Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import acroSupport from "@/assets/acro-support.png";
import { GlobalSearch } from "@/components/GlobalSearch";
import KillSwitch, { useLogoKillTrigger } from "@/components/KillSwitch";
import { ShiftHandoverDialog } from "@/components/ShiftHandoverDialog";
import { AvatarHash } from "@/components/ui/avatar-hash";

type NavItem = {
  to: string;
  icon: any;
  label: string;
  roles: string[];
  moduleKey: string;
  badgeKey?: "tickets" | "notifications" | "chat";
};

const sections: { id: string; title: string; adminOnly?: boolean; items: NavItem[] }[] = [
  {
    id: "workspace",
    title: "Рабочее место",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Панель управления", roles: [], moduleKey: "dashboard" },
      { to: "/tickets", icon: Ticket, label: "Заявки", roles: [], moduleKey: "tickets", badgeKey: "tickets" },
      { to: "/notifications", icon: Bell, label: "Уведомления", roles: [], moduleKey: "notifications", badgeKey: "notifications" },
    ],
  },
  {
    id: "objects",
    title: "Объекты",
    items: [
      { to: "/equipment", icon: Server, label: "Оборудование", roles: [], moduleKey: "equipment" },
      { to: "/agents", icon: MonitorSmartphone, label: "Агенты", roles: [], moduleKey: "equipment" },
    ],
  },
  {
    id: "service",
    title: "Обслуживание",
    items: [
      { to: "/work-scope", icon: ListChecks, label: "Регламент работ", roles: [], moduleKey: "protocols" },
      { to: "/protocols", icon: ClipboardList, label: "Протоколы", roles: [], moduleKey: "protocols" },
      { to: "/schedules", icon: CalendarCheck, label: "Календарь ТО", roles: [], moduleKey: "schedules" },
      { to: "/documents", icon: FileArchive, label: "Документация", roles: [], moduleKey: "documents" },
    ],
  },
  {
    id: "monitoring",
    title: "Мониторинг",
    items: [
      { to: "/monitoring", icon: Activity, label: "Мониторинг", roles: [], moduleKey: "monitoring" },
      { to: "/fleet-health", icon: ShieldCheck, label: "Здоровье парка", roles: [], moduleKey: "monitoring" },
      { to: "/infrastructure-maps", icon: Network, label: "Карта инфраструктуры", roles: [], moduleKey: "monitoring" },
    ],
  },
  {
    id: "help",
    title: "Справка",
    items: [
      { to: "/help", icon: HelpCircle, label: "Справка", roles: [], moduleKey: "help" },
    ],
  },
  {
    id: "admin",
    title: "Администрирование",
    adminOnly: true,
    items: [
      { to: "/organizations", icon: Briefcase, label: "Организации и Договоры", roles: ["admin"], moduleKey: "organizations" },
      { to: "/connections", icon: Plug, label: "Подключения", roles: ["admin"], moduleKey: "integrations" },
      { to: "/users", icon: Users, label: "Пользователи", roles: ["admin"], moduleKey: "users" },
      { to: "/enrollment-keys", icon: KeyRound, label: "Ключи регистрации", roles: ["admin"], moduleKey: "users" },
      { to: "/problem-rules", icon: SlidersHorizontal, label: "Правила проблем", roles: ["admin"], moduleKey: "users" },
      { to: "/agent-releases", icon: Rocket, label: "Релизы агента", roles: ["admin"], moduleKey: "users" },
      { to: "/audit", icon: ScrollText, label: "Журнал событий", roles: ["admin"], moduleKey: "audit" },
      { to: "/system-reset", icon: ShieldAlert, label: "Сервисные операции", roles: ["admin"], moduleKey: "audit" },
      { to: "/admin/migrations", icon: Database, label: "Миграции БД", roles: ["admin"], moduleKey: "audit" },
    ],
  },
];

const ADMIN_OPEN_KEY = "sidebar.adminSection.open";
const COLLAPSED_KEY = "sidebar.collapsed";

export default function AppSidebar() {
  const { pathname } = useLocation();
  const { user, profile, signOut, hasRole, hasModuleAccess, roles } = useAuth();
  const kill = useLogoKillTrigger();

  const [adminOpen, setAdminOpen] = useState<boolean>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(ADMIN_OPEN_KEY) : null;
    return v === "1";
  });
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(COLLAPSED_KEY) : null;
    return v === "1";
  });
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
  const [handoverOpen, setHandoverOpen] = useState(false);
  useEffect(() => {
    localStorage.setItem(ADMIN_OPEN_KEY, adminOpen ? "1" : "0");
  }, [adminOpen]);

  // Unread notifications count
  const { data: unreadNotifs = 0 } = useQuery({
    queryKey: ["sidebar-unread-notifications", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      // Считаем УНИКАЛЬНЫЕ события (event_id), а не строки-на-канал:
      // одно событие пишет по строке в notification_log на каждый канал доставки.
      const { data, error } = await supabase.rpc("unread_notifications_count", { p_user: user.id });
      if (error) return 0;
      return (data as number) ?? 0;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Unread chat messages for current user (messages newer than last_read_at in any thread they participate in)
  const { data: unreadChat = 0 } = useQuery({
    queryKey: ["sidebar-unread-chat", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { data: parts } = await supabase
        .from("chat_thread_participants")
        .select("thread_id, last_read_at")
        .eq("user_id", user.id);
      if (!parts?.length) return 0;
      let total = 0;
      for (const p of parts) {
        const { count } = await supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("thread_id", p.thread_id)
          .gt("created_at", p.last_read_at)
          .neq("user_id", user.id);
        total += count ?? 0;
      }
      return total;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // Active tickets assigned to current staff (or created by customer)
  const { data: ticketsBadge = 0 } = useQuery({
    queryKey: ["sidebar-tickets-badge", user?.id, roles],
    queryFn: async () => {
      if (!user) return 0;
      const isStaff = hasRole("admin") || hasRole("engineer");
      let q = supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "overdue"]);
      if (isStaff) q = q.eq("assigned_to", user.id);
      else q = q.eq("created_by", user.id);
      const { count } = await q;
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });


  const visibleSection = (section: typeof sections[number]) => {
    if (section.adminOnly && !hasRole("admin")) return null;
    const visible = section.items.filter((item) => {
      if (item.roles.length > 0 && !item.roles.some((r) => hasRole(r as any))) return false;
      if (!hasModuleAccess(item.moduleKey)) return false;
      return true;
    });
    if (visible.length === 0) return null;
    return { ...section, items: visible };
  };

  const renderItem = (item: NavItem) => {
    const isActive = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
    const badgeValue =
      item.badgeKey === "notifications" ? unreadNotifs :
      item.badgeKey === "tickets" ? ticketsBadge :
      item.badgeKey === "chat" ? unreadChat : 0;
    const link = (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
          collapsed && "justify-center px-2",
          isActive
            ? "bg-sidebar-primary/15 text-sidebar-primary font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <span className="relative shrink-0">
          <item.icon className="h-4 w-4" />
          {collapsed && badgeValue > 0 && (
            <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
              {badgeValue > 9 ? "9+" : badgeValue}
            </span>
          )}
        </span>
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {!collapsed && badgeValue > 0 && (
          <Badge className="h-5 px-1.5 text-[10px] bg-destructive text-destructive-foreground hover:bg-destructive">
            {badgeValue > 99 ? "99+" : badgeValue}
          </Badge>
        )}
      </Link>
    );
    if (collapsed) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return link;
  };

  const sectionLabelClass = "text-[10px] uppercase tracking-widest text-sidebar-foreground/30 px-3 mt-4 mb-1 font-medium";

  return (
    <TooltipProvider delayDuration={150}>
    <aside className={cn(
      "relative z-10 hidden lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200",
      collapsed ? "lg:w-16" : "lg:w-64",
    )}>
      <div className={cn("shrink-0 flex items-center gap-3 py-4 border-b border-sidebar-border", collapsed ? "px-2 justify-center" : "px-5")}>
        <button
          type="button"
          aria-label="Logo"
          onClick={kill.onLogoClick}
          className="focus:outline-none cursor-pointer"
          tabIndex={-1}
        >
          <img
            src={acroSupport}
            alt="Акро"
            className="h-10 w-10 rounded-xl border border-primary/30 object-cover object-[50%_32%] shadow-lg shadow-primary/15"
          />
        </button>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-heading text-sm font-semibold text-sidebar-foreground leading-tight">Assist Portal</h1>
            <p className="text-[11px] text-sidebar-foreground/60 truncate">Техническая поддержка</p>
          </div>
        )}
      </div>

      <div className="shrink-0 px-2 pt-3 flex items-center gap-1">
        {!collapsed && <div className="flex-1"><GlobalSearch /></div>}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((v) => !v)}
              className={cn("h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50", collapsed && "mx-auto")}
              aria-label={collapsed ? "Развернуть панель" : "Свернуть панель"}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? "Развернуть" : "Свернуть"}</TooltipContent>
        </Tooltip>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {sections.map((rawSection) => {
          const section = visibleSection(rawSection);
          if (!section) return null;

          if (section.adminOnly) {
            if (collapsed) {
              return (
                <div key={section.id} className="space-y-1 mt-2">
                  {section.items.map(renderItem)}
                </div>
              );
            }
            return (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() => setAdminOpen((v) => !v)}
                  className={cn(sectionLabelClass, "flex items-center gap-1 w-full hover:text-sidebar-foreground/60 transition-colors")}
                >
                  {adminOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {section.title}
                </button>
                {adminOpen && (
                  <div className="space-y-1 mt-1">
                    {section.items.map(renderItem)}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={section.id}>
              {!collapsed && <div className={sectionLabelClass}>{section.title}</div>}
              <div className="space-y-1">
                {section.items.map(renderItem)}
              </div>
            </div>
          );
        })}
      </nav>


      <div className={cn("shrink-0 py-3 border-t border-sidebar-border", collapsed ? "px-2" : "px-3")}>
        {!collapsed && (hasRole("admin") || hasRole("engineer")) && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 mb-2"
            onClick={() => setHandoverOpen(true)}
          >
            <DoorOpen className="h-4 w-4" />Сдать смену
          </Button>
        )}
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <NavLink to="/profile" className="block" title="Мой профиль">
                  <AvatarHash name={profile?.full_name ?? user?.email} email={user?.email} size="md" />
                </NavLink>
              </TooltipTrigger>
              <TooltipContent side="right">{profile?.full_name ?? user?.email ?? "Профиль"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Выйти</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            <div className="px-3 py-2 mb-2 flex items-center justify-between gap-2">
              <NavLink to="/profile" className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity" title="Мой профиль">
                <AvatarHash name={profile?.full_name ?? user?.email} email={user?.email} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground/90 truncate">{profile?.full_name ?? user?.email ?? "—"}</p>
                  <p className="text-xs text-sidebar-foreground/50 capitalize">{roles[0] ?? "user"}</p>
                </div>
              </NavLink>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 mb-1" asChild>
              <NavLink to="/profile">
                <UserCircle className="h-4 w-4" />
                Мой профиль
              </NavLink>
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Выйти
            </Button>
          </>
        )}
      </div>
      <KillSwitch open={kill.open} onOpenChange={kill.setOpen} />
      <ShiftHandoverDialog open={handoverOpen} onOpenChange={setHandoverOpen} />
    </aside>
    </TooltipProvider>
  );
}
