CREATE TABLE IF NOT EXISTS public.collector_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id text NOT NULL UNIQUE,
  name text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  sync_token_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  last_event_at timestamptz,
  collector_version text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collector_connections_org ON public.collector_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_collector_connections_seen ON public.collector_connections(last_seen_at DESC);

ALTER TABLE public.collector_connections ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.collector_connections TO service_role;

DROP TRIGGER IF EXISTS update_collector_connections_updated_at ON public.collector_connections;
CREATE TRIGGER update_collector_connections_updated_at
  BEFORE UPDATE ON public.collector_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- This self-hosted installation blocks CREATE POLICY through the realtime
-- schema. Access for the admin UI is deliberately limited to these RPCs.
CREATE OR REPLACE FUNCTION public.collector_admin_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.list_collector_connections()
RETURNS TABLE (
  id uuid, collector_id text, name text, organization_id uuid, organization_name text,
  is_active boolean, last_seen_at timestamptz, last_event_at timestamptz, collector_version text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  RETURN QUERY
  SELECT c.id, c.collector_id, c.name, c.organization_id, o.name, c.is_active, c.last_seen_at, c.last_event_at, c.collector_version
  FROM public.collector_connections c LEFT JOIN public.organizations o ON o.id = c.organization_id
  ORDER BY c.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_collector_connection(_collector_id text, _name text, _organization_id uuid, _token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  INSERT INTO public.collector_connections(collector_id, name, organization_id, sync_token_hash)
  VALUES (_collector_id, _name, _organization_id, _token_hash) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_collector_organization(_id uuid, _organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  UPDATE public.collector_connections SET organization_id = _organization_id WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Коллектор не найден'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_collector_connection(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  DELETE FROM public.collector_connections WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Коллектор не найден'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.collector_admin_allowed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_collector_connections() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_collector_connection(text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_collector_organization(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_collector_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_collector_connections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_collector_connection(text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_collector_organization(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_collector_connection(uuid) TO authenticated;
