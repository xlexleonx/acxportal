-- Мультитенантность агентского потока.
--
-- Портал уже разделён по организациям на 63 таблицах через has_role() и
-- organization_id. Агентские таблицы (метрики/события/инвентарь/процессы/
-- регистрации/ключи) остались без RLS и без надёжной привязки к организации.
-- Эта миграция закрывает дыру, НЕ трогая таблицы данных: организация выводится
-- через связь agent_id -> agent_registrations.organization_id.
--
-- Идемпотентна: повторный запуск безопасен (IF NOT EXISTS / DROP POLICY IF EXISTS).

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. profiles.organization_id — связь юзера с организацией по uuid
--    (сейчас есть только текстовое profiles.organization с именем).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
  ON public.profiles(organization_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Создать в organizations недостающие организации из имён profiles.
--    (Напр. «ООО "ИнноТех Инжиниринг"» есть в profiles, но нет в
--    organizations — иначе бэкофилл оставит NULL.)
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.organizations (name)
SELECT DISTINCT p.organization
FROM public.profiles p
WHERE p.organization IS NOT NULL
  AND btrim(p.organization) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.name = p.organization
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Бэкофилл profiles.organization_id по совпадению имени.
-- ─────────────────────────────────────────────────────────────
UPDATE public.profiles p
SET organization_id = o.id
FROM public.organizations o
WHERE p.organization = o.name
  AND p.organization_id IS DISTINCT FROM o.id;

-- ─────────────────────────────────────────────────────────────
-- 4. Хелпер current_org() — организация текущего пользователя.
--    SECURITY DEFINER, чтобы читать profiles в обход RLS без рекурсии.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_org()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. agent_enrollment_keys.organization_id — ключ регистрации знает,
--    какому клиенту принадлежит. Корень изоляции: агент, регистрируясь
--    по ключу, наследует его организацию.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.agent_enrollment_keys
  ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- 6. Триггер: при вставке регистрации без организации — взять её из
--    ключа. Ключ сопоставляем по agent_enrollment_keys.key, если агент
--    прислал его в notes/token нельзя — поэтому берём из последнего
--    активного ключа той же организации ТОЛЬКО когда org пуст и это
--    возможно однозначно. Безопасный вариант: не угадываем, а оставляем
--    механику явной — org проставляет функция регистрации (Edge). Здесь
--    лишь страхуемся: если organization_id пуст, но задан equipment_id
--    или site_id с известной организацией, подтянуть оттуда.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_reg_fill_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.equipment_id IS NOT NULL THEN
    SELECT e.organization_id INTO NEW.organization_id
    FROM public.equipment e WHERE e.id = NEW.equipment_id;
  END IF;
  IF NEW.organization_id IS NULL AND NEW.site_id IS NOT NULL THEN
    SELECT s.organization_id INTO NEW.organization_id
    FROM public.sites s WHERE s.id = NEW.site_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_reg_fill_org ON public.agent_registrations;
CREATE TRIGGER trg_agent_reg_fill_org
  BEFORE INSERT OR UPDATE OF equipment_id, site_id, organization_id
  ON public.agent_registrations
  FOR EACH ROW EXECUTE FUNCTION public.agent_reg_fill_org();

-- ─────────────────────────────────────────────────────────────
-- 7. RLS на агентских таблицах.
--    Правило: admin/engineer — весь парк (как в существующих политиках
--    monitored_hosts); обычный пользователь — только своя организация.
--    Для таблиц данных организация выводится через agent_registrations.
--    Роль service_role (Edge Functions, агентский приём) обходит RLS
--    автоматически — приём данных не ломается.
-- ─────────────────────────────────────────────────────────────

-- helper-предикат «мой агент»: регистрация принадлежит моей организации
--   (или я admin/engineer). Используем в политиках таблиц данных.

-- 7.1 agent_registrations — организация прямо в строке
ALTER TABLE public.agent_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_reg_staff_all ON public.agent_registrations;
CREATE POLICY agent_reg_staff_all ON public.agent_registrations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role));

DROP POLICY IF EXISTS agent_reg_org_select ON public.agent_registrations;
CREATE POLICY agent_reg_org_select ON public.agent_registrations
  FOR SELECT
  USING (organization_id = current_org());

-- 7.2 agent_enrollment_keys — организация прямо в строке
ALTER TABLE public.agent_enrollment_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_keys_staff_all ON public.agent_enrollment_keys;
CREATE POLICY agent_keys_staff_all ON public.agent_enrollment_keys
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'engineer'::app_role));

DROP POLICY IF EXISTS agent_keys_org_select ON public.agent_enrollment_keys;
CREATE POLICY agent_keys_org_select ON public.agent_enrollment_keys
  FOR SELECT
  USING (organization_id = current_org());

-- 7.3 Таблицы данных: организация через связь agent_id -> agent_registrations
--     Функция-предикат, чтобы не дублировать подзапрос в каждой политике.
CREATE OR REPLACE FUNCTION public.agent_belongs_to_me(p_agent_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'engineer'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.agent_registrations r
      WHERE r.agent_id = p_agent_id
        AND r.organization_id = public.current_org()
    );
$$;

-- agent_metrics
ALTER TABLE public.agent_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_metrics_org ON public.agent_metrics;
CREATE POLICY agent_metrics_org ON public.agent_metrics
  FOR SELECT USING (public.agent_belongs_to_me(agent_id));

-- agent_events
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_events_org ON public.agent_events;
CREATE POLICY agent_events_org ON public.agent_events
  FOR SELECT USING (public.agent_belongs_to_me(agent_id));

-- agent_inventory
ALTER TABLE public.agent_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_inventory_org ON public.agent_inventory;
CREATE POLICY agent_inventory_org ON public.agent_inventory
  FOR SELECT USING (public.agent_belongs_to_me(agent_id));

-- agent_processes
ALTER TABLE public.agent_processes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_processes_org ON public.agent_processes;
CREATE POLICY agent_processes_org ON public.agent_processes
  FOR SELECT USING (public.agent_belongs_to_me(agent_id));

COMMIT;
