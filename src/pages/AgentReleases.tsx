import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Rocket, Trash2, CheckCircle2, Upload } from "lucide-react";

export default function AgentReleases() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = hasRole("admin");

  const { data: releases = [] } = useQuery({
    queryKey: ["agent-releases"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_releases").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [version, setVersion] = useState("");
  const [url, setUrl] = useState("");
  const [sha256, setSha256] = useState("");
  const [notes, setNotes] = useState("");
  const [rollout, setRollout] = useState(100);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");

  // Загрузка бинаря: браузер сам считает SHA-256 и грузит файл в бакет releases,
  // затем подставляет публичный URL и сумму в форму — оператору не нужны scp/sha256sum.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const path = version.trim() ? `apagent-${version.trim()}.exe` : file.name;
      const { error: upErr } = await supabase.storage.from("releases").upload(path, file, { upsert: true, contentType: "application/octet-stream" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("releases").getPublicUrl(path);
      setUrl(pub.publicUrl);
      setSha256(hash);
      toast({ title: "Файл загружен", description: "URL и контрольная сумма заполнены автоматически" });
    } catch (err: any) {
      toast({ title: "Ошибка загрузки", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("agent_releases").insert({
        version: version.trim(), url: url.trim() || null, sha256: sha256.trim() || null,
        notes: notes.trim() || null, rollout_percent: rollout, is_current: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-releases"] });
      setVersion(""); setUrl(""); setSha256(""); setNotes(""); setRollout(100);
      toast({ title: "Релиз добавлен" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const makeCurrent = useMutation({
    mutationFn: async (id: string) => {
      // снять флаг со всех, затем поставить на выбранный
      await supabase.from("agent_releases").update({ is_current: false }).eq("is_current", true);
      const { error } = await supabase.from("agent_releases").update({ is_current: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-releases"] });
      qc.invalidateQueries({ queryKey: ["current-agent-version"] });
      toast({ title: "Актуальная версия обновлена" });
    },
    onError: (e: any) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const setRolloutMut = useMutation({
    mutationFn: async ({ id, pct }: { id: string; pct: number }) => {
      const { error } = await supabase.from("agent_releases").update({ rollout_percent: pct }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-releases"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_releases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-releases"] });
      toast({ title: "Релиз удалён" });
    },
  });

  if (!isAdmin) return <div className="p-8 text-muted-foreground">Доступ только для операторов.</div>;

  return (
    <div className="space-y-6 p-1 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Rocket className="h-6 w-6" />Релизы агента</h1>
        <p className="text-sm text-muted-foreground mt-1">Управление версиями агента и раскаткой обновлений. Бинарь кладётся на портал в /releases/, здесь указывается ссылка и контрольная сумма.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="text-sm font-medium">Новый релиз</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">Версия (напр. 0.9.0)</label><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="0.9.0" /></div>
            <div><label className="text-xs text-muted-foreground">Что нового</label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="краткое описание" /></div>
          </div>

          <div className="rounded-lg border border-dashed border-border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium flex items-center gap-2"><Upload className="h-4 w-4" />Файл агента (.exe)</div>
              <div className="text-xs text-muted-foreground">укажите версию выше, затем выберите файл</div>
            </div>
            <input type="file" accept=".exe" onChange={handleFile} disabled={uploading || !version.trim()}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer disabled:opacity-50" />
            {uploading && <div className="text-xs text-muted-foreground">Загрузка и подсчёт контрольной суммы…</div>}
            {url && !uploading && (
              <div className="text-xs space-y-1 pt-1">
                <div className="text-green-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{uploadName || "файл"} загружен</div>
                <div className="text-muted-foreground font-mono break-all">SHA-256: {sha256}</div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              Раскатка: {rollout}% парка
              <span className="text-muted-foreground/70" title="Доля агентов, которым предлагается это обновление. 100% — всем сразу. Меньше — поэтапный выкат: сначала часть парка (конкретный агент попадает в выборку стабильно по своему ID), убедились что версия рабочая — двигаете к 100%. Защита от выката битой версии на весь парк разом.">ⓘ</span>
            </label>
            <input type="range" min={1} max={100} value={rollout} onChange={(e) => setRollout(Number(e.target.value))} className="w-full block cursor-pointer accent-primary" />
            <div className="text-xs text-muted-foreground mt-1">{rollout === 100 ? "Обновление получат все агенты" : `Обновление получат ~${rollout}% агентов (поэтапный выкат)`}</div>
          </div>
          <Button onClick={() => create.mutate()} disabled={!version.trim() || !url || !sha256 || create.isPending}>Добавить релиз</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow><TableHead>Версия</TableHead><TableHead>Статус</TableHead><TableHead>Раскатка</TableHead><TableHead>Что нового</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {releases.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium">v{r.version}</TableCell>
                  <TableCell>
                    {r.is_current
                      ? <Badge className="bg-green-600 hover:bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Актуальная</Badge>
                      : <Button size="sm" variant="outline" onClick={() => makeCurrent.mutate(r.id)}>Сделать актуальной</Button>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <input type="range" min={1} max={100} defaultValue={r.rollout_percent} className="w-full max-w-[160px] cursor-pointer accent-primary"
                        onMouseUp={(e: any) => setRolloutMut.mutate({ id: r.id, pct: Number(e.target.value) })} />
                      <span className="text-xs text-muted-foreground w-8">{r.rollout_percent}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{r.notes || "—"}</TableCell>
                  <TableCell>
                    {!r.is_current && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
              {releases.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Релизов пока нет</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
