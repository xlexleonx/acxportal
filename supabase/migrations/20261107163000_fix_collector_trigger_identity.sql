-- Repair controls created before the monitoring read model exposed the actual
-- Zabbix trigger ID. Keep the user's enabled/disabled choice intact.
INSERT INTO public.collector_trigger_states (
  collector_device_id, source_trigger_id, enabled, description, severity, updated_at
)
SELECT s.collector_device_id, p.source_trigger_id, s.enabled, s.description, s.severity, s.updated_at
FROM public.collector_trigger_states s
JOIN public.collector_problems p
  ON p.collector_device_id = s.collector_device_id
 AND p.id::text = s.source_trigger_id
ON CONFLICT (collector_device_id, source_trigger_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    description = EXCLUDED.description,
    severity = EXCLUDED.severity,
    updated_at = EXCLUDED.updated_at;

DELETE FROM public.collector_trigger_states s
USING public.collector_problems p
WHERE p.collector_device_id = s.collector_device_id
  AND p.id::text = s.source_trigger_id;

UPDATE public.collector_problems p
SET is_active = false, closed_at = COALESCE(p.closed_at, now())
FROM public.collector_trigger_states s
WHERE s.collector_device_id = p.collector_device_id
  AND s.source_trigger_id = p.source_trigger_id
  AND NOT s.enabled
  AND p.is_active;

DROP FUNCTION IF EXISTS public.list_collector_monitoring_problems();

CREATE FUNCTION public.list_collector_monitoring_problems()
RETURNS TABLE (
  problem_id uuid,
  collector_connection_id uuid,
  collector_name text,
  device_id uuid,
  source_device_id text,
  device_name text,
  device_address text,
  source_trigger_id text,
  site_id uuid,
  site_name text,
  description text,
  severity text,
  is_active boolean,
  opened_at timestamptz,
  closed_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  RETURN QUERY
  SELECT p.id, c.id, c.name, d.id, d.source_device_id, d.name, d.address, p.source_trigger_id,
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
