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

-- На этой self-hosted установке операции CREATE/DROP POLICY блокируются
-- расширением realtime. Вместо изменения политик используем узкую RPC-функцию:
-- менять состояние может только владелец канала или администратор.
CREATE OR REPLACE FUNCTION public.set_notification_channels_enabled(
  _channel_ids uuid[],
  _enabled boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changed integer;
BEGIN
  UPDATE public.notification_channels AS channel
  SET enabled = _enabled
  WHERE channel.id = ANY(_channel_ids)
    AND (channel.user_id = auth.uid() OR public.is_notification_admin());

  GET DIAGNOSTICS _changed = ROW_COUNT;
  IF _changed <> cardinality(_channel_ids) THEN
    RAISE EXCEPTION 'Канал не найден или у вас нет прав на его изменение';
  END IF;
  RETURN _changed;
END;
$$;

REVOKE ALL ON FUNCTION public.set_notification_channels_enabled(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_notification_channels_enabled(uuid[], boolean) TO authenticated;
