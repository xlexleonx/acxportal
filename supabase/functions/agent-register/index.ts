// Регистрация агента AP Agent. POST /functions/v1/agent-register
// Требует действительный ключ регистрации (enrollment_key). Принимает данные хоста,
// создаёт/обновляет запись в agent_registrations и возвращает токен (X-Agent-Token).
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token, x-enrollment-key" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomAgentId(): string {
  return "agent_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
function reject(msg: string, status = 403): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Проверка ключа регистрации (до любой записи) ──
    const enrollKey =
      req.headers.get("X-Enrollment-Key") ||
      req.headers.get("x-enrollment-key") ||
      body.enrollment_key;
    if (!enrollKey) return reject("Missing enrollment key", 401);

    const { data: keyRow, error: keyErr } = await supabase
      .from("agent_enrollment_keys")
      .select("id, is_active, max_uses, used_count, expires_at, organization_id")
      .eq("key", enrollKey)
      .maybeSingle();
    if (keyErr) throw keyErr;
    if (!keyRow || !keyRow.is_active) return reject("Invalid enrollment key");
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      return reject("Enrollment key expired");
    }
    if (keyRow.max_uses != null && keyRow.used_count >= keyRow.max_uses) {
      return reject("Enrollment key exhausted");
    }
    // ──────────────────────────────────────────────────

    const agentId: string = body.agent_id || randomAgentId();
    const payload: Record<string, unknown> = {
      agent_id: agentId,
      hostname: body.hostname ?? null,
      os_type: body.os_type ?? null,
      os_version: body.os_version ?? null,
      arch: body.arch ?? null,
      serial_number: body.serial_number ?? null,
      ip_addresses: body.ip_addresses ?? [],
      mac_addresses: body.mac_addresses ?? [],
      cpu_model: body.cpu_model ?? null,
      cpu_cores: body.cpu_cores ?? null,
      ram_total_mb: body.ram_total_mb ?? null,
      agent_version: body.agent_version ?? null,
      last_seen_at: new Date().toISOString(),
      auto_registered: true,
    };

    payload.enrollment_key_id = keyRow.id;
    // Организация берётся из ключа (если у ключа она задана). Демо-ключ без
    // организации org не проставляет — не затираем возможную существующую.
    if (keyRow.organization_id) {
      payload.organization_id = keyRow.organization_id;
    }

    // Известный агент — обновляем, ключ НЕ расходуем (это не новая установка).
    const { data: existing } = await supabase
      .from("agent_registrations")
      .select("id, token")
      .eq("agent_id", agentId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("agent_registrations")
        .update(payload)
        .eq("agent_id", agentId);
      if (error) throw error;
      return new Response(
        JSON.stringify({ agent_id: agentId, token: existing.token, registered: false }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // Лимит модулей SNMP/BMC по тарифу орг. Считаем только НОВЫЕ цели этого типа.
    const moduleType = body.is_snmp ? "snmp" : (body.is_bmc ? "bmc" : null);
    if (moduleType && keyRow.organization_id) {
      const limitCol = moduleType === "snmp" ? "snmp_device_limit" : "bmc_device_limit";
      const { data: org } = await supabase
        .from("organizations")
        .select(limitCol)
        .eq("id", keyRow.organization_id)
        .maybeSingle();
      const limit = (org?.[limitCol] as number) ?? 0;
      const { count } = await supabase
        .from("agent_registrations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", keyRow.organization_id)
        .eq("os_type", moduleType);
      if ((count ?? 0) >= limit) {
        return new Response(
          JSON.stringify({ error: `Лимит модуля ${moduleType.toUpperCase()} исчерпан (${count ?? 0}/${limit}). Обратитесь за расширением тарифа.` }),
          { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } },
        );
      }
    }

    // Новый агент — создаём и расходуем одну единицу ключа.
    const token = randomToken();
    const { error } = await supabase
      .from("agent_registrations")
      .insert({ ...payload, token, registered_at: new Date().toISOString() });
    if (error) throw error;

    await supabase
      .from("agent_enrollment_keys")
      .update({ used_count: keyRow.used_count + 1 })
      .eq("id", keyRow.id);

    // Уведомление о новом агенте — подписчикам события agent.registered.
    console.log(`[agent.registered] новый агент ${agentId} (${payload.hostname ?? "?"}), шлю уведомление в dispatch`);
    try {
      const nr = await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json", "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({
          event_type: "agent.registered",
          priority: "P3",
          title: "🖥 Новый агент подключён",
          body: `Зарегистрирован агент ${payload.hostname ?? agentId}.`,
          payload: { agent_id: agentId, hostname: payload.hostname, organization_id: keyRow.organization_id ?? null },
        }),
      });
      console.log(`[agent.registered] dispatch ответил: HTTP ${nr.status}`);
      const nrText = await nr.text();
      console.log(`[agent.registered] dispatch тело: ${nrText.slice(0,300)}`);
    } catch (e) { console.log(`[agent.registered] ОШИБКА уведомления: ${e}`); }
    return new Response(
      JSON.stringify({ agent_id: agentId, token, registered: true }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
}
