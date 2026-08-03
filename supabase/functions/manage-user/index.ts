import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await callerClient.from("user_roles").select("role").eq("user_id", caller.id);
    const isAdmin = roles?.some((r: any) => r.role === "admin");
    const isOrgAdmin = roles?.some((r: any) => r.role === "org_admin");

    // org вызывающего (для ограничения org_admin своей организацией)
    const callerOrg = (await adminClient.from("profiles").select("organization_id").eq("user_id", caller.id).maybeSingle()).data?.organization_id ?? null;
    // Гард: org_admin (не оператор) может трогать только юзеров своей орг и не выдавать роли выше своей
    const orgAdminGuard = async (targetUserId: string | null, requestedRoles: string[] | null) => {
      if (isAdmin) return null; // оператор — без ограничений
      if (!callerOrg) return errorRes("У вашей учётной записи не задана организация");
      if (targetUserId) {
        const tOrg = (await adminClient.from("profiles").select("organization_id").eq("user_id", targetUserId).maybeSingle()).data?.organization_id ?? null;
        if (tOrg !== callerOrg) return errorRes("Можно управлять только пользователями своей организации");
      }
      if (requestedRoles && requestedRoles.some((r) => r === "admin" || r === "engineer")) {
        return errorRes("Недостаточно прав для назначения этой роли");
      }
      return null;
    };
    if (!isAdmin && !isOrgAdmin) {
      return new Response(JSON.stringify({ error: "Доступ запрещён" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    // ─── UPDATE USER PROFILE ───
    if (action === "update") {
      const { user_id, full_name, organization, phone, position, roles: newRoles } = body;
      if (!user_id) return errorRes("user_id обязателен");
      { const g = await orgAdminGuard(user_id, Array.isArray(newRoles) ? newRoles : null); if (g) return g; }

      // Update profile
      const orgId = organization ? (await adminClient.from("organizations").select("id").eq("name", organization).maybeSingle()).data?.id ?? null : null;
      await adminClient.from("profiles").update({
        full_name: full_name ?? null,
        organization: organization ?? null,
        organization_id: orgId,
        phone: phone ?? null,
        position: position ?? null,
      }).eq("user_id", user_id);

      // Update user metadata for display name
      if (full_name !== undefined) {
        await adminClient.auth.admin.updateUserById(user_id, {
          user_metadata: { full_name: full_name || "" },
        });
      }

      // Sync roles if provided
      if (Array.isArray(newRoles)) {
        // Check: cannot remove last admin
        if (!newRoles.includes("admin")) {
          const { data: adminUsers } = await adminClient.from("user_roles")
            .select("user_id")
            .eq("role", "admin");
          const activeAdmins = adminUsers?.filter((a: any) => a.user_id !== user_id) ?? [];
          if (activeAdmins.length === 0) {
            return errorRes("Нельзя снять роль администратора с последнего активного администратора");
          }
        }

        // Delete existing roles and re-insert
        await adminClient.from("user_roles").delete().eq("user_id", user_id);
        if (newRoles.length > 0) {
          await adminClient.from("user_roles").insert(
            newRoles.map((role: string) => ({ user_id, role }))
          );
        }
      }

      return jsonRes({ success: true });
    }

    // ─── BLOCK / UNBLOCK ───
    if (action === "block" || action === "unblock") {
      const { user_id } = body;
      if (!user_id) return errorRes("user_id обязателен");
      if (user_id === caller.id) return errorRes("Нельзя заблокировать самого себя");
      { const g = await orgAdminGuard(user_id, null); if (g) return g; }

      const isActive = action === "unblock";

      // Update profile
      await adminClient.from("profiles").update({ is_active: isActive }).eq("user_id", user_id);

      // Ban/unban in auth
      if (action === "block") {
        await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "876000h", // ~100 years
        });
      } else {
        await adminClient.auth.admin.updateUserById(user_id, {
          ban_duration: "none",
        });
      }

      return jsonRes({ success: true });
    }

    // ─── RESET PASSWORD ───
    if (action === "reset_password") {
      const { user_id } = body;
      if (!user_id) return errorRes("user_id обязателен");
      { const g = await orgAdminGuard(user_id, null); if (g) return g; }

      // Generate a secure random password
      const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
      let newPassword = "";
      const randomValues = new Uint8Array(16);
      crypto.getRandomValues(randomValues);
      for (let i = 0; i < 16; i++) {
        newPassword += chars[randomValues[i] % chars.length];
      }

      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        password: newPassword,
      });
      if (error) return errorRes(error.message);

      return jsonRes({ success: true, new_password: newPassword });
    }

    // ─── DELETE USER ───
    if (action === "delete") {
      const { user_id } = body;
      if (!user_id) return errorRes("user_id обязателен");
      if (user_id === caller.id) return errorRes("Нельзя удалить самого себя");
      { const g = await orgAdminGuard(user_id, null); if (g) return g; }

      // Check for linked tickets
      const { data: linkedTickets } = await adminClient.from("tickets")
        .select("id")
        .or(`created_by.eq.${user_id},assigned_to.eq.${user_id}`)
        .limit(1);

      if (linkedTickets && linkedTickets.length > 0) {
        return errorRes("У пользователя есть связанные заявки. Сначала переназначьте или удалите их.");
      }

      // Delete related data
      await adminClient.from("user_module_permissions").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("user_id", user_id);

      // Delete auth user
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      if (error) return errorRes(error.message);

      return jsonRes({ success: true });
    }

    // ─── LIST USERS (with email from auth) ───
    if (action === "list") {
      const { data: { users: authUsers }, error } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });
      if (error) return errorRes(error.message);

      // Build email map
      const emailMap: Record<string, string> = {};
      const bannedMap: Record<string, boolean> = {};
      for (const u of authUsers) {
        emailMap[u.id] = u.email ?? "";
        bannedMap[u.id] = !!u.banned_until && new Date(u.banned_until) > new Date();
      }

      return jsonRes({ emails: emailMap, banned: bannedMap });
    }

    return errorRes("Неизвестное действие");
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

function jsonRes(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorRes(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}