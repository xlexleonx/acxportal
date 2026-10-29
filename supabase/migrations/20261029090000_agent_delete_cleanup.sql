-- Полное удаление агента из интерфейса должно удалять и данные, которые
-- поступают от него. Метрики и команды уже имеют ON DELETE CASCADE, а для
-- остальных агентских таблиц гарантируем очистку до удаления регистрации.
CREATE OR REPLACE FUNCTION public.cleanup_agent_data_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_events',
    'agent_inventory',
    'agent_processes',
    'agent_problem_rules'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE agent_id = $1', table_name)
      USING OLD.agent_id;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_agent_data_before_delete ON public.agent_registrations;
CREATE TRIGGER cleanup_agent_data_before_delete
  BEFORE DELETE ON public.agent_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_agent_data_before_delete();
