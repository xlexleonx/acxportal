import { supabase } from "@/integrations/supabase/client";

/**
 * Reads the currently selected Zabbix connection id from localStorage.
 * The provider in src/hooks/useZabbixConnection.tsx writes this value.
 * Reading from storage (instead of context) lets non-React code and
 * legacy invocations participate without a refactor.
 */
function activeConnectionId(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("zabbix.activeConnectionId");
  } catch {
    return null;
  }
}

/**
 * Drop-in replacement for `invokeZabbix( { body })`
 * that automatically injects `connection_id` from the global picker.
 */
// Return type kept as `any` so legacy callers that read `data.result` / `data.error`
// keep working without per-call generic annotations.
export function invokeZabbix<T = any>(payload: { body?: Record<string, unknown> } = {}) {
  const id = activeConnectionId();
  // Явно переданный connection_id важнее глобально выбранного. Это нужно
  // при проверке нового/редактируемого подключения: иначе тест уходил к
  // старому выбранному серверу из localStorage.
  const nextBody = { ...(id ? { connection_id: id } : {}), ...(payload.body ?? {}) };
  return supabase.functions.invoke<T>("zabbix-proxy", { body: nextBody });
}
