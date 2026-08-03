-- 20260727000000_enrollment_keys_tariff_demo.sql
-- Тариф на ключе, единая демо-организация, привязка старого ключа к Брестэнерго.

-- 1. тариф на ключе (demo / basic / extended)
ALTER TABLE public.agent_enrollment_keys
  ADD COLUMN IF NOT EXISTS tariff text;

-- 2. единая демо-организация (идемпотентно по имени)
INSERT INTO public.organizations (name, short_name, notes)
SELECT 'Демо-стенд', 'Демо', 'Единая песочница для демо-ключей и демо-доступов'
WHERE NOT EXISTS (SELECT 1 FROM public.organizations WHERE name = 'Демо-стенд');

-- 3. старый ключ «Партия Брестэнерго» без organization_id -> головной Брестэнерго
UPDATE public.agent_enrollment_keys
SET organization_id = 'cf0cefb9-7892-4d29-8f42-764c19512092'
WHERE organization_id IS NULL
  AND label = 'Партия Брестэнерго';
