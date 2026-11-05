ALTER TABLE public.collector_devices
  ADD COLUMN IF NOT EXISTS equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_collector_devices_equipment ON public.collector_devices(equipment_id);

CREATE OR REPLACE FUNCTION public.list_collector_monitoring_devices()
RETURNS TABLE (
  collector_name text, collector_connection_id uuid, device_id uuid, equipment_id uuid,
  name text, address text, protocol text, status text, status_message text,
  last_seen_at timestamptz, last_poll_at timestamptz, metric_count bigint,
  active_problems bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  RETURN QUERY
  SELECT c.name, c.id, d.id, d.equipment_id, d.name, d.address, d.protocol,
    d.status, d.status_message, d.last_seen_at, d.last_poll_at,
    COUNT(DISTINCT m.id), COUNT(DISTINCT p.id) FILTER (WHERE p.is_active)
  FROM public.collector_connections c
  JOIN public.collector_devices d ON d.collector_connection_id = c.id
  LEFT JOIN public.collector_metric_values m ON m.collector_device_id = d.id
  LEFT JOIN public.collector_problems p ON p.collector_device_id = d.id
  GROUP BY c.name, c.id, d.id
  ORDER BY c.name, d.name;
END;
$$;

REVOKE ALL ON FUNCTION public.list_collector_monitoring_devices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_collector_monitoring_devices() TO authenticated;
