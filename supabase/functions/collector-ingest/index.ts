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
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { last_seen_at: now };
    if (body?.type && body.type !== "collector.heartbeat") update.last_event_at = now;
    if (typeof payload.collector_version === "string") update.collector_version = payload.collector_version.slice(0, 80);
    if (typeof payload.collector_name === "string") update.metadata = { name: payload.collector_name.slice(0, 200) };
    const { error: updateError } = await supabase.from("collector_connections").update(update).eq("id", collector.id);
    if (updateError) throw updateError;
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
}
