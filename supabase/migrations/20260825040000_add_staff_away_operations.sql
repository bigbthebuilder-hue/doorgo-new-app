BEGIN;

CREATE TABLE public.dg_staff_away_periods (
  period_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  company_location text NOT NULL,
  staff_id uuid NOT NULL REFERENCES public.dg_capacity_staff(staff_id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  away_mode text NOT NULL CHECK (away_mode IN ('full_day','partial')),
  partial_drag_hours numeric(6,2) NULL CHECK (partial_drag_hours BETWEEN 0 AND 24),
  reason text NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  updated_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  deleted_at timestamptz NULL,
  deleted_by_user_id uuid NULL REFERENCES auth.users(id),
  CHECK (company_location=pg_catalog.btrim(company_location) AND company_location<>''),
  CHECK (end_date>=start_date AND end_date-start_date<=366),
  CHECK (
    (away_mode='full_day' AND partial_drag_hours IS NULL)
    OR (away_mode='partial' AND start_date=end_date AND partial_drag_hours IS NOT NULL)
  )
);
CREATE INDEX dg_staff_away_periods_range_idx ON public.dg_staff_away_periods(company_location,start_date,end_date) WHERE deleted_at IS NULL;
CREATE INDEX dg_staff_away_periods_staff_idx ON public.dg_staff_away_periods(staff_id,start_date DESC);

CREATE TABLE public.dg_staff_away_events (
  event_id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  command_id uuid NOT NULL UNIQUE,
  period_id uuid NOT NULL REFERENCES public.dg_staff_away_periods(period_id) ON DELETE RESTRICT,
  action_type text NOT NULL CHECK (action_type IN ('create','edit','delete')),
  previous_values jsonb NULL,
  new_values jsonb NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE INDEX dg_staff_away_events_period_idx ON public.dg_staff_away_events(period_id,occurred_at DESC);

ALTER TABLE public.dg_staff_away_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dg_staff_away_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dg_staff_away_periods,public.dg_staff_away_events FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.dg_staff_away_scope(p_require_use boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_location text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='staff_away.authentication_required';END IF;
  SELECT COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''),'default') INTO v_location
  FROM public.dg_user_profiles p WHERE p.user_id=v_actor AND p.active=true;
  IF v_location IS NULL THEN RAISE EXCEPTION USING MESSAGE='staff_away.active_profile_required';END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.dg_user_permissions p
    WHERE p.user_id=v_actor AND p.permission_key='production'
      AND (p.access_level='use' OR (NOT p_require_use AND p.access_level='view'))
  ) THEN RAISE EXCEPTION USING MESSAGE='staff_away.permission_required';END IF;
  RETURN v_location;
END $$;

CREATE OR REPLACE FUNCTION public.dg_staff_away_is_working_day(p_location text,p_date date)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.dg_company_workweek_weekdays w
    WHERE w.workweek_version_id=(
      SELECT v.workweek_version_id FROM public.dg_company_workweek_versions v
      WHERE v.company_location=p_location AND v.effective_from<=p_date
      ORDER BY v.effective_from DESC LIMIT 1
    ) AND w.weekday=(EXTRACT(DOW FROM p_date))::smallint
  )
$$;

CREATE OR REPLACE FUNCTION public.dg_staff_away_full_day_impact(p_staff_id uuid,p_date date)
RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path='' STABLE AS $$
  SELECT COALESCE((
    SELECT COALESCE(w.productive_hours,w.away_impact_hours)
    FROM public.dg_staff_capacity_versions v
    JOIN public.dg_staff_capacity_weekdays w ON w.capacity_version_id=v.capacity_version_id
    WHERE v.capacity_version_id=(
      SELECT latest.capacity_version_id FROM public.dg_staff_capacity_versions latest
      WHERE latest.staff_id=p_staff_id AND latest.effective_from<=p_date
      ORDER BY latest.effective_from DESC LIMIT 1
    ) AND w.weekday=(EXTRACT(DOW FROM p_date))::smallint
  ),0)
$$;

CREATE OR REPLACE FUNCTION public.dg_staff_away_deduction(p_location text,p_date date)
RETURNS numeric LANGUAGE sql SECURITY DEFINER SET search_path='' STABLE AS $$
  SELECT CASE WHEN public.dg_staff_away_is_working_day(p_location,p_date) THEN COALESCE((
    SELECT pg_catalog.sum(CASE WHEN a.away_mode='partial' THEN a.partial_drag_hours ELSE public.dg_staff_away_full_day_impact(a.staff_id,p_date) END)
    FROM public.dg_staff_away_periods a
    JOIN public.dg_capacity_staff s ON s.staff_id=a.staff_id AND s.company_location=a.company_location
    WHERE a.company_location=p_location AND a.deleted_at IS NULL AND s.active
      AND p_date BETWEEN a.start_date AND a.end_date
  ),0) ELSE 0 END
$$;

CREATE OR REPLACE FUNCTION public.dg_apply_staff_away_to_capacity_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_location text;v_deduction numeric:=0;v_baseline_available numeric:=NEW.available_hours;v_baseline_deduction numeric:=COALESCE(NEW.deduction_hours,0);
BEGIN
  IF pg_catalog.current_setting('doorgo.staff_away_recalc',true)='1' THEN RETURN NEW;END IF;
  SELECT COALESCE(NULLIF(pg_catalog.btrim(p.company_location),''),'default') INTO v_location
  FROM public.dg_user_profiles p WHERE p.active ORDER BY p.created_at LIMIT 1;
  IF v_location IS NULL THEN RETURN NEW;END IF;
  v_deduction:=public.dg_staff_away_deduction(v_location,NEW.production_date);
  NEW.available_hours:=CASE WHEN NEW.is_closed THEN 0 WHEN v_baseline_available IS NULL THEN NULL ELSE GREATEST(0::numeric,v_baseline_available-v_deduction) END;
  NEW.deduction_hours:=v_baseline_deduction+v_deduction;
  NEW.details:=COALESCE(NEW.details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'native_staff_away_applied',true,
    'native_staff_away_baseline_available_hours',v_baseline_available,
    'native_staff_away_baseline_deduction_hours',v_baseline_deduction,
    'native_staff_away_deduction_hours',v_deduction
  );
  RETURN NEW;
END $$;
CREATE TRIGGER dg_daily_capacity_apply_staff_away
BEFORE INSERT OR UPDATE ON public.dg_daily_capacity
FOR EACH ROW EXECUTE FUNCTION public.dg_apply_staff_away_to_capacity_row();

CREATE OR REPLACE FUNCTION public.dg_recalculate_staff_away_capacity(p_location text,p_start date,p_end date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_date date;v_deduction numeric;v_row public.dg_daily_capacity%ROWTYPE;v_baseline_available numeric;v_baseline_deduction numeric;
BEGIN
  IF p_location IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end<p_start OR p_end-p_start>366 THEN RAISE EXCEPTION USING MESSAGE='staff_away.invalid_range';END IF;
  PERFORM pg_catalog.set_config('doorgo.staff_away_recalc','1',true);
  FOR v_date IN SELECT d::date FROM pg_catalog.generate_series(p_start,p_end,'1 day'::interval) d LOOP
    SELECT * INTO v_row FROM public.dg_daily_capacity c WHERE c.production_date=v_date FOR UPDATE;
    IF NOT FOUND THEN CONTINUE;END IF;
    v_deduction:=public.dg_staff_away_deduction(p_location,v_date);
    v_baseline_available:=CASE WHEN COALESCE((v_row.details->>'native_staff_away_applied')::boolean,false)
      THEN (v_row.details->>'native_staff_away_baseline_available_hours')::numeric ELSE v_row.available_hours END;
    v_baseline_deduction:=CASE WHEN COALESCE((v_row.details->>'native_staff_away_applied')::boolean,false)
      THEN COALESCE((v_row.details->>'native_staff_away_baseline_deduction_hours')::numeric,0) ELSE COALESCE(v_row.deduction_hours,0) END;
    UPDATE public.dg_daily_capacity SET
      available_hours=CASE WHEN v_row.is_closed THEN 0 WHEN v_baseline_available IS NULL THEN NULL ELSE GREATEST(0::numeric,v_baseline_available-v_deduction) END,
      deduction_hours=v_baseline_deduction+v_deduction,
      details=COALESCE(v_row.details,'{}'::jsonb)||pg_catalog.jsonb_build_object(
        'native_staff_away_applied',true,
        'native_staff_away_baseline_available_hours',v_baseline_available,
        'native_staff_away_baseline_deduction_hours',v_baseline_deduction,
        'native_staff_away_deduction_hours',v_deduction
      ),
      updated_at=pg_catalog.clock_timestamp()
    WHERE production_date=v_date;
  END LOOP;
END $$;

CREATE POLICY dg_staff_away_periods_view ON public.dg_staff_away_periods FOR SELECT TO authenticated
USING(company_location=public.dg_staff_away_scope(false));
CREATE POLICY dg_staff_away_events_view ON public.dg_staff_away_events FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.dg_staff_away_periods p WHERE p.period_id=dg_staff_away_events.period_id AND p.company_location=public.dg_staff_away_scope(false)));
GRANT SELECT ON public.dg_staff_away_periods,public.dg_staff_away_events TO authenticated;

CREATE OR REPLACE FUNCTION public.load_staff_away_calendar_range(p_start date,p_end_exclusive date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_location text:=public.dg_staff_away_scope(false);
BEGIN
  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive<=p_start OR p_end_exclusive-p_start>370 THEN RAISE EXCEPTION USING MESSAGE='staff_away.invalid_range';END IF;
  RETURN pg_catalog.jsonb_build_object(
    'activeStaff',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('staffId',s.staff_id,'displayName',s.display_name) ORDER BY s.display_name)
      FROM public.dg_capacity_staff s WHERE s.company_location=v_location AND s.active
    ),'[]'::jsonb),
    'periods',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'periodId',a.period_id,'staffId',a.staff_id,'staffName',s.display_name,'startDate',a.start_date,'endDate',a.end_date,
        'mode',a.away_mode,'partialDragHours',a.partial_drag_hours,'reason',a.reason,'revision',a.revision,
        'createdAt',a.created_at,'updatedAt',a.updated_at,
        'occurrences',(
          SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'date',d.day,'deductionHours',CASE WHEN a.away_mode='partial' THEN a.partial_drag_hours ELSE public.dg_staff_away_full_day_impact(a.staff_id,d.day) END
          ) ORDER BY d.day),'[]'::jsonb)
          FROM (SELECT value::date AS day FROM pg_catalog.generate_series(GREATEST(a.start_date,p_start),LEAST(a.end_date,p_end_exclusive-1),'1 day'::interval) value) d
          WHERE public.dg_staff_away_is_working_day(v_location,d.day)
        )
      ) ORDER BY a.start_date,s.display_name,a.period_id)
      FROM public.dg_staff_away_periods a JOIN public.dg_capacity_staff s ON s.staff_id=a.staff_id
      WHERE a.company_location=v_location AND a.deleted_at IS NULL AND a.start_date<p_end_exclusive AND a.end_date>=p_start
    ),'[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.save_staff_away_period(
  p_command_id uuid,p_period_id uuid,p_expected_revision bigint,p_staff_id uuid,p_start_date date,p_end_date date,
  p_mode text,p_partial_drag_hours numeric,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid();v_location text:=public.dg_staff_away_scope(true);v_period public.dg_staff_away_periods%ROWTYPE;v_before jsonb;v_id uuid:=COALESCE(p_period_id,extensions.gen_random_uuid());v_max_impact numeric;
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
DECLARE v_actor uuid:=auth.uid();v_location text:=public.dg_staff_away_scope(true);v_period public.dg_staff_away_periods%ROWTYPE;v_before jsonb;v_now timestamptz:=pg_catalog.clock_timestamp();
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

DO $$DECLARE f regprocedure;BEGIN FOREACH f IN ARRAY ARRAY[
  'public.dg_staff_away_scope(boolean)'::regprocedure,
  'public.dg_staff_away_is_working_day(text,date)'::regprocedure,
  'public.dg_staff_away_full_day_impact(uuid,date)'::regprocedure,
  'public.dg_staff_away_deduction(text,date)'::regprocedure,
  'public.dg_apply_staff_away_to_capacity_row()'::regprocedure,
  'public.dg_recalculate_staff_away_capacity(text,date,date)'::regprocedure,
  'public.load_staff_away_calendar_range(date,date)'::regprocedure,
  'public.save_staff_away_period(uuid,uuid,bigint,uuid,date,date,text,numeric,text)'::regprocedure,
  'public.delete_staff_away_period(uuid,uuid,bigint)'::regprocedure
] LOOP EXECUTE 'ALTER FUNCTION '||f||' OWNER TO postgres';EXECUTE 'REVOKE ALL ON FUNCTION '||f||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.dg_staff_away_scope(boolean),public.load_staff_away_calendar_range(date,date),public.save_staff_away_period(uuid,uuid,bigint,uuid,date,date,text,numeric,text),public.delete_staff_away_period(uuid,uuid,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.load_staff_away_calendar_range(date,date) TO service_role;

COMMIT;
