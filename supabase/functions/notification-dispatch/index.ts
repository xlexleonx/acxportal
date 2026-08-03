// Notification dispatcher: enqueue + send via webhooks (Telegram, Mattermost, Email-webhook, SMS-webhook)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type EventInput = {
  event_id?: string;
  event_type: string;
  priority?: string | null;
  title: string;
  body?: string;
  payload?: Record<string, unknown>;
  // Optional: target specific users; otherwise dispatch to all subscribed
  target_user_ids?: string[];
  // For testing a single channel
  test_channel_id?: string;
  // For SMS test: override recipient number
  override_phone?: string;
};

const PRIORITY_RANK: Record<string, number> = {
  P1: 4, critical: 4,
  P2: 3, high: 3,
  P3: 2, normal: 2, medium: 2,
  P4: 1, low: 1,
  info: 0,
};

function meetsPriority(eventPriority: string | null | undefined, minPriority: string | null | undefined): boolean {
  if (!minPriority) return true;
  const e = PRIORITY_RANK[eventPriority ?? "info"] ?? 0;
  const m = PRIORITY_RANK[minPriority] ?? 0;
  return e >= m;
}

function isCritical(p?: string | null) {
  return (PRIORITY_RANK[p ?? ""] ?? 0) >= 3;
}

// Evaluate sub.filters against event.payload. Filters are AND-combined.
// Supported keys (all optional):
//   assignee_scope: "any" | "me" | "unassigned" | "user_ids"
//   assignee_user_ids: string[]
//   creator_scope:  "any" | "me" | "user_ids"
//   creator_user_ids: string[]
//   priorities:     string[]   (e.g. ["P1","P2"])
//   request_types:  string[]   (incident/service_request/...)
//   product_codes:  string[]
//   site_ids:       string[]
//   statuses:       string[]
//   only_internal:  boolean    (for ticket.comment_added)
function matchesFilters(filters: any, payload: Record<string, any> | undefined, subscriberUserId: string): boolean {
  if (!filters || typeof filters !== "object") return true;
  const p = payload ?? {};

  const assigneeScope = filters.assignee_scope as string | undefined;
  if (assigneeScope && assigneeScope !== "any") {
    const a = p.assigned_to as string | null | undefined;
    if (assigneeScope === "me" && a !== subscriberUserId) return false;
    if (assigneeScope === "unassigned" && a) return false;
    if (assigneeScope === "user_ids") {
      const ids: string[] = Array.isArray(filters.assignee_user_ids) ? filters.assignee_user_ids : [];
      if (!a || !ids.includes(a)) return false;
    }
  }

  const creatorScope = filters.creator_scope as string | undefined;
  if (creatorScope && creatorScope !== "any") {
    const c = p.created_by as string | null | undefined;
    if (creatorScope === "me" && c !== subscriberUserId) return false;
    if (creatorScope === "user_ids") {
      const ids: string[] = Array.isArray(filters.creator_user_ids) ? filters.creator_user_ids : [];
      if (!c || !ids.includes(c)) return false;
    }
  }

  const arrayMatch = (key: string, val: any) => {
    const arr = filters[key];
    if (!Array.isArray(arr) || arr.length === 0) return true;
    return val != null && arr.includes(val);
  };
  if (!arrayMatch("priorities", p.priority)) return false;
  if (!arrayMatch("request_types", p.request_type)) return false;
  if (!arrayMatch("product_codes", p.product_code)) return false;
  if (!arrayMatch("site_ids", p.site_id)) return false;
  if (!arrayMatch("statuses", p.status)) return false;

  if (filters.only_internal === true && p.is_internal !== true) return false;
  if (filters.only_internal === false && p.is_internal === true) return false;

  return true;
}

function nowInTz(tz: string): { hhmm: string; dow: number } {
  // dow: 0 = Sunday ... 6 = Saturday
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
  const parts = fmt.formatToParts(new Date());
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const wk = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hhmm: `${hh}:${mm}`, dow: map[wk] ?? 1 };
}

function inQuietWindow(prefs: any): boolean {
  if (!prefs?.quiet_hours_enabled) return false;
  const tz = prefs.timezone || "Europe/Minsk";
  const { hhmm, dow } = nowInTz(tz);
  const days: number[] = Array.isArray(prefs.quiet_days) ? prefs.quiet_days : [];
  if (days.length > 0 && !days.includes(dow)) return false;
  const s = prefs.quiet_hours_start as string | null;
  const e = prefs.quiet_hours_end as string | null;
  if (!s || !e) return false;
  // HH:MM:SS -> HH:MM
  const ss = s.slice(0, 5);
  const ee = e.slice(0, 5);
  if (ss <= ee) return hhmm >= ss && hhmm < ee;
  // Wraps midnight
  return hhmm >= ss || hhmm < ee;
}

const EVENT_LABELS: Record<string, string> = {
  "ticket.created": "🆕 Новая заявка",
  "ticket.assigned": "👤 Назначена заявка",
  "ticket.status_changed": "🔄 Изменение статуса",
  "ticket.resolved": "✅ Заявка решена",
  "ticket.closed": "🔒 Заявка закрыта",
  "ticket.comment_added": "💬 Новый комментарий",
  "ticket.comment_internal": "🔒 Внутренний комментарий",
  "protocol.created": "📋 Новый протокол",
  "protocol.completed": "✅ Протокол выполнен",
  "monitoring.alert": "⚠️ Срабатывание мониторинга",
  "audit.event": "📝 Событие в журнале",
  "test.channel": "🧪 Тест канала",
  "chat.message_new": "💬 Новое сообщение в чате",
};

function flattenPayload(prefix: string, value: any, out: Record<string, string>) {
  if (value === null || value === undefined) return;
  if (typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      flattenPayload(prefix ? `${prefix}.${k}` : k, v, out);
    }
  } else {
    out[prefix] = typeof value === "string" ? value : JSON.stringify(value);
  }
}

function buildDefaultMessage(data: { title: string; body?: string; event_type: string; priority?: string | null; payload?: Record<string, any> }): string {
  const p = data.payload ?? {};
  const lines: string[] = [];
  const header = EVENT_LABELS[data.event_type] ?? data.event_type;
  const prio = data.priority ? ` [${data.priority}]` : "";
  lines.push(`${header}${prio}`);
  lines.push(`📌 ${data.title}`);
  if (data.body) lines.push("", data.body);

  // Контекст
  const ctx: string[] = [];
  if (p.product_name || p.product_code) ctx.push(`🧩 Модуль: ${p.product_name ?? p.product_code}${p.subcategory ? " / " + p.subcategory : ""}`);
  if (p.site_name) ctx.push(`🏢 ЦОД: ${p.site_name}`);
  if (p.equipment_name) ctx.push(`🖥 Оборудование: ${p.equipment_name}`);
  if (p.request_type_label || p.request_type) ctx.push(`📂 Тип: ${p.request_type_label ?? p.request_type}`);
  if (p.status_label || p.status) ctx.push(`🏷 Статус: ${p.status_label ?? p.status}`);
  if (p.old_status_label && p.status_label) ctx[ctx.length - 1] = `🏷 Статус: ${p.old_status_label} → ${p.status_label}`;
  if (p.created_by_name) ctx.push(`👤 Автор: ${p.created_by_name}`);
  if (p.assigned_to_name) ctx.push(`🔧 Исполнитель: ${p.assigned_to_name}`);
  if (p.author_name && data.event_type.startsWith("ticket.comment")) ctx.push(`✍️ Комментарий от: ${p.author_name}`);
  if (p.changed_by_name && data.event_type === "ticket.status_changed") ctx.push(`✍️ Изменил: ${p.changed_by_name}`);
  if (p.sla_deadline_label) ctx.push(`⏱ SLA до: ${p.sla_deadline_label}`);
  if (p.actor_name && data.event_type === "audit.event") ctx.push(`👤 Пользователь: ${p.actor_name}`);
  if (p.module_label && data.event_type === "audit.event") ctx.push(`🧩 Модуль: ${p.module_label}`);
  if (p.host_name && data.event_type === "monitoring.alert") ctx.push(`🖥 Хост: ${p.host_name}`);
  if (p.metric_name && data.event_type === "monitoring.alert") ctx.push(`📊 Метрика: ${p.metric_name}${p.value != null ? " = " + p.value : ""}`);

  if (ctx.length) {
    lines.push("");
    lines.push(...ctx);
  }

  if (p.comment_text && data.event_type.startsWith("ticket.comment")) {
    lines.push("");
    lines.push(`«${String(p.comment_text).slice(0, 600)}»`);
  }
  if (p.transition_comment && data.event_type === "ticket.status_changed") {
    lines.push("");
    lines.push(`Комментарий: ${String(p.transition_comment).slice(0, 400)}`);
  }
  if (p.url) {
    lines.push("");
    lines.push(`🔗 ${p.url}`);
  }
  return lines.join("\n");
}

function renderTemplate(tpl: string | undefined, data: { title: string; body?: string; event_type: string; priority?: string | null; payload?: Record<string, unknown> }): string {
  if (!tpl || !tpl.trim()) {
    return buildDefaultMessage(data as any);
  }
  const flat: Record<string, string> = {
    title: data.title,
    body: data.body ?? "",
    event_type: data.event_type,
    event_label: EVENT_LABELS[data.event_type] ?? data.event_type,
    priority: data.priority ?? "",
  };
  flattenPayload("", data.payload ?? {}, flat);
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => flat[k] ?? "");
}

async function sendTelegram(cfg: any, message: string) {
  const token = cfg.bot_token;
  const chatId = cfg.chat_id;
  if (!token || !chatId) throw new Error("Telegram: bot_token и chat_id обязательны");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: cfg.parse_mode || undefined, disable_web_page_preview: true }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

async function sendMattermost(cfg: any, message: string, title: string) {
  const url = cfg.webhook_url;
  if (!url) throw new Error("Mattermost: webhook_url обязателен");
  const body: any = { text: message };
  if (cfg.channel) body.channel = cfg.channel;
  if (cfg.username) body.username = cfg.username;
  if (cfg.icon_url) body.icon_url = cfg.icon_url;
  if (cfg.use_attachments) {
    body.attachments = [{ fallback: title, title, text: message, color: cfg.color || "#3b82f6" }];
    body.text = undefined;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

async function sendWebhook(cfg: any, message: string, title: string, event: EventInput) {
  const url = cfg.webhook_url;
  if (!url) throw new Error("Webhook URL обязателен");
  const method = (cfg.method || "POST").toUpperCase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.headers && typeof cfg.headers === "object") {
    for (const [k, v] of Object.entries(cfg.headers)) headers[k] = String(v);
  }
  let body: string | undefined;
  if (method !== "GET") {
    if (cfg.body_template) {
      body = renderTemplate(cfg.body_template, { title, body: message, event_type: event.event_type, priority: event.priority, payload: event.payload });
      // Try parse as JSON (preserve content-type), else send raw
    } else {
      body = JSON.stringify({
        title, message, event_type: event.event_type, priority: event.priority, payload: event.payload, recipient: cfg.recipient || cfg.email || cfg.phone,
      });
    }
  }
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

function normalizePhone(p: string): string {
  return String(p ?? "").replace(/[^\d]/g, "");
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function sendMtsSms(cfg: any, message: string, overridePhone?: string) {
  const clientId = String(cfg.client_id ?? "").trim();
  const apiKey = String(cfg.api_key ?? "").trim();
  const sender = String(cfg.sender_name ?? "").trim();
  const phone = normalizePhone(overridePhone ?? cfg.recipient ?? cfg.phone);
  if (!clientId || !apiKey) throw new Error("МТС: client_id и api_key обязательны");
  if (!sender) throw new Error("МТС: имя отправителя (alpha_name) обязательно");
  if (!phone) throw new Error("МТС: номер телефона обязателен");
  const ttl = Math.min(259200, Math.max(300, Number(cfg.ttl) || 300));
  const url = `https://api.communicator.mts.by/${encodeURIComponent(clientId)}/json2/simple`;
  const body: any = {
    phone_number: Number(phone),
    channels: ["sms"],
    channel_options: { sms: { text: message, alpha_name: sender, ttl } },
  };
  if (cfg.callback_url) body.callback_url = cfg.callback_url;
  const auth = btoa(`${clientId}:${apiKey}`);
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let providerOk = res.ok;
  let info = "";
  try {
    const j = JSON.parse(text);
    if (j.error_code) { providerOk = false; info = `error_code=${j.error_code} ${j.error_text ?? ""}`; }
    else if (j.message_id) { info = `message_id=${j.message_id}`; }
  } catch { /* keep raw */ }
  return { ok: providerOk, status: res.status, body: info ? `${info} | ${text}` : text };
}

async function sendA1Sms(cfg: any, message: string, overridePhone?: string) {
  const login = normalizePhone(cfg.login);
  const apiKey = String(cfg.api_key ?? "").trim();
  const sender = String(cfg.sender_name ?? "").trim();
  const phone = normalizePhone(overridePhone ?? cfg.recipient ?? cfg.phone);
  if (!login || !apiKey) throw new Error("А1: login и api_key обязательны");
  if (!sender) throw new Error("А1: имя отправителя обязательно");
  if (!phone) throw new Error("А1: номер телефона обязателен");
  const ttl = Math.min(86400, Math.max(40, Number(cfg.ttl) || 86400));
  const params = new URLSearchParams({
    user: login,
    apikey: apiKey,
    sender,
    phone,
    text: message,
    ttl: String(ttl),
  });
  const url = `https://smart-sender.a1.by/api/send/sms?${params.toString()}`;
  const res = await fetchWithTimeout(url, { method: "GET" });
  const text = await res.text();
  let providerOk = res.ok;
  let info = "";
  try {
    const j = JSON.parse(text);
    if (j.status === false) {
      providerOk = false;
      info = `error=${j.error?.code ?? ""} ${j.error?.description ?? ""}`;
    } else if (j.status === true && j.data?.message_id) {
      info = `message_id=${j.data.message_id}`;
    }
  } catch { /* keep raw */ }
  return { ok: providerOk, status: res.status, body: info ? `${info} | ${text}` : text };
}

async function sendSmtp(cfg: any, message: string, title: string, overrideEmail?: string) {
  const host = String(cfg.host ?? "").trim();
  const port = Number(cfg.port ?? 465);
  const secure = cfg.secure !== false; // default true (SSL/TLS for 465)
  const username = String(cfg.username ?? "").trim();
  const password = String(cfg.password ?? "");
  const fromEmail = String(cfg.from_email ?? username).trim();
  const fromName = String(cfg.from_name ?? "Assist Portal").trim();
  const toEmail = String(overrideEmail ?? cfg.to_email ?? cfg.recipient ?? "").trim();
  if (!host) throw new Error("SMTP: host обязателен");
  if (!username || !password) throw new Error("SMTP: username и password обязательны");
  if (!toEmail) throw new Error("SMTP: адрес получателя обязателен");
  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: secure,
      auth: { username, password },
    },
  });
  try {
    await client.send({
      from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      to: toEmail,
      subject: title,
      content: message,
      html: message
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>"),
    });
    await client.close();
    return { ok: true, status: 250, body: `sent to ${toEmail}` };
  } catch (e: any) {
    try { await client.close(); } catch { /* ignore */ }
    throw new Error(`SMTP send failed: ${e?.message ?? e}`);
  }
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subj = Deno.env.get("VAPID_SUBJECT") || "mailto:support@gloars.by";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subj, pub, priv);
  vapidReady = true;
  return true;
}

// Возвращает { ok, status, body, gone } — gone=true означает протухшую подписку (404/410),
// её канал надо выключить, чтобы не долбить мёртвый endpoint.
async function sendWebPush(cfg: any, title: string, message: string, event: EventInput) {
  if (!ensureVapid()) throw new Error("VAPID ключи не заданы (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)");
  if (!cfg?.endpoint || !cfg?.keys?.p256dh || !cfg?.keys?.auth) {
    throw new Error("web_push: в config нужны endpoint и keys.p256dh/auth");
  }
  const subscription = { endpoint: cfg.endpoint, keys: { p256dh: cfg.keys.p256dh, auth: cfg.keys.auth } };
  const payload = JSON.stringify({
    title: title || "Assist Portal",
    body: message || "",
    priority: event.priority ?? null,
    tag: (event.payload as any)?.tag ?? event.event_type,
    url: (event.payload as any)?.url ?? "/",
  });
  try {
    const res: any = await webpush.sendNotification(subscription, payload, { TTL: 3600 });
    return { ok: true, status: res?.statusCode ?? 201, body: "sent", gone: false };
  } catch (e: any) {
    const status = e?.statusCode ?? 0;
    const gone = status === 404 || status === 410;
    return { ok: false, status, body: String(e?.body ?? e?.message ?? e).slice(0, 500), gone };
  }
}

async function deliverToChannel(supabase: any, userId: string, channel: any, event: EventInput) {
  const message = renderTemplate(channel.config?.message_template, {
    title: event.title, body: event.body, event_type: event.event_type, priority: event.priority, payload: event.payload,
  });
  let result: { ok: boolean; status: number; body: string };
  try {
    if (channel.channel_type === "telegram") result = await sendTelegram(channel.config, message);
    else if (channel.channel_type === "mattermost") result = await sendMattermost(channel.config, message, event.title);
    else if (channel.channel_type === "mts_sms") result = await sendMtsSms(channel.config, message, (event as any).override_phone);
    else if (channel.channel_type === "a1_sms") result = await sendA1Sms(channel.config, message, (event as any).override_phone);
    else if (channel.channel_type === "smtp") result = await sendSmtp(channel.config, message, event.title, (event as any).override_email);
    else if (channel.channel_type === "web_push") {
      const wp = await sendWebPush(channel.config, event.title, message, event);
      if (wp.gone) {
        // подписка протухла — выключаем канал, чтобы не слать в мёртвый endpoint
        await supabase.from("notification_channels").update({ enabled: false, verified: false, last_test_status: "gone", last_test_error: "Подписка недействительна (протухла)" }).eq("id", channel.id);
      }
      result = { ok: wp.ok, status: wp.status, body: wp.body };
    }
    else result = await sendWebhook(channel.config, message, event.title, event);

    await supabase.from("notification_log").insert({
      user_id: userId, channel_id: channel.id, channel_type: channel.channel_type, event_id: event.event_id ?? null,
      event_type: event.event_type, priority: event.priority ?? null,
      title: event.title, body: event.body ?? null, payload: event.payload ?? null,
      status: result.ok ? "sent" : "failed", attempts: 1,
      error: result.ok ? null : result.body.slice(0, 1000),
      http_status: result.status, sent_at: result.ok ? new Date().toISOString() : null,
    });
    return result;
  } catch (e: any) {
    await supabase.from("notification_log").insert({
      user_id: userId, channel_id: channel.id, channel_type: channel.channel_type, event_id: event.event_id ?? null,
      event_type: event.event_type, priority: event.priority ?? null,
      title: event.title, body: event.body ?? null, payload: event.payload ?? null,
      status: "failed", attempts: 1, error: String(e?.message ?? e).slice(0, 1000),
    });
    return { ok: false, status: 0, body: String(e?.message ?? e) };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // === AUTH GUARD ===
    // Reject anonymous callers. Accept either a service-role bearer (for
    // server-to-server calls from other edge functions / cron) or an
    // authenticated end-user JWT.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
    const isServiceRole = !!token && token === SERVICE_KEY;

    let callerUserId: string | null = null;
    if (!isServiceRole) {
      if (!token || token === ANON_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        ANON_KEY || SERVICE_KEY,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data: userData, error: userErr } = await authClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerUserId = userData.user.id;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      SERVICE_KEY,
    );

    const event = (await req.json()) as EventInput;
    // один id на событие — все строки-каналы в notification_log получат его,
    // чтобы бейдж считал события, а не доставки по каналам
    event.event_id = event.event_id ?? crypto.randomUUID();
    if (!event?.event_type || !event?.title) {
      return new Response(JSON.stringify({ error: "event_type и title обязательны" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Test mode: send to a single channel
    if (event.test_channel_id) {
      const { data: ch } = await supabase.from("notification_channels").select("*").eq("id", event.test_channel_id).maybeSingle();
      if (!ch) return new Response(JSON.stringify({ error: "Канал не найден" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      // Only the channel owner (or a service-role caller) may test a channel.
      if (!isServiceRole && ch.user_id !== callerUserId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = await deliverToChannel(supabase, ch.user_id, ch, event);
      if (r.ok) {
        await supabase.from("notification_channels").update({
          verified: true, last_test_at: new Date().toISOString(), last_test_status: "ok", last_test_error: null,
        }).eq("id", ch.id);
      } else {
        await supabase.from("notification_channels").update({
          last_test_at: new Date().toISOString(), last_test_status: "failed", last_test_error: r.body.slice(0, 500),
        }).eq("id", ch.id);
      }
      return new Response(JSON.stringify(r), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find subscribers
    const { data: subs } = await supabase
      .from("notification_subscriptions")
      .select("*")
      .eq("event_type", event.event_type)
      .eq("enabled", true);

    let candidates = subs ?? [];
    if (event.target_user_ids?.length) {
      candidates = candidates.filter((s: any) => event.target_user_ids!.includes(s.user_id));
    }

    let delivered = 0, queued = 0, skipped = 0;

    for (const sub of candidates) {
      if (!meetsPriority(event.priority, sub.min_priority)) { skipped++; continue; }
      if (!matchesFilters(sub.filters, event.payload as any, sub.user_id)) { skipped++; continue; }

      const { data: prefs } = await supabase.from("notification_preferences").select("*").eq("user_id", sub.user_id).maybeSingle();
      const critical = isCritical(event.priority);

      if (prefs?.dnd_enabled && !(critical && prefs.quiet_bypass_critical)) { skipped++; continue; }

      const inQuiet = prefs ? inQuietWindow(prefs) : false;
      const bypass = critical && (prefs?.quiet_bypass_critical ?? true);
      const mode = prefs?.delivery_mode || "instant";
      const shouldDigest = mode === "digest" || (mode === "instant_critical_digest_rest" && !critical) || (inQuiet && !bypass);

      if (shouldDigest) {
        await supabase.from("notification_queue").insert({
          user_id: sub.user_id, event_type: event.event_type, priority: event.priority ?? null,
          title: event.title, body: event.body ?? null, payload: event.payload ?? {},
        });
        queued++;
        continue;
      }

      // Instant: deliver to chosen channels
      const chIds: string[] = Array.isArray(sub.channel_ids) ? sub.channel_ids : [];
      if (chIds.length === 0) { skipped++; continue; }
      const { data: channels } = await supabase
        .from("notification_channels").select("*").in("id", chIds).eq("enabled", true);
      for (const ch of channels ?? []) {
        const r = await deliverToChannel(supabase, sub.user_id, ch, event);
        if (r.ok) delivered++;
      }
    }

    return new Response(JSON.stringify({ delivered, queued, skipped, candidates: candidates.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notification-dispatch error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}
