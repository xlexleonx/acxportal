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

CREATE POLICY "Admins manage collector connections"
  ON public.collector_connections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collector_connections TO authenticated;
GRANT ALL ON public.collector_connections TO service_role;

DROP TRIGGER IF EXISTS update_collector_connections_updated_at ON public.collector_connections;
CREATE TRIGGER update_collector_connections_updated_at
  BEFORE UPDATE ON public.collector_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
