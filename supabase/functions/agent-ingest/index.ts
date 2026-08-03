// Приём метрик от агента. POST /functions/v1/agent-ingest
// Заголовок X-Agent-Token обязателен. Сохраняет метрики, процессы, инвентарь,
// события Windows (с дедупликацией), обновляет last_seen_at и agent_version.
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  const token = req.headers.get("X-Agent-Token") || req.headers.get("x-agent-token");
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing X-Agent-Token" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: agent, error: authErr } = await supabase
      .from("agent_registrations")
      .select("id, agent_id, is_active")
      .eq("token", token)
      .maybeSingle();
    if (authErr || !agent || !agent.is_active) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const bodyRaw = await req.json().catch(() => ({}));
    // Postgres не принимает \u0000 в jsonb/text — чистим рекурсивно.
    const stripNul = (v: any): any =>
      typeof v === "string" ? v.replace(/\u0000/g, "")
      : Array.isArray(v) ? v.map(stripNul)
      : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripNul(x)]))
      : v;
    const body = stripNul(bodyRaw);
    const now = new Date().toISOString();
    const metric = {
      agent_id: agent.agent_id,
      collected_at: body.collected_at ?? now,
      cpu_usage_percent: body.cpu_usage_percent ?? null,
      ram_used_mb: body.ram_used_mb ?? null,
      ram_total_mb: body.ram_total_mb ?? null,
      disk_forecast: body.disk_forecast ?? null,
          smart_trends: body.smart_trends ?? null,
          system_state: body.system_state ?? null,
          health: body.health ?? null,
          disk_metrics: body.disk_metrics ?? null,
      network_metrics: body.network_metrics ?? null,
      bmc_hardware: body.bmc_hardware ?? null,
      snmp_sys_descr: body.snmp_sys_descr ?? null,
      snmp_sys_name: body.snmp_sys_name ?? null,
      source: body.source ?? null,
      temperatures: body.temperatures ?? null,
      services: body.services ?? null,
      uptime_seconds: body.uptime_seconds ?? null,
      load_avg: body.load_avg ?? null,
    };
    const { error: insErr } = await supabase.from("agent_metrics").insert(metric);
    if (insErr) throw insErr;

    if (Array.isArray(body.processes)) {
      const { error: procErr } = await supabase
        .from("agent_processes")
        .upsert({
          agent_id: agent.agent_id,
          collected_at: body.collected_at ?? now,
          processes: body.processes,
          updated_at: now,
        }, { onConflict: "agent_id" });
      if (procErr) console.error("processes upsert:", procErr.message);
    }

    if (body.inventory && typeof body.inventory === "object") {
      const inv = body.inventory;
      const { error: invErr } = await supabase
        .from("agent_inventory")
        .upsert({
          agent_id: agent.agent_id,
          collected_at: inv.collected_at ?? now,
          software: Array.isArray(inv.software) ? inv.software : [],
          disks_health: Array.isArray(inv.disks_health) ? inv.disks_health : [],
          updated_at: now,
        }, { onConflict: "agent_id" });
      if (invErr) console.error("inventory upsert:", invErr.message);
    }

    if (Array.isArray(body.events) && body.events.length > 0) {
      const rows = body.events.map((e: any) => ({
        agent_id: agent.agent_id,
        record_id: e.record_id ?? null,
        log: e.log ?? null,
        level: e.level ?? null,
        source: e.source ?? null,
        event_id: e.event_id ?? null,
        message: e.message ?? null,
        time_created: e.time_created ?? null,
      }));
      const { error: evErr } = await supabase
        .from("agent_events")
        .upsert(rows, { onConflict: "agent_id,log,record_id", ignoreDuplicates: true });
      if (evErr) console.error("events upsert:", evErr.message);
    }

    const reg: Record<string, unknown> = { last_seen_at: now };
    if (typeof body.agent_version === "string" && body.agent_version) {
      reg.agent_version = body.agent_version;
    }
    await supabase.from("agent_registrations").update(reg).eq("agent_id", agent.agent_id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
}
