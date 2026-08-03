// Проблемы от АГЕНТОВ (диск/CPU/офлайн/критичные события) единым списком.
// RLS применяется через клиент пользователя (Authorization заголовок проброшен).
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const norm = (l: string) => {
  const s = (l || "").toLowerCase();
  if (s.includes("crit")) return "critical";
  if (s.includes("error") || s.includes("ошиб") || s.includes("failure")) return "error";
  if (s.includes("warn") || s.includes("предупре")) return "warning";
  return "info";
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });

    // правила категорий проблем (дефолт по виду + исключения на агента)
    const { data: rulesRows } = await sb.from("agent_problem_rules").select("*");
    const ruleFor = (kind: string, agentId: string) => {
      const list = rulesRows || [];
      return list.find((r: any) => r.kind === kind && r.agent_id === agentId)
          || list.find((r: any) => r.kind === kind && !r.agent_id)
          || { enabled: true, action: "alert", warning_value: null, critical_value: null };
    };
    // применить действие правила к severity; вернуть null если проблему гасим
    const applyRule = (kind: string, agentId: string, sev: string): string | null => {
      const r: any = ruleFor(kind, agentId);
      if (r.enabled === false || r.action === "ignore") return null;
      if (r.action === "warn") return "warning";
      return sev;
    };

    // агенты (RLS отфильтрует по роли/орг)
    const { data: agents } = await sb.from("agent_registrations")
      .select("agent_id, hostname, organization_id, last_seen_at, is_active");
    const ids = (agents ?? []).map((a: any) => a.agent_id);
    const byId: Record<string, any> = {};
    for (const a of agents ?? []) byId[a.agent_id] = a;

    // последние метрики по каждому агенту
    const { data: metrics } = ids.length ? await sb.from("agent_metrics")
      .select("agent_id, collected_at, cpu_usage_percent, disk_metrics, disk_forecast, smart_trends, system_state, uptime_seconds")
      .in("agent_id", ids).order("collected_at", { ascending: false }).limit(1000) : { data: [] };
    const lastMetric: Record<string, any> = {};
    for (const m of metrics ?? []) if (!lastMetric[m.agent_id]) lastMetric[m.agent_id] = m;

    // SMART/здоровье дисков (последний inventory по агенту)
    const { data: invRows } = ids.length ? await sb.from("agent_inventory")
      .select("agent_id, collected_at, disks_health")
      .in("agent_id", ids).order("collected_at", { ascending: false }).limit(500) : { data: [] };
    const lastInv: Record<string, any> = {};
    for (const r of invRows ?? []) if (!lastInv[r.agent_id]) lastInv[r.agent_id] = r;

    // критичные события за час
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { data: events } = ids.length ? await sb.from("agent_events")
      .select("agent_id, level, source, message, time_created")
      .in("agent_id", ids).gte("time_created", since).order("time_created", { ascending: false }).limit(500) : { data: [] };

    const now = Date.now();
    const problems: any[] = [];
    const push = (sev: string, agent: any, kind: string, name: string, detail: string, ts: string) => {
      const eff = applyRule(kind, agent.agent_id, sev);
      if (!eff) return; // погашено правилом
      problems.push({ source: "agent", severity: eff, agent_id: agent.agent_id, hostname: agent.hostname || agent.agent_id,
        organization_id: agent.organization_id, kind, name, detail, clock: ts });
    };

    for (const a of agents ?? []) {
      // офлайн > 10 мин (только активные)
      if (a.is_active && a.last_seen_at) {
        const ago = (now - new Date(a.last_seen_at).getTime()) / 60000;
        const ro: any = ruleFor("offline", a.agent_id);
        const wo = ro.warning_value ?? 10, co = ro.critical_value ?? 60;
        if (ago > wo) push(ago > co ? "high" : "average", a, "offline", "Агент офлайн",
          `Нет связи ${Math.round(ago)} мин`, a.last_seen_at);
      }
      const m = lastMetric[a.agent_id];
      if (m) {
        // диски
        for (const d of (m.disk_metrics ?? [])) {
          const p = Number(d.used_percent ?? 0);
          const rd: any = ruleFor("disk", a.agent_id);
          const wd = rd.warning_value ?? 85, cd = rd.critical_value ?? 95;
          if (p >= cd) push("high", a, "disk", `Диск ${d.device || d.mount_point} переполнен`, `${p.toFixed(1)}% занято`, m.collected_at);
          else if (p >= wd) push("average", a, "disk", `Мало места на ${d.device || d.mount_point}`, `${p.toFixed(1)}% занято`, m.collected_at);
        }
        // CPU
        const cpu = Number(m.cpu_usage_percent ?? 0);
        const rc: any = ruleFor("cpu", a.agent_id);
        const wc = rc.warning_value ?? 90;
        if (cpu >= wc) push("average", a, "cpu", "Высокая загрузка CPU", `${cpu.toFixed(0)}%`, m.collected_at);
        // прогноз заполнения дисков (данные считает агент)
        const rf: any = ruleFor("disk_fill", a.agent_id);
        const wf = rf.warning_value ?? 14, cf = rf.critical_value ?? 5;
        for (const fc of (m.disk_forecast ?? [])) {
          const days = Number(fc.days_left ?? -1);
          const key = fc.device ?? "диск";
          const gbDay = Number(fc.trend_gb_per_day ?? 0);
          const conf = String(fc.confidence ?? "");
          if (days < 0 || gbDay <= 0.001 || conf === "low") continue; // нет тренда/шум/низкая достоверность
          if (days <= wf) {
            const rate = gbDay > 0 ? ` (растёт ${gbDay.toFixed(1)} ГБ/сут)` : "";
            const dateStr = fc.full_date ? `, ~${fc.full_date}` : "";
            push(days <= cf ? "high" : "average", a, "disk_fill",
              `Диск ${key}: ~${Math.round(days)} дн. до заполнения`, `Прогноз по тренду${rate}${dateStr}`, m.collected_at);
          }
        }
      }
    }
    // критичные события Windows (агрегируем по агенту+источнику)
    const evAgg: Record<string, any> = {};
    for (const e of events ?? []) {
      const lvl = norm(e.level);
      if (lvl !== "critical" && lvl !== "error") continue;
      const k = e.agent_id + "|" + (e.source || "");
      if (!evAgg[k]) { evAgg[k] = { ...e, count: 0, lvl }; }
      evAgg[k].count++;
    }
    for (const k in evAgg) {
      const e = evAgg[k]; const a = byId[e.agent_id]; if (!a) continue;
      push(e.lvl === "critical" ? "high" : "average", a, "event",
        `События: ${e.source || "система"}`, `${e.count} ${e.lvl === "critical" ? "критич." : "ошибок"} за час`, e.time_created);
    }

    // ── SMART/здоровье дисков ──
    for (const a of agents ?? []) {
      const inv = lastInv[a.agent_id]; if (!inv) continue;
      const rs: any = ruleFor("smart", a.agent_id);
      const wearWarn = rs.warning_value ?? 80; // % износа SSD
      for (const d of (inv.disks_health ?? [])) {
        const nm = d.name || d.model || "диск";
        const ts = inv.collected_at;
        if (d.predict_failure === true)
          push("high", a, "smart", `Диск ${nm}: прогноз отказа`, "S.M.A.R.T. предсказывает сбой — замена срочно", ts);
        const h = String(d.health || "").toLowerCase();
        if (h === "unhealthy")
          push("high", a, "smart", `Диск ${nm}: критическое состояние`, `Здоровье: ${d.health}`, ts);
        else if (h === "warning")
          push("average", a, "smart", `Диск ${nm}: ухудшение состояния`, `Здоровье: ${d.health}`, ts);
        const wear = Number(d.wear ?? 0);
        if ((d.media_type === "SSD" || d.bus_type === "NVMe") && wear >= wearWarn)
          push(wear >= 95 ? "high" : "average", a, "smart", `SSD ${nm}: износ ${wear}%`, "Ресурс записи на исходе", ts);
        const t = Number(d.temperature ?? 0), tmax = Number(d.temperature_max ?? 0);
        if (t > 0 && tmax > 0 && t >= tmax)
          push("average", a, "smart", `Диск ${nm}: перегрев ${t}°C`, `Порог ${tmax}°C`, ts);
      }
    }
    // SMART_DONE
    // ── ПРОГНОЗ ОТКАЗА по трендам SMART ──
    for (const a of agents ?? []) {
      const m = lastMetric[a.agent_id];
      if (!m || !Array.isArray(m.smart_trends)) continue;
      const rw: any = ruleFor("ssd_wear", a.agent_id);       // месяцев до износа
      const wearW = rw.warning_value ?? 18, wearC = rw.critical_value ?? 6;
      const rt: any = ruleFor("temp_trend", a.agent_id);     // °C прироста
      const tW = rt.warning_value ?? 3, tC = rt.critical_value ?? 6;
      for (const tr of m.smart_trends) {
        const dev = tr.device || tr.serial || "диск";
        const ts = m.collected_at;
        // износ SSD: месяцы до 100%
        const mw = Number(tr.months_to_wear ?? -1);
        if (mw >= 0 && mw <= wearW)
          push(mw <= wearC ? "high" : "average", a, "ssd_wear",
            `SSD ${dev}: ресурс ~${mw.toFixed(0)} мес`, `Износ ${Number(tr.wear_per_month ?? 0).toFixed(1)}%/мес — замена ${mw <= wearC ? "срочно" : "планово"}`, ts);
        // деградация: флаг или растущие ошибки чтения/записи
        const rErr = Number(tr.read_err_delta ?? 0), wErr = Number(tr.write_err_delta ?? 0);
        if (tr.degrading === true || rErr > 0 || wErr > 0) {
          const err = (rErr > 0 || wErr > 0) ? ` (ошибки чт/зп +${rErr}/${wErr})` : "";
          push((rErr > 0 || wErr > 0) ? "high" : "average", a, "disk_degrading",
            `Диск ${dev}: деградация`, `${tr.note || "Показатели ухудшаются"}${err} — замена рекомендуется`, ts);
        }
        // температурный тренд
        const tt = Number(tr.temp_trend ?? 0);
        if (tt >= tW)
          push(tt >= tC ? "high" : "average", a, "temp_trend",
            `Диск ${dev}: перегрев прогрессирует`, `Температура растёт +${tt.toFixed(1)}°C`, ts);
      }
    }
    // ── СТАБИЛЬНОСТЬ ЖЕЛЕЗА/СИСТЕМЫ (system_state.stability, окно 30 дней) ── STABILITY_BLOCK
    for (const a of agents ?? []) {
      const m = lastMetric[a.agent_id];
      const stab = m?.system_state?.stability;
      if (!stab) continue;
      const ts = m.collected_at;
      const rs: any = ruleFor("stability", a.agent_id);
      const bsW = rs.warning_value ?? 1, bsC = rs.critical_value ?? 3;
      const days = Number(stab.window_days ?? 30);
      const bs = Number(stab.bugchecks ?? 0);
      const pf = Number(stab.power_faults ?? 0);
      const hw = Number(stab.hardware ?? 0);
      // Сбои железа (диск/память/WHEA) — деградация. Без ECC некорректируемые опаснее.
      if (hw > 0) {
        const eccNote = stab.ecc_supported ? "" : " (ОЗУ без ECC — ошибки памяти не корректируются)";
        push(hw >= bsC ? "high" : "average", a, "stability",
          `Сбои оборудования: ${hw} за ${days} дн`,
          `Ошибки диска/памяти/WHEA${eccNote} — проверить состояние оборудования`, ts);
      }
      // Синие экраны — нестабильность системы.
      if (bs >= bsW) {
        push(bs >= bsC ? "high" : "average", a, "stability",
          `BSOD: ${bs} за ${days} дн`,
          `Синие экраны${pf ? `, некорректных отключений: ${pf}` : ""} — система нестабильна`, ts);
      } else if (pf >= bsC) {
        // много некорректных отключений даже без BSOD
        push("average", a, "stability",
          `Некорректные отключения: ${pf} за ${days} дн`,
          "Частые сбросы питания — проверить питание/выключение", ts);
      }
    }
    // ── UPTIME: два раздельных повода (перезагрузка и физическое ТО) ── UPTIME_BLOCK
    for (const a of agents ?? []) {
      const m = lastMetric[a.agent_id];
      const secs = Number(m?.uptime_seconds ?? 0);
      if (!secs || secs <= 0) continue;
      const days = secs / 86400;
      const ts = m.collected_at;

      // перезагрузка: накопились обновления, возможны утечки памяти
      const rr: any = ruleFor("uptime_reboot", a.agent_id);
      const rW = rr.warning_value ?? 30, rC = rr.critical_value ?? 60;
      if (days >= rW) {
        push(days >= rC ? "average" : "warning", a, "uptime_reboot",
          `Без перезагрузки ${Math.floor(days)} дн`,
          "Давно не перезагружался — накопились обновления, возможны утечки памяти", ts);
      }

      // физическое ТО: чистка от пыли, проверка охлаждения
      const rm: any = ruleFor("uptime_maintenance", a.agent_id);
      const mW = rm.warning_value ?? 180, mC = rm.critical_value ?? 365;
      if (days >= mW) {
        push(days >= mC ? "average" : "warning", a, "uptime_maintenance",
          `Без обслуживания ${Math.floor(days)} дн`,
          "Давно без физического ТО — пора чистка от пыли, проверка охлаждения", ts);
      }
    }
    // PROGNOSIS_DONE
    const rank: Record<string, number> = { high: 3, average: 2, warning: 1 };
    problems.sort((x, y) => (rank[y.severity] || 0) - (rank[x.severity] || 0) || (y.clock || "").localeCompare(x.clock || ""));
    return new Response(JSON.stringify({ problems, count: problems.length }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e), problems: [] }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
}
