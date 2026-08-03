// agent-update — раздаёт агентам манифест обновления по актуальному релизу.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};

function cmp(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function bucket(agentId: string): number {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  return h % 100;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const curVer = url.searchParams.get("version") || "0.0.0";
    const agentId = url.searchParams.get("agent_id") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: rel } = await supabase
      .from("agent_releases")
      .select("version,url,sha256,notes,policy_override,rollout_percent")
      .eq("is_current", true)
      .maybeSingle();
    if (!rel || cmp(rel.version, curVer) <= 0) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const pct = rel.rollout_percent ?? 100;
    if (pct < 100 && agentId && bucket(agentId) >= pct) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    return new Response(JSON.stringify({
      version: rel.version, url: rel.url, sha256: rel.sha256,
      policy_override: rel.policy_override, rollout_percent: pct, notes: rel.notes,
    }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
}
