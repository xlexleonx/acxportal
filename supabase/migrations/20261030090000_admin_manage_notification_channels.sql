-- Администратор видит каналы и подписки всех пользователей, поэтому ему
-- необходимо также разрешить их включение, отключение и удаление.
CREATE POLICY "Admins manage all channels" ON public.notification_channels
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage all subscriptions" ON public.notification_subscriptions
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
