import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatabaseZap, Plus, Trash2, Clock3, Download, BarChart3 } from "lucide-react";

type Collector = {
  id: string; collector_id: string; name: string; organization_id: string | null; is_active: boolean;
  last_seen_at: string | null; last_event_at: string | null; collector_version: string | null;
  organization_name: string | null;
};

const randomHex = (bytes = 24) => Array.from(crypto.getRandomValues(new Uint8Array(bytes))).map((value) => value.toString(16).padStart(2, "0")).join("");
async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}
const isOnline = (value: string | null) => !!value && Date.now() - new Date(value).getTime() < 180_000;

export default function CollectorConnections() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [packageReady, setPackageReady] = useState<{ collector: Pick<Collector, "id" | "collector_id" | "name">; token: string } | null>(null);
  const [telemetryCollector, setTelemetryCollector] = useState<Collector | null>(null);
  const portalApiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => (await supabase.from("organizations").select("id,name").order("name")).data ?? [],
  });
  const { data: collectors = [], isLoading } = useQuery({
    queryKey: ["collector-connections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("list_collector_connections");
      if (error) throw error;
      return (data ?? []) as Collector[];
    },
    refetchInterval: 30_000,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["collector-connections"] });
  const { data: telemetry, isLoading: telemetryLoading } = useQuery({
    queryKey: ["collector-telemetry", telemetryCollector?.id],
    enabled: !!telemetryCollector,
    queryFn: async () => {
      const connectionId = telemetryCollector!.id;
      const [devices, metrics, problems] = await Promise.all([
        (supabase as any).rpc("list_collector_devices", { _collector_connection_id: connectionId }),
        (supabase as any).rpc("list_collector_metric_values", { _collector_connection_id: connectionId }),
        (supabase as any).rpc("list_collector_problems", { _collector_connection_id: connectionId }),
      ]);
      if (devices.error) throw devices.error;
      if (metrics.error) throw metrics.error;
      if (problems.error) throw problems.error;
      return { devices: devices.data ?? [], metrics: metrics.data ?? [], problems: problems.data ?? [] };
    },
    refetchInterval: 15_000,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("delete_collector_connection", { _id: id });
      if (error) throw error;
    }, onSuccess: () => { refresh(); toast({ title: "Коллектор удалён" }); },
    onError: (error: any) => toast({ title: "Не удалось удалить", description: error.message, variant: "destructive" }),
  });

  const downloadPackage = async (collector: Pick<Collector, "collector_id" | "name">, bootstrapToken: string) => {
    const response = await fetch("/collector-ca.crt", { cache: "no-store" });
    if (!response.ok) throw new Error("Не удалось получить сертификат CA с портала");
    const caCertificate = await response.text();
    if (!caCertificate.includes("-----BEGIN CERTIFICATE-----")) throw new Error("Портал вернул некорректный сертификат CA");
    if (!portalApiKey) throw new Error("В сборке портала отсутствует публичный API-ключ");
    const payload = {
      format: "acro-collector-connection",
      version: 1,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      portal_url: window.location.origin,
      collector_id: collector.collector_id,
      collector_name: collector.name,
      bootstrap_token: bootstrapToken,
      portal_api_key: portalApiKey,
      ca_certificate: caCertificate,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `acro-collector-${collector.collector_id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const issuePackage = async (collector: Collector) => {
    if (!confirm(`Выпустить новый файл для «${collector.name}»? Старый неиспользованный файл станет недействителен через 24 часа.`)) return;
    try {
      const token = randomHex(32);
      const { error } = await (supabase as any).rpc("issue_collector_bootstrap", { _id: collector.id, _token_hash: await tokenHash(token) });
      if (error) throw error;
      await downloadPackage(collector, token);
      toast({ title: "Файл подключения скачан", description: "Загрузите его в ACRO Collector в разделе «Подключение к порталу»." });
      refresh();
    } catch (error: any) {
      toast({ title: "Не удалось выпустить файл", description: error.message, variant: "destructive" });
    }
  };

  const create = async () => {
    if (!name.trim()) return toast({ title: "Укажите название коллектора", variant: "destructive" });
    try {
      const collectorId = `collector_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const token = randomHex(32);
      const { data: id, error } = await (supabase as any).rpc("create_collector_connection", {
        _collector_id: collectorId, _name: name.trim(), _organization_id: organizationId || null, _token_hash: await tokenHash(token),
      });
      if (error) throw error;
      setCreateOpen(false); setPackageReady({ collector: { id, collector_id: collectorId, name: name.trim() }, token }); setName(""); setOrganizationId(""); refresh();
    } catch (error: any) { toast({ title: "Не удалось создать коллектор", description: error.message, variant: "destructive" }); }
  };
  const updateOrganization = async (collector: Collector, value: string) => {
    const { error } = await (supabase as any).rpc("set_collector_organization", { _id: collector.id, _organization_id: value || null });
    if (error) toast({ title: "Не удалось изменить организацию", description: error.message, variant: "destructive" }); else refresh();
  };
  return <>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle className="text-base flex items-center gap-2"><DatabaseZap className="h-4 w-4 text-primary" /> Коллекторы ACRO</CardTitle><CardDescription className="mt-1">Локальные коллекторы заказчиков. Привязка к организации определяет контекст будущих метрик и проблем.</CardDescription></div>
        <div className="flex gap-2"><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Новый коллектор</Button></div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : collectors.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Коллекторов ещё нет. Создайте коллектор, скачайте файл подключения и загрузите его на локальном ACRO Collector.</p> : <div className="space-y-3">{collectors.map((collector) => {
          const online = isOnline(collector.last_seen_at);
          return <div key={collector.id} className="rounded-lg border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground"}`} /><b>{collector.name}</b><Badge variant={collector.is_active ? "secondary" : "destructive"}>{collector.is_active ? online ? "На связи" : "Ожидание связи" : "Отключён"}</Badge></div><div className="mt-1 text-xs font-mono text-muted-foreground truncate">{collector.collector_id}</div><div className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><Clock3 className="h-3 w-3" />{collector.last_seen_at ? `Последняя связь: ${new Date(collector.last_seen_at).toLocaleString("ru-RU")}` : "Ещё не подключался"}{collector.collector_version ? ` · ${collector.collector_version}` : ""}</div></div><div className="flex items-center gap-2"><select className="h-9 max-w-52 rounded-md border bg-background px-2 text-sm" value={collector.organization_id ?? ""} onChange={(event) => updateOrganization(collector, event.target.value)}><option value="">Без организации</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select><Button size="sm" variant="outline" title="Скачать одноразовый файл подключения" onClick={() => issuePackage(collector)}><Download className="h-4 w-4 mr-2" />Настройки</Button><Button size="sm" variant="outline" title="Устройства и последние данные" onClick={() => setTelemetryCollector(collector)}><BarChart3 className="h-4 w-4 mr-2" />Данные</Button><Button size="icon" variant="ghost" className="text-destructive" title="Удалить" onClick={() => confirm(`Удалить коллектор «${collector.name}»?`) && remove.mutate(collector.id)}><Trash2 className="h-4 w-4" /></Button></div></div>;
        })}</div>}
      </CardContent>
    </Card>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Новый коллектор</DialogTitle><DialogDescription>После создания будет сформирован одноразовый файл подключения. В нём уже будут CA-сертификат и параметры безопасной активации.</DialogDescription></DialogHeader><div className="space-y-3"><div><Label>Название *</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Коллектор Брестэнерго" /></div><div><Label>Организация</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Привязать позднее</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button><Button onClick={create}>Создать</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!telemetryCollector} onOpenChange={(open) => !open && setTelemetryCollector(null)}><DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Данные коллектора: {telemetryCollector?.name}</DialogTitle><DialogDescription>Устройства, последние значения и проблемы, переданные локальным коллектором.</DialogDescription></DialogHeader>{telemetryLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Загрузка данных…</p> : <div className="space-y-6"><div className="grid gap-3 md:grid-cols-3"><Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Устройства</div><b className="text-2xl">{telemetry?.devices.length ?? 0}</b></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Последние метрики</div><b className="text-2xl">{telemetry?.metrics.length ?? 0}</b></CardContent></Card><Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Активные проблемы</div><b className="text-2xl">{telemetry?.problems.filter((problem: any) => problem.is_active).length ?? 0}</b></CardContent></Card></div><section><h3 className="mb-2 font-semibold">Устройства</h3><Table><TableHeader><TableRow><TableHead>Имя</TableHead><TableHead>Адрес</TableHead><TableHead>Протокол</TableHead><TableHead>Статус</TableHead><TableHead>Метрики</TableHead><TableHead>Последние данные</TableHead></TableRow></TableHeader><TableBody>{telemetry?.devices.map((device: any) => <TableRow key={device.id}><TableCell className="font-medium">{device.name}</TableCell><TableCell>{device.address || "—"}</TableCell><TableCell>{device.protocol || "—"}</TableCell><TableCell><Badge variant={device.status === "available" ? "secondary" : "destructive"}>{device.status}</Badge></TableCell><TableCell>{device.metric_count}</TableCell><TableCell>{device.last_metric_at ? new Date(device.last_metric_at).toLocaleString("ru-RU") : "—"}</TableCell></TableRow>)}</TableBody></Table></section><section><h3 className="mb-2 font-semibold">Последние значения</h3><Table><TableHeader><TableRow><TableHead>Устройство</TableHead><TableHead>Метрика</TableHead><TableHead>Ключ</TableHead><TableHead>Значение</TableHead><TableHead>Проверка</TableHead></TableRow></TableHeader><TableBody>{telemetry?.metrics.map((metric: any) => <TableRow key={`${metric.device_name}-${metric.item_key}`}><TableCell>{metric.device_name}</TableCell><TableCell>{metric.name}</TableCell><TableCell className="font-mono text-xs">{metric.item_key}</TableCell><TableCell className={metric.error ? "text-destructive" : ""}>{metric.error || `${metric.value ?? "—"}${metric.units ? ` ${metric.units}` : ""}`}</TableCell><TableCell>{new Date(metric.collected_at).toLocaleString("ru-RU")}</TableCell></TableRow>)}</TableBody></Table></section><section><h3 className="mb-2 font-semibold">Проблемы</h3><Table><TableHeader><TableRow><TableHead>Устройство</TableHead><TableHead>Описание</TableHead><TableHead>Важность</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader><TableBody>{telemetry?.problems.map((problem: any, index: number) => <TableRow key={`${problem.device_name}-${problem.opened_at}-${index}`}><TableCell>{problem.device_name}</TableCell><TableCell>{problem.description}</TableCell><TableCell>{problem.severity}</TableCell><TableCell><Badge variant={problem.is_active ? "destructive" : "secondary"}>{problem.is_active ? "Активна" : "Закрыта"}</Badge></TableCell></TableRow>)}</TableBody></Table></section></div>}</DialogContent></Dialog>
    <Dialog open={!!packageReady} onOpenChange={(open) => !open && setPackageReady(null)}><DialogContent><DialogHeader><DialogTitle>Файл подключения готов</DialogTitle><DialogDescription>Скачайте один файл и загрузите его на локальном ACRO Collector. Он содержит CA-сертификат, публичный API-ключ и одноразовый токен активации.</DialogDescription></DialogHeader><div className="space-y-3"><p className="text-xs text-muted-foreground">Файл действует 24 часа и становится недействительным сразу после успешной активации. Не передавайте его третьим лицам.</p><DialogFooter><Button variant="outline" onClick={() => setPackageReady(null)}>Закрыть</Button><Button onClick={async () => { try { if (packageReady) await downloadPackage(packageReady.collector, packageReady.token); toast({ title: "Файл подключения скачан" }); } catch (error: any) { toast({ title: "Не удалось скачать файл", description: error.message, variant: "destructive" }); } }}><Download className="mr-2 h-4 w-4" />Скачать настройки</Button></DialogFooter></div></DialogContent></Dialog>
  </>;
}
