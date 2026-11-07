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

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}

type CollectorEvent = { event_id?: string; type?: string; payload?: Record<string, unknown>; created_at?: string };
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const eventTime = (event: CollectorEvent) => {
  const value = text(event.created_at);
  return value && !Number.isNaN(Date.parse(value)) ? value : new Date().toISOString();
};

async function redeemBootstrap(supabase: any, body: any): Promise<Response> {
  const collectorId = typeof body?.collector_id === "string" ? body.collector_id.trim() : "";
  const bootstrapToken = typeof body?.bootstrap_token === "string" ? body.bootstrap_token.trim() : "";
  if (!collectorId || bootstrapToken.length < 32) {
    return new Response(JSON.stringify({ error: "Collector package is invalid" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
  const tokenHash = await sha256(bootstrapToken);
  const { data: collector, error: lookupError } = await supabase
    .from("collector_connections")
    .select("id,name,is_active,bootstrap_token_hash,bootstrap_expires_at,bootstrap_used_at")
    .eq("collector_id", collectorId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const expiresAt = collector?.bootstrap_expires_at ? Date.parse(collector.bootstrap_expires_at) : NaN;
  if (!collector || !collector.is_active || collector.bootstrap_used_at || !Number.isFinite(expiresAt)
      || expiresAt <= Date.now() || collector.bootstrap_token_hash !== tokenHash) {
    return new Response(JSON.stringify({ error: "Collector package is invalid, expired, or already used" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  const syncToken = randomToken();
  const { data: updated, error: updateError } = await supabase
    .from("collector_connections")
    .update({
      sync_token_hash: await sha256(syncToken),
      bootstrap_token_hash: "",
      bootstrap_used_at: new Date().toISOString(),
    })
    .eq("id", collector.id)
    .eq("bootstrap_token_hash", tokenHash)
    .is("bootstrap_used_at", null)
    .select("id")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) {
    return new Response(JSON.stringify({ error: "Collector package was already used" }), { status: 409, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  return new Response(JSON.stringify({
    collector_name: collector.name,
    sync_token: syncToken,
    portal_api_key: Deno.env.get("SUPABASE_ANON_KEY")!,
  }), { headers: { ...corsHeaders, "content-type": "application/json" } });
}

async function syncEquipment(supabase: any, collector: any, savedDevices: any[], deviceRows: Map<string, Record<string, unknown>>) {
  let organizationName = "ACRO Collector";
  if (collector.organization_id) {
    const { data: organization } = await supabase.from("organizations").select("name").eq("id", collector.organization_id).maybeSingle();
    if (organization?.name) organizationName = organization.name;
  }
  const siteName = `Коллектор · ${collector.name}`;
  let { data: site, error: siteError } = await supabase.from("sites").select("id").eq("name", siteName).maybeSingle();
  if (siteError) throw siteError;
  if (!site) {
    const { data, error } = await supabase.from("sites").insert({ name: siteName, organization: organizationName, organization_id: collector.organization_id || null, description: "Автоматически создано для ACRO Collector" }).select("id").single();
    if (error) throw error;
    site = data;
  }
  for (const saved of savedDevices) {
    const source = deviceRows.get(saved.source_device_id) ?? {};
    const status = text(source.status, "unknown") === "available" ? "active" : "faulty";
    const payload = {
      site_id: site.id,
      name: text(source.name, `Устройство ${saved.source_device_id.slice(0, 8)}`),
      model: text(source.protocol, "Collector"),
      serial_number: `collector:${collector.id}:${saved.source_device_id}`,
      description: `Автоматически синхронизировано из ${collector.name}. Адрес: ${text(source.address, "—")}`,
      status,
      quantity: 1,
    };
    let equipmentId = saved.equipment_id;
    if (!equipmentId) {
      const { data, error } = await supabase.from("equipment").insert(payload).select("id").single();
      if (error) throw error;
      equipmentId = data.id;
      const { error: linkError } = await supabase.from("collector_devices").update({ equipment_id: equipmentId }).eq("id", saved.id);
      if (linkError) throw linkError;
    } else {
      const { error } = await supabase.from("equipment").update(payload).eq("id", equipmentId);
      if (error) throw error;
    }
  }
}

async function persistTelemetry(supabase: any, collector: any, events: CollectorEvent[]) {
  const collectorConnectionId = collector.id;
  // The collector sends one authoritative list on every snapshot. This lets a
  // customer explicitly stop exporting a host without deleting any manually
  // created equipment on the portal.
  const inventoryEvent = [...events].reverse().find((event) => event.type === "collector.inventory");
  const exportedDeviceIds = inventoryEvent && Array.isArray((asRecord(inventoryEvent.payload).source_device_ids))
    ? new Set((asRecord(inventoryEvent.payload).source_device_ids as unknown[]).filter((value) => typeof value === "string" && value.length > 0) as string[])
    : null;
  if (exportedDeviceIds) {
    const { data: existing, error: existingError } = await supabase
      .from("collector_devices")
      .select("id,source_device_id,equipment_id")
      .eq("collector_connection_id", collectorConnectionId);
    if (existingError) throw existingError;
    const obsolete = (existing ?? []).filter((device: any) => !exportedDeviceIds.has(device.source_device_id));
    const equipmentIds = obsolete.map((device: any) => device.equipment_id).filter(Boolean);
    if (equipmentIds.length) {
      const { data: owned, error: ownedError } = await supabase.from("equipment")
        .select("id").in("id", equipmentIds).like("serial_number", `collector:${collectorConnectionId}:%`);
      if (ownedError) throw ownedError;
      if (owned?.length) {
        const { error } = await supabase.from("equipment").delete().in("id", owned.map((row: any) => row.id));
        if (error) throw error;
      }
    }
    if (obsolete.length) {
      const { error } = await supabase.from("collector_devices").delete().in("id", obsolete.map((device: any) => device.id));
      if (error) throw error;
    }
  }
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
    .select("id,source_device_id,equipment_id");
  if (devicesError) throw devicesError;
  await syncEquipment(supabase, collector, savedDevices ?? [], devices);
  const deviceIds = new Map((savedDevices ?? []).map((device: any) => [device.source_device_id, device.id]));

  const metrics = new Map<string, Record<string, unknown>>();
  const openedProblems = new Map<string, Record<string, unknown>>();
  const closedProblems: Array<{ collector_device_id: string; trigger_id: string; closed_at: string }> = [];
  const inventories = new Map<string, string[]>();
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
    if (event.type === "device.inventory") {
      const keys = Array.isArray(payload.metrics)
        ? payload.metrics.map((metric) => text(asRecord(metric).key)).filter(Boolean)
        : [];
      inventories.set(collectorDeviceId, keys);
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
    const metricRows = [...metrics.values()];
    const deviceIdsForMetrics = [...new Set(metricRows.map((metric) => metric.collector_device_id))];
    const { data: existingMetrics, error: existingMetricsError } = await supabase.from("collector_metric_values")
      .select("collector_device_id,item_key,collected_at").in("collector_device_id", deviceIdsForMetrics);
    if (existingMetricsError) throw existingMetricsError;
    const existingTimes = new Map((existingMetrics ?? []).map((metric: any) => [`${metric.collector_device_id}:${metric.item_key}`, Date.parse(metric.collected_at)]));
    const currentRows = metricRows.filter((metric) => {
      const previous = existingTimes.get(`${metric.collector_device_id}:${metric.item_key}`);
      return previous === undefined || Date.parse(String(metric.collected_at)) >= previous;
    });
    if (currentRows.length) {
      const { error } = await supabase.from("collector_metric_values")
        .upsert(currentRows, { onConflict: "collector_device_id,item_key" });
      if (error) throw error;
    }
  }
  for (const [collectorDeviceId, activeKeys] of inventories) {
    const { data: existing, error: existingError } = await supabase.from("collector_metric_values")
      .select("item_key").eq("collector_device_id", collectorDeviceId);
    if (existingError) throw existingError;
    const obsolete = (existing ?? []).map((metric: any) => metric.item_key).filter((key: string) => !activeKeys.includes(key));
    if (obsolete.length) {
      const { error } = await supabase.from("collector_metric_values")
        .delete().eq("collector_device_id", collectorDeviceId).in("item_key", obsolete);
      if (error) throw error;
    }
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

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    if (body?.bootstrap_token) return await redeemBootstrap(supabase, body);

    const collectorId = req.headers.get("X-ACX-Installation") || "";
    const token = req.headers.get("X-ACX-Sync-Token") || "";
    if (!collectorId || !token) return new Response(JSON.stringify({ error: "Collector credentials are required" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    const tokenHash = await sha256(token);
    const { data: collector, error } = await supabase
      .from("collector_connections")
      .select("id, is_active, organization_id, name")
      .eq("collector_id", collectorId)
      .eq("sync_token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!collector || !collector.is_active) return new Response(JSON.stringify({ error: "Invalid collector credentials" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });

    const events: CollectorEvent[] = Array.isArray(body?.events)
      ? body.events.slice(0, 500)
      : [{ event_id: body?.event_id, type: body?.type, payload: asRecord(body?.payload), created_at: body?.created_at }];
    await persistTelemetry(supabase, collector, events);
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
