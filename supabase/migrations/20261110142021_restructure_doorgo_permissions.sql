BEGIN;

-- Preserve assigned grants separately. Existing DoorGo RPCs and RLS continue to
-- read the same table and object identity, which now hold effective grants.
LOCK TABLE public.dg_user_profiles, public.dg_user_permissions IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.dg_permission_assignments (
  user_id uuid PRIMARY KEY REFERENCES public.dg_user_profiles(user_id) ON DELETE CASCADE,
  grants jsonb NOT NULL
);
ALTER TABLE public.dg_permission_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dg_permission_assignments FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.dg_permission_assignments (user_id, grants)
SELECT profile.user_id, COALESCE(
  (SELECT jsonb_object_agg(permission_key, access_level)
   FROM public.dg_user_permissions p WHERE p.user_id = profile.user_id), '{}'::jsonb)
FROM public.dg_user_profiles profile;

-- Require explicit confirmation of the existing administrator; do not promote
-- anyone else based on their legacy role or grants.
DO $$
DECLARE administrator uuid := NULLIF(current_setting('doorgo.permission_cutover_administrator',true),'')::uuid;
BEGIN
  IF administrator IS NULL OR NOT EXISTS (
    SELECT 1
  FROM public.dg_user_profiles profile JOIN public.dg_permission_assignments a USING (user_id)
  WHERE profile.active AND profile.is_manager AND NOT profile.must_change_password
    AND a.grants->>'settings' = 'use' AND a.grants->>'users' = 'use'
    AND profile.user_id = administrator
  ) THEN RAISE EXCEPTION 'users.cutover_administrator_required'; END IF;
  UPDATE public.dg_permission_assignments SET grants = grants || '{"administration":"use"}'
  WHERE user_id = administrator;
END $$;

CREATE FUNCTION public.dg_effective_module_grants(p_grants jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH levels AS (
    SELECT COALESCE(p_grants->>'administration' = 'use', false) AS admin,
           COALESCE(p_grants->>'calendar', 'none') AS calendar,
           COALESCE(p_grants->>'jobs', 'none') AS jobs
  ), effective AS (
    SELECT admin, calendar,
           CASE WHEN calendar = 'none' THEN 'none'
                WHEN jobs = 'use' AND calendar <> 'use' THEN 'view'
                ELSE jobs END AS jobs,
           jobs = 'use' AND calendar = 'use'
             AND p_grants->>'production' = 'use'
             AND p_grants->>'production_checkpoints' = 'use' AS production
    FROM levels
  )
  SELECT jsonb_build_object(
    'administration', CASE WHEN admin THEN 'use' ELSE 'none' END,
    'settings', CASE WHEN admin THEN 'use' ELSE 'none' END,
    'users', CASE WHEN admin THEN 'use' ELSE 'none' END,
    'calendar', CASE WHEN admin THEN 'use' ELSE calendar END,
    'jobs', CASE WHEN admin THEN 'use' ELSE jobs END,
    'production', CASE WHEN admin OR production THEN 'use' ELSE 'none' END,
    'production_checkpoints', CASE WHEN admin OR production THEN 'use' ELSE 'none' END,
    'documents', CASE WHEN admin THEN 'use' ELSE COALESCE(p_grants->>'documents', 'none') END,
    'tools', 'use', 'reports', 'none')
  FROM effective;
$$;

CREATE FUNCTION public.dg_refresh_effective_module_grants(p_user_id uuid, p_grants jsonb)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO public.dg_user_permissions(user_id, permission_key, access_level)
  SELECT p_user_id, key, value FROM jsonb_each_text(public.dg_effective_module_grants(p_grants))
  ON CONFLICT (user_id, permission_key) DO UPDATE
  SET access_level = EXCLUDED.access_level, updated_at = now();
$$;

SELECT public.dg_refresh_effective_module_grants(user_id, grants)
FROM public.dg_permission_assignments;

CREATE OR REPLACE FUNCTION public.dg_users_validate_permissions(p_permissions jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_permissions IS NULL OR jsonb_typeof(p_permissions) <> 'object' THEN
    RAISE EXCEPTION 'users.invalid_permissions';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_permissions)) <> 6 OR EXISTS (
    SELECT 1 FROM jsonb_each(p_permissions) e
    WHERE e.key NOT IN ('jobs','calendar','production','production_checkpoints','documents','administration')
      OR jsonb_typeof(e.value) <> 'string'
      OR e.value #>> '{}' NOT IN ('none','view','use')
  ) THEN RAISE EXCEPTION 'users.invalid_permissions'; END IF;
  IF (p_permissions->>'jobs' = 'use' AND p_permissions->>'calendar' <> 'use')
    OR (p_permissions->>'jobs' = 'view' AND p_permissions->>'calendar' = 'none')
    OR p_permissions->>'production' <> p_permissions->>'production_checkpoints'
    OR p_permissions->>'production' = 'view'
    OR p_permissions->>'administration' = 'view'
    OR (p_permissions->>'production' = 'use'
        AND (p_permissions->>'jobs' <> 'use' OR p_permissions->>'calendar' <> 'use'))
  THEN RAISE EXCEPTION 'users.incompatible_permissions'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dg_users_record(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'userId',p.user_id,'displayName',p.display_name,'companyLocation',p.company_location,
    'active',p.active,'mustChangePassword',p.must_change_password,'passwordChangedAt',p.password_changed_at,
    'permissions',COALESCE(a.grants,'{}'::jsonb))
  FROM public.dg_user_profiles p LEFT JOIN public.dg_permission_assignments a USING (user_id)
  WHERE p.user_id=p_user_id;
$$;

-- A single updated row also fences concurrent membership changes at snapshot isolation.
CREATE TABLE public.dg_administration_guard (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL DEFAULT 0
);
INSERT INTO public.dg_administration_guard DEFAULT VALUES;
ALTER TABLE public.dg_administration_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dg_administration_guard FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.dg_guard_last_administrator(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Serialize the guard across permission and profile changes.
  UPDATE public.dg_administration_guard SET revision = revision + 1 WHERE singleton;
  IF EXISTS (
    SELECT 1 FROM public.dg_user_profiles p JOIN public.dg_permission_assignments a USING (user_id)
    WHERE p.user_id = p_user_id AND p.active AND a.grants->>'administration' = 'use'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.dg_user_profiles p JOIN public.dg_permission_assignments a USING (user_id)
    WHERE p.user_id <> p_user_id AND p.active AND NOT p.must_change_password
      AND a.grants->>'administration' = 'use'
  ) THEN RAISE EXCEPTION 'users.last_administrator'; END IF;
END $$;

CREATE FUNCTION public.dg_guard_administrator_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.dg_guard_last_administrator(OLD.user_id);
    RETURN OLD;
  END IF;
  IF OLD.active AND NOT NEW.active THEN
    PERFORM public.dg_guard_last_administrator(OLD.user_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER dg_guard_administrator_profile
BEFORE UPDATE OF active OR DELETE ON public.dg_user_profiles
FOR EACH ROW EXECUTE FUNCTION public.dg_guard_administrator_profile();

CREATE OR REPLACE FUNCTION public.dg_admin_update_permissions(p_user_id uuid,p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.dg_users_require_access(true);
  PERFORM public.dg_users_validate_permissions(p_permissions);
  IF p_permissions->>'administration' <> 'use' THEN
    PERFORM public.dg_guard_last_administrator(p_user_id);
  ELSE
    UPDATE public.dg_administration_guard SET revision = revision + 1 WHERE singleton;
  END IF;
  PERFORM public.dg_users_require_access(true);
  PERFORM 1 FROM public.dg_user_profiles p WHERE p.user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'users.not_found'; END IF;
  INSERT INTO public.dg_permission_assignments(user_id,grants) VALUES (p_user_id,p_permissions)
  ON CONFLICT (user_id) DO UPDATE SET grants = dg_permission_assignments.grants || EXCLUDED.grants;
  PERFORM public.dg_refresh_effective_module_grants(p_user_id,p_permissions);
  RETURN public.dg_users_record(p_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.dg_admin_provision_user(p_user_id uuid,p_display_name text,p_company_location text,p_active boolean,p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.dg_users_require_access(true);
  PERFORM public.dg_users_validate_permissions(p_permissions);
  IF p_display_name IS NULL OR length(btrim(p_display_name)) NOT BETWEEN 1 AND 200
    OR length(p_company_location)>200 OR p_active IS NULL THEN RAISE EXCEPTION 'users.invalid_profile'; END IF;
  UPDATE public.dg_administration_guard SET revision = revision + 1 WHERE singleton;
  PERFORM public.dg_users_require_access(true);
  INSERT INTO public.dg_user_profiles(user_id,display_name,company_location,active,is_manager,must_change_password)
  VALUES(p_user_id,btrim(p_display_name),NULLIF(btrim(p_company_location),''),p_active,false,true);
  INSERT INTO public.dg_permission_assignments(user_id,grants) VALUES (p_user_id,p_permissions);
  PERFORM public.dg_refresh_effective_module_grants(p_user_id,p_permissions);
  RETURN public.dg_users_record(p_user_id);
END $$;

REVOKE ALL ON FUNCTION public.dg_effective_module_grants(jsonb),
  public.dg_refresh_effective_module_grants(uuid,jsonb), public.dg_guard_last_administrator(uuid),
  public.dg_guard_administrator_profile() FROM PUBLIC, anon, authenticated, service_role;


-- A scheduler keeps their existing roster/location. Administrators can select
-- staff across locations, but an existing period stays in its original location.
CREATE FUNCTION public.dg_staff_away_write_location(p_staff_id uuid, p_period_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE v_location text := public.dg_staff_away_scope(true);
BEGIN
  IF EXISTS (SELECT 1 FROM public.dg_user_permissions
             WHERE user_id = auth.uid() AND permission_key = 'administration' AND access_level = 'use') THEN
    IF p_period_id IS NOT NULL THEN
      SELECT company_location INTO v_location FROM public.dg_staff_away_periods
      WHERE period_id = p_period_id AND deleted_at IS NULL;
    ELSE
      SELECT company_location INTO v_location FROM public.dg_capacity_staff WHERE staff_id = p_staff_id;
    END IF;
  END IF;
  RETURN v_location;
END $$;
REVOKE ALL ON FUNCTION public.dg_staff_away_write_location(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_staff_away_period(
  p_command_id uuid,p_period_id uuid,p_expected_revision bigint,p_staff_id uuid,p_start_date date,p_end_date date,
  p_mode text,p_partial_drag_hours numeric,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_location text:=public.dg_staff_away_write_location(p_staff_id,p_period_id);v_period public.dg_staff_away_periods%ROWTYPE;v_before jsonb;v_id uuid:=COALESCE(p_period_id,extensions.gen_random_uuid());v_max_impact numeric;
BEGIN
  IF p_command_id IS NULL OR p_staff_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR p_end_date-p_start_date>366 OR p_mode NOT IN('full_day','partial') THEN RAISE EXCEPTION USING MESSAGE='staff_away.invalid_request';END IF;
  IF EXISTS(SELECT 1 FROM public.dg_staff_away_events e WHERE e.command_id=p_command_id) THEN RETURN pg_catalog.jsonb_build_object('periodId',(SELECT e.period_id FROM public.dg_staff_away_events e WHERE e.command_id=p_command_id));END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dg_capacity_staff s WHERE s.staff_id=p_staff_id AND s.company_location=v_location AND (s.active OR s.staff_id=(SELECT a.staff_id FROM public.dg_staff_away_periods a WHERE a.period_id=p_period_id))) THEN RAISE EXCEPTION USING MESSAGE='staff_away.staff_unavailable';END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('staff-away:'||p_staff_id::text,0));
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.generate_series(p_start_date,p_end_date,'1 day'::interval) d WHERE public.dg_staff_away_is_working_day(v_location,d::date)) THEN RAISE EXCEPTION USING MESSAGE='staff_away.no_working_dates';END IF;
  IF EXISTS(SELECT 1 FROM public.dg_staff_away_periods a WHERE a.staff_id=p_staff_id AND a.company_location=v_location AND a.deleted_at IS NULL AND a.period_id IS DISTINCT FROM p_period_id AND a.start_date<=p_end_date AND a.end_date>=p_start_date) THEN RAISE EXCEPTION USING MESSAGE='staff_away.overlapping_period';END IF;
  IF p_mode='partial' THEN
    IF p_start_date<>p_end_date OR NOT public.dg_staff_away_is_working_day(v_location,p_start_date) THEN RAISE EXCEPTION USING MESSAGE='staff_away.partial_single_working_date';END IF;
    v_max_impact:=public.dg_staff_away_full_day_impact(p_staff_id,p_start_date);
    IF p_partial_drag_hours IS NULL OR p_partial_drag_hours<0 OR p_partial_drag_hours>v_max_impact THEN RAISE EXCEPTION USING MESSAGE='staff_away.partial_drag_excessive';END IF;
  ELSIF p_partial_drag_hours IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='staff_away.invalid_request';END IF;
  IF p_period_id IS NULL THEN
    INSERT INTO public.dg_staff_away_periods(period_id,company_location,staff_id,start_date,end_date,away_mode,partial_drag_hours,reason,created_by_user_id,updated_by_user_id)
    VALUES(v_id,v_location,p_staff_id,p_start_date,p_end_date,p_mode,p_partial_drag_hours,NULLIF(pg_catalog.btrim(p_reason),''),v_actor,v_actor) RETURNING * INTO v_period;
    INSERT INTO public.dg_staff_away_events(command_id,period_id,action_type,new_values,actor_user_id)VALUES(p_command_id,v_id,'create',pg_catalog.to_jsonb(v_period),v_actor);
    PERFORM public.dg_recalculate_staff_away_capacity(v_location,p_start_date,p_end_date);
  ELSE
    SELECT * INTO v_period FROM public.dg_staff_away_periods a WHERE a.period_id=p_period_id AND a.company_location=v_location AND a.deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='staff_away.not_found';END IF;
    IF v_period.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='staff_away.stale_period';END IF;
    v_before:=pg_catalog.to_jsonb(v_period);
    UPDATE public.dg_staff_away_periods SET staff_id=p_staff_id,start_date=p_start_date,end_date=p_end_date,away_mode=p_mode,
      partial_drag_hours=p_partial_drag_hours,reason=NULLIF(pg_catalog.btrim(p_reason),''),revision=revision+1,updated_at=pg_catalog.clock_timestamp(),updated_by_user_id=v_actor
    WHERE period_id=p_period_id RETURNING * INTO v_period;
    INSERT INTO public.dg_staff_away_events(command_id,period_id,action_type,previous_values,new_values,actor_user_id)VALUES(p_command_id,p_period_id,'edit',v_before,pg_catalog.to_jsonb(v_period),v_actor);
    PERFORM public.dg_recalculate_staff_away_capacity(v_location,LEAST((v_before->>'start_date')::date,p_start_date),GREATEST((v_before->>'end_date')::date,p_end_date));
  END IF;
  RETURN pg_catalog.jsonb_build_object('periodId',v_period.period_id,'revision',v_period.revision,'startDate',v_period.start_date,'endDate',v_period.end_date);
END $$;

CREATE OR REPLACE FUNCTION public.delete_staff_away_period(p_command_id uuid,p_period_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_location text:=public.dg_staff_away_write_location(NULL,p_period_id);v_period public.dg_staff_away_periods%ROWTYPE;v_before jsonb;v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF p_command_id IS NULL OR p_period_id IS NULL THEN RAISE EXCEPTION USING MESSAGE='staff_away.invalid_request';END IF;
  IF EXISTS(SELECT 1 FROM public.dg_staff_away_events e WHERE e.command_id=p_command_id) THEN RETURN pg_catalog.jsonb_build_object('periodId',p_period_id);END IF;
  SELECT * INTO v_period FROM public.dg_staff_away_periods a WHERE a.period_id=p_period_id AND a.company_location=v_location AND a.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='staff_away.not_found';END IF;
  IF v_period.revision<>p_expected_revision THEN RAISE EXCEPTION USING MESSAGE='staff_away.stale_period';END IF;
  v_before:=pg_catalog.to_jsonb(v_period);
  UPDATE public.dg_staff_away_periods SET deleted_at=v_now,deleted_by_user_id=v_actor,revision=revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE period_id=p_period_id RETURNING * INTO v_period;
  INSERT INTO public.dg_staff_away_events(command_id,period_id,action_type,previous_values,new_values,actor_user_id)VALUES(p_command_id,p_period_id,'delete',v_before,pg_catalog.to_jsonb(v_period),v_actor);
  PERFORM public.dg_recalculate_staff_away_capacity(v_location,v_period.start_date,v_period.end_date);
  RETURN pg_catalog.jsonb_build_object('periodId',p_period_id,'startDate',v_period.start_date,'endDate',v_period.end_date);
END $$;

CREATE OR REPLACE FUNCTION public.calendar_staff_away_capacity_drag_max(p_staff_id uuid, p_date date)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_location text:=public.dg_staff_away_write_location(p_staff_id,NULL);
BEGIN
  IF p_staff_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION USING MESSAGE='staff_away.invalid_request';
  END IF;
  -- Existing periods may reference inactive staff; still enforce company scope.
  IF NOT EXISTS(SELECT 1 FROM public.dg_capacity_staff s WHERE s.staff_id=p_staff_id AND s.company_location=v_location) THEN
    RAISE EXCEPTION USING MESSAGE='staff_away.staff_unavailable';
  END IF;
  IF NOT public.dg_staff_away_is_working_day(v_location,p_date) THEN
    RAISE EXCEPTION USING MESSAGE='staff_away.partial_single_working_date';
  END IF;
  RETURN public.dg_staff_away_full_day_impact(p_staff_id,p_date);
END;$$;

CREATE OR REPLACE FUNCTION public.load_calendar_staff_away_range(p_start date,p_end_exclusive date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_actor uuid:=auth.uid();v_location text;v_admin boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='staff_away.authentication_required';END IF;
  PERFORM public.dg_require_business_access();
  SELECT COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''),'default') INTO v_location
  FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true;
  IF v_location IS NULL THEN RAISE EXCEPTION USING MESSAGE='staff_away.active_profile_required';END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dg_user_permissions p
    WHERE p.user_id=v_actor AND p.permission_key='calendar' AND p.access_level IN ('view','use')
  ) THEN RAISE EXCEPTION USING MESSAGE='staff_away.permission_required';END IF;
  SELECT EXISTS(SELECT 1 FROM public.dg_user_permissions
    WHERE user_id=v_actor AND permission_key='administration' AND access_level='use') INTO v_admin;
  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive<=p_start OR p_end_exclusive-p_start>370 THEN RAISE EXCEPTION USING MESSAGE='staff_away.invalid_range';END IF;
  RETURN pg_catalog.jsonb_build_object(
    'activeStaff',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('staffId',s.staff_id,'displayName',s.display_name,'companyLocation',s.company_location) ORDER BY s.display_name)
      FROM public.dg_capacity_staff s WHERE (v_admin OR s.company_location=v_location) AND s.active
    ),'[]'::jsonb),
    'periods',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'periodId',a.period_id,'staffId',a.staff_id,'staffName',s.display_name,
        'companyLocation',a.company_location,'inEditScope',(v_admin OR a.company_location=v_location),'startDate',a.start_date,'endDate',a.end_date,
        'mode',a.away_mode,'partialDragHours',a.partial_drag_hours,'reason',a.reason,'revision',a.revision,
        'createdAt',a.created_at,'updatedAt',a.updated_at,
        'occurrences',(
          SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'date',d.day,'deductionHours',CASE WHEN a.away_mode='partial' THEN a.partial_drag_hours ELSE public.dg_staff_away_full_day_impact(a.staff_id,d.day) END
          ) ORDER BY d.day),'[]'::jsonb)
          FROM (SELECT value::date AS day FROM pg_catalog.generate_series(GREATEST(a.start_date,p_start),LEAST(a.end_date,p_end_exclusive-1),'1 day'::interval) value) d
          WHERE public.dg_staff_away_is_working_day(a.company_location,d.day)
        )
      ) ORDER BY a.start_date,s.display_name,a.period_id)
      FROM public.dg_staff_away_periods a JOIN public.dg_capacity_staff s ON s.staff_id=a.staff_id
      WHERE a.deleted_at IS NULL AND a.start_date<p_end_exclusive AND a.end_date>=p_start
    ),'[]'::jsonb)
  );
END $$;


-- Keep permanent-delete authorization aligned with the consolidated control.
-- Retain the effective business-access wrapper and the rest of the function.
DO $$
DECLARE definition text := pg_get_functiondef('public.dg_delete_native_job(uuid,bigint)'::regprocedure);
        legacy text := 'profile.is_manager = true';
BEGIN
  IF (length(definition) - length(replace(definition, legacy, ''))) <> length(legacy) THEN
    RAISE EXCEPTION 'users.unexpected_delete_authorization';
  END IF;
  EXECUTE replace(definition, legacy, 'EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id = v_actor AND p.permission_key = ''administration'' AND p.access_level = ''use'')');
END $$;

COMMIT;
