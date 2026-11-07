CREATE TABLE IF NOT EXISTS public.collector_trigger_states (
  collector_device_id uuid NOT NULL REFERENCES public.collector_devices(id) ON DELETE CASCADE,
  source_trigger_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  description text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'warning',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collector_device_id, source_trigger_id)
);

CREATE OR REPLACE FUNCTION public.set_collector_trigger_enabled(_collector_device_id uuid, _trigger_id text, _enabled boolean, _description text DEFAULT '', _severity text DEFAULT 'warning')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  INSERT INTO public.collector_trigger_states(collector_device_id, source_trigger_id, enabled, description, severity)
  VALUES (_collector_device_id, _trigger_id, _enabled, _description, _severity)
  ON CONFLICT (collector_device_id, source_trigger_id) DO UPDATE
    SET enabled = EXCLUDED.enabled, description = EXCLUDED.description, severity = EXCLUDED.severity, updated_at = now();
  IF NOT _enabled THEN
    UPDATE public.collector_problems SET is_active = false, closed_at = now()
    WHERE collector_device_id = _collector_device_id AND source_trigger_id = _trigger_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.list_collector_disabled_triggers()
RETURNS TABLE (collector_device_id uuid, trigger_id text, device_name text, collector_name text, description text, severity text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  RETURN QUERY SELECT s.collector_device_id, s.source_trigger_id, d.name, c.name, s.description, s.severity
  FROM public.collector_trigger_states s JOIN public.collector_devices d ON d.id=s.collector_device_id
  JOIN public.collector_connections c ON c.id=d.collector_connection_id WHERE NOT s.enabled ORDER BY d.name, s.description;
END; $$;

REVOKE ALL ON FUNCTION public.set_collector_trigger_enabled(uuid,text,boolean,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_collector_disabled_triggers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_collector_trigger_enabled(uuid,text,boolean,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_collector_disabled_triggers() TO authenticated;
