-- SELECT по своей организации для не-штатных ролей (штат уже покрыт admin/engineer ALL-политиками)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipment','tickets','documents','contracts','sites'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_org_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_org_select ON public.%I FOR SELECT USING (organization_id = public.current_org())',
      t, t);
  END LOOP;
END $$;

-- org_admin управляет ЗАЯВКАМИ своей организации (создание/правка)
DROP POLICY IF EXISTS tickets_orgadmin_write ON public.tickets;
CREATE POLICY tickets_orgadmin_write ON public.tickets FOR ALL
  USING (organization_id = public.current_org())
  WITH CHECK (organization_id = public.current_org());
