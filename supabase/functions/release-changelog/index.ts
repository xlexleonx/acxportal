import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHARED_SECRET = Deno.env.get("RELEASE_NOTES_SECRET") || "apagent-changelog-2026";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { "Content-Type": "application/json" } }); }

  const { version, notes, secret } = body || {};
  if (secret !== SHARED_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  if (typeof version !== "string" || !version.trim()) {
    return new Response(JSON.stringify({ error: "version required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase
    .from("release_notes")
    .upsert({ version: version.trim(), notes: (notes || "").toString() }, { onConflict: "version" });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true, version: version.trim() }), { headers: { "Content-Type": "application/json" } });
});
