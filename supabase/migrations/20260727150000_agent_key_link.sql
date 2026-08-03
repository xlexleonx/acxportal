ALTER TABLE public.agent_registrations
  ADD COLUMN IF NOT EXISTS enrollment_key_id uuid REFERENCES public.agent_enrollment_keys(id);
