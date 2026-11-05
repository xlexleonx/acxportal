CREATE TABLE IF NOT EXISTS public.collector_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_connection_id uuid NOT NULL REFERENCES public.collector_connections(id) ON DELETE CASCADE,
  source_device_id text NOT NULL,
  name text NOT NULL,
  address text,
  protocol text,
  status text NOT NULL DEFAULT 'unknown',
  status_message text,
  last_seen_at timestamptz,
  last_poll_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collector_connection_id, source_device_id)
);

CREATE INDEX IF NOT EXISTS idx_collector_devices_connection ON public.collector_devices(collector_connection_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.collector_metric_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_device_id uuid NOT NULL REFERENCES public.collector_devices(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  name text NOT NULL,
  units text NOT NULL DEFAULT '',
  value text,
  error text,
  collected_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collector_device_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_collector_metric_values_device ON public.collector_metric_values(collector_device_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS public.collector_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_device_id uuid NOT NULL REFERENCES public.collector_devices(id) ON DELETE CASCADE,
  source_trigger_id text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  is_active boolean NOT NULL DEFAULT true,
  opened_at timestamptz NOT NULL,
  closed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collector_device_id, source_trigger_id)
);

CREATE INDEX IF NOT EXISTS idx_collector_problems_active ON public.collector_problems(collector_device_id, is_active, opened_at DESC);

ALTER TABLE public.collector_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collector_metric_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collector_problems ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.collector_devices, public.collector_metric_values, public.collector_problems TO service_role;

DROP TRIGGER IF EXISTS update_collector_devices_updated_at ON public.collector_devices;
CREATE TRIGGER update_collector_devices_updated_at BEFORE UPDATE ON public.collector_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_collector_metric_values_updated_at ON public.collector_metric_values;
CREATE TRIGGER update_collector_metric_values_updated_at BEFORE UPDATE ON public.collector_metric_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_collector_problems_updated_at ON public.collector_problems;
CREATE TRIGGER update_collector_problems_updated_at BEFORE UPDATE ON public.collector_problems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.list_collector_devices(_collector_connection_id uuid)
RETURNS TABLE (
  id uuid, source_device_id text, name text, address text, protocol text, status text,
  status_message text, last_seen_at timestamptz, last_poll_at timestamptz,
  metric_count bigint, last_metric_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  RETURN QUERY
  SELECT d.id, d.source_device_id, d.name, d.address, d.protocol, d.status,
    d.status_message, d.last_seen_at, d.last_poll_at, COUNT(m.id), MAX(m.collected_at)
  FROM public.collector_devices d
  LEFT JOIN public.collector_metric_values m ON m.collector_device_id = d.id
  WHERE d.collector_connection_id = _collector_connection_id
  GROUP BY d.id
  ORDER BY d.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_collector_metric_values(_collector_connection_id uuid)
RETURNS TABLE (
  device_name text, item_key text, name text, units text, value text, error text, collected_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  RETURN QUERY
  SELECT d.name, m.item_key, m.name, m.units, m.value, m.error, m.collected_at
  FROM public.collector_metric_values m
  JOIN public.collector_devices d ON d.id = m.collector_device_id
  WHERE d.collector_connection_id = _collector_connection_id
  ORDER BY d.name, m.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_collector_problems(_collector_connection_id uuid)
RETURNS TABLE (
  device_name text, description text, severity text, is_active boolean, opened_at timestamptz, closed_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  RETURN QUERY
  SELECT d.name, p.description, p.severity, p.is_active, p.opened_at, p.closed_at
  FROM public.collector_problems p
  JOIN public.collector_devices d ON d.id = p.collector_device_id
  WHERE d.collector_connection_id = _collector_connection_id
  ORDER BY p.is_active DESC, p.opened_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_collector_devices(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_collector_metric_values(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_collector_problems(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_collector_devices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_collector_metric_values(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_collector_problems(uuid) TO authenticated;
