import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Shield, Plus, Ban, Download, FlaskConical } from "lucide-react";
import { logAudit } from "@/lib/audit";

// portal_url и anon-ключ для строки deploy.conf. anon-ключ публичный (в любом фронте).
const PORTAL_URL = window.location.origin;
const ANON_KEY = (supabase as any).supabaseKey ?? "";

const TARIFFS: { value: string; label: string }[] = [
  { value: "demo", label: "Демо" },
  { value: "basic", label: "Базовая" },
  { value: "extended", label: "Расширенная" },
];
const tariffLabel = (t: string | null) => TARIFFS.find((x) => x.value === t)?.label ?? "—";

interface OrgRow { id: string; name: string }
interface KeyRow {
  id: string; key: string; label: string | null; is_active: boolean;
  max_uses: number | null; used_count: number; expires_at: string | null;
  organization_id: string | null; tariff: string | null; created_at: string;
}

function randomKey(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export default function ManageKeys() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = hasRole("admin");

  const [showCreate, setShowCreate] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [label, setLabel] = useState("");
  const [orgId, setOrgId] = useState<string>("");
  const [tariff, setTariff] = useState("basic");
  const [maxUses, setMaxUses] = useState("50");
  const [expiresDays, setExpiresDays] = useState("");

  const { data: orgs = [] } = useQuery({
    queryKey: ["orgs-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name").order("name");
      if (error) throw error;
      return data as OrgRow[];
    },
  });

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["enrollment-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_enrollment_keys")
        .select("id, key, label, is_active, max_uses, used_count, expires_at, organization_id, tariff, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as KeyRow[];
    },
  });

  const orgName = useMemo(() => {
    const m = new Map(orgs.map((o) => [o.id, o.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [orgs]);

  const demoOrg = useMemo(() => orgs.find((o) => o.name === "Демо-стенд"), [orgs]);

  const openCreate = (demo: boolean) => {
    setDemoMode(demo);
    setLabel(demo ? "Демо " + format(new Date(), "dd.MM") : "");
    setTariff(demo ? "demo" : "basic");
    setMaxUses(demo ? "3" : "50");
    setExpiresDays(demo ? "7" : "");
    setOrgId(demo ? (demoOrg?.id ?? "") : "");
    setShowCreate(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const expires_at = expiresDays
        ? new Date(Date.now() + Number(expiresDays) * 86400_000).toISOString()
        : null;
      const key = randomKey();
      const { error } = await supabase.from("agent_enrollment_keys").insert({
        key,
        label: label || null,
        organization_id: orgId || null,
        tariff,
        max_uses: maxUses ? Number(maxUses) : null,
        used_count: 0,
        is_active: true,
        expires_at,
      });
      if (error) throw error;
      await logAudit({ action: "Создание ключа регистрации", module: "organizations", details: `${label} (${tariffLabel(tariff)})` });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollment-keys"] });
      toast({ title: "Ключ создан" });
      setShowCreate(false);
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_enrollment_keys").update({ is_active: false }).eq("id", id);
      if (error) throw error;
      await logAudit({ action: "Отзыв ключа регистрации", module: "organizations", entityId: id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrollment-keys"] });
      toast({ title: "Ключ отозван" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const downloadDeployConf = (k: KeyRow) => {
    const isDemo = k.tariff === "demo";
    const conf =
`# deploy.conf — параметры установки AP Workstation Agent.
# Положите этот файл РЯДОМ с APAgentSetup-*.exe. Если он есть, мастер не
# спрашивает параметры подключения и берёт их отсюда.
#
# Тихая установка для раскатки по сети:
#   APAgentSetup.exe /SILENT /NORESTART

portal_url=${PORTAL_URL}
anon_key=${ANON_KEY}
enrollment_key=${k.key}

# Профиль сбора: full | standard | minimal
profile=standard

# Срок демонстрационной версии в днях. 0 — обычная установка.
demo_days=${isDemo ? 7 : 0}
`;
    const blob = new Blob([conf], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "deploy.conf"; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "deploy.conf скачан", description: k.label ?? k.key });
  };

  if (!isAdmin) {
    return (
      <div>
        <h1 className="font-heading text-2xl font-bold mb-6">Ключи регистрации</h1>
        <Card><CardContent className="flex flex-col items-center justify-center py-12">
          <Shield className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">Доступ только для администраторов</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-heading text-2xl font-bold">Ключи регистрации</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => openCreate(true)}>
            <FlaskConical className="h-4 w-4 mr-2" />Демо-ключ
          </Button>
          <Button onClick={() => openCreate(false)}>
            <Plus className="h-4 w-4 mr-2" />Создать ключ
          </Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <CardContent className="py-12 text-center">
            <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          </CardContent>
        ) : keys.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-12">
            <KeyRound className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Ключей пока нет</p>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Метка</TableHead>
                <TableHead>Организация</TableHead>
                <TableHead>Тариф</TableHead>
                <TableHead>Использовано</TableHead>
                <TableHead>Срок</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="w-24">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => {
                const expired = k.expires_at ? new Date(k.expires_at) < new Date() : false;
                const exhausted = k.max_uses != null && k.used_count >= k.max_uses;
                return (
                  <TableRow key={k.id} className={!k.is_active ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{k.label || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{orgName(k.organization_id)}</TableCell>
                    <TableCell><Badge variant="secondary">{tariffLabel(k.tariff)}</Badge></TableCell>
                    <TableCell className="text-sm">{k.used_count}{k.max_uses != null ? ` / ${k.max_uses}` : ""}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.expires_at ? format(new Date(k.expires_at), "dd.MM.yyyy") : "бессрочно"}
                    </TableCell>
                    <TableCell>
                      {!k.is_active ? <Badge variant="destructive">Отозван</Badge>
                        : expired ? <Badge variant="destructive">Истёк</Badge>
                        : exhausted ? <Badge variant="destructive">Исчерпан</Badge>
                        : <Badge variant="success">Активен</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="Скачать deploy.conf" onClick={() => downloadDeployConf(k)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {k.is_active && (
                          <Button variant="ghost" size="icon" title="Отозвать" onClick={() => revokeMutation.mutate(k.id)}>
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{demoMode ? "Демо-ключ" : "Новый ключ регистрации"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Метка</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="например, Партия Могилёвэнерго" />
            </div>
            <div className="space-y-2">
              <Label>Организация</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
                <SelectContent>
                  {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Тариф</Label>
              <Select value={tariff} onValueChange={setTariff}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TARIFFS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Лимит установок</Label>
                <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="без лимита" />
              </div>
              <div className="space-y-2">
                <Label>Срок, дней</Label>
                <Input type="number" min="1" value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} placeholder="бессрочно" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Отмена</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !orgId}>
              {createMutation.isPending ? "Создание..." : "Создать"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
