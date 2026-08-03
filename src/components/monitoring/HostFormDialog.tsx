import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { deviceTypeConfig } from "./deviceTypes";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { MonitoredHost } from "./HostManagement";

const DEVICE_TYPES = Object.entries(deviceTypeConfig).map(([value, v]) => ({ value, label: v.label }));

const PROTOCOLS = [
  { value: "Agent", label: "Zabbix Agent" },
  { value: "SNMP", label: "SNMP" },
  { value: "IPMI", label: "IPMI" },
  { value: "SSH", label: "SSH" },
  { value: "HTTP", label: "HTTP" },
  { value: "HTTPS", label: "HTTPS" },
] as const;

type FormValues = {
  name: string;
  ip_address: string;
  device_type: string;
  protocol: string;
  port: string;
  snmp_community: string;
  credentials_login: string;
  credentials_password: string;
  site_id: string;
  enabled: boolean;
  notes: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: MonitoredHost | null;
}

export function HostFormDialog({ open, onOpenChange, host }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!host;

  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      ip_address: "",
      device_type: "server",
      protocol: "Agent",
      port: "",
      snmp_community: "",
      credentials_login: "",
      credentials_password: "",
      site_id: "",
      enabled: true,
      notes: "",
    },
  });

  useEffect(() => {
    if (open && host) {
      form.reset({
        name: host.name,
        ip_address: host.ip_address,
        device_type: host.device_type,
        protocol: host.protocol,
        port: host.port?.toString() || "",
        snmp_community: host.snmp_community || "",
        credentials_login: host.credentials_login || "",
        credentials_password: host.credentials_password || "",
        site_id: host.site_id || "",
        enabled: host.enabled,
        notes: host.notes || "",
      });
    } else if (open) {
      form.reset();
    }
  }, [open, host]);

  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sites").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name,
        ip_address: values.ip_address,
        device_type: values.device_type as any,
        protocol: values.protocol as any,
        port: values.port ? parseInt(values.port) : null,
        snmp_community: values.snmp_community || null,
        credentials_login: values.credentials_login || null,
        credentials_password: values.credentials_password || null,
        site_id: values.site_id && values.site_id !== "none" ? values.site_id : null,
        enabled: values.enabled,
        notes: values.notes || null,
      };

      if (isEdit) {
        const { error } = await supabase
          .from("monitored_hosts")
          .update(payload)
          .eq("id", host!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("monitored_hosts")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitored-hosts"] });
      toast({ title: isEdit ? "Хост обновлён" : "Хост добавлен" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    },
  });

  const deviceType = form.watch("device_type");
  const protocol = form.watch("protocol");

  // Auto-suggest protocol based on device type
  useEffect(() => {
    if (!isEdit) {
      if (deviceType === "bmc") form.setValue("protocol", "IPMI");
      else if (deviceType === "switch" || deviceType === "storage" || deviceType === "ups" || deviceType === "router")
        form.setValue("protocol", "SNMP");
      else if (deviceType === "firewall") form.setValue("protocol", "SNMP");
    }
  }, [deviceType, isEdit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Редактирование хоста" : "Добавить хост"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" rules={{ required: "Обязательное поле" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Имя хоста</FormLabel>
                    <FormControl><Input placeholder="srv-dc1-01" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="ip_address" rules={{ required: "Обязательное поле" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP-адрес</FormLabel>
                    <FormControl><Input placeholder="10.11.12.100" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="device_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Тип устройства</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {DEVICE_TYPES.map((dt) => (
                          <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="protocol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Протокол</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {PROTOCOLS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="port"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Порт</FormLabel>
                    <FormControl><Input type="number" placeholder="Авто" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="site_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ЦОД</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Не указан" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">Не указан</SelectItem>
                        {sites?.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {protocol === "SNMP" && (
              <FormField control={form.control} name="snmp_community"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SNMP Community</FormLabel>
                    <FormControl><Input placeholder="public" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {(protocol === "IPMI" || protocol === "SSH") && (
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="credentials_login"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Логин</FormLabel>
                      <FormControl><Input placeholder="admin" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={form.control} name="credentials_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Пароль</FormLabel>
                      <FormControl><Input type="password" placeholder="••••••" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField control={form.control} name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Заметки</FormLabel>
                  <FormControl><Textarea placeholder="Дополнительная информация..." rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField control={form.control} name="enabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <FormLabel className="!mt-0">Мониторинг включён</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {isEdit ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
