-- Администратор видит каналы и подписки всех пользователей, поэтому ему
-- необходимо также разрешить их включение, отключение и удаление.
-- Не используем историческую has_role(): на некоторых self-hosted БД у неё
-- сохранён неверный search_path (realtime вместо public).
CREATE OR REPLACE FUNCTION public.is_notification_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'::public.app_role
  );
$$;

DROP POLICY IF EXISTS "Admins manage all channels" ON public.notification_channels;
DROP POLICY IF EXISTS "Admins manage all subscriptions" ON public.notification_subscriptions;

CREATE POLICY "Admins manage all channels" ON public.notification_channels
  FOR ALL
  TO authenticated
  USING (public.is_notification_admin())
  WITH CHECK (public.is_notification_admin());

CREATE POLICY "Admins manage all subscriptions" ON public.notification_subscriptions
  FOR ALL
  TO authenticated
  USING (public.is_notification_admin())
  WITH CHECK (public.is_notification_admin());
