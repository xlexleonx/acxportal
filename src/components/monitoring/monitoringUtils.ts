export const priorityColor = (p: string) => {
  const n = parseInt(p);
  if (n >= 4) return "destructive";
  if (n === 3) return "warning";
  if (n === 2) return "default";
  return "secondary";
};

export const priorityLabel = (p: string) => {
  const map: Record<string, string> = {
    "0": "Не классиф.", "1": "Информация", "2": "Предупреждение",
    "3": "Средний", "4": "Высокий", "5": "Катастрофа",
  };
  return map[p] || p;
};

export const priorityToIncident = (p: string) => {
  const n = parseInt(p);
  if (n >= 4) return { label: "П1 — Критический", priority: "P1", color: "text-red-500" };
  if (n === 3) return { label: "П2 — Частичный отказ", priority: "P2", color: "text-orange-500" };
  if (n === 2) return { label: "П3 — Сбои сервисов", priority: "P3", color: "text-yellow-500" };
  return { label: "П4 — Некритичные", priority: "P4", color: "text-blue-500" };
};

export const availabilityBadge = (avail: string) => {
  switch (avail) {
    case "1": return { variant: "success" as const, label: "Доступен", color: "text-green-500" };
    case "2": return { variant: "destructive" as const, label: "Недоступен", color: "text-red-500" };
    default: return { variant: "outline" as const, label: "Неизвестно", color: "text-muted-foreground" };
  }
};

export const hostGroupType = (groups: any[]) => {
  const name = (groups?.[0]?.name || "").toLowerCase();
  if (name.includes("linux") || name.includes("astra")) return "server";
  if (name.includes("storage") || name.includes("ocean")) return "storage";
  if (name.includes("switch") || name.includes("network") || name.includes("firewall") || name.includes("router")) return "network";
  if (name.includes("windows")) return "windows";
  return "other";
};

import { Server, Monitor, HardDrive, Network, Cpu } from "lucide-react";

export const groupTypeConfig: Record<string, { label: string; icon: typeof Server }> = {
  server: { label: "Серверы (Linux)", icon: Server },
  windows: { label: "Серверы (Windows)", icon: Monitor },
  storage: { label: "СХД", icon: HardDrive },
  network: { label: "Сетевое оборудование", icon: Network },
  other: { label: "Zabbix клиенты", icon: Server },
};

export function metricColor(val: number | null) {
  if (val === null) return "text-muted-foreground";
  if (val > 90) return "text-red-500";
  if (val > 70) return "text-yellow-500";
  return "text-green-500";
}

export function duration(clock: string) {
  const diff = Math.floor(Date.now() / 1000 - parseInt(clock));
  if (diff < 60) return `${diff}с`;
  if (diff < 3600) return `${Math.floor(diff / 60)}м`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч ${Math.floor((diff % 3600) / 60)}м`;
  return `${Math.floor(diff / 86400)}д ${Math.floor((diff % 86400) / 3600)}ч`;
}


// Нужно ли устройству ФИЗИЧЕСКОЕ обслуживание (чистка от пыли, проверка охлаждения)
// и применимо ли к нему uptime-правило перезагрузки/ТО.
// Обслуживаемое: серверы, СХД, BMC (это компьютеры/массивы с вентиляторами и ОС).
// НЕ обслуживаемое: сетевое (коммутаторы/маршрутизаторы/МСЭ) и ИБП — их uptime это норма.
// Физическое ТО (чистка от пыли, проверка охлаждения) — железо с вентиляторами.
export const PHYSICAL_SERVICE_TYPES = new Set(["server", "backup_server", "storage", "bmc", "pdu", "ups"]);
// Перезагрузка/uptime актуальны — то же железо ПЛЮС виртуальные машины (ОС требует перезагрузки).
export const REBOOT_TYPES = new Set([...PHYSICAL_SERVICE_TYPES, "vm_windows", "vm_linux"]);

export function needsPhysicalService(deviceType?: string | null): boolean {
  return PHYSICAL_SERVICE_TYPES.has(String(deviceType || "").toLowerCase());
}
export function needsReboot(deviceType?: string | null): boolean {
  return REBOOT_TYPES.has(String(deviceType || "").toLowerCase());
}
// Обратная совместимость: «обслуживаемое» = требует физического ТО.
export const MAINTAINABLE_TYPES = PHYSICAL_SERVICE_TYPES;
export function isMaintainable(deviceType?: string | null): boolean {
  return needsPhysicalService(deviceType);
}
