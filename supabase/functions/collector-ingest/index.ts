import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-acx-installation, x-acx-sync-token",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type CollectorEvent = { event_id?: string; type?: string; payload?: Record<string, unknown>; created_at?: string };
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const eventTime = (event: CollectorEvent) => {
  const value = text(event.created_at);
  return value && !Number.isNaN(Date.parse(value)) ? value : new Date().toISOString();
};

async function persistTelemetry(supabase: any, collectorConnectionId: string, events: CollectorEvent[]) {
  const devices = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    const payload = asRecord(event.payload);
    const source = asRecord(payload.device);
    const sourceDeviceId = text(source.source_device_id, text(payload.device_id));
    if (!sourceDeviceId) continue;
    devices.set(sourceDeviceId, {
      collector_connection_id: collectorConnectionId,
      source_device_id: sourceDeviceId,
      name: text(source.name, `Устройство ${sourceDeviceId.slice(0, 8)}`),
      address: text(source.address) || null,
      protocol: text(source.protocol) || null,
      status: text(source.status, "unknown"),
      status_message: text(source.status_message) || null,
      last_seen_at: text(source.last_seen_at) || null,
      last_poll_at: text(source.last_poll_at) || null,
      metadata: { collector_device_id: sourceDeviceId },
    });
  }
  if (!devices.size) return;

  const { data: savedDevices, error: devicesError } = await supabase
    .from("collector_devices")
    .upsert([...devices.values()], { onConflict: "collector_connection_id,source_device_id" })
    .select("id,source_device_id");
  if (devicesError) throw devicesError;
  const deviceIds = new Map((savedDevices ?? []).map((device: any) => [device.source_device_id, device.id]));

  const metrics = new Map<string, Record<string, unknown>>();
  const openedProblems = new Map<string, Record<string, unknown>>();
  const closedProblems: Array<{ collector_device_id: string; trigger_id: string; closed_at: string }> = [];
  for (const event of events) {
    const payload = asRecord(event.payload);
    const source = asRecord(payload.device);
    const sourceDeviceId = text(source.source_device_id, text(payload.device_id));
    const collectorDeviceId = deviceIds.get(sourceDeviceId);
    if (!collectorDeviceId) continue;
    const timestamp = eventTime(event);
    if (event.type === "metric.sample") {
      const metric = asRecord(payload.metric);
      const key = text(metric.key, text(payload.item_key));
      if (!key) continue;
      metrics.set(`${collectorDeviceId}:${key}`, {
        collector_device_id: collectorDeviceId,
        item_key: key,
        name: text(metric.name, key),
        units: text(metric.units),
        value: text(metric.value, text(payload.value)) || null,
        error: text(metric.error, text(payload.error)) || null,
        collected_at: text(metric.collected_at, timestamp),
      });
    }
    if (event.type === "problem.opened") {
      const triggerId = text(payload.trigger_id);
      if (!triggerId) continue;
      openedProblems.set(`${collectorDeviceId}:${triggerId}`, {
        collector_device_id: collectorDeviceId,
        source_trigger_id: triggerId,
        description: text(payload.name, "Проблема коллектора"),
        severity: text(payload.severity, "warning"),
        is_active: true,
        opened_at: timestamp,
        closed_at: null,
      });
    }
    if (event.type === "problem.closed") {
      const triggerId = text(payload.trigger_id);
      if (triggerId) closedProblems.push({ collector_device_id: collectorDeviceId, trigger_id: triggerId, closed_at: timestamp });
    }
  }
  if (metrics.size) {
    const { error } = await supabase.from("collector_metric_values")
      .upsert([...metrics.values()], { onConflict: "collector_device_id,item_key" });
    if (error) throw error;
  }
  if (openedProblems.size) {
    const { error } = await supabase.from("collector_problems")
      .upsert([...openedProblems.values()], { onConflict: "collector_device_id,source_trigger_id" });
    if (error) throw error;
  }
  for (const problem of closedProblems) {
    const { error } = await supabase.from("collector_problems")
      .update({ is_active: false, closed_at: problem.closed_at })
      .eq("collector_device_id", problem.collector_device_id)
      .eq("source_trigger_id", problem.trigger_id);
    if (error) throw error;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "content-type": "application/json" } });

  const collectorId = req.headers.get("X-ACX-Installation") || "";
  const token = req.headers.get("X-ACX-Sync-Token") || "";
  if (!collectorId || !token) return new Response(JSON.stringify({ error: "Collector credentials are required" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const tokenHash = await sha256(token);
    const { data: collector, error } = await supabase
      .from("collector_connections")
      .select("id, is_active")
      .eq("collector_id", collectorId)
      .eq("sync_token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!collector || !collector.is_active) return new Response(JSON.stringify({ error: "Invalid collector credentials" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const events: CollectorEvent[] = Array.isArray(body?.events)
      ? body.events.slice(0, 500)
      : [{ event_id: body?.event_id, type: body?.type, payload: asRecord(body?.payload), created_at: body?.created_at }];
    await persistTelemetry(supabase, collector.id, events);
    const heartbeat = events.find((event) => event.type === "collector.heartbeat");
    const heartbeatPayload = asRecord(heartbeat?.payload);
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { last_seen_at: now };
    if (events.some((event) => event.type && event.type !== "collector.heartbeat")) update.last_event_at = now;
    if (typeof heartbeatPayload.collector_version === "string") update.collector_version = heartbeatPayload.collector_version.slice(0, 80);
    if (typeof heartbeatPayload.collector_name === "string") update.metadata = { name: heartbeatPayload.collector_name.slice(0, 200) };
    const { error: updateError } = await supabase.from("collector_connections").update(update).eq("id", collector.id);
    if (updateError) throw updateError;
    return new Response(JSON.stringify({ ok: true, ingest_version: 2 }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
}
