import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatabaseZap, Plus, Trash2, Copy, CheckCircle2, Clock3, Download } from "lucide-react";

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
  const [credentials, setCredentials] = useState<{ id: string; token: string; name: string; portalUrl: string } | null>(null);

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
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("delete_collector_connection", { _id: id });
      if (error) throw error;
    }, onSuccess: () => { refresh(); toast({ title: "Коллектор удалён" }); },
    onError: (error: any) => toast({ title: "Не удалось удалить", description: error.message, variant: "destructive" }),
  });
  const create = async () => {
    if (!name.trim()) return toast({ title: "Укажите название коллектора", variant: "destructive" });
    try {
      const collectorId = `collector_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const token = randomHex(32);
      const { error } = await (supabase as any).rpc("create_collector_connection", {
        _collector_id: collectorId, _name: name.trim(), _organization_id: organizationId || null, _token_hash: await tokenHash(token),
      });
      if (error) throw error;
      setCreateOpen(false); setCredentials({ id: collectorId, token, name: name.trim(), portalUrl: window.location.origin }); setName(""); setOrganizationId(""); refresh();
    } catch (error: any) { toast({ title: "Не удалось создать коллектор", description: error.message, variant: "destructive" }); }
  };
  const updateOrganization = async (collector: Collector, value: string) => {
    const { error } = await (supabase as any).rpc("set_collector_organization", { _id: collector.id, _organization_id: value || null });
    if (error) toast({ title: "Не удалось изменить организацию", description: error.message, variant: "destructive" }); else refresh();
  };
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); toast({ title: "Скопировано" }); };

  return <>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle className="text-base flex items-center gap-2"><DatabaseZap className="h-4 w-4 text-primary" /> Коллекторы ACROTIX</CardTitle><CardDescription className="mt-1">Локальные коллекторы заказчиков. Привязка к организации определяет контекст будущих метрик и проблем.</CardDescription></div>
        <div className="flex gap-2"><Button asChild variant="outline"><a href="/collector-ca.crt" download><Download className="h-4 w-4 mr-2" />Сертификат CA</a></Button><Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Новый коллектор</Button></div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Загрузка…</p> : collectors.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Коллекторов ещё нет. Создайте подключение и укажите выданные параметры на локальном коллекторе.</p> : <div className="space-y-3">{collectors.map((collector) => {
          const online = isOnline(collector.last_seen_at);
          return <div key={collector.id} className="rounded-lg border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-500" : "bg-muted-foreground"}`} /><b>{collector.name}</b><Badge variant={collector.is_active ? "secondary" : "destructive"}>{collector.is_active ? online ? "На связи" : "Ожидание связи" : "Отключён"}</Badge></div><div className="mt-1 text-xs font-mono text-muted-foreground truncate">{collector.collector_id}</div><div className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><Clock3 className="h-3 w-3" />{collector.last_seen_at ? `Последняя связь: ${new Date(collector.last_seen_at).toLocaleString("ru-RU")}` : "Ещё не подключался"}{collector.collector_version ? ` · ${collector.collector_version}` : ""}</div></div><div className="flex items-center gap-2"><select className="h-9 max-w-52 rounded-md border bg-background px-2 text-sm" value={collector.organization_id ?? ""} onChange={(event) => updateOrganization(collector, event.target.value)}><option value="">Без организации</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select><Button size="icon" variant="ghost" className="text-destructive" title="Удалить" onClick={() => confirm(`Удалить коллектор «${collector.name}»?`) && remove.mutate(collector.id)}><Trash2 className="h-4 w-4" /></Button></div></div>;
        })}</div>}
      </CardContent>
    </Card>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent><DialogHeader><DialogTitle>Новый коллектор</DialogTitle><DialogDescription>Будет создан уникальный идентификатор и токен. Токен показывается один раз.</DialogDescription></DialogHeader><div className="space-y-3"><div><Label>Название *</Label><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Коллектор Брестэнерго" /></div><div><Label>Организация</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Привязать позднее</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Отмена</Button><Button onClick={create}>Создать</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!credentials} onOpenChange={(open) => !open && setCredentials(null)}><DialogContent><DialogHeader><DialogTitle>Параметры подключения</DialogTitle><DialogDescription>Сохраните токен сейчас: после закрытия окна он не отображается в портале.</DialogDescription></DialogHeader><div className="space-y-3"><div><Label>URL портала</Label><div className="flex gap-2"><Input readOnly value={credentials?.portalUrl ?? ""} /><Button variant="outline" size="icon" onClick={() => copy(credentials?.portalUrl ?? "")}><Copy className="h-4 w-4" /></Button></div></div><div><Label>Идентификатор коллектора</Label><div className="flex gap-2"><Input readOnly value={credentials?.id ?? ""} /><Button variant="outline" size="icon" onClick={() => copy(credentials?.id ?? "")}><Copy className="h-4 w-4" /></Button></div></div><div><Label>Токен синхронизации</Label><div className="flex gap-2"><Textarea readOnly value={credentials?.token ?? ""} className="min-h-20 font-mono text-xs" /><Button variant="outline" size="icon" onClick={() => copy(credentials?.token ?? "")}><Copy className="h-4 w-4" /></Button></div></div><p className="text-xs text-muted-foreground">Скачайте «Сертификат CA» выше. На коллекторе откройте <b>Система → Синхронизация</b>, нажмите «Подключить портал» и внесите URL, ID, токен и сертификат. Редактирование и удаление подключения выполняются там же — без CLI.</p><DialogFooter><Button onClick={() => setCredentials(null)}><CheckCircle2 className="mr-2 h-4 w-4" />Сохранил</Button></DialogFooter></div></DialogContent></Dialog>
  </>;
}
