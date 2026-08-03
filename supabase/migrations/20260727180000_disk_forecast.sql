ALTER TABLE public.agent_metrics ADD COLUMN IF NOT EXISTS disk_forecast jsonb;
