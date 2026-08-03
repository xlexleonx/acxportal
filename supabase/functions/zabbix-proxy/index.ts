import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ZABBIX_TIMEOUT = 15000;

/* ─── Simple in-memory cache ─── */
const cache = new Map<string, { data: unknown; ts: number }>();
function getCached(key: string, ttlMs: number): unknown | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}
function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
  // Evict old entries (max 100)
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

/* ─── Helpers ─── */
async function fetchWithTimeout(url: string, options: RequestInit, timeout = ZABBIX_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message))) {
      throw new Error(`Zabbix-сервер недоступен (timeout ${timeout} мс): ${url}`);
    }
    if (e instanceof Error && /network|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(e.message)) {
      throw new Error(`Zabbix-сервер недоступен: ${e.message}`);
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

function jsonRpc(method: string, params: unknown, auth?: string, id = 1) {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method, params, id };
  if (auth) body.auth = auth;
  return JSON.stringify(body);
}

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const fail = (error: string, status = 500) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/* ─── Zabbix auth session (per connection, 1h TTL) ─── */
const authTokenCache = new Map<string, { token: string; ts: number }>();
const AUTH_TTL = 60 * 60 * 1000; // 1 hour

async function getAuthToken(cacheKey: string, apiUrl: string, user: string, password: string): Promise<string> {
  const entry = authTokenCache.get(cacheKey);
  if (entry && Date.now() - entry.ts < AUTH_TTL) return entry.token;

  const res = await fetchWithTimeout(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonRpc("user.login", { username: user, password }),
  });
  const data = await res.json();
  if (!data.result) throw new Error("Ошибка авторизации Zabbix");
  authTokenCache.set(cacheKey, { token: data.result, ts: Date.now() });
  return data.result;
}

/* ─── Action definitions with cache TTL ─── */
interface ActionDef {
  method: string;
  params: Record<string, unknown>;
  cacheTtl: number; // ms, 0 = no cache
}

function getActionDef(action: string, extraParams?: Record<string, unknown>): ActionDef | null {
  switch (action) {
    case "getHosts":
      return {
        method: "host.get",
        params: {
          output: ["hostid", "host", "name", "status", "available", "snmp_available"],
          selectInterfaces: ["ip", "dns", "port", "type", "available"],
          selectGroups: ["groupid", "name"],
          sortfield: "name",
          ...extraParams,
        },
        cacheTtl: 60000,
      };
    case "getProblems":
      return {
        method: "problem.get",
        params: {
          output: "extend",
          selectAcknowledges: "extend",
          selectTags: "extend",
          recent: true,
          sortfield: ["eventid"],
          sortorder: "DESC",
          limit: 100,
          ...extraParams,
        },
        cacheTtl: 30000,
      };
    case "getAlerts":
      return {
        method: "trigger.get",
        params: {
          output: ["triggerid", "description", "priority", "value", "lastchange", "status"],
          selectHosts: ["hostid", "name"],
          filter: { value: 1 },
          sortfield: "priority",
          sortorder: "DESC",
          limit: 100,
          only_true: true,
          active: true,
          expandDescription: true,
          ...extraParams,
        },
        cacheTtl: 30000,
      };
    case "getHostAvailability":
      return {
        method: "host.get",
        params: {
          output: ["hostid", "host", "name", "available"],
          selectInterfaces: ["ip"],
          ...extraParams,
        },
        cacheTtl: 60000,
      };
    case "getItems":
      return {
        method: "item.get",
        params: {
          output: ["itemid", "name", "key_", "lastvalue", "lastclock", "units", "state", "status"],
          selectHosts: ["hostid", "name"],
          sortfield: "name",
          limit: 500,
          ...extraParams,
        },
        cacheTtl: 30000,
      };
    case "getGraphs":
      return {
        method: "graph.get",
        params: {
          output: ["graphid", "name", "width", "height"],
          selectHosts: ["hostid", "name"],
          sortfield: "name",
          ...extraParams,
        },
        cacheTtl: 60000,
      };
    case "getScripts":
      return {
        method: "script.get",
        params: {
          output: ["scriptid", "name", "command", "description", "type", "scope"],
          selectGroups: ["groupid", "name"],
          ...extraParams,
        },
        cacheTtl: 60000,
      };
    case "getHostGroups":
      return {
        method: "hostgroup.get",
        params: {
          output: ["groupid", "name"],
          sortfield: "name",
          ...extraParams,
        },
        cacheTtl: 120000,
      };
    case "getEvents":
      return {
        method: "event.get",
        params: {
          output: "extend",
          selectHosts: ["hostid", "name"],
          sortfield: ["clock"],
          sortorder: "DESC",
          limit: 200,
          ...extraParams,
        },
        cacheTtl: 30000,
      };
    case "getRecentEvents":
      return {
        method: "event.get",
        params: {
          output: ["eventid", "source", "object", "objectid", "clock", "value", "name", "severity", "acknowledged"],
          selectHosts: ["hostid", "name"],
          sortfield: ["clock"],
          sortorder: "DESC",
          limit: 10,
          value: 1,
          ...extraParams,
        },
        cacheTtl: 15000,
      };
    case "getTemplates":
      return {
        method: "template.get",
        params: {
          output: ["templateid", "host", "name", "description"],
          sortfield: "name",
          ...extraParams,
        },
        cacheTtl: 300000,
      };
    case "getHistory":
      return {
        method: "history.get",
        params: {
          output: "extend",
          history: 0,
          sortfield: "clock",
          sortorder: "DESC",
          limit: 500,
          ...extraParams,
        },
        cacheTtl: 30000,
      };
    case "getTrends":
      return {
        method: "trend.get",
        params: {
          output: "extend",
          sortfield: "clock",
          sortorder: "DESC",
          limit: 1000,
          ...extraParams,
        },
        cacheTtl: 60000,
      };
    case "getClosedEvents":
      return {
        method: "event.get",
        params: {
          output: ["eventid", "source", "object", "objectid", "clock", "value", "name", "severity", "acknowledged", "r_eventid"],
          selectHosts: ["hostid", "name"],
          sortfield: ["clock"],
          sortorder: "DESC",
          limit: 200,
          value: 0, // recovered
          ...extraParams,
        },
        cacheTtl: 30000,
      };
    case "getTriggerCounts":
      return {
        method: "trigger.get",
        params: {
          output: ["triggerid", "priority"],
          filter: { value: 1, status: 0 },
          countOutput: false,
          ...extraParams,
        },
        cacheTtl: 30000,
      };
    case "getDisabledTriggers":
      return {
        method: "trigger.get",
        params: {
          output: ["triggerid", "description", "priority", "status", "lastchange", "templateid"],
          selectHosts: ["hostid", "name"],
          filter: { status: 1 },
          expandDescription: true,
          sortfield: "description",
          limit: 500,
          ...extraParams,
        },
        cacheTtl: 30000,
      };
    default:
      return null;
  }
}

/* ─── Main handler ─── */
export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify user auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return fail("Unauthorized", 401);

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) return fail("Unauthorized", 401);

  // Get Zabbix settings
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Resolve which Zabbix connection to use:
  // 1) explicit `connection_id` in request body (preferred — set by global picker),
  // 2) the row in `zabbix_connections` flagged is_default,
  // 3) any active row in `zabbix_connections`.
  let bodyParsed: Record<string, unknown> = {};
  try { bodyParsed = await req.clone().json(); } catch { /* ignore — handled below */ }
  const explicitConnId = typeof bodyParsed?.connection_id === "string" ? bodyParsed.connection_id as string : null;

  let ZABBIX_URL = "", ZABBIX_USER = "", ZABBIX_PASSWORD = "";
  let resolvedConnId: string | null = null;

  if (explicitConnId) {
    const { data: conn } = await supabaseAdmin
      .from("zabbix_connections")
      .select("id, zabbix_url, zabbix_user, zabbix_password, is_active")
      .eq("id", explicitConnId)
      .maybeSingle();
    if (conn && conn.is_active) {
      ZABBIX_URL = conn.zabbix_url; ZABBIX_USER = conn.zabbix_user; ZABBIX_PASSWORD = conn.zabbix_password;
      resolvedConnId = conn.id;
    }
  }
  if (!ZABBIX_URL) {
    const { data: conns } = await supabaseAdmin
      .from("zabbix_connections")
      .select("id, zabbix_url, zabbix_user, zabbix_password, is_default")
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .limit(1);
    if (conns && conns.length) {
      const c = conns[0] as any;
      ZABBIX_URL = c.zabbix_url; ZABBIX_USER = c.zabbix_user; ZABBIX_PASSWORD = c.zabbix_password;
      resolvedConnId = c.id;
    }
  }
  if (!ZABBIX_URL) {
    return fail("Подключение Zabbix не сконфигурировано. Добавьте подключение в разделе «Подключения».");
  }

  // Per-connection auth-token cache key suffix
  const connCacheKey = resolvedConnId ?? `legacy:${ZABBIX_URL}`;

  if (!ZABBIX_URL || !ZABBIX_USER || !ZABBIX_PASSWORD) {
    return fail("Заполните все поля подключения к Zabbix в настройках.");
  }

  const apiUrl = `${ZABBIX_URL}/api_jsonrpc.php`;
  const headers = { "Content-Type": "application/json" };

  try {
    const body = await req.json();
    const { action, params: extraParams } = body;

    /* ─── Test Connection ─── */
    if (action === "testConnection") {
      try {
        // Step 1: apiinfo.version
        let versionRes: Response;
        try {
          versionRes = await fetchWithTimeout(apiUrl, {
            method: "POST", headers,
            body: jsonRpc("apiinfo.version", {}),
          }, 10000);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("abort") || msg.includes("Abort")) {
            return ok({ ok: false, error: "timeout", message: "Таймаут соединения (10 сек). Сервер недоступен." });
          }
          return ok({ ok: false, error: "network_error", message: `Сервер не отвечает. Проверьте VPN (BelVPN). (${msg})` });
        }

        const versionText = await versionRes.text();
        let versionData: { result?: string; error?: { message?: string } };
        try { versionData = JSON.parse(versionText); } catch {
          return ok({ ok: false, error: "invalid_url", message: "Ответ не соответствует API Zabbix. Проверьте URL." });
        }
        if (!versionData.result) {
          return ok({ ok: false, error: "invalid_url", message: "Не удалось получить версию Zabbix API." });
        }

        const zabbixVersion = versionData.result;

        // Step 2: user.login
        let loginRes: Response;
        try {
          loginRes = await fetchWithTimeout(apiUrl, {
            method: "POST", headers,
            body: jsonRpc("user.login", { username: ZABBIX_USER, password: ZABBIX_PASSWORD }),
          }, 10000);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return ok({ ok: false, error: "network_error", message: `Ошибка сети при аутентификации: ${msg}` });
        }

        const loginData = await loginRes.json();
        if (loginData.error) {
          return ok({ ok: false, error: "auth_failed", message: `Неверные учётные данные. (${loginData.error.data || loginData.error.message})` });
        }
        if (!loginData.result) {
          return ok({ ok: false, error: "auth_failed", message: "Не удалось получить токен авторизации." });
        }

        // Step 3: logout
        try {
          const lr = await fetchWithTimeout(apiUrl, {
            method: "POST", headers,
            body: jsonRpc("user.logout", [], loginData.result),
          }, 5000);
          await lr.text();
        } catch { /* ignore */ }

        // Invalidate cached auth token since we just did a fresh login
        authTokenCache.delete(connCacheKey);

        return ok({ ok: true, data: { version: zabbixVersion }, rawLogin: loginData });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return ok({ ok: false, error: "unknown", message: `Непредвиденная ошибка: ${msg}` });
      }
    }

    /* ─── Execute Script ─── */
    if (action === "executeScript") {
      const { scriptid, hostid } = extraParams || {};
      if (!scriptid || !hostid) return fail("scriptid и hostid обязательны", 400);

      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "script.execute",
          params: { scriptid, hostid },
          auth: authToken, id: 2,
        }),
      });
      const data = await res.json();
      return ok({ result: data.result, error: data.error });
    }

    /* ─── Acknowledge Event ─── */
    if (action === "acknowledgeEvent") {
      const { eventids, message: ackMessage, ackAction } = extraParams || {};
      if (!eventids) return fail("eventids обязателен", 400);

      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "event.acknowledge",
          params: {
            eventids,
            message: ackMessage || "",
            action: ackAction || 6, // close + message
          },
          auth: authToken, id: 2,
        }),
      });
      const data = await res.json();
      return ok({ result: data.result, error: data.error });
    }

    /* ─── Get Graph Image ─── */
    if (action === "getGraphImage") {
      const { graphid, period, width, height } = extraParams || {};
      if (!graphid) return fail("graphid обязателен", 400);

      // Zabbix chart2.php requires cookie-based auth, so we return graph URL info
      return ok({
        result: {
          graphid,
          url: `${ZABBIX_URL}/chart2.php?graphid=${graphid}&period=${period || 3600}&width=${width || 900}&height=${height || 200}`,
          note: "Для доступа к графику напрямую требуется VPN и авторизация в Zabbix.",
        },
      });
    }

    /* ─── Create Host in Zabbix ─── */
    if (action === "createHost") {
      const { name, visible_name, ip, port, group_name, templates, protocol_type } = extraParams || {};
      if (!name || !ip) return fail("name и ip обязательны", 400);

      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);

      // 1) Get or create host group
      let groupId: string | null = null;
      if (group_name) {
        const grpRes = await fetchWithTimeout(apiUrl, {
          method: "POST", headers,
          body: JSON.stringify({ jsonrpc: "2.0", method: "hostgroup.get", params: { filter: { name: [group_name] } }, auth: authToken, id: 10 }),
        });
        const grpData = await grpRes.json();
        if (grpData.result?.length) {
          groupId = grpData.result[0].groupid;
        } else {
          const createRes = await fetchWithTimeout(apiUrl, {
            method: "POST", headers,
            body: JSON.stringify({ jsonrpc: "2.0", method: "hostgroup.create", params: { name: group_name }, auth: authToken, id: 11 }),
          });
          const createData = await createRes.json();
          if (createData.error) return fail(`Group create error: ${createData.error.data || createData.error.message}`);
          groupId = createData.result.groupids[0];
        }
      }

      // 2) Build interface config based on protocol_type
      const ptype = protocol_type || "Agent";
      const ifaceTypeMap: Record<string, number> = { Agent: 1, SNMP: 2, IPMI: 3, JMX: 4 };
      const ifaceType = ifaceTypeMap[ptype] || 1;
      const defaultPorts: Record<string, string> = { Agent: "10050", SNMP: "161", IPMI: "623" };

      const hostParams: Record<string, unknown> = {
        host: name,
        name: visible_name || name,
        interfaces: [{
          type: ifaceType,
          main: 1,
          useip: 1,
          ip,
          dns: "",
          port: String(port || defaultPorts[ptype] || "10050"),
          ...(ifaceType === 2 ? { details: { version: 2, bulk: 1, community: "{$SNMP_COMMUNITY}" } } : {}),
        }],
        groups: groupId ? [{ groupid: groupId }] : [],
      };
      if (Array.isArray(templates) && templates.length > 0) {
        hostParams.templates = templates.map((t: string) => ({ templateid: t }));
      }

      const createHostRes = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({ jsonrpc: "2.0", method: "host.create", params: hostParams, auth: authToken, id: 12 }),
      });
      const createHostData = await createHostRes.json();
      if (createHostData.error) {
        return fail(`Zabbix host.create error: ${createHostData.error.data || createHostData.error.message}`);
      }
      return ok({ result: createHostData.result });
    }

    /* ─── Test Host Connectivity (ICMP via Zabbix item) ─── */
    if (action === "testHostConnectivity") {
      const { hostid } = extraParams || {};
      if (!hostid) return fail("hostid обязателен", 400);
      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const itemsRes = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "item.get",
          params: { hostids: [hostid], output: ["itemid","name","key_","lastvalue","lastclock","state"], limit: 5 },
          auth: authToken, id: 13,
        }),
      });
      const itemsData = await itemsRes.json();
      const items = itemsData.result || [];
      const alive = items.some((i: { lastclock?: string }) => i.lastclock && parseInt(i.lastclock) > Date.now()/1000 - 3600);
      return ok({ result: { alive, items_count: items.length, sample: items.slice(0,3) } });
    }

    /* ─── Update Host Templates (link / unlink) ─── */
    if (action === "updateHostTemplates") {
      const { hostid, templateids, mode } = extraParams || {};
      if (!hostid || !Array.isArray(templateids)) return fail("hostid и templateids обязательны", 400);
      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);

      // mode: "link" | "unlink" | "replace" (default replace)
      const params: Record<string, unknown> = { hostid };
      const tplObjs = templateids.map((t: string) => ({ templateid: t }));
      if (mode === "unlink") {
        params.templates_clear = tplObjs;
      } else if (mode === "link") {
        // Need to merge with existing
        const curRes = await fetchWithTimeout(apiUrl, {
          method: "POST", headers,
          body: JSON.stringify({ jsonrpc: "2.0", method: "host.get", params: { hostids: [hostid], selectParentTemplates: ["templateid"] }, auth: authToken, id: 20 }),
        });
        const curData = await curRes.json();
        const existing = curData.result?.[0]?.parentTemplates?.map((t: { templateid: string }) => ({ templateid: t.templateid })) || [];
        const merged = [...existing, ...tplObjs.filter((n: { templateid: string }) => !existing.find((e: { templateid: string }) => e.templateid === n.templateid))];
        params.templates = merged;
      } else {
        params.templates = tplObjs;
      }

      const updateRes = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({ jsonrpc: "2.0", method: "host.update", params, auth: authToken, id: 21 }),
      });
      const updateData = await updateRes.json();
      if (updateData.error) return fail(`host.update error: ${updateData.error.data || updateData.error.message}`);
      return ok({ result: updateData.result });
    }

    /* ─── Get host details with templates ─── */
    if (action === "getHostDetail") {
      const { hostid } = extraParams || {};
      if (!hostid) return fail("hostid обязателен", 400);
      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "host.get",
          params: {
            hostids: [hostid],
            output: "extend",
            selectInterfaces: "extend",
            selectGroups: "extend",
            selectParentTemplates: ["templateid", "name", "host"],
            selectTriggers: ["triggerid", "description", "priority", "value"],
          },
          auth: authToken, id: 22,
        }),
      });
      const data = await res.json();
      if (data.error) return fail(`host.get error: ${data.error.data || data.error.message}`);
      return ok({ result: data.result?.[0] || null });
    }

    /* ─── Get template detail (items + linked hosts count) ─── */
    if (action === "getTemplateDetail") {
      const { templateid } = extraParams || {};
      if (!templateid) return fail("templateid обязателен", 400);
      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "template.get",
          params: {
            templateids: [templateid],
            output: "extend",
            selectItems: ["itemid", "name", "key_"],
            selectTriggers: ["triggerid", "description", "priority"],
            selectHosts: ["hostid", "name"],
            selectMacros: "extend",
          },
          auth: authToken, id: 30,
        }),
      });
      const data = await res.json();
      if (data.error) return fail(`template.get error: ${data.error.data || data.error.message}`);
      return ok({ result: data.result?.[0] || null });
    }

    /* ─── Get active (unresolved) problems for a specific host ─── */
    if (action === "getActiveProblemsByHost") {
      const { hostid } = extraParams || {};
      if (!hostid) return fail("hostid обязателен", 400);
      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "problem.get",
          params: {
            hostids: [hostid],
            output: "extend",
            selectAcknowledges: "extend",
            recent: false,
            sortfield: ["eventid"],
            sortorder: "DESC",
            limit: 100,
          },
          auth: authToken, id: 33,
        }),
      });
      const data = await res.json();
      if (data.error) return fail(`problem.get error: ${data.error.data || data.error.message}`);
      return ok({ result: data.result || [] });
    }

    /* ─── Get items for a specific host (efficient, cached 30s) ─── */
    if (action === "getItemsByHost") {
      const { hostid } = extraParams || {};
      if (!hostid) return fail("hostid обязателен", 400);
      const cacheKey = `${connCacheKey}:getItemsByHost:${hostid}`;
      const cached = getCached(cacheKey, 30000);
      if (cached !== null) return ok({ result: cached, cached: true });

      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "item.get",
          params: {
            hostids: [hostid],
            output: ["itemid", "name", "key_", "lastvalue", "lastclock", "units", "value_type", "state", "status"],
            sortfield: "name",
            limit: 1000,
          },
          auth: authToken, id: 31,
        }),
      });
      const data = await res.json();
      if (data.error) return fail(`item.get error: ${data.error.data || data.error.message}`);
      setCache(cacheKey, data.result || []);
      return ok({ result: data.result || [] });
    }

    /* ─── Close Event (admin) — uses event.acknowledge with action=1 (close) ─── */
    if (action === "closeEvent") {
      const { eventids, message: closeMessage } = extraParams || {};
      if (!eventids) return fail("eventids обязателен", 400);
      const ids = Array.isArray(eventids) ? eventids : [eventids];

      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const msg = closeMessage || "Закрыто через портал ITEA";

      const callAck = async (actionBitmap: number) => {
        const r = await fetchWithTimeout(apiUrl, {
          method: "POST", headers,
          body: JSON.stringify({
            jsonrpc: "2.0", method: "event.acknowledge",
            params: { eventids: ids, action: actionBitmap, message: msg },
            auth: authToken, id: 23,
          }),
        });
        return r.json();
      };

      // Try full close (1=close + 2=ack + 4=msg = 7)
      let data = await callAck(7);

      // Fallback: if the trigger doesn't allow manual closing, just acknowledge (2+4=6)
      const errStr = data?.error ? String(data.error.data || data.error.message || "") : "";
      const noManualClose = /manual closing|manual_close|does not allow.*clos/i.test(errStr);

      if (data.error && noManualClose) {
        data = await callAck(6);
        if (data.error) {
          return fail(`Триггер не позволяет ручное закрытие, и подтверждение тоже не удалось: ${data.error.data || data.error.message}`);
        }
        cache.delete(`getProblems:${JSON.stringify({})}`);
        cache.delete(`getRecentEvents:${JSON.stringify({})}`);
        return ok({
          result: data.result,
          partial: true,
          message: "Триггер не разрешает ручное закрытие в Zabbix. Событие подтверждено (acknowledged). Закроется автоматически, когда условие триггера станет ложным.",
        });
      }

      if (data.error) return fail(`event.close error: ${data.error.data || data.error.message}`);
      cache.delete(`getProblems:${JSON.stringify({})}`);
      cache.delete(`getRecentEvents:${JSON.stringify({})}`);
      return ok({ result: data.result });
    }

    /* ─── Mass Acknowledge / Close ─── */
    if (action === "massAcknowledge") {
      const { eventids, message: ackMessage, close } = extraParams || {};
      if (!Array.isArray(eventids) || eventids.length === 0) return fail("eventids[] обязателен", 400);
      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const actionBitmap = close ? 7 : 6; // close ? close+ack+msg : ack+msg
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "event.acknowledge",
          params: { eventids, action: actionBitmap, message: ackMessage || "Массовое действие через портал" },
          auth: authToken, id: 24,
        }),
      });
      const data = await res.json();
      if (data.error) return fail(`mass acknowledge error: ${data.error.data || data.error.message}`);
      cache.delete(`getProblems:${JSON.stringify({})}`);
      return ok({ result: data.result, count: eventids.length });
    }


    /* ─── Update item (disable / enable / change key/name) ─── */
    if (action === "disableItem" || action === "enableItem" || action === "updateItemKey") {
      // staff-only
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", user.id);
      const roles = (roleRows ?? []).map((r: any) => r.role);
      if (!roles.includes("admin") && !roles.includes("engineer")) {
        return fail("Forbidden", 403);
      }

      const { itemid, key_, name } = extraParams || {};
      if (!itemid) return fail("itemid обязателен", 400);

      const params: Record<string, unknown> = { itemid };
      if (action === "disableItem") params.status = 1;
      if (action === "enableItem") params.status = 0;
      if (action === "updateItemKey") {
        if (!key_) return fail("key_ обязателен", 400);
        params.key_ = key_;
        if (name) params.name = name;
      }

      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "item.update", params,
          auth: authToken, id: 41,
        }),
      });
      const data = await res.json();
      if (data.error) return fail(`item.update error: ${data.error.data || data.error.message}`);
      return ok({ result: data.result });
    }

    /* ─── Disable / Enable trigger (admin/engineer) ─── */
    if (action === "setTriggerStatus") {
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", user.id);
      const roles = (roleRows ?? []).map((r: any) => r.role);
      if (!roles.includes("admin") && !roles.includes("engineer")) {
        return fail("Forbidden", 403);
      }
      const { triggerids, disabled } = extraParams || {};
      const ids = Array.isArray(triggerids) ? triggerids : (triggerids ? [triggerids] : []);
      if (ids.length === 0) return fail("triggerids обязателен", 400);
      const status = disabled ? 1 : 0; // 0=enabled, 1=disabled in Zabbix
      const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
      const payload = ids.map((id: string) => ({ triggerid: id, status }));
      const res = await fetchWithTimeout(apiUrl, {
        method: "POST", headers,
        body: JSON.stringify({
          jsonrpc: "2.0", method: "trigger.update", params: payload,
          auth: authToken, id: 42,
        }),
      });
      const data = await res.json();
      if (data.error) return fail(`trigger.update error: ${data.error.data || data.error.message}`);
      // Invalidate problem/alert caches so UI refreshes
      for (const k of Array.from(cache.keys())) {
        if (k.includes(":getProblems:") || k.includes(":getAlerts:") || k.includes(":getRecentEvents:")) {
          cache.delete(k);
        }
      }
      return ok({ result: data.result, count: ids.length });
    }

    const actionDef = getActionDef(action, extraParams);
    if (!actionDef) return fail("Unknown action", 400);

    // Check cache (per-connection isolation)
    const cacheKey = `${connCacheKey}:${action}:${JSON.stringify(extraParams || {})}`;
    if (actionDef.cacheTtl > 0) {
      const cached = getCached(cacheKey, actionDef.cacheTtl);
      if (cached !== null) return ok({ result: cached, cached: true });
    }

    // Get auth token (cached)
    const authToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);

    const dataResponse = await fetchWithTimeout(apiUrl, {
      method: "POST", headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: actionDef.method,
        params: actionDef.params,
        auth: authToken,
        id: 2,
      }),
    });
    const data = await dataResponse.json();

    if (data.error) {
      // Auth expired - retry once
      if (data.error.code === -32602 || data.error.data === "Session terminated") {
        authTokenCache.delete(connCacheKey);
        const newToken = await getAuthToken(connCacheKey, apiUrl, ZABBIX_USER, ZABBIX_PASSWORD);
        const retryRes = await fetchWithTimeout(apiUrl, {
          method: "POST", headers,
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: actionDef.method,
            params: actionDef.params,
            auth: newToken,
            id: 3,
          }),
        });
        const retryData = await retryRes.json();
        if (retryData.error) return fail(`Zabbix API error: ${retryData.error.message || retryData.error.data}`);
        if (actionDef.cacheTtl > 0) setCache(cacheKey, retryData.result);
        return ok({ result: retryData.result });
      }
      return fail(`Zabbix API error: ${data.error.message || data.error.data}`);
    }

    // Cache result
    if (actionDef.cacheTtl > 0) setCache(cacheKey, data.result);

    return ok({ result: data.result });
  } catch (err) {
    console.error("Zabbix proxy error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    // Return 200 with fallback flag so the frontend doesn't blank-screen on
    // unreachable/timeout situations (Zabbix host behind VPN, internal IP, etc).
    const isUnreachable = /недоступен|timeout|aborted|network|fetch failed|ECONN|ENOTFOUND/i.test(msg);
    return new Response(
      JSON.stringify({ error: msg, fallback: isUnreachable }),
      {
        status: isUnreachable ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
}
