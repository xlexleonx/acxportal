-- Read model for the common Monitoring page.  A collector owns the source
-- data, while the portal adds the automatically created site (ЦОД) context.
CREATE OR REPLACE FUNCTION public.list_collector_monitoring_problems()
RETURNS TABLE (
  problem_id uuid,
  collector_connection_id uuid,
  collector_name text,
  device_id uuid,
  source_device_id text,
  device_name text,
  device_address text,
  site_id uuid,
  site_name text,
  description text,
  severity text,
  is_active boolean,
  opened_at timestamptz,
  closed_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  RETURN QUERY
  SELECT p.id, c.id, c.name, d.id, d.source_device_id, d.name, d.address,
    s.id, s.name, p.description, p.severity, p.is_active, p.opened_at, p.closed_at
  FROM public.collector_problems p
  JOIN public.collector_devices d ON d.id = p.collector_device_id
  JOIN public.collector_connections c ON c.id = d.collector_connection_id
  LEFT JOIN public.equipment e ON e.id = d.equipment_id
  LEFT JOIN public.sites s ON s.id = e.site_id
  ORDER BY p.is_active DESC, p.opened_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_collector_monitoring_problems() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_collector_monitoring_problems() TO authenticated;
