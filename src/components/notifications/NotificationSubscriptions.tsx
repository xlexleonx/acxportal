import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Filter } from "lucide-react";
import { NOTIFICATION_EVENTS, EVENT_MODULES, PRIORITY_OPTIONS } from "@/lib/notification-events";
import { PRODUCTS, REQUEST_TYPE_LABELS } from "@/lib/ticket-categories";

export function NotificationSubscriptions() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: channels = [] } = useQuery({
    queryKey: ["notif-channels", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("notification_channels").select("id,name,channel_type,enabled");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["notif-subs", user?.id],
    queryFn: async () => {
      // Подписки — персональная настройка. Администратор может видеть все
      // строки по RLS, но в этой форме должен изменять только собственные.
      const { data } = await supabase
        .from("notification_subscriptions")
        .select("*")
        .eq("user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["notif-sites"],
    queryFn: async () => {
      const { data } = await supabase.from("sites").select("id,name").order("name");
      return data ?? [];
    },
    enabled: !!user,
  });

  const subMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of subs) m.set(s.event_type, s);
    return m;
  }, [subs]);

  const upsertMut = useMutation({
    mutationFn: async (sub: any) => {
      // id принадлежит конкретной строке. Его нельзя переносить в upsert:
      // при конфликте по user_id/event_type это могло столкнуться с чужим id.
      const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...values } = sub;
      const payload = { ...values, user_id: user!.id };
      const { error } = await supabase
        .from("notification_subscriptions")
        .upsert(payload, { onConflict: "user_id,event_type" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-subs"] }),
    onError: (e: any) => toast({ title: "Ошибка сохранения", description: e.message, variant: "destructive" }),
  });

  function update(eventKey: string, patch: Partial<{ enabled: boolean; min_priority: string | null; channel_ids: string[] }>) {
    const existing = subMap.get(eventKey) ?? { event_type: eventKey, enabled: true, min_priority: null, channel_ids: [] };
    upsertMut.mutate({ ...existing, ...patch });
  }

  function updateFilters(eventKey: string, patch: Record<string, any>) {
    const existing = subMap.get(eventKey) ?? { event_type: eventKey, enabled: true, min_priority: null, channel_ids: [], filters: {} };
    const filters = { ...(existing.filters ?? {}), ...patch };
    // Clean undefined / empty arrays
    for (const k of Object.keys(filters)) {
      if (filters[k] === undefined || filters[k] === null) delete filters[k];
      if (Array.isArray(filters[k]) && filters[k].length === 0) delete filters[k];
    }
    upsertMut.mutate({ ...existing, filters });
  }

  function toggleChannel(eventKey: string, channelId: string, on: boolean) {
    const existing = subMap.get(eventKey) ?? { event_type: eventKey, enabled: true, min_priority: null, channel_ids: [] };
    const ids: string[] = Array.isArray(existing.channel_ids) ? existing.channel_ids : [];
    const next = on ? Array.from(new Set([...ids, channelId])) : ids.filter((x) => x !== channelId);
    upsertMut.mutate({ ...existing, channel_ids: next });
  }

  // Group events by module, filter by audience (show all to admins)
  const isAdmin = roles.includes("admin");
  const visibleEvents = NOTIFICATION_EVENTS.filter((e) =>
    isAdmin || e.key === "agent.registered" || e.audience.some((a) => roles.includes(a as any))
  );
  const grouped = useMemo(() => {
    const g: Record<string, typeof NOTIFICATION_EVENTS> = {};
    for (const e of visibleEvents) (g[e.module] ??= []).push(e);
    return g;
  }, [visibleEvents]);

  const enabledChannels = channels.filter((c: any) => c.enabled);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-lg">Подписки на события</h3>
        <p className="text-sm text-muted-foreground">
          Выберите события и каналы для каждого. Используются только включённые каналы.
        </p>
      </div>

      {enabledChannels.length === 0 && (
        <Card><CardContent className="py-6 text-sm text-amber-600">
          У вас нет активных каналов. Добавьте хотя бы один канал на вкладке «Каналы», иначе уведомления не будут отправляться.
        </CardContent></Card>
      )}

      <Tabs defaultValue={Object.keys(grouped)[0]} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          {Object.keys(grouped).map((mod) => (
            <TabsTrigger key={mod} value={mod} className="text-xs">
              {EVENT_MODULES[mod] ?? mod} <span className="ml-1 opacity-60">{grouped[mod].length}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {Object.entries(grouped).map(([mod, events]) => (
          <TabsContent key={mod} value={mod} className="space-y-3 mt-4">
            {events.map((ev) => {
              const sub = subMap.get(ev.key);
              const enabled = sub?.enabled ?? false;
              const chIds: string[] = Array.isArray(sub?.channel_ids) ? sub!.channel_ids : [];
              return (
                <div key={ev.key} className="rounded-md border bg-card p-3 space-y-2 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{ev.label}</span>
                        {ev.defaultPriority && <Badge variant="outline" className="text-[10px]">{ev.defaultPriority}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{ev.description}</p>
                    </div>
                    <Switch checked={enabled} onCheckedChange={(v) => update(ev.key, { enabled: v })} />
                  </div>

                  {enabled && (
                    <div className={"grid gap-3 pt-2 border-t " + ((ev.module === "tickets" || ev.module === "monitoring") ? "md:grid-cols-2" : "grid-cols-1")}>
                      {(ev.module === "tickets" || ev.module === "monitoring") && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Минимальный приоритет</p>
                        <Select value={sub?.min_priority ?? "info"} onValueChange={(v) => update(ev.key, { min_priority: v === "info" ? null : v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Каналы доставки</p>
                        <div className="flex flex-wrap gap-2">
                          {enabledChannels.length === 0 && <span className="text-xs text-muted-foreground">Нет каналов</span>}
                          {enabledChannels.map((c: any) => (
                            <label key={c.id} className="flex items-center gap-1.5 text-xs cursor-pointer rounded-md border px-2 py-1 hover:bg-muted/50">
                              <Checkbox
                                checked={chIds.includes(c.id)}
                                onCheckedChange={(v) => toggleChannel(ev.key, c.id, !!v)}
                              />
                              <span>{c.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {enabled && ev.module === "tickets" && (
                    <TicketFilters
                      eventKey={ev.key}
                      filters={sub?.filters ?? {}}
                      sites={sites}
                      onChange={(patch) => updateFilters(ev.key, patch)}
                      isCommentEvent={ev.key.startsWith("ticket.comment")}
                    />
                  )}

                  {enabled && ev.key === "ticket.sla_warning" && (
                    <SLAOffsetsPicker
                      value={Array.isArray(sub?.filters?.sla_reminder_offsets) ? sub!.filters.sla_reminder_offsets : [30, 10, 5]}
                      onChange={(offsets) => updateFilters(ev.key, { sla_reminder_offsets: offsets })}
                    />
                  )}
                </div>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ---------------- SLA Offset Picker ----------------
function SLAOffsetsPicker({ value, onChange }: { value: number[]; onChange: (next: number[]) => void }) {
  // Discrete 10-min steps + extra short reminders
  const presets = [5, 10, 20, 30, 60, 120, 180];
  const toggle = (n: number) => {
    const set = new Set(value);
    if (set.has(n)) set.delete(n); else set.add(n);
    onChange(Array.from(set).sort((a, b) => b - a));
  };
  return (
    <div className="pt-2 border-t space-y-1">
      <p className="text-xs text-muted-foreground">Напоминать за (минуты до дедлайна SLA)</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => toggle(n)}
            className={`text-xs px-2 py-0.5 rounded-md border font-mono transition-colors ${
              value.includes(n) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"
            }`}
          >{n} мин</button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Проверка выполняется каждые 5 минут. Уведомление отправится один раз для каждого выбранного интервала.</p>
    </div>
  );
}

// ---------------- TicketFilters ----------------
function TicketFilters({
  eventKey,
  filters,
  sites,
  onChange,
  isCommentEvent,
}: {
  eventKey: string;
  filters: any;
  sites: { id: string; name: string }[];
  onChange: (patch: Record<string, any>) => void;
  isCommentEvent: boolean;
}) {
  const assigneeScope = filters.assignee_scope ?? "any";
  const creatorScope = filters.creator_scope ?? "any";
  const priorities: string[] = filters.priorities ?? [];
  const requestTypes: string[] = filters.request_types ?? [];
  const productCodes: string[] = filters.product_codes ?? [];
  const siteIds: string[] = filters.site_ids ?? [];

  const toggleArr = (key: string, arr: string[], val: string) => {
    onChange({ [key]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] });
  };

  const activeCount =
    (assigneeScope !== "any" ? 1 : 0) +
    (creatorScope !== "any" ? 1 : 0) +
    (priorities.length ? 1 : 0) +
    (requestTypes.length ? 1 : 0) +
    (productCodes.length ? 1 : 0) +
    (siteIds.length ? 1 : 0) +
    (isCommentEvent && filters.only_internal !== undefined ? 1 : 0);

  return (
    <Collapsible className="pt-2 border-t">
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <Filter className="h-3 w-3" />
        <span>Условия отправки</span>
        {activeCount > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{activeCount}</Badge>}
        <ChevronDown className="h-3 w-3 ml-auto" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Исполнитель</p>
            <Select value={assigneeScope} onValueChange={(v) => onChange({ assignee_scope: v === "any" ? undefined : v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Любой</SelectItem>
                <SelectItem value="me">Назначенные на меня</SelectItem>
                <SelectItem value="unassigned">Без исполнителя</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Автор заявки</p>
            <Select value={creatorScope} onValueChange={(v) => onChange({ creator_scope: v === "any" ? undefined : v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Любой</SelectItem>
                <SelectItem value="me">Только мои заявки</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Приоритет (если ничего не выбрано — все)</p>
          <div className="flex flex-wrap gap-1.5">
            {["P1","P2","P3","P4"].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => toggleArr("priorities", priorities, p)}
                className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                  priorities.includes(p) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"
                }`}
              >{p}</button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Тип обращения</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(REQUEST_TYPE_LABELS).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleArr("request_types", requestTypes, v)}
                className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                  requestTypes.includes(v) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"
                }`}
              >{label}</button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Продукт / система</p>
          <div className="flex flex-wrap gap-1.5">
            {PRODUCTS.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => toggleArr("product_codes", productCodes, p.code)}
                className={`text-xs px-2 py-0.5 rounded-md border font-mono transition-colors ${
                  productCodes.includes(p.code) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"
                }`}
              >{p.code}</button>
            ))}
          </div>
        </div>

        {sites.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">ЦОД</p>
            <div className="flex flex-wrap gap-1.5">
              {sites.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleArr("site_ids", siteIds, s.id)}
                  className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                    siteIds.includes(s.id) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"
                  }`}
                >{s.name}</button>
              ))}
            </div>
          </div>
        )}

        {isCommentEvent && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Тип комментария</p>
            <Select
              value={filters.only_internal === true ? "internal" : filters.only_internal === false ? "public" : "any"}
              onValueChange={(v) => onChange({ only_internal: v === "internal" ? true : v === "public" ? false : undefined })}
            >
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Любые</SelectItem>
                <SelectItem value="public">Только публичные</SelectItem>
                <SelectItem value="internal">Только внутренние</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
