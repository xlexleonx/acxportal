import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Subscribes to notification_log inserts for the current user and shows
 * a native browser Notification for items where channel_type === 'web_push'.
 * Works while at least one tab is open. Permission must be granted.
 */
export function useBrowserNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!user || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;

    const ch = supabase
      .channel(`notif-log-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_log", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row: any = payload.new;
          // Браузерные пуши рисует Service Worker (push-событие), даже при закрытой вкладке.
          // Здесь их НЕ дублируем, иначе при открытой вкладке придёт два уведомления.
          if (row.channel_type === "web_push") return;
          try {
            const n = new Notification(row.title || "Уведомление", {
              body: row.body || "",
              tag: row.id,
              icon: "/favicon.ico",
            });
            n.onclick = () => {
              window.focus();
              n.close();
            };
          } catch {
            // silent
          }
        }
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, permission]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return "denied" as NotificationPermission;
    const p = await Notification.requestPermission();
    setPermission(p);
    return p;
  };

  return { permission, requestPermission, supported: typeof Notification !== "undefined" };
}