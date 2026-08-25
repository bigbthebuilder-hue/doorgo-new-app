BEGIN;

CREATE TABLE public.dg_capacity_staff (
  staff_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_location text NOT NULL,
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  linked_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  updated_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  CHECK (company_location = pg_catalog.btrim(company_location) AND company_location <> ''),
  CHECK (display_name = pg_catalog.btrim(display_name) AND display_name <> '')
);
CREATE UNIQUE INDEX dg_capacity_staff_location_name_active_idx ON public.dg_capacity_staff(company_location,pg_catalog.lower(display_name)) WHERE active;

CREATE TABLE public.dg_staff_capacity_versions (
  capacity_version_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.dg_capacity_staff(staff_id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  capacity_role text NOT NULL CHECK (capacity_role IN ('direct_production','support')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE(staff_id,effective_from),
  UNIQUE(capacity_version_id,capacity_role)
);
CREATE INDEX dg_staff_capacity_versions_resolution_idx ON public.dg_staff_capacity_versions(staff_id,effective_from DESC);

CREATE TABLE public.dg_staff_capacity_weekdays (
  capacity_version_id uuid NOT NULL,
  capacity_role text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  scheduled_hours numeric(6,2) NOT NULL CHECK (scheduled_hours BETWEEN 0 AND 24),
  productive_hours numeric(6,2) NULL,
  away_impact_hours numeric(6,2) NULL,
  PRIMARY KEY(capacity_version_id,weekday),
  FOREIGN KEY(capacity_version_id,capacity_role) REFERENCES public.dg_staff_capacity_versions(capacity_version_id,capacity_role) ON DELETE CASCADE,
  CHECK (
    (capacity_role='direct_production' AND productive_hours BETWEEN 0 AND scheduled_hours AND away_impact_hours IS NULL)
    OR (capacity_role='support' AND productive_hours IS NULL AND away_impact_hours BETWEEN 0 AND 24)
  )
);

CREATE TABLE public.dg_company_workweek_versions (
  workweek_version_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_location text NOT NULL,
  effective_from date NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE(company_location,effective_from),
  CHECK(company_location=pg_catalog.btrim(company_location) AND company_location<>'')
);
CREATE TABLE public.dg_company_workweek_weekdays (
  workweek_version_id uuid NOT NULL REFERENCES public.dg_company_workweek_versions(workweek_version_id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  PRIMARY KEY(workweek_version_id,weekday)
);
CREATE INDEX dg_company_workweek_resolution_idx ON public.dg_company_workweek_versions(company_location,effective_from DESC);

ALTER TABLE public.dg_capacity_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_staff_capacity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_staff_capacity_weekdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_company_workweek_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_company_workweek_weekdays ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dg_capacity_staff,public.dg_staff_capacity_versions,public.dg_staff_capacity_weekdays,public.dg_company_workweek_versions,public.dg_company_workweek_weekdays FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.dg_settings_scope(p_require_use boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_location text;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='manager.authentication_required';END IF;
 SELECT COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''),'default') INTO v_location FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true;
 IF v_location IS NULL THEN RAISE EXCEPTION USING MESSAGE='manager.active_profile_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='settings' AND (p.access_level='use' OR (NOT p_require_use AND p.access_level='view'))) THEN RAISE EXCEPTION USING MESSAGE='manager.permission_required';END IF;
 RETURN v_location;
END $$;
ALTER FUNCTION public.dg_settings_scope(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.dg_settings_scope(boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dg_settings_scope(boolean) TO authenticated;

CREATE POLICY dg_capacity_staff_settings_read ON public.dg_capacity_staff FOR SELECT TO authenticated USING(company_location=public.dg_settings_scope(false));
CREATE POLICY dg_staff_capacity_versions_settings_read ON public.dg_staff_capacity_versions FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.dg_capacity_staff s WHERE s.staff_id=dg_staff_capacity_versions.staff_id AND s.company_location=public.dg_settings_scope(false)));
CREATE POLICY dg_staff_capacity_weekdays_settings_read ON public.dg_staff_capacity_weekdays FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.dg_staff_capacity_versions v JOIN public.dg_capacity_staff s ON s.staff_id=v.staff_id WHERE v.capacity_version_id=dg_staff_capacity_weekdays.capacity_version_id AND s.company_location=public.dg_settings_scope(false)));
CREATE POLICY dg_company_workweek_versions_settings_read ON public.dg_company_workweek_versions FOR SELECT TO authenticated USING(company_location=public.dg_settings_scope(false));
CREATE POLICY dg_company_workweek_weekdays_settings_read ON public.dg_company_workweek_weekdays FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.dg_company_workweek_versions v WHERE v.workweek_version_id=dg_company_workweek_weekdays.workweek_version_id AND v.company_location=public.dg_settings_scope(false)));
GRANT SELECT ON public.dg_capacity_staff,public.dg_staff_capacity_versions,public.dg_staff_capacity_weekdays,public.dg_company_workweek_versions,public.dg_company_workweek_weekdays TO authenticated;

CREATE OR REPLACE FUNCTION public.save_capacity_staff_configuration(p_command_id uuid,p_staff_id uuid,p_expected_staff_revision bigint,p_display_name text,p_active boolean,p_effective_from date,p_capacity_role text,p_weekdays jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_location text:=public.dg_settings_scope(true);v_staff_id uuid:=COALESCE(p_staff_id,extensions.gen_random_uuid());v_version_id uuid:=extensions.gen_random_uuid();v_day jsonb;v_seen smallint[]:=ARRAY[]::smallint[];
BEGIN
 IF p_command_id IS NULL OR NULLIF(pg_catalog.btrim(p_display_name),'') IS NULL OR p_effective_from IS NULL OR p_capacity_role NOT IN('direct_production','support') OR pg_catalog.jsonb_typeof(p_weekdays)<>'array' OR pg_catalog.jsonb_array_length(p_weekdays)<>7 THEN RAISE EXCEPTION USING MESSAGE='manager.invalid_staff_configuration';END IF;
 IF p_staff_id IS NULL THEN INSERT INTO public.dg_capacity_staff(staff_id,company_location,display_name,active,created_by_user_id,updated_by_user_id)VALUES(v_staff_id,v_location,pg_catalog.btrim(p_display_name),p_active,v_actor,v_actor);
 ELSE UPDATE public.dg_capacity_staff SET display_name=pg_catalog.btrim(p_display_name),active=p_active,revision=revision+1,updated_at=pg_catalog.clock_timestamp(),updated_by_user_id=v_actor WHERE staff_id=p_staff_id AND company_location=v_location AND revision=p_expected_staff_revision;IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='manager.stale_staff';END IF;END IF;
 IF EXISTS(SELECT 1 FROM public.dg_staff_capacity_versions v WHERE v.staff_id=v_staff_id AND v.effective_from=p_effective_from) THEN RAISE EXCEPTION USING MESSAGE='manager.effective_date_exists';END IF;
 INSERT INTO public.dg_staff_capacity_versions(capacity_version_id,staff_id,effective_from,capacity_role,created_by_user_id)VALUES(v_version_id,v_staff_id,p_effective_from,p_capacity_role,v_actor);
 FOR v_day IN SELECT value FROM pg_catalog.jsonb_array_elements(p_weekdays) LOOP
  IF (v_day->>'weekday')::smallint=ANY(v_seen) THEN RAISE EXCEPTION USING MESSAGE='manager.duplicate_weekday';END IF;v_seen:=pg_catalog.array_append(v_seen,(v_day->>'weekday')::smallint);
  INSERT INTO public.dg_staff_capacity_weekdays(capacity_version_id,capacity_role,weekday,scheduled_hours,productive_hours,away_impact_hours)VALUES(v_version_id,p_capacity_role,(v_day->>'weekday')::smallint,(v_day->>'scheduledHours')::numeric,CASE WHEN p_capacity_role='direct_production' THEN (v_day->>'capacityHours')::numeric ELSE NULL END,CASE WHEN p_capacity_role='support' THEN (v_day->>'capacityHours')::numeric ELSE NULL END);
 END LOOP;
 RETURN v_staff_id;
END $$;

CREATE OR REPLACE FUNCTION public.save_company_workweek(p_command_id uuid,p_effective_from date,p_weekdays smallint[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_location text:=public.dg_settings_scope(true);v_id uuid:=extensions.gen_random_uuid();v_day smallint;
BEGIN
 IF p_command_id IS NULL OR p_effective_from IS NULL OR pg_catalog.cardinality(p_weekdays) NOT BETWEEN 1 AND 7 OR (SELECT pg_catalog.count(DISTINCT x) FROM pg_catalog.unnest(p_weekdays)x)<>pg_catalog.cardinality(p_weekdays) OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_weekdays)x WHERE x NOT BETWEEN 0 AND 6) THEN RAISE EXCEPTION USING MESSAGE='manager.invalid_workweek';END IF;
 IF EXISTS(SELECT 1 FROM public.dg_company_workweek_versions v WHERE v.company_location=v_location AND v.effective_from=p_effective_from) THEN RAISE EXCEPTION USING MESSAGE='manager.effective_date_exists';END IF;
 INSERT INTO public.dg_company_workweek_versions(workweek_version_id,company_location,effective_from,created_by_user_id)VALUES(v_id,v_location,p_effective_from,v_actor);
 FOREACH v_day IN ARRAY p_weekdays LOOP INSERT INTO public.dg_company_workweek_weekdays VALUES(v_id,v_day);END LOOP;RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_manager_capacity_configuration(p_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_location text:=public.dg_settings_scope(false);v_workweek uuid;v_result jsonb;
BEGIN
 SELECT v.workweek_version_id INTO v_workweek FROM public.dg_company_workweek_versions v WHERE v.company_location=v_location AND v.effective_from<=p_date ORDER BY v.effective_from DESC LIMIT 1;
 SELECT pg_catalog.jsonb_build_object('companyLocation',v_location,'date',p_date,'workingWeekdays',COALESCE((SELECT pg_catalog.jsonb_agg(w.weekday ORDER BY w.weekday) FROM public.dg_company_workweek_weekdays w WHERE w.workweek_version_id=v_workweek),'[1,2,3,4,5]'::jsonb),'staff',COALESCE(pg_catalog.jsonb_agg(row_value ORDER BY row_value->>'displayName'),'[]'::jsonb)) INTO v_result FROM(SELECT pg_catalog.jsonb_build_object('staffId',s.staff_id,'displayName',s.display_name,'active',s.active,'capacityRole',v.capacity_role,'effectiveFrom',v.effective_from,'weekday',w.weekday,'scheduledHours',w.scheduled_hours,'capacityHours',COALESCE(w.productive_hours,w.away_impact_hours))row_value FROM public.dg_capacity_staff s JOIN LATERAL(SELECT x.* FROM public.dg_staff_capacity_versions x WHERE x.staff_id=s.staff_id AND x.effective_from<=p_date ORDER BY x.effective_from DESC LIMIT 1)v ON true JOIN public.dg_staff_capacity_weekdays w ON w.capacity_version_id=v.capacity_version_id AND w.weekday=(EXTRACT(DOW FROM p_date))::smallint WHERE s.company_location=v_location)x;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.load_manager_capacity_configuration() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_location text:=public.dg_settings_scope(false);
BEGIN RETURN pg_catalog.jsonb_build_object('companyLocation',v_location,'staff',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('staffId',s.staff_id,'displayName',s.display_name,'active',s.active,'revision',s.revision,'versions',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('effectiveFrom',v.effective_from,'capacityRole',v.capacity_role,'weekdays',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('weekday',w.weekday,'scheduledHours',w.scheduled_hours,'capacityHours',COALESCE(w.productive_hours,w.away_impact_hours)) ORDER BY w.weekday)FROM public.dg_staff_capacity_weekdays w WHERE w.capacity_version_id=v.capacity_version_id))ORDER BY v.effective_from DESC),'[]'::jsonb)FROM public.dg_staff_capacity_versions v WHERE v.staff_id=s.staff_id))ORDER BY s.display_name)FROM public.dg_capacity_staff s WHERE s.company_location=v_location),'[]'::jsonb),'workweeks',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('effectiveFrom',v.effective_from,'weekdays',(SELECT pg_catalog.jsonb_agg(w.weekday ORDER BY w.weekday)FROM public.dg_company_workweek_weekdays w WHERE w.workweek_version_id=v.workweek_version_id))ORDER BY v.effective_from DESC)FROM public.dg_company_workweek_versions v WHERE v.company_location=v_location),'[]'::jsonb));END $$;

DO $$DECLARE f regprocedure;BEGIN FOREACH f IN ARRAY ARRAY['public.save_capacity_staff_configuration(uuid,uuid,bigint,text,boolean,date,text,jsonb)'::regprocedure,'public.save_company_workweek(uuid,date,smallint[])'::regprocedure,'public.resolve_manager_capacity_configuration(date)'::regprocedure,'public.load_manager_capacity_configuration()'::regprocedure] LOOP EXECUTE 'ALTER FUNCTION '||f||' OWNER TO postgres';EXECUTE 'REVOKE ALL ON FUNCTION '||f||' FROM PUBLIC,anon';EXECUTE 'GRANT EXECUTE ON FUNCTION '||f||' TO authenticated';END LOOP;END $$;

COMMIT;
