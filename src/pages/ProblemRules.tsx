import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Shield, SlidersHorizontal, Trash2 } from "lucide-react";

const KIND_LABEL: Record<string, string> = { offline: "Агент офлайн", disk: "Заполнение диска", cpu: "Загрузка CPU", event: "События Windows" };
const KIND_UNIT: Record<string, string> = { offline: "мин", disk: "%", cpu: "%", event: "" };
const ACTIONS = [{ v: "alert", l: "Алерт" }, { v: "warn", l: "Только предупреждение" }, { v: "ignore", l: "Игнорировать" }];

export default function ProblemRules() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = hasRole("admin") || hasRole("engineer");

  const { data: rules = [] } = useQuery({
    queryKey: ["agent-problem-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_problem_rules").select("*").order("kind").order("agent_id", { nullsFirst: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const save = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await supabase.from("agent_problem_rules").update({
        enabled: r.enabled, action: r.action, warning_value: r.warning_value, critical_value: r.critical_value, note: r.note, updated_at: new Date().toISOString(),
      }).eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agent-problem-rules"] }); qc.invalidateQueries({ queryKey: ["agent-problems"] }); toast({ title: "Сохранено" }); },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("agent_problem_rules").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agent-problem-rules"] }); qc.invalidateQueries({ queryKey: ["agent-problems"] }); toast({ title: "Исключение удалено" }); },
  });

  const [local, setLocal] = useState<Record<string, any>>({});
  const val = (r: any, f: string) => (local[r.id]?.[f] ?? r[f]);
  const set = (r: any, f: string, v: any) => setLocal((s) => ({ ...s, [r.id]: { ...s[r.id], [f]: v } }));
  const rowChanged = (r: any) => local[r.id] && Object.keys(local[r.id]).some((k) => local[r.id][k] !== r[k]);

  if (!isAdmin) return (
    <div><h1 className="font-heading text-2xl font-bold mb-6">Правила проблем агентов</h1>
      <Card><CardContent className="flex flex-col items-center py-12"><Shield className="h-12 w-12 text-muted-foreground/40 mb-4" /><p className="text-muted-foreground">Только для операторов</p></CardContent></Card></div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-5 w-5 text-primary" />
        <h1 className="font-heading text-2xl font-bold">Правила проблем агентов</h1>
      </div>
      <p className="text-sm text-muted-foreground">Пороги и реакция на проблемы от агентов. Строки без агента — правило по умолчанию для вида; с агентом — исключение для конкретной машины.</p>
      <Card><Table>
        <TableHeader><TableRow>
          <TableHead>Вид</TableHead><TableHead>Агент</TableHead><TableHead>Вкл</TableHead>
          <TableHead>Реакция</TableHead><TableHead>Предупр.</TableHead><TableHead>Критично</TableHead>
          <TableHead>Заметка</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{KIND_LABEL[r.kind] || r.kind}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.agent_id ? <Badge variant="outline">{r.agent_id}</Badge> : "по умолчанию"}</TableCell>
              <TableCell><Switch checked={val(r, "enabled")} onCheckedChange={(v) => set(r, "enabled", v)} /></TableCell>
              <TableCell>
                <Select value={val(r, "action")} onValueChange={(v) => set(r, "action", v)}>
                  <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTIONS.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}</SelectContent>
                </Select>
              </TableCell>
              <TableCell>{r.kind !== "event" ? <Input type="number" className="h-8 w-24" value={val(r, "warning_value") ?? ""} onChange={(e) => set(r, "warning_value", e.target.value === "" ? null : Number(e.target.value))} placeholder={KIND_UNIT[r.kind]} /> : "—"}</TableCell>
              <TableCell>{r.kind === "disk" || r.kind === "offline" ? <Input type="number" className="h-8 w-24" value={val(r, "critical_value") ?? ""} onChange={(e) => set(r, "critical_value", e.target.value === "" ? null : Number(e.target.value))} placeholder={KIND_UNIT[r.kind]} /> : "—"}</TableCell>
              <TableCell><Input className="h-8" value={val(r, "note") ?? ""} onChange={(e) => set(r, "note", e.target.value)} placeholder="—" /></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" disabled={!rowChanged(r) || save.isPending} onClick={() => save.mutate({ ...r, ...local[r.id] })}>Сохранить</Button>
                  {r.agent_id && <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></Card>
    </div>
  );
}
