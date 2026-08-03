ALTER TABLE public.agent_metrics
  ADD COLUMN IF NOT EXISTS smart_trends jsonb,
  ADD COLUMN IF NOT EXISTS system_state jsonb,
  ADD COLUMN IF NOT EXISTS health jsonb;
INSERT INTO public.agent_problem_rules (kind, warning_value, critical_value, action) VALUES
  ('ssd_wear', 18, 6, 'alert'),
  ('disk_degrading', 0, 0, 'alert'),
  ('temp_trend', 3, 6, 'warn')
ON CONFLICT (kind, agent_id) DO NOTHING;
