-- One-time activation packages let a collector obtain its credentials using
-- only an outbound HTTPS request. The package itself never contains a reusable
-- synchronization token or an API key.
ALTER TABLE public.collector_connections
  ADD COLUMN IF NOT EXISTS bootstrap_token_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bootstrap_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS bootstrap_used_at timestamptz;

CREATE OR REPLACE FUNCTION public.create_collector_connection(
  _collector_id text,
  _name text,
  _organization_id uuid,
  _token_hash text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  IF length(trim(_collector_id)) < 3 OR length(trim(_name)) < 1 OR length(trim(_token_hash)) < 32 THEN
    RAISE EXCEPTION 'Некорректные параметры коллектора';
  END IF;

  INSERT INTO public.collector_connections(
    collector_id, name, organization_id, sync_token_hash, bootstrap_token_hash, bootstrap_expires_at
  ) VALUES (
    trim(_collector_id), trim(_name), _organization_id,
    md5(gen_random_uuid()::text), trim(_token_hash), now() + interval '24 hours'
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_collector_bootstrap(_id uuid, _token_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.collector_admin_allowed() THEN RAISE EXCEPTION 'Недостаточно прав'; END IF;
  IF length(trim(_token_hash)) < 32 THEN RAISE EXCEPTION 'Некорректный токен активации'; END IF;

  UPDATE public.collector_connections
  SET bootstrap_token_hash = trim(_token_hash),
      bootstrap_expires_at = now() + interval '24 hours',
      bootstrap_used_at = NULL
  WHERE id = _id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Коллектор не найден'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_collector_bootstrap(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_collector_bootstrap(uuid, text) TO authenticated;
