// Опрос/отчёт по командам для агента.
//   GET  /functions/v1/agent-command  — вернуть pending команды (X-Agent-Token)
//   POST /functions/v1/agent-command  — отчёт по выполнению { id, status, result }
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-token" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function authAgent(token: string | null) {
  if (!token) return null;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data } = await supabase
    .from("agent_registrations")
    .select("id, agent_id, is_active")
    .eq("token", token)
    .maybeSingle();
  if (!data || !data.is_active) return null;
  return { supabase, agent: data };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("X-Agent-Token") || req.headers.get("x-agent-token");
  const ctx = await authAgent(token);
  if (!ctx) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  const { supabase, agent } = ctx;

  try {
    if (req.method === "GET") {
      // Update last_seen on poll too
      await supabase
        .from("agent_registrations")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("agent_id", agent.agent_id);

      const { data, error } = await supabase
        .from("agent_commands")
        .select("id, command_type, payload, created_at")
        .eq("agent_id", agent.agent_id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(20);
      if (error) throw error;

      if (data && data.length) {
        await supabase
          .from("agent_commands")
          .update({ status: "sent" })
          .in("id", data.map((c) => c.id));
      }

      return new Response(JSON.stringify({ commands: data ?? [] }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { id, status, result } = body ?? {};
      if (!id || !status) {
        return new Response(JSON.stringify({ error: "id and status required" }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
      const { error } = await supabase
        .from("agent_commands")
        .update({
          status,
          result: result ?? null,
          executed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("agent_id", agent.agent_id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
}