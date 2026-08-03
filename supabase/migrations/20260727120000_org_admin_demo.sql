-- Роль «Админ организации» + флаги демо на организации
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'org_admin';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at timestamptz;

UPDATE public.organizations SET is_demo = true WHERE name = 'Демо-стенд';
