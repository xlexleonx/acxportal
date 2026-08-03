import { useState, useEffect, useMemo } from "react";
import { deviceTypeConfig } from "./deviceTypes";
import { invokeZabbix } from "@/lib/zabbix-invoke";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ChevronLeft, ChevronRight, Check, AlertCircle } from "lucide-react";
import { logAudit } from "@/lib/audit";

const DEVICE_TYPES = Object.entries(deviceTypeConfig).map(([value, v]) => ({ value, label: v.label }));

interface ProtocolConfig {
  agent?: { enabled: boolean; port: string };
  snmp?: { enabled: boolean; version: string; community: string; port: string };
  ipmi?: { enabled: boolean; username: string; password: string; port: string };
  ssh?: { enabled: boolean; username: string; password: string; port: string; use_ipmitool: boolean };
}

interface WizardData {
  name: string;
  visible_name: string;
  ip_address: string;
  device_type: string;
  host_group: string;
  site_id: string;
  enabled: boolean;
  notes: string;
  protocols: ProtocolConfig;
  selected_templates: string[];
  push_to_zabbix: boolean;
}

const initialData: WizardData = {
  name: "",
  visible_name: "",
  ip_address: "",
  device_type: "server",
  host_group: "",
  site_id: "",
  enabled: true,
  notes: "",
  protocols: {
    agent: { enabled: true, port: "10050" },
    snmp: { enabled: false, version: "2c", community: "public", port: "161" },
    ipmi: { enabled: false, username: "", password: "", port: "623" },
    ssh: { enabled: false, username: "", password: "", port: "22", use_ipmitool: false },
  },
  selected_templates: [],
  push_to_zabbix: true,
};

function getRecommendedTemplates(deviceType: string, protocols: ProtocolConfig): string[] {
  const recs: string[] = [];
  if (deviceType === "server") {
    if (protocols.agent?.enabled) recs.push("Linux by Zabbix agent", "ICMP Ping");
    if (protocols.ipmi?.enabled) recs.push("Generic IPMI");
    if (protocols.ssh?.enabled) recs.push("Linux by SSH");
  } else if (deviceType === "bmc") {
    recs.push("Generic IPMI", "ICMP Ping");
  } else if (deviceType === "switch" || deviceType === "router") {
    recs.push("Network Generic SNMP", "ICMP Ping");
  } else if (deviceType === "storage") {
    recs.push("Storage SNMP", "ICMP Ping");
  } else if (deviceType === "ups") {
    recs.push("UPS SNMP");
  }
  return recs;
}

function getTzCoverageHints(deviceType: string, protocols: ProtocolConfig): { code: string; title: string }[] {
  const hints: { code: string; title: string }[] = [];
  if (deviceType === "bmc" || protocols.ipmi?.enabled) {
    hints.push({ code: "128", title: "Проверка статуса оборудования через iBMC (температуры, питание, вентиляторы)" });
    hints.push({ code: "131", title: "Проверка статуса S.M.A.R.T. системных дисков" });
  }
  if (protocols.agent?.enabled || protocols.ssh?.enabled) {
    hints.push({ code: "133", title: "Проверка синхронизации времени хостов (NTP)" });
    hints.push({ code: "134", title: "Проверка загрузки CPU и памяти" });
  }
  if (protocols.snmp?.enabled && (deviceType === "switch" || deviceType === "router")) {
    hints.push({ code: "150", title: "Контроль состояния портов и трафика" });
  }
  return hints;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HostWizardDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(initialData);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setData(initialData);
      setTestResult(null);
    }
  }, [open]);

  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data } = await supabase.from("sites").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: zbxGroups } = useQuery({
    queryKey: ["zabbix", "getHostGroups"],
    queryFn: async () => {
      const { data } = await invokeZabbix( { body: { action: "getHostGroups" } });
      return (data?.result as { groupid: string; name: string }[]) || [];
    },
    enabled: open,
  });

  const { data: zbxTemplates } = useQuery({
    queryKey: ["zabbix", "getTemplates"],
    queryFn: async () => {
      const { data } = await invokeZabbix( { body: { action: "getTemplates" } });
      return (data?.result as { templateid: string; name: string }[]) || [];
    },
    enabled: open && step >= 3,
  });

  const recommendedTemplates = useMemo(
    () => getRecommendedTemplates(data.device_type, data.protocols),
    [data.device_type, data.protocols],
  );

  const tzHints = useMemo(
    () => getTzCoverageHints(data.device_type, data.protocols),
    [data.device_type, data.protocols],
  );

  const filteredTemplates = useMemo(() => {
    if (!zbxTemplates) return [];
    return zbxTemplates.filter((t) =>
      recommendedTemplates.some((r) => t.name.toLowerCase().includes(r.toLowerCase().split(" ")[0])),
    );
  }, [zbxTemplates, recommendedTemplates]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: resp, error } = await invokeZabbix( {
        body: { action: "testConnection" },
      });
      if (error) throw error;
      if (resp?.ok) {
        setTestResult({ ok: true, message: `Zabbix ${resp.data?.version} доступен. Готов к созданию хоста.` });
      } else {
        setTestResult({ ok: false, message: resp?.message || "Не удалось подключиться к Zabbix" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestResult({ ok: false, message: msg });
    } finally {
      setTesting(false);
    }
  };

  const finishMutation = useMutation({
    mutationFn: async () => {
      // Determine main protocol (first enabled)
      const mainProto =
        data.protocols.agent?.enabled ? "Agent"
        : data.protocols.snmp?.enabled ? "SNMP"
        : data.protocols.ipmi?.enabled ? "IPMI"
        : data.protocols.ssh?.enabled ? "SSH" : "Agent";

      let zabbix_host_id: string | null = null;

      if (data.push_to_zabbix) {
        const { data: zRes, error: zErr } = await invokeZabbix( {
          body: {
            action: "createHost",
            params: {
              name: data.name,
              visible_name: data.visible_name || data.name,
              ip: data.ip_address,
              port: data.protocols.agent?.port || data.protocols.snmp?.port || "10050",
              group_name: data.host_group || "Discovered hosts",
              templates: data.selected_templates,
              protocol_type: mainProto,
            },
          },
        });
        if (zErr) throw zErr;
        if (zRes?.error) throw new Error(zRes.error);
        zabbix_host_id = zRes?.result?.hostids?.[0] || null;
      }

      const { error } = await supabase.from("monitored_hosts").insert({
        name: data.name,
        visible_name: data.visible_name || null,
        ip_address: data.ip_address,
        device_type: data.device_type as "server",
        protocol: mainProto as "Agent",
        port: data.protocols.agent?.port ? parseInt(data.protocols.agent.port) : null,
        snmp_community: data.protocols.snmp?.community || null,
        credentials_login: data.protocols.ipmi?.username || data.protocols.ssh?.username || null,
        credentials_password: data.protocols.ipmi?.password || data.protocols.ssh?.password || null,
        site_id: data.site_id && data.site_id !== "none" ? data.site_id : null,
        host_group: data.host_group || null,
        protocols_config: data.protocols as never,
        templates: data.selected_templates as never,
        zabbix_host_id,
        enabled: data.enabled,
        notes: data.notes || null,
      });
      if (error) throw error;

      // Auto-create TZ coverage hints
      if (tzHints.length > 0) {
        const { data: reqs } = await supabase
          .from("tz_requirements")
          .select("id, code")
          .in("code", tzHints.map((h) => h.code));
        if (reqs && reqs.length > 0) {
          const { data: hostRow } = await supabase
            .from("monitored_hosts")
            .select("id")
            .eq("name", data.name)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (hostRow) {
            await supabase.from("tz_coverage").insert(
              reqs.map((r) => ({
                requirement_id: r.id,
                host_id: hostRow.id,
                status: "covered",
                notes: "Автоматически назначено мастером добавления хоста",
              })),
            );
          }
        }
      }

      await logAudit({
        action: "Добавление хоста мониторинга",
        module: "monitoring",
        details: `${data.name} (${data.ip_address}, протокол ${mainProto})`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitored-hosts"] });
      qc.invalidateQueries({ queryKey: ["zabbix"] });
      qc.invalidateQueries({ queryKey: ["tz-coverage"] });
      toast({ title: "Хост успешно добавлен" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const canNext = () => {
    if (step === 1) return data.name.trim() && data.ip_address.trim();
    if (step === 2) return Object.values(data.protocols).some((p) => p?.enabled);
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Мастер добавления хоста — Шаг {step} из 5</DialogTitle>
          <DialogDescription>
            {step === 1 && "Базовая информация о хосте"}
            {step === 2 && "Выбор протоколов сбора данных"}
            {step === 3 && "Шаблоны мониторинга Zabbix"}
            {step === 4 && "Соответствие пунктам регламента"}
            {step === 5 && "Проверка и добавление"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="flex gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded ${s <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        {/* STEP 1: Basic info */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Имя хоста *</Label>
                <Input
                  placeholder="srv-dc1-01"
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Видимое имя</Label>
                <Input
                  placeholder="Сервер БД №1"
                  value={data.visible_name}
                  onChange={(e) => setData({ ...data, visible_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>IP-адрес *</Label>
                <Input
                  placeholder="10.11.12.100"
                  value={data.ip_address}
                  onChange={(e) => setData({ ...data, ip_address: e.target.value })}
                />
              </div>
              <div>
                <Label>Тип устройства</Label>
                <Select value={data.device_type} onValueChange={(v) => setData({ ...data, device_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEVICE_TYPES.map((dt) => (
                      <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Группа узлов Zabbix</Label>
                <Select value={data.host_group} onValueChange={(v) => setData({ ...data, host_group: v })}>
                  <SelectTrigger><SelectValue placeholder="Выберите или введите" /></SelectTrigger>
                  <SelectContent>
                    {zbxGroups?.map((g) => (
                      <SelectItem key={g.groupid} value={g.name}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="mt-1"
                  placeholder="…или новая группа"
                  value={data.host_group}
                  onChange={(e) => setData({ ...data, host_group: e.target.value })}
                />
              </div>
              <div>
                <Label>ЦОД</Label>
                <Select value={data.site_id} onValueChange={(v) => setData({ ...data, site_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Не указан" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не указан</SelectItem>
                    {sites?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Заметки</Label>
              <Textarea
                rows={2}
                value={data.notes}
                onChange={(e) => setData({ ...data, notes: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* STEP 2: Protocols */}
        {step === 2 && (
          <div className="space-y-3">
            {/* Agent */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Zabbix Agent</p>
                    <p className="text-xs text-muted-foreground">Стандартный агент Zabbix</p>
                  </div>
                  <Switch
                    checked={data.protocols.agent?.enabled}
                    onCheckedChange={(v) => setData({
                      ...data,
                      protocols: { ...data.protocols, agent: { ...data.protocols.agent!, enabled: v } },
                    })}
                  />
                </div>
                {data.protocols.agent?.enabled && (
                  <Input
                    placeholder="Порт (10050)"
                    value={data.protocols.agent.port}
                    onChange={(e) => setData({
                      ...data,
                      protocols: { ...data.protocols, agent: { ...data.protocols.agent!, port: e.target.value } },
                    })}
                  />
                )}
              </CardContent>
            </Card>

            {/* SNMP */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">SNMP</p>
                    <p className="text-xs text-muted-foreground">Сетевые устройства, СХД</p>
                  </div>
                  <Switch
                    checked={data.protocols.snmp?.enabled}
                    onCheckedChange={(v) => setData({
                      ...data,
                      protocols: { ...data.protocols, snmp: { ...data.protocols.snmp!, enabled: v } },
                    })}
                  />
                </div>
                {data.protocols.snmp?.enabled && (
                  <div className="grid grid-cols-3 gap-2">
                    <Select
                      value={data.protocols.snmp.version}
                      onValueChange={(v) => setData({
                        ...data,
                        protocols: { ...data.protocols, snmp: { ...data.protocols.snmp!, version: v } },
                      })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2c">v2c</SelectItem>
                        <SelectItem value="3">v3</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Community"
                      value={data.protocols.snmp.community}
                      onChange={(e) => setData({
                        ...data,
                        protocols: { ...data.protocols, snmp: { ...data.protocols.snmp!, community: e.target.value } },
                      })}
                    />
                    <Input
                      placeholder="Порт"
                      value={data.protocols.snmp.port}
                      onChange={(e) => setData({
                        ...data,
                        protocols: { ...data.protocols, snmp: { ...data.protocols.snmp!, port: e.target.value } },
                      })}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* IPMI */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">IPMI</p>
                    <p className="text-xs text-muted-foreground">BMC, iBMC (Huawei)</p>
                  </div>
                  <Switch
                    checked={data.protocols.ipmi?.enabled}
                    onCheckedChange={(v) => setData({
                      ...data,
                      protocols: { ...data.protocols, ipmi: { ...data.protocols.ipmi!, enabled: v } },
                    })}
                  />
                </div>
                {data.protocols.ipmi?.enabled && (
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="Логин"
                      value={data.protocols.ipmi.username}
                      onChange={(e) => setData({
                        ...data,
                        protocols: { ...data.protocols, ipmi: { ...data.protocols.ipmi!, username: e.target.value } },
                      })}
                    />
                    <Input
                      type="password"
                      placeholder="Пароль"
                      value={data.protocols.ipmi.password}
                      onChange={(e) => setData({
                        ...data,
                        protocols: { ...data.protocols, ipmi: { ...data.protocols.ipmi!, password: e.target.value } },
                      })}
                    />
                    <Input
                      placeholder="Порт (623)"
                      value={data.protocols.ipmi.port}
                      onChange={(e) => setData({
                        ...data,
                        protocols: { ...data.protocols, ipmi: { ...data.protocols.ipmi!, port: e.target.value } },
                      })}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SSH */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">SSH</p>
                    <p className="text-xs text-muted-foreground">Скрипты, ipmitool через SSH</p>
                  </div>
                  <Switch
                    checked={data.protocols.ssh?.enabled}
                    onCheckedChange={(v) => setData({
                      ...data,
                      protocols: { ...data.protocols, ssh: { ...data.protocols.ssh!, enabled: v } },
                    })}
                  />
                </div>
                {data.protocols.ssh?.enabled && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="Логин"
                        value={data.protocols.ssh.username}
                        onChange={(e) => setData({
                          ...data,
                          protocols: { ...data.protocols, ssh: { ...data.protocols.ssh!, username: e.target.value } },
                        })}
                      />
                      <Input
                        type="password"
                        placeholder="Пароль"
                        value={data.protocols.ssh.password}
                        onChange={(e) => setData({
                          ...data,
                          protocols: { ...data.protocols, ssh: { ...data.protocols.ssh!, password: e.target.value } },
                        })}
                      />
                      <Input
                        placeholder="Порт (22)"
                        value={data.protocols.ssh.port}
                        onChange={(e) => setData({
                          ...data,
                          protocols: { ...data.protocols, ssh: { ...data.protocols.ssh!, port: e.target.value } },
                        })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="ipmitool"
                        checked={data.protocols.ssh.use_ipmitool}
                        onCheckedChange={(v) => setData({
                          ...data,
                          protocols: { ...data.protocols, ssh: { ...data.protocols.ssh!, use_ipmitool: !!v } },
                        })}
                      />
                      <Label htmlFor="ipmitool" className="text-xs">Использовать ipmitool через SSH для сенсоров</Label>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 3: Templates */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Рекомендованные шаблоны для типа «{DEVICE_TYPES.find((d) => d.value === data.device_type)?.label}»:
            </p>
            <div className="flex flex-wrap gap-2">
              {recommendedTemplates.map((r) => (
                <Badge key={r} variant="secondary">{r}</Badge>
              ))}
            </div>
            <div className="border rounded-md max-h-72 overflow-y-auto p-2 space-y-1">
              {!zbxTemplates ? (
                <p className="text-center py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Загрузка шаблонов из Zabbix...
                </p>
              ) : filteredTemplates.length === 0 && zbxTemplates.length > 0 ? (
                <p className="text-xs text-muted-foreground p-2">
                  Подходящих шаблонов не найдено. Все доступные шаблоны:
                </p>
              ) : null}
              {(filteredTemplates.length > 0 ? filteredTemplates : zbxTemplates || []).slice(0, 50).map((t) => (
                <div key={t.templateid} className="flex items-center gap-2 p-1 hover:bg-muted/50 rounded">
                  <Checkbox
                    id={`tpl-${t.templateid}`}
                    checked={data.selected_templates.includes(t.templateid)}
                    onCheckedChange={(v) => {
                      const sel = v
                        ? [...data.selected_templates, t.templateid]
                        : data.selected_templates.filter((x) => x !== t.templateid);
                      setData({ ...data, selected_templates: sel });
                    }}
                  />
                  <Label htmlFor={`tpl-${t.templateid}`} className="text-sm cursor-pointer flex-1">{t.name}</Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: TZ coverage */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              При сохранении хост будет автоматически связан со следующими пунктами ТЗ:
            </p>
            {tzHints.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Не удалось определить пункты регламента автоматически.
                  Свяжите вручную через вкладку «Покрытие регламента».
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {tzHints.map((h) => (
                  <Card key={h.code}>
                    <CardContent className="py-3 flex items-start gap-3">
                      <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">п. {h.code}</p>
                        <p className="text-xs text-muted-foreground">{h.title}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 5: Review & test */}
        {step === 5 && (
          <div className="space-y-4">
            <Card>
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Имя:</span><span className="font-medium">{data.name}</span>
                  <span className="text-muted-foreground">IP:</span><span className="font-mono">{data.ip_address}</span>
                  <span className="text-muted-foreground">Тип:</span><span>{DEVICE_TYPES.find((d) => d.value === data.device_type)?.label}</span>
                  <span className="text-muted-foreground">Группа:</span><span>{data.host_group || "—"}</span>
                  <span className="text-muted-foreground">Протоколы:</span>
                  <span className="flex flex-wrap gap-1">
                    {Object.entries(data.protocols).filter(([_, v]) => v?.enabled).map(([k]) => (
                      <Badge key={k} variant="outline" className="text-xs uppercase">{k}</Badge>
                    ))}
                  </span>
                  <span className="text-muted-foreground">Шаблонов:</span><span>{data.selected_templates.length}</span>
                  <span className="text-muted-foreground">Пунктов ТЗ:</span><span>{tzHints.length}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm">Создать в Zabbix через API</Label>
                <p className="text-xs text-muted-foreground">Если выключено — только локальная запись в портале</p>
              </div>
              <Switch
                checked={data.push_to_zabbix}
                onCheckedChange={(v) => setData({ ...data, push_to_zabbix: v })}
              />
            </div>

            <Button variant="outline" onClick={handleTest} disabled={testing} className="w-full">
              {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Проверить связь с Zabbix
            </Button>

            {testResult && (
              <Card className={testResult.ok ? "border-green-500/50 bg-green-500/5" : "border-destructive/50 bg-destructive/5"}>
                <CardContent className="py-3 flex items-start gap-2">
                  {testResult.ok ? (
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  )}
                  <p className="text-sm">{testResult.message}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <Button
            variant="ghost"
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />Назад
          </Button>
          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Далее<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => finishMutation.mutate()} disabled={finishMutation.isPending}>
              {finishMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Добавить хост
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
