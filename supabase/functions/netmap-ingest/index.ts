import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  const { scanner_agent_id, nodes } = body || {};
  if (!scanner_agent_id || !Array.isArray(nodes)) {
    return new Response(JSON.stringify({ error: "scanner_agent_id и nodes[] обязательны" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // организация сканера — из agent_registrations
  let orgId: string | null = null;
  let linkedByIp: Record<string, string> = {};
  try {
    const { data: reg } = await supabase.from("agent_registrations").select("organization_id").eq("agent_id", scanner_agent_id).maybeSingle();
    orgId = reg?.organization_id ?? null;
    // все агенты этой организации — для связи узлов по IP с карточками
    if (orgId) {
      const { data: peers } = await supabase.from("agent_registrations").select("agent_id, ip_addresses").eq("organization_id", orgId);
      (peers || []).forEach((p: any) => {
        const ips = Array.isArray(p.ip_addresses) ? p.ip_addresses : [];
        ips.forEach((ip: string) => { if (ip) linkedByIp[ip] = p.agent_id; });
      });
    }
  } catch (_) {}

  const now = new Date().toISOString();
  const rows = nodes.map((n: any) => ({
    scanner_agent_id,
    organization_id: orgId,
    node_ip: n.ip,
    node_mac: n.mac ?? null,
    hostname: n.hostname ?? null,
    node_type: n.type ?? "other",
    icon: n.icon ?? "unknown",
    role: n.role ?? null,
    vendor: n.vendor ?? null,
    os: n.os ?? null,
    status: n.status ?? "ok",
    ping_ms: n.ping_ms ?? null,
    cpu_load: n.cpu_load ?? null,
    uptime: n.uptime ?? null,
    is_gateway: !!n.is_gateway,
    is_uplink: !!n.is_uplink,
    snmp: !!n.snmp,
    linked_agent_id: linkedByIp[n.ip] ?? null,
    links: n.links ?? [],
    last_seen: now,
  }));

  // удалить прежние узлы этого сканера и вставить свежие (полная замена снимка)
  await supabase.from("network_nodes").delete().eq("scanner_agent_id", scanner_agent_id);
  const { error } = await supabase.from("network_nodes").insert(rows);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });

  return new Response(JSON.stringify({ ok: true, count: rows.length }), { headers: { "Content-Type": "application/json" } });
});
