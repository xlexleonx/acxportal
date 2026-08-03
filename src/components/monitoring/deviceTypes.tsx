import type { LucideIcon } from "lucide-react";
import { Server, Monitor, HardDrive, Network, Shield, Zap, Router, MonitorCog, DatabaseBackup, PlugZap, Thermometer } from "lucide-react";

export const deviceTypeConfig: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  server: { label: "Сервер", icon: Server, color: "text-blue-500" },
  bmc: { label: "BMC / IPMI", icon: Monitor, color: "text-orange-500" },
  switch: { label: "Коммутатор", icon: Network, color: "text-green-500" },
  storage: { label: "СХД", icon: HardDrive, color: "text-purple-500" },
  firewall: { label: "Межсетевой экран", icon: Shield, color: "text-red-500" },
  ups: { label: "ИБП", icon: Zap, color: "text-yellow-500" },
  router: { label: "Маршрутизатор", icon: Router, color: "text-cyan-500" },
  vm_windows: { label: "ВМ (Windows)", icon: Monitor, color: "text-sky-500" },
  vm_linux: { label: "ВМ (Linux)", icon: MonitorCog, color: "text-teal-500" },
  backup_server: { label: "Сервер резервного копирования", icon: DatabaseBackup, color: "text-indigo-500" },
  pdu: { label: "PDU (распределение питания)", icon: PlugZap, color: "text-amber-500" },
  env_sensor: { label: "Датчик среды", icon: Thermometer, color: "text-pink-500" },
  other: { label: "Другое", icon: Server, color: "text-muted-foreground" },
};

export function getDeviceTypeConfig(type: string) {
  return deviceTypeConfig[type] || deviceTypeConfig.other;
}
