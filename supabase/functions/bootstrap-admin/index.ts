import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hardcoded bootstrap credentials. Only works while the system has 0 users.
const BOOTSTRAP_EMAIL = "admin@assist.local";
const BOOTSTRAP_PASSWORD = "derby3713";
const BOOTSTRAP_FULL_NAME = "Суперадминистратор";

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    // GET / status: report whether bootstrap is still available
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1, page: 1 });
    if (listErr) throw listErr;
    const usersCount = list?.users?.length ?? 0;
    // Also check total via second page when needed – listUsers does not return total reliably; fall back to >0 check.
    const isEmpty = usersCount === 0;

    if (req.method === "GET") {
      return json({ needs_bootstrap: isEmpty, email: isEmpty ? BOOTSTRAP_EMAIL : null });
    }

    if (!isEmpty) {
      return json({ error: "Система уже инициализирована — в БД есть пользователи. Используйте обычный вход или сброс пароля." }, 409);
    }

    // Create user (email already confirmed so no SMTP required)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: BOOTSTRAP_EMAIL,
      password: BOOTSTRAP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: BOOTSTRAP_FULL_NAME },
    });
    if (cErr) throw cErr;
    const uid = created.user!.id;

    // handle_new_user() trigger already creates profile + bootstraps admin role
    // when there is no admin yet, but we double-insert to be defensive.
    await admin.from("user_roles").insert({ user_id: uid, role: "admin" }).then(() => null, () => null);
    await admin.from("profiles").upsert(
      { user_id: uid, full_name: BOOTSTRAP_FULL_NAME, is_active: true },
      { onConflict: "user_id" },
    );

    return json({
      success: true,
      email: BOOTSTRAP_EMAIL,
      password: BOOTSTRAP_PASSWORD,
      message: "Суперадмин создан. Войдите и СРАЗУ смените пароль в профиле.",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}