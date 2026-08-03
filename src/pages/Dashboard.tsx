import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Lock, Unlock, RotateCcw, Plus, Trash2, BarChart3, MoreVertical, Settings,
} from "lucide-react";
import { useDashboardLayout, type WidgetInstance } from "@/hooks/useDashboardLayout";
import {
  WIDGET_REGISTRY, CHART_TYPE_LABELS, type ChartType,
} from "@/components/dashboard/widgets";

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function Dashboard() {
  const { layout, save, saveDebounced, reset, addWidget, removeWidget, setChartType, setWidgetConfig } = useDashboardLayout();
  const [editMode, setEditMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [configWidget, setConfigWidget] = useState<WidgetInstance | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Add live-graph widget via query param (?addLiveGraph=<savedGraphId>)
  useEffect(() => {
    const id = searchParams.get("addLiveGraph");
    if (!id) return;
    addWidget("live-graph", { savedGraphId: id, refreshInterval: 60 });
    searchParams.delete("addLiveGraph");
    setSearchParams(searchParams, { replace: true });
    setEditMode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const presentTypes = useMemo(() => new Set(layout.map((w) => w.type)), [layout]);

  // Persist only on drag/resize END (not on every animation frame) to avoid
  // duplicate-charts flicker and constant refetching.
  function handleStop(next: Layout[]) {
    if (!editMode) return;
    const map = new Map(next.map((n) => [n.i, n]));
    const merged = layout.map((w) => {
      const n = map.get(w.id);
      return n ? { ...w, x: n.x, y: n.y, w: n.w, h: n.h } : w;
    });
    saveDebounced(merged);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-heading text-2xl font-bold">Панель управления</h1>
          <p className="text-xs text-muted-foreground">
            Единая территория для виджетов: оперативные данные, мониторинг и аналитика. Раскладка сохраняется индивидуально для каждого пользователя.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Библиотека виджетов
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Добавить виджет</DialogTitle>
                <DialogDescription>
                  Выберите виджет из библиотеки. Можно добавлять один и тот же виджет несколько раз с разной визуализацией.
                </DialogDescription>
              </DialogHeader>
              <WidgetLibrary
                onAdd={(type) => { addWidget(type); setLibraryOpen(false); setEditMode(true); }}
                presentTypes={presentTypes}
              />
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" onClick={() => reset()}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Сбросить
          </Button>

          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? <Unlock className="h-4 w-4 mr-1.5" /> : <Lock className="h-4 w-4 mr-1.5" />}
            {editMode ? "Готово" : "Настроить"}
          </Button>
        </div>
      </div>

      {editMode && (
        <p className="text-xs text-muted-foreground">
          Перетащите виджеты за заголовок и измените их размер за правый нижний угол.
          Меню «⋯» в правом верхнем углу каждого виджета — выбор визуализации и удаление.
        </p>
      )}

      {layout.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center space-y-3">
          <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">На панели нет виджетов</p>
          <Button onClick={() => setLibraryOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Добавить из библиотеки
          </Button>
        </div>
      ) : (
        <ResponsiveGridLayout
          className={editMode ? "dashboard-edit" : ""}
          layouts={{ lg: layoutToGrid(layout), md: layoutToGrid(layout), sm: layoutToGrid(layout), xs: layoutToGrid(layout), xxs: layoutToGrid(layout) }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={40}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          isDraggable={editMode}
          isResizable={editMode}
          draggableHandle=".dashboard-drag-handle"
          onDragStop={handleStop}
          onResizeStop={handleStop}
          compactType="vertical"
        >
          {layout.map((w) => {
            const meta = WIDGET_REGISTRY[w.type];
            if (!meta) return <div key={w.id} />;
            const Comp = meta.Component;
            return (
              <div key={w.id} className="relative group">
                <Comp chartType={w.chartType ?? meta.defaultChart} config={w.config} onConfigChange={(c: any) => setWidgetConfig(w.id, { ...(w.config ?? {}), ...c })} />
                <WidgetMenu
                  instance={w}
                  onChartChange={(t) => setChartType(w.id, t)}
                  onRemove={() => removeWidget(w.id)}
                  onConfigure={meta.hasConfig ? () => setConfigWidget(w) : undefined}
                />
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}

      {configWidget && (
        <WidgetConfigDialog
          instance={configWidget}
          onClose={() => setConfigWidget(null)}
          onSave={(cfg) => { setWidgetConfig(configWidget.id, cfg); setConfigWidget(null); }}
        />
      )}
    </div>
  );
}

function layoutToGrid(items: WidgetInstance[]): Layout[] {
  return items.map((w) => {
    const meta = WIDGET_REGISTRY[w.type];
    return { i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: meta?.minW, minH: meta?.minH };
  });
}

/* ============ Per-widget menu ============ */
function WidgetMenu({ instance, onChartChange, onRemove, onConfigure }: {
  instance: WidgetInstance;
  onChartChange: (t: ChartType) => void;
  onRemove: () => void;
  onConfigure?: () => void;
}) {
  const meta = WIDGET_REGISTRY[instance.type];
  const supports = meta?.supportedCharts ?? [];
  return (
    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7 bg-background/80 backdrop-blur border">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
          {onConfigure && (
            <>
              <DropdownMenuItem onClick={onConfigure}>
                <Settings className="h-3.5 w-3.5 mr-2" />
                Настроить
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {supports.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs">Визуализация</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={instance.chartType ?? meta?.defaultChart ?? supports[0]}
                onValueChange={(v) => onChartChange(v as ChartType)}
              >
                {supports.map((t) => (
                  <DropdownMenuRadioItem key={t} value={t} className="text-sm">
                    {CHART_TYPE_LABELS[t]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={onRemove} className="text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Удалить виджет
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* ============ Live-graph configuration dialog ============ */
function WidgetConfigDialog({ instance, onClose, onSave }: {
  instance: WidgetInstance;
  onClose: () => void;
  onSave: (cfg: Record<string, unknown>) => void;
}) {
  const [savedGraphId, setSavedGraphId] = useState<string>(
    (instance.config?.savedGraphId as string) ?? "",
  );
  const [refreshInterval, setRefreshInterval] = useState<string>(
    String((instance.config?.refreshInterval as number) ?? 60),
  );

  const { data: graphs = [] } = useQuery({
    queryKey: ["saved-graphs-for-widget"],
    queryFn: async () => {
      const { data } = await supabase
        .from("saved_graphs")
        .select("id,name,description,is_shared,is_template")
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Настройка живого графика</DialogTitle>
          <DialogDescription>
            Выберите сохранённый график и интервал автоматического обновления данных.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Сохранённый график</Label>
            <Select value={savedGraphId} onValueChange={setSavedGraphId}>
              <SelectTrigger><SelectValue placeholder="Выберите график…" /></SelectTrigger>
              <SelectContent className="max-h-80 z-50">
                {graphs.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Нет сохранённых графиков. Создайте в Мониторинге → Графики.
                  </div>
                )}
                {graphs.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                    {g.is_template ? " · шаблон" : ""}
                    {g.is_shared ? " · общий" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Частота обновления</Label>
            <Select value={refreshInterval} onValueChange={setRefreshInterval}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="0">Не обновлять</SelectItem>
                <SelectItem value="15">15 секунд</SelectItem>
                <SelectItem value="30">30 секунд</SelectItem>
                <SelectItem value="60">1 минута</SelectItem>
                <SelectItem value="300">5 минут</SelectItem>
                <SelectItem value="900">15 минут</SelectItem>
                <SelectItem value="3600">1 час</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button
            disabled={!savedGraphId}
            onClick={() => onSave({ savedGraphId, refreshInterval: Number(refreshInterval) })}
          >
            Сохранить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============ Library dialog ============ */
function WidgetLibrary({ onAdd, presentTypes }: {
  onAdd: (type: string) => void;
  presentTypes: Set<string>;
}) {
  const grouped = useMemo(() => {
    const g: Record<string, typeof WIDGET_REGISTRY[string][]> = {};
    Object.values(WIDGET_REGISTRY).forEach((m) => { (g[m.category] ||= []).push(m); });
    return g;
  }, []);
  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{cat}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {items.map((m) => {
              const Icon = m.icon;
              const present = presentTypes.has(m.type);
              return (
                <button
                  key={m.type}
                  onClick={() => onAdd(m.type)}
                  className="text-left rounded-lg border p-3 hover:border-primary/40 hover:bg-muted/40 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-muted p-2 shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{m.title}</p>
                        {present && <Badge variant="secondary" className="text-[10px]">уже на панели</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.description}</p>
                      {m.supportedCharts && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Виды: {m.supportedCharts.map((t) => CHART_TYPE_LABELS[t]).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
