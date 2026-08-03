CREATE TABLE IF NOT EXISTS public.agent_problem_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                       -- offline | disk | cpu | event
  agent_id text,                            -- NULL = правило по умолчанию для вида; иначе исключение на агента
  enabled boolean NOT NULL DEFAULT true,
  action text NOT NULL DEFAULT 'alert',     -- alert | warn | ignore
  warning_value numeric,                    -- порог предупреждения (мин для offline/disk/cpu)
  critical_value numeric,                   -- порог критичности
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, agent_id)
);
ALTER TABLE public.agent_problem_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apr_staff_all ON public.agent_problem_rules;
CREATE POLICY apr_staff_all ON public.agent_problem_rules FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'engineer'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'engineer'::app_role));

-- дефолты = текущие зашитые пороги
INSERT INTO public.agent_problem_rules (kind, warning_value, critical_value, action) VALUES
  ('offline', 10, 60, 'alert'),
  ('disk',    85, 95, 'alert'),
  ('cpu',     90, NULL, 'warn'),
  ('event',   NULL, NULL, 'alert')
ON CONFLICT (kind, agent_id) DO NOTHING;
