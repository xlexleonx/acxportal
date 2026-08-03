import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function bufToB64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function usePushSubscription() {
  const { user } = useAuth();
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined";

  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getReg = useCallback(async () => {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existing) return existing;
    return navigator.serviceWorker.register("/sw.js");
  }, []);

  // текущее состояние подписки браузера
  useEffect(() => {
    if (!supported) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setSubscribed(!!sub);
      } catch { /* ignore */ }
    })();
  }, [supported]);

  const enable = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true); setError(null);
    try {
      if (!VAPID_PUBLIC) throw new Error("VAPID public key не задан (VITE_VAPID_PUBLIC_KEY)");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Разрешение на уведомления не выдано");

      const reg = await getReg();
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
      }

      const json: any = sub.toJSON();
      const config = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? bufToB64Url(sub.getKey("p256dh")),
          auth: json.keys?.auth ?? bufToB64Url(sub.getKey("auth")),
        },
        ua: navigator.userAgent,
      };

      // один канал web_push на пользователя (перезапись config при повторном включении)
      const { data: existing } = await supabase
        .from("notification_channels")
        .select("id")
        .eq("user_id", user.id)
        .eq("channel_type", "web_push")
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from("notification_channels")
          .update({ config, enabled: true, verified: true })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_channels").insert({
          user_id: user.id,
          channel_type: "web_push",
          name: "Этот браузер",
          config,
          enabled: true,
          verified: true,
        });
        if (error) throw error;
      }
      setSubscribed(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, [supported, user, getReg]);

  const disable = useCallback(async () => {
    if (!supported || !user) return;
    setBusy(true); setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint;
      if (sub) await sub.unsubscribe();
      // выключаем канал этого браузера (по endpoint)
      const { data: rows } = await supabase
        .from("notification_channels")
        .select("id, config")
        .eq("user_id", user.id)
        .eq("channel_type", "web_push");
      for (const r of rows ?? []) {
        if (!endpoint || (r as any).config?.endpoint === endpoint) {
          await supabase.from("notification_channels").update({ enabled: false }).eq("id", (r as any).id);
        }
      }
      setSubscribed(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [supported, user]);

  return { supported, subscribed, busy, error, enable, disable };
}
