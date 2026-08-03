-- Оператор/инженер видят ВСЕ агентские данные (реальная картина),
-- заказчик — только свою орг (существующие org/belongs-политики остаются).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_metrics','agent_events','agent_inventory','agent_processes'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_staff_all ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY %I_staff_all ON public.%I FOR SELECT USING (has_role(auth.uid(),''admin''::app_role) OR has_role(auth.uid(),''engineer''::app_role))',
        t, t);
    END IF;
  END LOOP;
END $$;
