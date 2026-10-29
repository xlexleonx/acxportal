// Справочник: технический ключ модуля → коммерческое название для UI.
export const MODULE_LABELS: Record<string, string> = {
  net_extended: "Network+",
  av_monitor: "Antivirus",
  patches: "Patches",
  security_events: "Security Events",
  removable_alerts: "Removable",
  hw_replace: "HW Replace",
  snmp: "SNMP",
  bmc: "BMC",
};

export function moduleLabel(key: string): string {
  return MODULE_LABELS[key] || key;
}

export function moduleLabels(keys: unknown): string {
  if (!Array.isArray(keys)) return "";
  return keys.map((k) => moduleLabel(String(k))).join(", ");
}
