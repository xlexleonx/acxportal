import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, Trash2, Pencil, Plus, CheckCircle2, XCircle, AlertCircle, MessageSquare, Mail, Phone, Bell, ToggleLeft, ToggleRight } from "lucide-react";
import { testChannel } from "@/lib/notify";
import { usePushSubscription } from "@/hooks/usePushSubscription";

type ChannelType = "telegram" | "mattermost" | "smtp" | "email" | "sms" | "mts_sms" | "a1_sms" | "web_push";

const TYPE_META: Record<ChannelType, { label: string; icon: any; color: string }> = {
  telegram: { label: "Telegram", icon: Send, color: "text-sky-500" },
  mattermost: { label: "Mattermost", icon: MessageSquare, color: "text-indigo-500" },
  smtp: { label: "Email (SMTP)", icon: Mail, color: "text-blue-500" },
  email: { label: "Email (webhook)", icon: Mail, color: "text-emerald-500" },
  sms: { label: "SMS (webhook)", icon: Phone, color: "text-amber-500" },
  mts_sms: { label: "МТС SMS (JSONv2)", icon: Phone, color: "text-red-500" },
  a1_sms: { label: "А1 SMS (smart-sender)", icon: Phone, color: "text-orange-500" },
  web_push: { label: "Браузерные пуши", icon: Bell, color: "text-violet-500" },
};

function WebPushCard() {
  const { supported, subscribed, busy, error, vapidConfigured, enable, disable } = usePushSubscription();
  const { toast } = useToast();
  if (!supported) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-3 text-sm text-muted-foreground flex items-center gap-2">
          <Bell className="h-4 w-4" /> Браузерные push-уведомления не поддерживаются в этом браузере.
        </CardContent>
      </Card>
    );
  }
  const onToggle = async () => {
    try {
      if (subscribed) { await disable(); toast({ title: "Push отключены в этом браузере" }); }
      else { await enable(); toast({ title: "Push включены в этом браузере" }); }
    } catch (e: any) {
      toast({ title: "Не удалось", description: e?.message ?? String(e), variant: "destructive" });
    }
  };
  return (
    <Card>
      <CardContent className="py-3 flex items-center gap-3">
        <Bell className="h-5 w-5 text-violet-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Браузерные push-уведомления</div>
          <div className="text-xs text-muted-foreground truncate">
            {subscribed ? "Включены — приходят даже при закрытой вкладке" : "Получать уведомления в этом браузере, даже когда портал закрыт"}
          </div>
          {!vapidConfigured && (
            <div className="text-xs text-amber-500 mt-0.5">Push-уведомления ещё не настроены администратором портала.</div>
          )}
          {error ? <div className="text-xs text-destructive mt-0.5">{error}</div> : null}
        </div>
        <Button
          size="sm"
          variant={subscribed ? "outline" : "default"}
          disabled={busy || !vapidConfigured}
          title={!vapidConfigured ? "Требуется настройка VAPID-ключей на сервере" : undefined}
          onClick={onToggle}
        >
          {busy ? "…" : subscribed ? "Выключить" : "Включить в этом браузере"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function NotificationChannels() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [smsTestChannel, setSmsTestChannel] = useState<any | null>(null);
  const [smsTestPhone, setSmsTestPhone] = useState("");
  const [smsTestSending, setSmsTestSending] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["notif-channels", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_channels").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notification_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-channels"] });
      toast({ title: "Канал удалён" });
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("notification_channels").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, enabled }) => {
      await qc.cancelQueries({ queryKey: ["notif-channels", user?.id] });
      const previous = qc.getQueryData(["notif-channels", user?.id]);
      qc.setQueryData(["notif-channels", user?.id], (current: any[] | undefined) =>
        current?.map((channel) => channel.id === id ? { ...channel, enabled } : channel) ?? current,
      );
      return { previous };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) qc.setQueryData(["notif-channels", user?.id], context.previous);
      toast({ title: "Не удалось изменить состояние канала", description: error.message, variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notif-channels", user?.id] }),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, enabled }: { ids: string[]; enabled: boolean }) => {
      const { error } = await supabase.from("notification_channels").update({ enabled }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["notif-channels"] });
      toast({ title: v.enabled ? "Каналы включены" : "Каналы выключены" });
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("notification_channels").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-channels"] });
      toast({ title: "Каналы удалены" });
      setSelected(new Set());
    },
  });

  const allIds = useMemo(() => (channels as Array<{ id: string }>).map((c) => c.id), [channels]);
  const allChecked = selected.size > 0 && selected.size === allIds.length;
  const someChecked = selected.size > 0 && !allChecked;

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(allIds) : new Set());
  }

  async function handleTest(id: string) {
    const ch = channels.find((c: any) => c.id === id);
    if (ch && (ch.channel_type === "mts_sms" || ch.channel_type === "a1_sms")) {
      setSmsTestChannel(ch);
      setSmsTestPhone((ch.config as any)?.recipient ?? "");
      return;
    }
    toast({ title: "Отправляю тест..." });
    const r = await testChannel(id);
    if (r.ok) toast({ title: "Тест отправлен", description: "Проверьте канал доставки" });
    else toast({ title: "Ошибка теста", description: r.error, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["notif-channels"] });
  }

  async function runSmsTest() {
    if (!smsTestChannel) return;
    const phone = smsTestPhone.replace(/[^\d]/g, "");
    if (!phone) { toast({ title: "Введите номер телефона", variant: "destructive" }); return; }
    setSmsTestSending(true);
    const r = await testChannel(smsTestChannel.id, phone);
    setSmsTestSending(false);
    if (r.ok) { toast({ title: "SMS отправлено", description: `На номер ${phone}` }); setSmsTestChannel(null); }
    else toast({ title: "Ошибка отправки", description: r.error, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["notif-channels"] });
  }

  function openCreate() { setEditing(null); setOpen(true); }
  function openEdit(ch: any) { setEditing(ch); setOpen(true); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg">Каналы доставки</h3>
          <p className="text-sm text-muted-foreground">Настройте webhooks для получения уведомлений</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Добавить канал</Button>
      </div>

      <WebPushCard />

      {channels.length > 0 && (
      <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 bg-muted/30">
          <label className="flex items-center gap-2 text-sm cursor-pointer pl-1">
            <Checkbox
              checked={allChecked ? true : someChecked ? "indeterminate" : false}
              onCheckedChange={(v) => toggleAll(!!v)}
            />
            <span className="text-muted-foreground">
              {selected.size > 0 ? `Выбрано: ${selected.size}` : "Выбрать все"}
            </span>
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => bulkUpdateMut.mutate({ ids: Array.from(selected), enabled: true })}
            >
              <ToggleRight className="h-4 w-4 mr-1.5" />
              Включить
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => bulkUpdateMut.mutate({ ids: Array.from(selected), enabled: false })}
            >
              <ToggleLeft className="h-4 w-4 mr-1.5" />
              Выключить
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={selected.size === 0}
              onClick={() => {
                if (confirm(`Удалить ${selected.size} канал(ов)?`)) bulkDeleteMut.mutate(Array.from(selected));
              }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Удалить
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      ) : channels.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          У вас пока нет настроенных каналов. Добавьте первый, чтобы начать получать уведомления о заявках, SLA и системных событиях.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {channels.map((ch: any) => {
            const meta = TYPE_META[ch.channel_type as ChannelType];
            const Icon = meta?.icon ?? Send;
            return (
              <Card key={ch.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={selected.has(ch.id)}
                        onCheckedChange={(v) => toggleOne(ch.id, !!v)}
                        className="mt-1"
                        aria-label="Выбрать канал"
                      />
                      <Icon className={`h-5 w-5 shrink-0 ${meta?.color}`} />
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{ch.name}</CardTitle>
                        <CardDescription className="text-xs">{meta?.label}</CardDescription>
                      </div>
                    </div>
                    <Switch checked={ch.enabled} onCheckedChange={(v) => toggleMut.mutate({ id: ch.id, enabled: v })} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-xs">
                    {ch.verified ? (
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />Проверен
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-600">
                        <AlertCircle className="h-3 w-3" />Не проверен
                      </Badge>
                    )}
                    {ch.last_test_status === "failed" && (
                      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                        <XCircle className="h-3 w-3" />Последний тест: ошибка
                      </Badge>
                    )}
                  </div>
                  {ch.last_test_error && (
                    <p className="text-xs text-destructive line-clamp-2">{ch.last_test_error}</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleTest(ch.id)}>
                      <Send className="h-3.5 w-3.5 mr-1" />Тест
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(ch)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />Изменить
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive ml-auto"
                      onClick={() => { if (confirm("Удалить канал?")) deleteMut.mutate(ch.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ChannelDialog open={open} onOpenChange={setOpen} editing={editing} userId={user?.id ?? ""} />

      <Dialog open={!!smsTestChannel} onOpenChange={(v) => !v && setSmsTestChannel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Тестовое SMS</DialogTitle>
            <DialogDescription>
              Канал: {smsTestChannel?.name} ({smsTestChannel?.channel_type === "mts_sms" ? "МТС" : "А1"}).
              Будет отправлено сообщение «Тестовое уведомление от портала».
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Номер телефона (только цифры)</Label>
            <Input value={smsTestPhone} onChange={(e) => setSmsTestPhone(e.target.value.replace(/[^\d]/g, ""))} placeholder="375291234567" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsTestChannel(null)}>Отмена</Button>
            <Button onClick={runSmsTest} disabled={smsTestSending}>
              {smsTestSending ? "Отправка..." : "Отправить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChannelDialog({ open, onOpenChange, editing, userId }: { open: boolean; onOpenChange: (v: boolean) => void; editing: any; userId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [type, setType] = useState<ChannelType>(editing?.channel_type ?? "telegram");
  const [name, setName] = useState(editing?.name ?? "");
  const [config, setConfig] = useState<any>(editing?.config ?? {});

  // reset on open
  function onOpen(v: boolean) {
    if (v) {
      setType(editing?.channel_type ?? "telegram");
      setName(editing?.name ?? "");
      setConfig(editing?.config ?? {});
    }
    onOpenChange(v);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Введите название канала");
      const payload = { user_id: userId, channel_type: type, name: name.trim(), config };
      if (editing) {
        const { error } = await supabase.from("notification_channels").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_channels").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-channels"] });
      toast({ title: editing ? "Канал обновлён" : "Канал создан" });
      onOpen(false);
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Редактирование канала" : "Новый канал"}</DialogTitle>
          <DialogDescription>Заполните поля для подключения. Формат указан в подсказке для каждого типа.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Тип канала</Label>
            <Select value={type} onValueChange={(v) => { setType(v as ChannelType); setConfig({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_META) as ChannelType[]).map((k) => (
                  <SelectItem key={k} value={k}>{TYPE_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Мой Telegram" />
          </div>

          {type === "telegram" && <TelegramFields config={config} setConfig={setConfig} />}
          {type === "mattermost" && <MattermostFields config={config} setConfig={setConfig} />}
          {type === "smtp" && <SmtpFields config={config} setConfig={setConfig} />}
          {type === "email" && <EmailWebhookFields config={config} setConfig={setConfig} />}
          {type === "sms" && <SmsWebhookFields config={config} setConfig={setConfig} />}
          {type === "mts_sms" && <MtsSmsFields config={config} setConfig={setConfig} />}
          {type === "a1_sms" && <A1SmsFields config={config} setConfig={setConfig} />}
          {type === "web_push" && <WebPushFields />}

          <div className="grid gap-2">
            <Label>Шаблон сообщения (опционально)</Label>
            <Textarea
              rows={3}
              value={config.message_template ?? ""}
              onChange={(e) => setConfig({ ...config, message_template: e.target.value })}
              placeholder={"По умолчанию: {{title}}\\n{{body}}\\n\\nДоступные переменные: {{title}}, {{body}}, {{event_type}}, {{priority}}, и любые поля из payload"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpen(false)}>Отмена</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Сохранение..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TelegramFields({ config, setConfig }: any) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        1) Создайте бота в <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> командой <code>/newbot</code> — получите <b>токен</b>.<br />
        2) Откройте чат с ботом и отправьте любое сообщение.<br />
        3) Получите ваш <b>chat_id</b> через <a className="underline" href="https://t.me/userinfobot" target="_blank" rel="noreferrer">@userinfobot</a> или <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>.
      </p>
      <div className="grid gap-2">
        <Label>Bot token</Label>
        <Input value={config.bot_token ?? ""} onChange={(e) => setConfig({ ...config, bot_token: e.target.value })} placeholder="123456789:ABCdefGhIJKlmNoPQRstUVwxyz" />
      </div>
      <div className="grid gap-2">
        <Label>Chat ID</Label>
        <Input value={config.chat_id ?? ""} onChange={(e) => setConfig({ ...config, chat_id: e.target.value })} placeholder="123456789 или -1001234567890 (для группы)" />
      </div>
      <div className="grid gap-2">
        <Label>Parse mode (опционально)</Label>
        <Select value={config.parse_mode ?? "none"} onValueChange={(v) => setConfig({ ...config, parse_mode: v === "none" ? undefined : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без форматирования</SelectItem>
            <SelectItem value="HTML">HTML</SelectItem>
            <SelectItem value="MarkdownV2">MarkdownV2</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function MattermostFields({ config, setConfig }: any) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        В Mattermost: <b>Integrations → Incoming Webhooks → Add</b> — создайте webhook и скопируйте URL.
      </p>
      <div className="grid gap-2">
        <Label>Webhook URL</Label>
        <Input value={config.webhook_url ?? ""} onChange={(e) => setConfig({ ...config, webhook_url: e.target.value })} placeholder="https://mattermost.example.com/hooks/xxxxxxxx" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>Канал (опц.)</Label>
          <Input value={config.channel ?? ""} onChange={(e) => setConfig({ ...config, channel: e.target.value })} placeholder="#alerts" />
        </div>
        <div className="grid gap-2">
          <Label>Имя бота (опц.)</Label>
          <Input value={config.username ?? ""} onChange={(e) => setConfig({ ...config, username: e.target.value })} placeholder="Assist Portal" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={!!config.use_attachments} onCheckedChange={(v) => setConfig({ ...config, use_attachments: v })} />
        <Label className="cursor-pointer">Отправлять как rich attachment (с заголовком и цветом)</Label>
      </div>
    </div>
  );
}

function EmailWebhookFields({ config, setConfig }: any) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Укажите webhook вашего SMTP-relay / Make / n8n / Zapier. На него POST'нется JSON с полями <code>title</code>, <code>message</code>, <code>recipient</code>.
      </p>
      <div className="grid gap-2">
        <Label>Webhook URL</Label>
        <Input value={config.webhook_url ?? ""} onChange={(e) => setConfig({ ...config, webhook_url: e.target.value })} placeholder="https://hook.example.com/email" />
      </div>
      <div className="grid gap-2">
        <Label>Email получателя</Label>
        <Input type="email" value={config.recipient ?? ""} onChange={(e) => setConfig({ ...config, recipient: e.target.value })} placeholder="user@company.com" />
      </div>
      <CommonWebhookExtras config={config} setConfig={setConfig} />
    </div>
  );
}

function SmsWebhookFields({ config, setConfig }: any) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Укажите webhook вашего SMS-провайдера (SMS.by, SMSC.ru, Twilio relay, и т.п.) или прокси-эндпоинт.
      </p>
      <div className="grid gap-2">
        <Label>Webhook URL</Label>
        <Input value={config.webhook_url ?? ""} onChange={(e) => setConfig({ ...config, webhook_url: e.target.value })} placeholder="https://sms.example.com/send" />
      </div>
      <div className="grid gap-2">
        <Label>Номер телефона</Label>
        <Input value={config.recipient ?? ""} onChange={(e) => setConfig({ ...config, recipient: e.target.value })} placeholder="+375291234567" />
      </div>
      <CommonWebhookExtras config={config} setConfig={setConfig} />
    </div>
  );
}

function CommonWebhookExtras({ config, setConfig }: any) {
  const [headersText, setHeadersText] = useState(() => {
    try { return config.headers ? JSON.stringify(config.headers, null, 2) : ""; } catch { return ""; }
  });
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>HTTP метод</Label>
          <Select value={config.method ?? "POST"} onValueChange={(v) => setConfig({ ...config, method: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="GET">GET</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Доп. заголовки (JSON, опц.)</Label>
        <Textarea
          rows={3} value={headersText}
          onChange={(e) => {
            setHeadersText(e.target.value);
            try { setConfig({ ...config, headers: e.target.value ? JSON.parse(e.target.value) : undefined }); } catch { /* ignore */ }
          }}
          placeholder={'{ "Authorization": "Bearer ..." }'}
        />
      </div>
      <div className="grid gap-2">
        <Label>Шаблон тела запроса (опц.)</Label>
        <Textarea
          rows={3}
          value={config.body_template ?? ""}
          onChange={(e) => setConfig({ ...config, body_template: e.target.value })}
          placeholder={'{ "to": "{{recipient}}", "text": "{{title}}: {{body}}" } — переменные {{title}}, {{body}}, {{priority}}, {{event_type}}'}
        />
      </div>
    </>
  );
}

function MtsSmsFields({ config, setConfig }: any) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Используется JSONv2 API: <code>https://api.communicator.mts.by/&lt;client_id&gt;/json2/simple</code>.
        Получите у МТС <b>Client ID</b>, <b>API Key</b> и зарегистрированное имя отправителя (alpha_name, до 11 символов).
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>Client ID</Label>
          <Input value={config.client_id ?? ""} onChange={(e) => setConfig({ ...config, client_id: e.target.value })} placeholder="123456" />
        </div>
        <div className="grid gap-2">
          <Label>API Key</Label>
          <Input type="password" value={config.api_key ?? ""} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} placeholder="••••••••" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>Имя отправителя (alpha_name, до 11 симв.)</Label>
          <Input maxLength={11} value={config.sender_name ?? ""} onChange={(e) => setConfig({ ...config, sender_name: e.target.value })} placeholder="AP-Portal" />
        </div>
        <div className="grid gap-2">
          <Label>TTL, сек (300–259200)</Label>
          <Input type="number" min={300} max={259200} value={config.ttl ?? 300} onChange={(e) => setConfig({ ...config, ttl: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Номер телефона (только цифры, например 375291234567)</Label>
        <Input value={config.recipient ?? ""} onChange={(e) => setConfig({ ...config, recipient: e.target.value.replace(/[^\d]/g, "") })} placeholder="375291234567" />
      </div>
      <div className="grid gap-2">
        <Label>Callback URL (опц.)</Label>
        <Input value={config.callback_url ?? ""} onChange={(e) => setConfig({ ...config, callback_url: e.target.value })} placeholder="https://example.com/mts-callback" />
      </div>
    </div>
  );
}

function A1SmsFields({ config, setConfig }: any) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Используется smart-sender API: <code>https://smart-sender.a1.by/api/send/sms</code>.
        Получите в личном кабинете <b>логин</b> (номер телефона), <b>API Key</b> и зарегистрированное имя отправителя.
        IP портала должен быть в белом списке кабинета.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>Логин (номер телефона)</Label>
          <Input value={config.login ?? ""} onChange={(e) => setConfig({ ...config, login: e.target.value.replace(/[^\d]/g, "") })} placeholder="375291234567" />
        </div>
        <div className="grid gap-2">
          <Label>API Key</Label>
          <Input type="password" value={config.api_key ?? ""} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} placeholder="••••••••" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>Имя отправителя</Label>
          <Input value={config.sender_name ?? ""} onChange={(e) => setConfig({ ...config, sender_name: e.target.value })} placeholder="Portal" />
        </div>
        <div className="grid gap-2">
          <Label>TTL, сек (40–86400)</Label>
          <Input type="number" min={40} max={86400} value={config.ttl ?? 86400} onChange={(e) => setConfig({ ...config, ttl: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Номер получателя (только цифры)</Label>
        <Input value={config.recipient ?? ""} onChange={(e) => setConfig({ ...config, recipient: e.target.value.replace(/[^\d]/g, "") })} placeholder="375291234567" />
      </div>
    </div>
  );
}

function SmtpFields({ config, setConfig }: any) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Прямая отправка по SMTP с вашими кредами. Для hoster.by: <b>mailbe04.hoster.by</b>, порт <b>465</b>, шифрование <b>SSL/TLS</b>.
        Логин — это полный адрес ящика, пароль — пароль почтового ящика.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>SMTP сервер</Label>
          <Input value={config.host ?? ""} onChange={(e) => setConfig({ ...config, host: e.target.value })} placeholder="mailbe04.hoster.by" />
        </div>
        <div className="grid gap-2">
          <Label>Порт</Label>
          <Input type="number" value={config.port ?? 465} onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })} placeholder="465" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={config.secure !== false} onCheckedChange={(v) => setConfig({ ...config, secure: v })} />
        <Label className="cursor-pointer">SSL/TLS (обязательно для порта 465)</Label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>Логин (email)</Label>
          <Input value={config.username ?? ""} onChange={(e) => setConfig({ ...config, username: e.target.value })} placeholder="noreply@вашдомен.by" />
        </div>
        <div className="grid gap-2">
          <Label>Пароль</Label>
          <Input type="password" value={config.password ?? ""} onChange={(e) => setConfig({ ...config, password: e.target.value })} placeholder="••••••••" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-2">
          <Label>Email отправителя (From)</Label>
          <Input value={config.from_email ?? ""} onChange={(e) => setConfig({ ...config, from_email: e.target.value })} placeholder="noreply@вашдомен.by (по умолчанию = логин)" />
        </div>
        <div className="grid gap-2">
          <Label>Имя отправителя</Label>
          <Input value={config.from_name ?? ""} onChange={(e) => setConfig({ ...config, from_name: e.target.value })} placeholder="Assist Portal" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Email получателя</Label>
        <Input type="email" value={config.to_email ?? ""} onChange={(e) => setConfig({ ...config, to_email: e.target.value })} placeholder="user@company.by" />
      </div>
    </div>
  );
}

function WebPushFields() {
  const supported = typeof Notification !== "undefined";
  const [perm, setPerm] = useState<NotificationPermission>(supported ? Notification.permission : "default");
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Браузерные уведомления отображаются нативно в вашей ОС, пока хотя бы одна вкладка портала открыта.
        Конфигурация не требуется — достаточно дать разрешение и сохранить канал.
      </p>
      {!supported && (
        <p className="text-sm text-destructive">Этот браузер не поддерживает Notification API.</p>
      )}
      {supported && (
        <div className="flex items-center gap-3">
          <Badge variant={perm === "granted" ? "default" : perm === "denied" ? "destructive" : "outline"}>
            {perm === "granted" ? "Разрешено" : perm === "denied" ? "Запрещено" : "Не запрошено"}
          </Badge>
          {perm !== "granted" && perm !== "denied" && (
            <Button size="sm" variant="outline" type="button" onClick={async () => {
              const p = await Notification.requestPermission();
              setPerm(p);
            }}>
              Запросить разрешение
            </Button>
          )}
          {perm === "denied" && (
            <span className="text-xs text-muted-foreground">Включите уведомления в настройках браузера для этого сайта.</span>
          )}
        </div>
      )}
    </div>
  );
}
