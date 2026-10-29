import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Network, Lock, Search, Wifi, RotateCcw, Star, FileDown, Table } from "lucide-react";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

/* ───────────────── типы ───────────────── */
type NodeType = "net" | "server" | "pc" | "other";
interface NetNode {
  id: string;
  scanner_agent_id: string;
  node_ip: string;
  node_mac?: string;
  hostname?: string;
  node_type: NodeType;
  icon: string;
  role?: string;
  vendor?: string;
  os?: string;
  status: "ok" | "warn" | "off";
  ping_ms?: number | null;
  cpu_load?: number | null;
  uptime?: string | null;
  is_gateway?: boolean;
  is_uplink?: boolean;
  snmp?: boolean;
  linked_agent_id?: string | null;
  links?: { to: string; speed: number }[];
  pos_x?: number | null;
  pos_y?: number | null;
  av_version?: string | null;
  cause?: string | null;
  conn_type?: string | null;   // "wifi" | "wired" | null — тип подключения (авто)
  conn_type_manual?: string | null; // ручное переопределение: "wifi" | "ethernet"
  wifi_band?: string | null;   // "2.4" | "5" | "6" — диапазон WiFi
}

// эффективный тип канала: ручной приоритетнее авто
const effConn = (n: { conn_type?: string | null; conn_type_manual?: string | null }): string =>
  (n.conn_type_manual || n.conn_type || "");

/* ───────────────── стильные иконки устройств ─────────────────
   Проработанные пиктограммы: заполненная база + светлая деталь.
   Рисуются двумя слоями (fill солид + линии), чтобы читались объёмно. */
const ICONS: Record<string, { fill: string; line: string }> = {
  router: {
    fill: '<rect x="3" y="13" width="18" height="7" rx="2"/>',
    line: '<circle cx="7" cy="16.5" r="1.1"/><circle cx="10.5" cy="16.5" r="1.1"/><path d="M12 10V4m0 0 2.6 1.8M12 4 9.4 5.8"/><path d="M16.5 10V6m0 0 2 1.4M16.5 6l-2 1.4"/>',
  },
  switch: {
    fill: '<rect x="3" y="9" width="18" height="9" rx="2"/>',
    line: '<path d="M6.5 13.5h.01M9.5 13.5h.01M12.5 13.5h.01"/><path d="M7 9V6.4m5 2.6V6.4m5 2.6V6.4"/><path d="M6 6.4h4m3 0h5"/>',
  },
  server: {
    fill: '<rect x="4" y="3" width="16" height="8" rx="2"/><rect x="4" y="13" width="16" height="8" rx="2"/>',
    line: '<circle cx="8" cy="7" r="1"/><circle cx="8" cy="17" r="1"/><path d="M12 7h5M12 17h5"/>',
  },
  desktop: {
    fill: '<rect x="3" y="4" width="18" height="12" rx="2"/>',
    line: '<path d="M8.5 20h7m-3.5-4v4"/><path d="M6.5 8.5h11" opacity="0"/>',
  },
  laptop: {
    fill: '<rect x="5" y="5" width="14" height="9" rx="1.6"/>',
    line: '<path d="M3 18h18l-1.4-2.2H4.4L3 18Z"/>',
  },
  phone: {
    fill: '<rect x="7" y="3" width="10" height="18" rx="2.4"/>',
    line: '<path d="M10.5 5.4h3"/><circle cx="12" cy="18" r="0.9"/>',
  },
  printer: {
    fill: '<rect x="4" y="9" width="16" height="8" rx="1.8"/>',
    line: '<path d="M7 9V3.6h10V9"/><rect x="7.5" y="14" width="9" height="5.4" rx="1"/><circle cx="16.5" cy="12" r="0.9"/>',
  },
  camera: {
    fill: '<path d="M3 8.4 15 6.2v11.6L3 15.6Z"/>',
    line: '<path d="M15 10.4 21 8.2v7.6l-6-2.2"/><circle cx="8.4" cy="11" r="2.4"/>',
  },
  ups: {
    fill: '<rect x="5" y="3" width="14" height="18" rx="2"/>',
    line: '<path d="M13 6.5 8.8 12.4H12l-1 5.1 4.2-6.3H12l1-4.8Z"/>',
  },
  raspberry: {
    fill: '<rect x="3" y="6" width="18" height="12" rx="2"/>',
    line: '<circle cx="8" cy="12" r="1.6"/><circle cx="14" cy="12" r="1.6"/><path d="M17.5 10v4"/>',
  },
  console: {
    fill: '<rect x="2.5" y="7" width="19" height="10" rx="4"/>',
    line: '<path d="M7 10.5v3M5.5 12h3"/><circle cx="16" cy="11.4" r="1"/><circle cx="18" cy="13.4" r="1"/>',
  },
  iot: {
    fill: '<rect x="6" y="10" width="12" height="10" rx="1.5"/>',
    line: '<path d="M4 11l8-6 8 6"/><path d="M10.5 20v-4h3v4"/><circle cx="12" cy="8.6" r="0.9"/>',
  },
  unknown: {
    fill: '<circle cx="12" cy="12" r="9"/>',
    line: '<path d="M9.6 9.4a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1 .9-1 1.7"/><path d="M12 16.6h.01"/>',
  },
};

/* скорости линков */
const SPD: Record<number, { c: string; w: number; name: string }> = {
  10000: { c: "hsl(265 70% 60%)", w: 3.4, name: "10 GbE" },
  1000: { c: "hsl(var(--primary))", w: 2.2, name: "1 GbE" },
  100: { c: "hsl(var(--muted-foreground))", w: 1.6, name: "100 Mb" },
};
/* цвет типа узла — на палитре портала (акцент красный, зелёный success, синий инфо) */
const TCOL: Record<NodeType, string> = {
  net: "hsl(265 70% 60%)",
  server: "hsl(210 80% 55%)",
  pc: "hsl(var(--success))",
  other: "hsl(var(--muted-foreground))",
};
/* WiFi-диапазоны — цвет линии */
const WIFI_BAND: Record<string, { c: string; name: string }> = {
  "2.4": { c: "hsl(38 92% 50%)", name: "Wi-Fi 2.4 ГГц" },
  "5": { c: "hsl(200 85% 50%)", name: "Wi-Fi 5 ГГц" },
  "6": { c: "hsl(265 70% 60%)", name: "Wi-Fi 6 ГГц" },
};
const EXT_HOPS = [
  { hop: 4, ip: "10.50.0.1", rtt: 3 }, { hop: 5, ip: "93.84.112.1", rtt: 7 },
  { hop: 6, ip: "87.245.232.98", rtt: 14 }, { hop: 7, ip: "8.8.8.8", rtt: 19 },
];

/* модульный кэш вычисленных значений CSS-переменных портала (raw HSL: "0 72% 51%").
   Заполняется при чтении темы; canvas требует конкретные цвета, а не var(--). */
const THEME_VARS: Record<string, string> = {
  "--background": "0 0% 97%", "--card": "0 0% 100%", "--card-foreground": "0 0% 8%",
  "--foreground": "0 0% 8%", "--muted": "0 0% 95%", "--muted-foreground": "0 0% 40%",
  "--border": "0 0% 88%", "--primary": "0 85% 45%", "--success": "142 70% 40%",
  "--warning": "38 92% 50%", "--destructive": "0 72% 51%",
};
function refreshThemeVars() {
  try {
    const cs = getComputedStyle(document.documentElement);
    Object.keys(THEME_VARS).forEach((k) => {
      const raw = cs.getPropertyValue(k).trim();
      if (raw) THEME_VARS[k] = raw;
    });
  } catch { /* SSR/no-DOM */ }
}
/* превратить строку цвета в конкретный HSL, резолвя var(--X) из THEME_VARS.
   Принимает "hsl(var(--success))", "hsl(38 92% 50%)", "hsl(var(--primary))". */
function resolveColor(input: string): string {
  const m = input.match(/var\((--[a-z-]+)\)/i);
  if (m) {
    const val = THEME_VARS[m[1]] || "0 0% 50%";
    return `hsl(${val})`;
  }
  return input;
}
/* статусные цвета — конкретные HSL, готовые для canvas */
function statusColor(s: string) {
  const v = s === "ok" ? THEME_VARS["--success"] : s === "warn" ? THEME_VARS["--warning"] : THEME_VARS["--destructive"];
  return `hsl(${v})`;
}
function pingColor(p: number) {
  if (p <= 0) return `hsl(${THEME_VARS["--destructive"]})`;
  if (p < 5) return `hsl(${THEME_VARS["--success"]})`;
  if (p < 30) return `hsl(${THEME_VARS["--warning"]})`;
  return `hsl(${THEME_VARS["--destructive"]})`;
}
function loadColor(l: number) {
  if (l < 50) return `hsl(${THEME_VARS["--success"]})`;
  if (l < 80) return `hsl(${THEME_VARS["--warning"]})`;
  return `hsl(${THEME_VARS["--destructive"]})`;
}
/* полупрозрачный вариант — резолвит var(--) и добавляет альфу (для canvas) */
function cA(hslVar: string, a: number) {
  const resolved = resolveColor(hslVar);              // "hsl(0 72% 51%)" или "hsl(38 92% 50%)"
  const inner = resolved.replace(/^hsl\(/, "").replace(/\)$/, "");
  return `hsl(${inner} / ${a})`;
}
function iconSvg(kind: string, color: string, size: number) {
  const ic = ICONS[kind] || ICONS.unknown;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${ic.fill.replace(/<(rect|circle|path)/g, '<$1 fill="' + color + '" fill-opacity="0.18"')}${ic.line}</svg>`;
}

/* ───────────────── главный компонент ───────────────── */
export default function InfrastructureMaps() {
  const { isStaff } = useAuth();

  const { data: access, isLoading: accessLoading } = useQuery({
    queryKey: ["netmap-access"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_registrations")
        .select("agent_id, license_modules")
        .limit(500);
      if (error) return { licensed: false, scanners: [] as string[] };
      const scanners = (data || [])
        .filter((a: any) => Array.isArray(a.license_modules) ? a.license_modules.includes("netmap") : (typeof a.license_modules === "string" && a.license_modules.includes("netmap")))
        .map((a: any) => a.agent_id);
      return { licensed: scanners.length > 0, scanners };
    },
  });

  const { data: nodes = [], isLoading: nodesLoading, refetch } = useQuery({
    queryKey: ["network-nodes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("network_nodes" as any)
        .select("*")
        .order("last_seen", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as NetNode[];
    },
    enabled: !!access?.licensed,
    refetchInterval: 30000,
  });

  if (accessLoading) {
    return <div className="p-6"><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-[500px] w-full" /></div>;
  }
  if (!access?.licensed) {
    return (
      <div className="p-6">
        <EmptyState icon={Lock} title="Карта инфраструктуры недоступна"
          description="Раздел требует подписки на портал и лицензии модуля Network Map (netmap) хотя бы на одной машине-сканере. Обратитесь к поставщику для активации." />
      </div>
    );
  }
  if (nodesLoading) {
    return <div className="p-6"><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-[500px] w-full" /></div>;
  }
  if (!nodes.length) {
    return (
      <div className="p-6">
        <EmptyState icon={Network} title="Карта пока пуста"
          description="Машина-сканер с модулем Network Map ещё не прислала данные. После первого сканирования сети узлы появятся здесь автоматически." />
      </div>
    );
  }
  return <NetworkMapCanvas nodes={nodes} onLayoutSaved={refetch} />;
}

/* ───────────────── canvas-карта ───────────────── */
function NetworkMapCanvas({ nodes, onLayoutSaved }: { nodes: NetNode[]; onLayoutSaved: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<any>({
    view: { x: 0, y: 0, scale: 1 },
    filter: "all", hoverNode: null, selNode: null, dragNode: null,
    panning: false, last: { x: 0, y: 0 }, dragMoved: false,
    showFlow: true, showHeat: true, showSpeed: true, showLabels: true,
    searchQ: "", t: 0, anim: null, theme: null,
  });
  const [sel, setSel] = useState<NetNode | null>(null);
  const [filter, setFilter] = useState("all");
  const [toggles, setToggles] = useState({ flow: true, heat: true, speed: true, labels: true });
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [consoleState, setConsoleState] = useState<{ open: boolean; min: boolean; title: string; lines: { t: string; cls: string }[] }>({ open: false, min: false, title: "", lines: [] });

  const layout = useRef<{ byId: Record<string, NetNode>; positions: Record<string, { x: number; y: number }>; links: { a: string; b: string; speed: number; wifi?: boolean; band?: string }[]; adj: Record<string, string[]>; scanner: string }>({ byId: {}, positions: {}, links: [], adj: {}, scanner: "" });

  useEffect(() => {
    const byId: Record<string, NetNode> = {};
    const positions: Record<string, { x: number; y: number }> = {};
    const links: { a: string; b: string; speed: number; wifi?: boolean; band?: string }[] = [];
    const adj: Record<string, string[]> = {};
    nodes.forEach((n) => { byId[n.id] = n; adj[n.id] = []; });
    const layers: Record<number, NetNode[]> = {};
    const layerOf = (n: NetNode) => n.is_gateway ? 0 : n.node_type === "net" ? 1 : n.node_type === "server" ? 2 : 3;
    nodes.forEach((n) => { const l = layerOf(n); (layers[l] = layers[l] || []).push(n); });
    Object.keys(layers).forEach((lk) => {
      const l = Number(lk); const arr = layers[l];
      arr.forEach((n, i) => {
        if (n.pos_x != null && n.pos_y != null) positions[n.id] = { x: n.pos_x, y: n.pos_y };
        else positions[n.id] = { x: (i - (arr.length - 1) / 2) * 160, y: -170 + l * 140 };
      });
    });
    const ipToId: Record<string, string> = {};
    nodes.forEach((n) => { ipToId[n.node_ip] = n.id; });
    nodes.forEach((n) => {
      (n.links || []).forEach((lk) => {
        const targetId = ipToId[lk.to] || lk.to;
        if (byId[targetId] && !links.find((e) => (e.a === n.id && e.b === targetId) || (e.a === targetId && e.b === n.id))) {
          const wifi = effConn(n) === "wifi";
          links.push({ a: n.id, b: targetId, speed: lk.speed || 1000, wifi, band: n.wifi_band || undefined });
          adj[n.id].push(targetId); adj[targetId].push(n.id);
        }
      });
    });
    const scanner = (nodes.find((n) => n.is_gateway) || nodes[0])?.id || "";
    layout.current = { byId, positions, links, adj, scanner };
  }, [nodes]);

  const st = stateRef.current;
  st.filter = filter;
  st.showFlow = toggles.flow; st.showHeat = toggles.heat; st.showSpeed = toggles.speed; st.showLabels = toggles.labels;
  st.searchQ = search;

  // читаем реальные цвета из CSS-переменных портала (для canvas нужны rgb-значения)
  const themeRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const readTheme = () => {
      refreshThemeVars(); // обновить модульный кэш для statusColor/pingColor/cA
      const cs = getComputedStyle(document.documentElement);
      const v = (name: string) => {
        const raw = cs.getPropertyValue(name).trim();
        return raw ? `hsl(${raw})` : "";
      };
      themeRef.current = {
        background: v("--background") || "hsl(0 0% 97%)",
        card: v("--card") || "hsl(0 0% 100%)",
        cardForeground: v("--card-foreground") || "hsl(0 0% 8%)",
        foreground: v("--foreground") || "hsl(0 0% 8%)",
        muted: v("--muted") || "hsl(0 0% 95%)",
        mutedForeground: v("--muted-foreground") || "hsl(0 0% 40%)",
        border: v("--border") || "hsl(0 0% 88%)",
        primary: v("--primary") || "hsl(0 85% 45%)",
        success: v("--success") || "hsl(142 70% 40%)",
        warning: v("--warning") || "hsl(38 92% 50%)",
        destructive: v("--destructive") || "hsl(0 72% 51%)",
      };
    };
    readTheme();
    // отследить смену темы (класс .dark на html)
    const mo = new MutationObserver(readTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  const iconImgs = useRef<Record<string, HTMLImageElement>>({});
  useEffect(() => {
    Object.keys(ICONS).forEach((k) => {
      const ic = ICONS[k];
      const img = new Image();
      // база с полупрозрачной заливкой + линии — рисуем белым, тонируем на canvas
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${ic.fill.replace(/\/>/g, ' fill="white" fill-opacity="0.22"/>')}${ic.line}</svg>`;
      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
      iconImgs.current[k] = img;
    });
  }, []);

  const bfsPath = useCallback((a: string, b: string) => {
    const { adj } = layout.current;
    if (a === b) return [a];
    const prev: Record<string, string> = {}, q = [a], seen: Record<string, boolean> = { [a]: true };
    while (q.length) {
      const c = q.shift()!;
      for (const nx of adj[c] || []) {
        if (!seen[nx]) { seen[nx] = true; prev[nx] = c; if (nx === b) { const p = [b]; let k = b; while (k !== a) { k = prev[k]; p.unshift(k); } return p; } q.push(nx); }
      }
    }
    return null;
  }, []);

  // сохранение раскладки в network_nodes (pos_x/pos_y)
  const saveLayout = useCallback(async () => {
    setSaving(true);
    try {
      const L = layout.current;
      const updates = Object.keys(L.positions).map((id) => ({
        id, pos_x: Math.round(L.positions[id].x), pos_y: Math.round(L.positions[id].y),
      }));
      // по одному update (надёжнее, чем upsert с обязательными полями)
      for (const u of updates) {
        await (supabase.from("network_nodes" as any) as any)
          .update({ pos_x: u.pos_x, pos_y: u.pos_y })
          .eq("id", u.id);
      }
      setDirty(false);
      onLayoutSaved();
    } catch (e) {
      // no-op, останется dirty
    } finally {
      setSaving(false);
    }
  }, [onLayoutSaved]);

  const resetLayout = useCallback(() => {
    const L = layout.current;
    const layers: Record<number, NetNode[]> = {};
    const layerOf = (n: NetNode) => n.is_gateway ? 0 : n.node_type === "net" ? 1 : n.node_type === "server" ? 2 : 3;
    nodes.forEach((n) => { const l = layerOf(n); (layers[l] = layers[l] || []).push(n); });
    Object.keys(layers).forEach((lk) => {
      const l = Number(lk); const arr = layers[l];
      arr.forEach((n, i) => { L.positions[n.id] = { x: (i - (arr.length - 1) / 2) * 160, y: -170 + l * 140 }; });
    });
    setDirty(true);
  }, [nodes]);

  // Простая звезда: шлюз/аплинк в центр, все остальные узлы — по одному кольцу
  // вокруг, равномерно по углу. Радиус растёт с числом узлов, чтобы не наезжали.
  const starLayout = useCallback(() => {
    const L = layout.current;
    const center = nodes.find((n) => n.is_gateway) || nodes.find((n) => n.is_uplink) || null;
    const others = nodes.filter((n) => n !== center);
    if (center) L.positions[center.id] = { x: 0, y: 0 };
    const R = Math.max(240, Math.round(others.length * 34));
    const n = others.length || 1;
    others.forEach((node, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      L.positions[node.id] = { x: Math.round(Math.cos(a) * R), y: Math.round(Math.sin(a) * R) };
    });
    setDirty(true);
  }, [nodes]);

  // Экспорт карты в PDF (снимок canvas, ландшафт, с заголовком и датой).
  const exportPDF = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const img = cv.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const now = new Date();
    const stamp = now.toLocaleString("ru-RU");
    pdf.setFontSize(14);
    pdf.text("Карта сети", 32, 34);
    pdf.setFontSize(9);
    pdf.setTextColor(120);
    pdf.text(stamp + "  ·  узлов: " + nodes.length, 32, 50);
    // вписать изображение с сохранением пропорций
    const availW = pw - 64, availH = ph - 80;
    const ratio = Math.min(availW / cv.width, availH / cv.height);
    const iw = cv.width * ratio, ih = cv.height * ratio;
    pdf.addImage(img, "PNG", (pw - iw) / 2, 66, iw, ih);
    pdf.save("network-map-" + now.toISOString().slice(0, 10) + ".pdf");
  }, [nodes]);

  // Экспорт списка узлов в XLSX (для админа).
  const exportXLSX = useCallback(() => {
    const rows = nodes.map((n) => ({
      IP: n.node_ip,
      MAC: n.node_mac || "",
      Hostname: n.hostname || "",
      Тип: n.node_type || "",
      Роль: n.role || "",
      Вендор: n.vendor || "",
      ОС: n.os || "",
      Статус: n.status || "",
      Канал: effConn(n) || "",
      "Скорость, Мбит": n.link_speed_mbps || "",
      "Ping, мс": n.ping_ms ?? "",
      Шлюз: n.is_gateway ? "да" : "",
      Агент: n.linked_agent_id || "",
      Сканер: n.scanner_agent_id || "",
      "Последний раз": n.last_seen ? new Date(n.last_seen).toLocaleString("ru-RU") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 8 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 9 }, { wch: 9 }, { wch: 13 }, { wch: 9 }, { wch: 7 }, { wch: 26 }, { wch: 26 }, { wch: 19 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Узлы");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), "network-nodes-" + new Date().toISOString().slice(0, 10) + ".xlsx");
  }, [nodes]);

  // рендер-цикл
  useEffect(() => {
    const cv = canvasRef.current, stage = stageRef.current;
    if (!cv || !stage) return;
    const ctx = cv.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    const tintCanvas = document.createElement("canvas");
    const tctx = tintCanvas.getContext("2d")!;

    function resize() {
      const r = stage.getBoundingClientRect();
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(stage);
    const S = stateRef.current;
    const r0 = stage.getBoundingClientRect();
    S.view.x = r0.width / 2; S.view.y = r0.height / 2 + 20;

    const toScreen = (x: number, y: number) => ({ x: x * S.view.scale + S.view.x, y: y * S.view.scale + S.view.y });
    const L = layout.current;
    const pos = (id: string) => L.positions[id] || { x: 0, y: 0 };
    const TH = () => themeRef.current;

    function drawTinted(img: HTMLImageElement, x: number, y: number, w: number, h: number, color: string) {
      const sz = Math.max(2, Math.ceil(w * 2));
      tintCanvas.width = sz; tintCanvas.height = sz;
      tctx.clearRect(0, 0, sz, sz); tctx.drawImage(img, 0, 0, sz, sz);
      tctx.globalCompositeOperation = "source-in"; tctx.fillStyle = color; tctx.fillRect(0, 0, sz, sz);
      tctx.globalCompositeOperation = "source-over";
      ctx.drawImage(tintCanvas, x, y, w, h);
    }
    function roundRect(x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    const vis = (n: NetNode) => S.filter === "all" || n.node_type === S.filter;
    const match = (n: NetNode) => { if (!S.searchQ) return true; const q = S.searchQ.toLowerCase(); return (n.hostname || "").toLowerCase().includes(q) || n.node_ip.includes(q) || (n.node_mac || "").toLowerCase().includes(q); };

    // линия связи: WiFi → штрих-пунктир цвета диапазона; провод → сплошная цвета скорости
    function linkStyle(l: any) {
      if (l.wifi) {
        const band = WIFI_BAND[l.band || "2.4"] || WIFI_BAND["2.4"];
        return { c: resolveColor(band.c), w: 2, dash: [2, 5], name: band.name, wifi: true };
      }
      const sp = SPD[l.speed] || SPD[1000];
      return { c: resolveColor(sp.c), w: sp.w, dash: l.speed === 100 ? [6, 5] : [], name: sp.name, wifi: false };
    }

    function frame() {
      S.t += 0.016;
      const th = TH();
      const r = stage.getBoundingClientRect();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      // фон — как у портала
      ctx.fillStyle = th.background || "#f7f7f7"; ctx.fillRect(0, 0, r.width, r.height);
      // тонкая сетка в цвет границы
      const step = 46 * S.view.scale;
      if (step >= 14) {
        const ox = S.view.x % step, oy = S.view.y % step;
        ctx.strokeStyle = cA(th.border || "hsl(0 0% 88%)", 0.5); ctx.lineWidth = 1; ctx.beginPath();
        for (let x = ox; x < r.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, r.height); }
        for (let y = oy; y < r.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(r.width, y); }
        ctx.stroke();
      }
      // heat-map задержки
      if (S.showHeat) nodes.forEach((n) => {
        if (!vis(n) || !match(n)) return;
        const p = n.ping_ms || 0;
        if (p < 5 && n.status !== "off") return;
        const pp = pos(n.id); const s = toScreen(pp.x, pp.y);
        const rad = ((p >= 30 || n.status === "off") ? 70 : 44) * S.view.scale;
        const col = pingColor(p);
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
        const a = (p >= 30 || n.status === "off") ? 0.22 : 0.12;
        g.addColorStop(0, cA(col, a)); g.addColorStop(1, cA(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, rad, 0, 7); ctx.fill();
      });
      // линки
      L.links.forEach((l) => {
        const a = L.byId[l.a], b = L.byId[l.b]; if (!a || !b) return;
        const va = vis(a) && match(a), vb = vis(b) && match(b);
        const dim = (!va && !vb) || !!S.anim;
        const sa = toScreen(pos(a.id).x, pos(a.id).y), sb = toScreen(pos(b.id).x, pos(b.id).y);
        const ls = linkStyle(l);
        const hi = S.hoverNode && (l.a === S.hoverNode.id || l.b === S.hoverNode.id);
        ctx.save();
        ctx.strokeStyle = hi ? ls.c : cA(ls.c, dim ? 0.14 : 0.55);
        ctx.lineWidth = (hi ? ls.w + 1.2 : ls.w) * Math.max(S.view.scale, 0.6);
        ctx.setLineDash(ls.dash.map((d) => d * Math.max(S.view.scale, 0.7)));
        if (l.wifi) ctx.lineDashOffset = -(S.t * 18) % 1000; // анимация «эфира»
        ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
        ctx.restore();
      });
      // аним-линки (ping/traceroute)
      if (S.anim && S.anim.pathIds) {
        for (let i = 0; i < S.anim.pathIds.length - 1; i++) {
          const a = L.byId[S.anim.pathIds[i]], b = L.byId[S.anim.pathIds[i + 1]]; if (!a || !b) continue;
          const reached = S.anim.litSegments > i;
          const sa = toScreen(pos(a.id).x, pos(a.id).y), sb = toScreen(pos(b.id).x, pos(b.id).y);
          ctx.save(); ctx.strokeStyle = reached ? th.primary : cA(th.mutedForeground, 0.5); ctx.lineWidth = (reached ? 3.2 : 2) * Math.max(S.view.scale, 0.6);
          if (reached) { ctx.shadowColor = th.primary; ctx.shadowBlur = 10; }
          ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke(); ctx.restore();
        }
      }
      // метки скорости/диапазона — ВСЕГДА видимы (не только на hover)
      if (S.showSpeed && S.view.scale >= 0.6 && !S.anim) L.links.forEach((l) => {
        const a = L.byId[l.a], b = L.byId[l.b]; if (!a || !b) return;
        const va = vis(a) && match(a), vb = vis(b) && match(b); if (!va && !vb) return;
        const hi = S.hoverNode && (l.a === S.hoverNode.id || l.b === S.hoverNode.id);
        const ls = linkStyle(l);
        const sa = toScreen(pos(a.id).x, pos(a.id).y), sb = toScreen(pos(b.id).x, pos(b.id).y);
        const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
        ctx.save(); ctx.font = `${9.5 * S.view.scale}px 'DM Sans',sans-serif`;
        const txt = ls.name; const w = ctx.measureText(txt).width + 12;
        ctx.fillStyle = cA(th.card, 0.92); ctx.strokeStyle = cA(ls.c, 0.4); ctx.lineWidth = 1;
        roundRect(mx - w / 2, my - 9 * S.view.scale, w, 17 * S.view.scale, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = ls.c; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(txt, mx, my + 0.5); ctx.restore();
      });
      // поток данных частицами
      if (S.showFlow && !S.anim) L.links.forEach((l) => {
        const a = L.byId[l.a], b = L.byId[l.b]; if (!a || !b) return;
        const va = vis(a) && match(a), vb = vis(b) && match(b); if (!va && !vb) return;
        const sa = toScreen(pos(a.id).x, pos(a.id).y), sb = toScreen(pos(b.id).x, pos(b.id).y);
        const ls = linkStyle(l); const hi = S.hoverNode && (l.a === S.hoverNode.id || l.b === S.hoverNode.id);
        const cnt = l.wifi ? 1 : l.speed >= 10000 ? 3 : l.speed >= 1000 ? 2 : 1;
        const spd = l.wifi ? 0.3 : l.speed >= 10000 ? 0.55 : l.speed >= 1000 ? 0.4 : 0.25;
        for (let i = 0; i < cnt; i++) {
          const f = ((S.t * spd) + i / cnt) % 1; const x = sa.x + (sb.x - sa.x) * f, y = sa.y + (sb.y - sa.y) * f;
          const rad = (hi ? 3 : 2.2) * Math.max(S.view.scale, 0.6);
          ctx.beginPath(); ctx.fillStyle = hi ? ls.c : cA(ls.c, 0.7); ctx.arc(x, y, rad, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.fillStyle = cA(ls.c, 0.16); ctx.arc(x, y, rad * 2.4, 0, 7); ctx.fill();
        }
      });
      // узлы — карточки в стиле портала
      nodes.forEach((n) => {
        const pp = pos(n.id); const s = toScreen(pp.x, pp.y);
        const R = (n.node_type === "net" ? 24 : 21) * S.view.scale;
        const inPath = S.anim && S.anim.activeNodes && S.anim.activeNodes.has(n.id);
        const dim = ((!vis(n)) || (!match(n))) || (S.anim && !inPath);
        const sc = statusColor(n.status); const tc = resolveColor(TCOL[n.node_type] || TCOL.other);
        const alpha = dim ? 0.22 : 1; const unknown = n.icon === "unknown";
        ctx.save(); ctx.globalAlpha = alpha;
        // пульсация проблемных
        if ((n.status === "off" || n.status === "warn") && !dim && !S.anim) {
          const pulse = Math.sin(S.t * 3) * 0.5 + 0.5; const pr = R + (5 + pulse * 9) * S.view.scale;
          ctx.beginPath(); ctx.fillStyle = cA(sc, 0.08 + pulse * 0.1); ctx.arc(s.x, s.y, pr, 0, 7); ctx.fill();
        }
        if (inPath) { const pulse = Math.sin(S.t * 6) * 0.5 + 0.5; ctx.beginPath(); ctx.strokeStyle = cA(th.primary, 0.5 + pulse * 0.5); ctx.lineWidth = 2.5; ctx.arc(s.x, s.y, R + (7 + pulse * 4) * S.view.scale, 0, 7); ctx.stroke(); }
        if (S.selNode === n && !S.anim) { ctx.beginPath(); ctx.strokeStyle = cA(th.primary, 0.9); ctx.lineWidth = 2.2; ctx.arc(s.x, s.y, R + 7 * S.view.scale, 0, 7); ctx.stroke(); }
        else if (S.hoverNode === n && !S.anim) { ctx.beginPath(); ctx.strokeStyle = cA(th.foreground, 0.25); ctx.lineWidth = 1.5; ctx.arc(s.x, s.y, R + 6 * S.view.scale, 0, 7); ctx.stroke(); }
        // карточка узла: круглая плашка card + мягкая тень + цветная обводка типа
        ctx.save();
        ctx.shadowColor = cA(th.foreground, 0.18); ctx.shadowBlur = 10 * S.view.scale; ctx.shadowOffsetY = 2 * S.view.scale;
        ctx.beginPath(); ctx.fillStyle = th.card; ctx.arc(s.x, s.y, R, 0, 7); ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.strokeStyle = unknown ? cA(th.destructive, 0.8) : tc; ctx.lineWidth = 2.2 * Math.max(S.view.scale, 0.6); ctx.arc(s.x, s.y, R, 0, 7); ctx.stroke();
        // тонкое цветное кольцо-подложка типа
        ctx.beginPath(); ctx.fillStyle = cA(tc, 0.1); ctx.arc(s.x, s.y, R - 1.5, 0, 7); ctx.fill();
        // иконка
        const img = iconImgs.current[n.icon]; const isz = (n.node_type === "net" ? 23 : 21) * S.view.scale;
        if (img && img.complete) drawTinted(img, s.x - isz / 2, s.y - isz / 2, isz, isz, unknown ? th.destructive : tc);
        // статус-точка
        const sd = R * 0.72;
        ctx.beginPath(); ctx.arc(s.x + sd, s.y - sd, 4.8 * Math.max(S.view.scale, 0.7), 0, 7); ctx.fillStyle = sc; ctx.fill(); ctx.strokeStyle = th.card; ctx.lineWidth = 1.8; ctx.stroke();
        // бейдж агента
        if (n.linked_agent_id) { ctx.beginPath(); ctx.arc(s.x - sd, s.y - sd, 5.2 * Math.max(S.view.scale, 0.7), 0, 7); ctx.fillStyle = th.success; ctx.fill(); ctx.fillStyle = th.card; ctx.font = `bold ${7.5 * Math.max(S.view.scale, 0.7)}px 'DM Sans',sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("A", s.x - sd, s.y - sd + 0.5); }
        // WiFi-значок на узле
        if (effConn(n) === "wifi") {
          const band = WIFI_BAND[n.wifi_band || "2.4"] || WIFI_BAND["2.4"];
          ctx.beginPath(); ctx.arc(s.x + sd, s.y + sd, 5 * Math.max(S.view.scale, 0.7), 0, 7); ctx.fillStyle = band.c; ctx.fill(); ctx.strokeStyle = th.card; ctx.lineWidth = 1.6; ctx.stroke();
        }
        if (n.is_uplink) { ctx.fillStyle = cA("hsl(265 70% 60%)", 0.95); ctx.font = `${10 * S.view.scale}px 'DM Sans'`; ctx.textAlign = "center"; ctx.fillText("\u2191", s.x, s.y - R - 4 * S.view.scale); }
        // подписи
        if (S.showLabels && S.view.scale > 0.5 && !dim) {
          ctx.globalAlpha = alpha; ctx.fillStyle = th.foreground; ctx.font = `600 ${11 * S.view.scale}px 'DM Sans',sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
          const label = n.hostname && !/^\d+$/.test(n.hostname) ? n.hostname : n.node_ip;
          ctx.fillText(label, s.x, s.y + R + 15 * S.view.scale);
          if (S.view.scale > 0.75) {
            const parts: { t: string; c: string }[] = [];
            if ((n.ping_ms || 0) > 0) parts.push({ t: n.ping_ms + "ms", c: pingColor(n.ping_ms!) });
            else if (n.status === "off") parts.push({ t: "timeout", c: th.destructive });
            if (n.cpu_load != null) parts.push({ t: n.cpu_load + "%", c: loadColor(n.cpu_load) });
            ctx.font = `${9 * S.view.scale}px 'DM Sans',sans-serif`; let tw = 0; parts.forEach((p) => tw += ctx.measureText(p.t).width + 8); let sx = s.x - tw / 2;
            parts.forEach((p) => { const w = ctx.measureText(p.t).width; ctx.fillStyle = p.c; ctx.textAlign = "left"; ctx.fillText(p.t, sx, s.y + R + 27 * S.view.scale); sx += w + 8; });
          }
        }
        ctx.restore();
      });
      // анимация: пакеты, внешние хопы, RTT-метки
      if (S.anim) {
        const a = S.anim;
        if (a.packets) a.packets.forEach((p: any) => {
          const seg = a.pathIds; if (p.seg >= seg.length - 1) return;
          const na = L.byId[seg[p.seg]], nb = L.byId[seg[p.seg + 1]]; if (!na || !nb) return;
          const sa = toScreen(pos(na.id).x, pos(na.id).y), sb = toScreen(pos(nb.id).x, pos(nb.id).y);
          const x = sa.x + (sb.x - sa.x) * p.f, y = sa.y + (sb.y - sa.y) * p.f;
          ctx.save(); ctx.shadowColor = p.color; ctx.shadowBlur = 14; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, 4.5 * Math.max(S.view.scale, 0.7), 0, 7); ctx.fill(); ctx.restore();
        });
        if (a.externalHops && a.externalHops.length) {
          const gw = L.byId[a.pathIds[a.pathIds.length - 1]]; if (gw) {
            const s = toScreen(pos(gw.id).x, pos(gw.id).y);
            const bx = Math.min(stage.getBoundingClientRect().width - 180, s.x + 120); const by = s.y - 40;
            ctx.save(); ctx.strokeStyle = cA("hsl(265 70% 60%)", 0.6); ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(bx - 10, by + 10); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = cA("hsl(265 70% 60%)", 0.95); ctx.font = `${10 * S.view.scale}px 'DM Sans'`; ctx.textAlign = "left"; ctx.fillText("\u2192 выход в интернет", bx - 10, by - 4);
            a.externalHops.forEach((h: any, i: number) => {
              if (i >= a.extShown) return; const y = by + i * 22;
              ctx.fillStyle = cA(TH().card, 0.95); ctx.strokeStyle = cA(TH().border, 0.8); ctx.lineWidth = 1; roundRect(bx, y, 168, 18, 5); ctx.fill(); ctx.stroke();
              ctx.fillStyle = "hsl(265 70% 60%)"; ctx.font = "10px 'DM Sans'"; ctx.textAlign = "left"; ctx.fillText("hop " + h.hop, bx + 7, y + 13);
              ctx.fillStyle = TH().foreground; ctx.fillText(h.ip, bx + 42, y + 13);
              ctx.fillStyle = h.rtt > 0 ? pingColor(h.rtt) : TH().destructive; ctx.textAlign = "right"; ctx.fillText(h.rtt > 0 ? h.rtt + "ms" : "*", bx + 162, y + 13);
            });
            ctx.restore();
          }
        }
        if (a.rttLabels) a.rttLabels.forEach((lb: any) => {
          const n = L.byId[lb.id]; if (!n) return; const s = toScreen(pos(n.id).x, pos(n.id).y);
          ctx.save(); ctx.font = `bold ${10 * S.view.scale}px 'DM Sans'`; const txt = lb.text; const w = ctx.measureText(txt).width + 12;
          ctx.fillStyle = lb.color; roundRect(s.x - w / 2, s.y - 28 * S.view.scale, w, 16 * S.view.scale, 5); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, s.x, s.y - 20 * S.view.scale); ctx.restore();
        });
      }
      raf = requestAnimationFrame(frame);
    }
    frame();

    // взаимодействие
    const nodeAt = (sx: number, sy: number) => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]; if (!vis(n) || !match(n)) continue;
        const pp = pos(n.id); const s = toScreen(pp.x, pp.y);
        const R = (n.node_type === "net" ? 24 : 21) * S.view.scale + 4;
        if ((sx - s.x) ** 2 + (sy - s.y) ** 2 < R * R) return n;
      }
      return null;
    };
    const toWorld = (sx: number, sy: number) => ({ x: (sx - S.view.x) / S.view.scale, y: (sy - S.view.y) / S.view.scale });
    const onMove = (e: MouseEvent) => {
      const r = stage.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
      if (S.dragNode) { const w = toWorld(sx, sy); L.positions[S.dragNode.id] = { x: w.x, y: w.y }; S.dragMoved = true; return; }
      if (S.panning) { S.view.x += sx - S.last.x; S.view.y += sy - S.last.y; S.last = { x: sx, y: sy }; return; }
      const n = nodeAt(sx, sy); S.hoverNode = n; stage.style.cursor = n ? "grab" : "default";
    };
    const onDown = (e: MouseEvent) => {
      const r = stage.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const n = nodeAt(sx, sy); if (n) { S.dragNode = n; S.dragMoved = false; stage.style.cursor = "grabbing"; } else { S.panning = true; S.last = { x: sx, y: sy }; }
    };
    const onUp = () => {
      if (S.dragNode) {
        if (!S.dragMoved) { S.selNode = S.dragNode; setSel(S.dragNode); }
        else { setDirty(true); } // раскладка изменилась
      }
      S.dragNode = null; S.panning = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const r = stage.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const w = toWorld(sx, sy); const d = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      S.view.scale = Math.max(0.35, Math.min(3, S.view.scale * d)); S.view.x = sx - w.x * S.view.scale; S.view.y = sy - w.y * S.view.scale;
    };
    stage.addEventListener("mousemove", onMove); stage.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp); stage.addEventListener("wheel", onWheel, { passive: false });
    return () => { cancelAnimationFrame(raf); ro.disconnect(); stage.removeEventListener("mousemove", onMove); stage.removeEventListener("mousedown", onDown); window.removeEventListener("mouseup", onUp); stage.removeEventListener("wheel", onWheel); };
  }, [nodes]);

  // операции ping/traceroute (анимация по данным карты)
  const conLine = (t: string, cls = "") => setConsoleState((cs) => ({ ...cs, lines: [...cs.lines, { t, cls }] }));
  const runOp = useCallback((type: string, target: string) => {
    const S = stateRef.current, L = layout.current;
    const dst = nodes.find((n) => n.node_ip === target || (n.hostname || "").toLowerCase() === target.toLowerCase());
    const isExternal = !dst;
    setConsoleState({ open: true, min: false, title: `${type} ${target}`, lines: [] });
    S.anim = null;
    const scanner = L.scanner;
    let path: string[];
    if (dst) path = bfsPath(scanner, dst.id) || [scanner, dst.id];
    else { const gw = nodes.find((n) => n.is_gateway); path = gw ? (bfsPath(scanner, gw.id) || [scanner, gw.id]) : [scanner]; }

    if (type === "ping") {
      conLine(`PING ${target}${dst ? ` (${dst.hostname || dst.node_ip})` : ""} — 4 пакета`, "dim");
      S.anim = { type: "ping", pathIds: path, litSegments: path.length, activeNodes: new Set(path), packets: [], rttLabels: [], externalHops: isExternal ? EXT_HOPS : null, extShown: 0, isExternal };
      let seq = 0;
      const pkt = () => {
        if (!S.anim) return;
        if (seq >= 4) {
          conLine("", "dim");
          const off = dst && dst.status === "off";
          conLine(`4 sent, ${off ? "0" : "4"} received${off ? ", 100% loss" : ", 0% loss"}`, off ? "crit" : "ok");
          if (!off) { const dp = dst ? (dst.ping_ms || 2) : 15; conLine(`rtt min/avg/max = ${Math.max(1, dp - 1)}/${dp}/${dp + 3} ms`, "dim"); }
          setTimeout(() => { S.anim = null; }, 800);
          return;
        }
        seq++;
        const baseRtt = dst ? (dst.ping_ms || 2) : 19; const jit = Math.round((Math.random() * 4 - 1) * 10) / 10; const rtt = Math.max(1, baseRtt + jit);
        const lost = dst && dst.status === "off";
        const p = { seg: 0, f: 0, color: lost ? resolveColor("hsl(var(--destructive))") : resolveColor("hsl(var(--primary))") }; S.anim.packets = [p];
        const endIdx = path.length - 1;
        const iv = setInterval(() => {
          if (!S.anim) { clearInterval(iv); return; }
          p.f += 0.06;
          if (p.f >= 1) { p.f = 0; p.seg++; if (p.seg >= endIdx) { clearInterval(iv); S.anim.packets = []; const tgt = isExternal ? nodes.find((n) => n.is_gateway) : dst;
            if (lost) conLine(`seq=${seq}  timeout`, "crit");
            else { conLine(`seq=${seq}  RTT=${rtt} ms${isExternal ? "  (via gw → интернет)" : ""}`, rtt < 5 ? "ok" : rtt < 30 ? "warn" : "crit"); if (tgt) S.anim.rttLabels = [{ id: tgt.id, text: rtt + " ms", color: pingColor(rtt) }]; }
            setTimeout(pkt, 420);
          } }
        }, 16);
      };
      pkt();
    } else {
      conLine(`traceroute to ${target}, 30 hops max`, "dim");
      S.anim = { type: "trace", pathIds: path, litSegments: 0, activeNodes: new Set([path[0]]), packets: [], rttLabels: [], externalHops: isExternal ? EXT_HOPS : null, extShown: 0, isExternal };
      let hop = 0;
      const step = () => {
        if (!S.anim) return;
        if (hop < path.length - 1) {
          const to = layout.current.byId[path[hop + 1]];
          const p = { seg: hop, f: 0, color: resolveColor("hsl(var(--primary))") }; S.anim.packets = [p];
          const iv = setInterval(() => {
            if (!S.anim) { clearInterval(iv); return; }
            p.f += 0.05;
            if (p.f >= 1) { clearInterval(iv); S.anim.packets = []; S.anim.litSegments = hop + 1; S.anim.activeNodes.add(to.id);
              const rtt = Math.max(1, (to.ping_ms || 2) + Math.round(Math.random() * 3)); S.anim.rttLabels.push({ id: to.id, text: rtt + "ms", color: pingColor(rtt) });
              conLine(`${hop + 1}  ${to.node_ip}  (${to.hostname || "—"})  ${rtt} ms`, "hop"); hop++; setTimeout(step, 500);
            }
          }, 16);
        } else if (isExternal) {
          conLine("— выход за пределы LAN —", "dim"); let ei = 0;
          const ext = () => { if (!S.anim) return; if (ei >= EXT_HOPS.length) { conLine("", "dim"); conLine("трасса завершена", "ok"); setTimeout(() => { S.anim = null; }, 800); return; } S.anim.extShown = ei + 1; const h = EXT_HOPS[ei]; conLine(`${path.length + ei}  ${h.ip}  ${h.rtt} ms`, "hop"); ei++; setTimeout(ext, 520); };
          ext();
        } else { conLine("", "dim"); conLine("трасса завершена", "ok"); setTimeout(() => { S.anim = null; }, 800); }
      };
      step();
    }
  }, [nodes, bfsPath]);

  const [opType, setOpType] = useState("ping");
  const [opTarget, setOpTarget] = useState("8.8.8.8");

  const kpi = {
    online: nodes.filter((n) => n.status === "ok").length,
    warn: nodes.filter((n) => n.status === "warn").length,
    off: nodes.filter((n) => n.status === "off").length,
    agents: nodes.filter((n) => n.linked_agent_id).length,
    avg: (() => { const ps = nodes.filter((n) => (n.ping_ms || 0) > 0); return ps.length ? Math.round(ps.reduce((s, n) => s + (n.ping_ms || 0), 0) / ps.length) : 0; })(),
  };

  return (
    <div className="relative w-full overflow-hidden bg-background text-foreground" style={{ height: "calc(100vh - 64px)", fontFamily: "'DM Sans',system-ui,sans-serif" }}>
      {/* шапка */}
      <div className="flex items-center gap-4 px-5 py-3 bg-card border-b border-border relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded-lg bg-primary" style={{ width: 28, height: 28 }}>
            <Network size={16} color="hsl(var(--primary-foreground))" />
          </div>
          <div>
            <div className="font-semibold text-[15px]" style={{ fontFamily: "'Space Grotesk',sans-serif" }}>Карта инфраструктуры</div>
            <div className="text-muted-foreground text-xs">Живая схема сети · обновление каждые 30 с</div>
          </div>
        </div>
        <div className="flex gap-2 ml-2">
          {[["online", kpi.online, "hsl(var(--success))"], ["warning", kpi.warn, "hsl(var(--warning))"], ["offline", kpi.off, "hsl(var(--destructive))"], ["avg RTT", kpi.avg + " ms", "hsl(var(--foreground))"], ["AP Agent", kpi.agents, "hsl(var(--foreground))"]].map(([l, v, c]) => (
            <div key={l as string} className="bg-muted border border-border rounded-lg px-3 py-1.5" style={{ minWidth: 70 }}>
              <div className="text-[17px] font-semibold" style={{ color: c as string }}>{v}</div>
              <div className="text-[9.5px] text-muted-foreground uppercase tracking-wide mt-0.5">{l}</div>
            </div>
          ))}
        </div>
        <div className="flex-1" />
        {/* сохранение раскладки */}
        {dirty && (
          <button onClick={saveLayout} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-[13px] font-medium disabled:opacity-60">
            {saving ? "Сохранение…" : "Сохранить раскладку"}
          </button>
        )}
        <button onClick={exportXLSX} title="Выгрузить список узлов в Excel (XLSX)"
          className="flex items-center justify-center rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground" style={{ width: 36, height: 36 }}>
          <Table size={15} />
        </button>
        <button onClick={exportPDF} title="Выгрузить карту в PDF"
          className="flex items-center justify-center rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground" style={{ width: 36, height: 36 }}>
          <FileDown size={15} />
        </button>
        <button onClick={starLayout} title="Собрать звездой (шлюз в центре)"
          className="flex items-center justify-center rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground" style={{ width: 36, height: 36 }}>
          <Star size={15} />
        </button>
        <button onClick={resetLayout} title="Сбросить раскладку (по слоям)"
          className="flex items-center justify-center rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground" style={{ width: 36, height: 36 }}>
          <RotateCcw size={15} />
        </button>
        <div className="relative">
          <Search size={13} className="absolute text-muted-foreground" style={{ left: 11, top: "50%", transform: "translateY(-50%)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value.trim())} placeholder="host, IP, MAC…"
            className="bg-muted border border-border rounded-lg text-foreground outline-none" style={{ padding: "8px 12px 8px 32px", fontSize: 13, width: 190 }} />
        </div>
      </div>

      {/* сцена */}
      <div ref={stageRef} className="absolute left-0 right-0 bottom-0" style={{ top: 64 }}>
        <canvas ref={canvasRef} className="block absolute inset-0" />

        {/* фильтры + легенда */}
        <div className="absolute flex flex-col gap-2.5 z-[5]" style={{ left: 16, top: 16 }}>
          <div className="flex gap-1.5 bg-card/90 backdrop-blur border border-border rounded-xl p-1.5">
            {[["all", "Все"], ["net", "Network"], ["server", "Серверы"], ["pc", "Хосты"], ["other", "Прочее"]].map(([f, l]) => (
              <button key={f} onClick={() => setFilter(f)}
                className={filter === f ? "bg-primary text-primary-foreground rounded-lg" : "text-muted-foreground hover:text-foreground rounded-lg"}
                style={{ padding: "6px 11px", fontSize: 12, border: "1px solid transparent" }}>{l}</button>
            ))}
          </div>
          <div className="bg-card/90 backdrop-blur border border-border rounded-xl text-muted-foreground" style={{ padding: "11px 13px", fontSize: 11, width: 216 }}>
            <div className="uppercase tracking-wide mb-2 font-semibold" style={{ fontSize: 9.5 }}>Link — скорость канала</div>
            <div className="flex items-center gap-2 mb-1.5"><span style={{ width: 24, borderTop: "3px solid hsl(265 70% 60%)", borderRadius: 2 }} />10 GbE — магистраль</div>
            <div className="flex items-center gap-2 mb-1.5"><span style={{ width: 24, borderTop: "2.5px solid hsl(var(--primary))", borderRadius: 2 }} />1 GbE — стандарт</div>
            <div className="flex items-center gap-2 mb-1.5"><span style={{ width: 24, borderTop: "1.6px dashed hsl(var(--muted-foreground))" }} />100 Mb — узкое место</div>
            <div style={{ height: 1, background: "hsl(var(--border))", margin: "9px 0" }} />
            <div className="uppercase tracking-wide mb-2 font-semibold flex items-center gap-1.5" style={{ fontSize: 9.5 }}><Wifi size={11} /> Wi-Fi — беспровод</div>
            <div className="flex items-center gap-2 mb-1.5"><span style={{ width: 24, borderTop: "2px dotted hsl(38 92% 50%)" }} />2.4 ГГц</div>
            <div className="flex items-center gap-2 mb-1.5"><span style={{ width: 24, borderTop: "2px dotted hsl(200 85% 50%)" }} />5 ГГц</div>
            <div style={{ height: 1, background: "hsl(var(--border))", margin: "9px 0" }} />
            <div className="uppercase tracking-wide mb-2 font-semibold" style={{ fontSize: 9.5 }}>RTT — задержка</div>
            <div className="flex items-center gap-2 mb-1.5"><span style={{ width: 11, height: 11, borderRadius: 3, background: "hsl(var(--success))" }} />&lt; 5 ms — норма</div>
            <div className="flex items-center gap-2 mb-1.5"><span style={{ width: 11, height: 11, borderRadius: 3, background: "hsl(var(--warning))" }} />5–30 ms — повышенная</div>
            <div className="flex items-center gap-2 mb-1.5"><span style={{ width: 11, height: 11, borderRadius: 3, background: "hsl(var(--destructive))" }} />&gt; 30 ms — высокая</div>
            <div style={{ height: 1, background: "hsl(var(--border))", margin: "9px 0" }} />
            <div className="flex flex-col gap-1.5">
              {[["flow", "Трафик (поток)"], ["heat", "RTT heat-map"], ["speed", "Метки скорости"], ["labels", "Подписи узлов"]].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 11.5 }}>
                  <input type="checkbox" checked={(toggles as any)[k]} onChange={(e) => setToggles((t) => ({ ...t, [k]: e.target.checked }))} style={{ accentColor: "hsl(var(--primary))", width: 13, height: 13 }} />{l}
                </label>
              ))}
            </div>
          </div>
        </div>

        {sel && <DetailPanel node={sel} onClose={() => { setSel(null); stateRef.current.selNode = null; }} onOp={(t) => { setOpType(t); setOpTarget(sel.node_ip); runOp(t, sel.node_ip); }}
          onSetConn={async (val) => {
            try {
              await (supabase.from("network_nodes" as any) as any).update({ conn_type_manual: val }).eq("id", sel.id);
              sel.conn_type_manual = val || null;
              onLayoutSaved();
            } catch (e) { /* no-op */ }
          }} />}

        {/* панель операций */}
        <div className="absolute flex items-center gap-2 bg-card/95 backdrop-blur border border-border rounded-xl z-[8]" style={{ left: "50%", bottom: 16, transform: "translateX(-50%)", padding: "8px 10px", boxShadow: "0 8px 30px hsl(0 0% 0% / 0.15)" }}>
          <span className="text-muted-foreground px-1" style={{ fontSize: 11 }}>Операция</span>
          <select value={opType} onChange={(e) => setOpType(e.target.value)} className="bg-muted border border-border rounded-lg text-foreground outline-none" style={{ padding: "7px 9px", fontSize: 12.5 }}>
            <option value="ping">ping</option><option value="traceroute">traceroute</option>
          </select>
          <span className="text-muted-foreground px-1" style={{ fontSize: 11 }}>Цель</span>
          <input value={opTarget} onChange={(e) => setOpTarget(e.target.value)} placeholder="IP или host" className="bg-muted border border-border rounded-lg text-foreground outline-none font-mono" style={{ padding: "7px 9px", fontSize: 12.5, width: 150 }} />
          <button onClick={() => opTarget.trim() && runOp(opType, opTarget.trim())} className="bg-primary text-primary-foreground rounded-lg font-semibold" style={{ padding: "7px 16px", fontSize: 12.5, border: "none" }}>▶ Выполнить</button>
        </div>

        {/* консоль */}
        {consoleState.open && (
          <div className="absolute bg-card/97 backdrop-blur border border-border rounded-xl z-[7] overflow-hidden" style={{ right: 16, bottom: 16, width: 340, boxShadow: "0 8px 30px hsl(0 0% 0% / 0.2)" }}>
            <div className="flex items-center gap-2 border-b border-border bg-muted/60" style={{ padding: "9px 12px" }}>
              <div className="font-semibold font-mono flex-1 flex items-center gap-2 text-foreground" style={{ fontSize: 12 }}>
                <span className="flex gap-1"><i style={{ width: 9, height: 9, borderRadius: "50%", background: "hsl(var(--destructive))", display: "block" }} /><i style={{ width: 9, height: 9, borderRadius: "50%", background: "hsl(var(--warning))", display: "block" }} /><i style={{ width: 9, height: 9, borderRadius: "50%", background: "hsl(var(--success))", display: "block" }} /></span>
                {consoleState.title}
              </div>
              <button onClick={() => setConsoleState((c) => ({ ...c, min: !c.min }))} className="text-muted-foreground" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>–</button>
              <button onClick={() => { setConsoleState((c) => ({ ...c, open: false })); stateRef.current.anim = null; }} className="text-muted-foreground" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>×</button>
            </div>
            {!consoleState.min && (
              <div className="font-mono overflow-y-auto text-foreground" style={{ padding: "10px 12px", fontSize: 11.5, lineHeight: 1.65, maxHeight: 200 }}>
                {consoleState.lines.map((l, i) => (
                  <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: l.cls === "dim" ? "hsl(var(--muted-foreground))" : l.cls === "ok" ? "hsl(var(--success))" : l.cls === "warn" ? "hsl(var(--warning))" : l.cls === "crit" ? "hsl(var(--destructive))" : l.cls === "hop" ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>{l.t || "\u00a0"}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* панель деталей узла — в стиле портала */
function DetailPanel({ node, onClose, onOp, onSetConn }: { node: NetNode; onClose: () => void; onOp: (t: string) => void; onSetConn: (val: string) => void }) {
  const tc = TCOL[node.node_type] || TCOL.other;
  const unknown = node.icon === "unknown";
  const pc = pingColor(node.ping_ms || 0);
  const st = node.status === "ok" ? ["hsl(var(--success))", "online"] : node.status === "warn" ? ["hsl(var(--warning))", "warning"] : ["hsl(var(--destructive))", "offline"];
  const band = effConn(node) === "wifi" ? (WIFI_BAND[node.wifi_band || "2.4"] || WIFI_BAND["2.4"]) : null;
  const label = node.hostname && !/^\d+$/.test(node.hostname) ? node.hostname : node.node_ip;
  const rows: [string, any][] = [
    ["IP", node.node_ip], ["MAC", node.node_mac], ["Роль", node.role],
    ["Vendor", node.vendor], ["OS", node.os], ["Uptime", node.uptime],
  ];
  return (
    <div className="absolute bg-card/95 backdrop-blur border border-border rounded-2xl z-[6] overflow-hidden" style={{ right: 16, top: 16, width: 300, boxShadow: "0 12px 40px hsl(0 0% 0% / 0.2)" }}>
      <div className="border-b border-border relative" style={{ padding: "15px 16px 13px" }}>
        <button onClick={onClose} className="absolute text-muted-foreground" style={{ right: 12, top: 12, background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>×</button>
        <div className="font-semibold flex items-center gap-2.5 mb-2 text-foreground" style={{ fontSize: 16, paddingRight: 22, fontFamily: "'Space Grotesk',sans-serif" }}>
          <span className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, background: cA(unknown ? "hsl(var(--destructive))" : tc, 0.14) }}
            dangerouslySetInnerHTML={{ __html: iconSvg(node.icon, unknown ? "hsl(var(--destructive))" : tc, 20) }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md" style={{ fontSize: 10.5, padding: "3px 8px", background: cA(st[0], 0.14), color: st[0] }}>● {st[1]}</span>
          {node.linked_agent_id
            ? <span className="rounded-md" style={{ fontSize: 10.5, padding: "3px 8px", background: cA("hsl(var(--success))", 0.14), color: "hsl(var(--success))" }}>▲ AP Agent{node.av_version ? " " + node.av_version : ""}</span>
            : <span className="rounded-md" style={{ fontSize: 10.5, padding: "3px 8px", background: cA("hsl(var(--muted-foreground))", 0.16), color: "hsl(var(--muted-foreground))" }}>без агента</span>}
          {band && <span className="rounded-md flex items-center gap-1" style={{ fontSize: 10.5, padding: "3px 8px", background: cA(band.c, 0.14), color: band.c }}>Wi-Fi {node.wifi_band} ГГц</span>}
          {node.snmp && <span className="rounded-md" style={{ fontSize: 10.5, padding: "3px 8px", background: cA("hsl(210 80% 55%)", 0.14), color: "hsl(210 80% 55%)" }}>SNMP</span>}
          {node.is_uplink && <span className="rounded-md" style={{ fontSize: 10.5, padding: "3px 8px", background: cA("hsl(265 70% 60%)", 0.14), color: "hsl(265 70% 60%)" }}>uplink ↑</span>}
        </div>
      </div>
      {node.cause && (
        <div className="flex gap-2" style={{ margin: "12px 16px 0", padding: "9px 11px", borderRadius: 9, fontSize: 12, lineHeight: 1.4, background: cA(node.status === "off" ? "hsl(var(--destructive))" : "hsl(var(--warning))", 0.1), border: `1px solid ${cA(node.status === "off" ? "hsl(var(--destructive))" : "hsl(var(--warning))", 0.25)}`, color: node.status === "off" ? "hsl(var(--destructive))" : "hsl(38 80% 35%)" }}>
          <span>{node.status === "off" ? "✕" : "⚠"}</span><span><b>Причина статуса:</b> {node.cause}</span>
        </div>
      )}
      <div style={{ padding: "13px 16px 6px" }}>
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between border-b" style={{ padding: "6.5px 0", borderColor: "hsl(var(--border) / 0.6)", fontSize: 12.5, gap: 10 }}>
            <span className="text-muted-foreground whitespace-nowrap">{k}</span>
            <span className="text-foreground font-mono" style={{ fontWeight: 500, fontSize: 12, textAlign: "right" }}>{v}</span>
          </div>
        ))}
        {(node.ping_ms || 0) > 0 && <div className="flex justify-between border-b" style={{ padding: "6.5px 0", borderColor: "hsl(var(--border) / 0.6)", fontSize: 12.5 }}><span className="text-muted-foreground">RTT</span><span className="font-mono rounded" style={{ padding: "2px 7px", fontSize: 11, fontWeight: 600, background: cA(pc, 0.14), color: pc }}>{node.ping_ms} ms</span></div>}
        {node.status === "off" && <div className="flex justify-between border-b" style={{ padding: "6.5px 0", borderColor: "hsl(var(--border) / 0.6)", fontSize: 12.5 }}><span className="text-muted-foreground">RTT</span><span className="font-mono rounded" style={{ padding: "2px 7px", fontSize: 11, fontWeight: 600, background: cA("hsl(var(--destructive))", 0.14), color: "hsl(var(--destructive))" }}>timeout</span></div>}
        {node.cpu_load != null && <div className="flex justify-between" style={{ padding: "6.5px 0", fontSize: 12.5 }}><span className="text-muted-foreground">CPU load</span><span className="font-mono rounded" style={{ padding: "2px 7px", fontSize: 11, fontWeight: 600, background: cA(loadColor(node.cpu_load), 0.14), color: loadColor(node.cpu_load) }}>{node.cpu_load}%</span></div>}
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border" style={{ padding: "10px 16px" }}>
        <div className="flex items-center gap-1.5" style={{ fontSize: 11 }}>
          <span className="text-muted-foreground" style={{ minWidth: 44 }}>Канал:</span>
          {[["", "авто"], ["ethernet", "кабель"], ["wifi", "Wi-Fi"]].map(([val, lbl]) => {
            const active = (node.conn_type_manual || "") === val;
            return (
              <button key={val || "auto"} onClick={() => onSetConn(val)}
                className={active ? "rounded-md bg-primary text-primary-foreground" : "rounded-md bg-muted border border-border text-muted-foreground hover:text-foreground"}
                style={{ padding: "4px 9px", fontSize: 11, cursor: "pointer", border: active ? "1px solid transparent" : undefined }}>{lbl}</button>
            );
          })}
        </div>
        <div className="flex gap-2">
        <button onClick={() => onOp("ping")} className="flex-1 bg-muted border border-border rounded-lg text-foreground hover:bg-accent/10" style={{ padding: 7, fontSize: 12, cursor: "pointer" }}>▶ ping отсюда</button>
        <button onClick={() => onOp("traceroute")} className="flex-1 bg-muted border border-border rounded-lg text-foreground hover:bg-accent/10" style={{ padding: 7, fontSize: 12, cursor: "pointer" }}>▶ traceroute</button>
        </div>
      </div>
      {node.linked_agent_id && (
        <div className="border-t border-border bg-muted/50" style={{ padding: "11px 16px" }}>
          <a href={`/agents/${node.linked_agent_id}`} className="text-primary flex items-center gap-1.5" style={{ fontSize: 12.5, textDecoration: "none" }}>↗ Открыть карточку в портале · AP Agent</a>
        </div>
      )}
    </div>
  );
}
