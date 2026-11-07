import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLIC_API_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}

function error(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("Method not allowed", 405);

  const body = await req.json().catch(() => ({}));
  const collectorId = typeof body?.collector_id === "string" ? body.collector_id.trim() : "";
  const bootstrapToken = typeof body?.bootstrap_token === "string" ? body.bootstrap_token.trim() : "";
  if (!collectorId || bootstrapToken.length < 32) return error("Collector package is invalid", 400);

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
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
      return error("Collector package is invalid, expired, or already used", 401);
    }

    const syncToken = randomToken();
    const syncTokenHash = await sha256(syncToken);
    const { data: updated, error: updateError } = await supabase
      .from("collector_connections")
      .update({
        sync_token_hash: syncTokenHash,
        bootstrap_token_hash: "",
        bootstrap_used_at: new Date().toISOString(),
      })
      .eq("id", collector.id)
      .eq("bootstrap_token_hash", tokenHash)
      .is("bootstrap_used_at", null)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return error("Collector package was already used", 409);

    return new Response(JSON.stringify({
      collector_name: collector.name,
      sync_token: syncToken,
      portal_api_key: PUBLIC_API_KEY,
    }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (reason) {
    return error(String(reason), 500);
  }
}
