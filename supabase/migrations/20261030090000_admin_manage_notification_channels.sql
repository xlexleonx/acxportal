-- Администратор видит каналы и подписки всех пользователей, поэтому ему
-- необходимо также разрешить их включение, отключение и удаление.
CREATE POLICY "Admins manage all channels" ON public.notification_channels
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage all subscriptions" ON public.notification_subscriptions
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
