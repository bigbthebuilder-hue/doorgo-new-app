-- Prepared PostgreSQL authorization/occurrence regression; NOT run by this task.
-- Requires a disposable local database already migrated and seeded independently.
-- Run only after separate authorization: psql -X -v ON_ERROR_STOP=1 -f this-file
-- Fixtures: North/South active setup-complete View+Use users with Jobs none;
-- Calendar-none (preferably Production-use), inactive and setup-required actors;
-- North/South absences in 2026-11-02..09, with differing workweeks (e.g. Saturday).
BEGIN;
DO $$ BEGIN
  IF current_database()<>'doorgo_staff_away_test'
     OR (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)) THEN
    RAISE EXCEPTION 'Requires disposable local doorgo_staff_away_test';
  END IF;
END $$;
CREATE TEMP TABLE away_actors AS
SELECT DISTINCT ON (p.company_location,a.access_level)
  p.user_id,p.company_location,a.access_level
FROM public.dg_user_profiles p JOIN public.dg_user_permissions a USING(user_id)
WHERE p.active AND p.must_change_password IS FALSE AND p.company_location IN ('North','South')
 AND a.permission_key='calendar' AND a.access_level IN ('view','use')
 AND NOT EXISTS(SELECT 1 FROM public.dg_user_permissions j WHERE j.user_id=p.user_id AND j.permission_key='jobs' AND j.access_level IN ('view','use'))
ORDER BY p.company_location,a.access_level,p.user_id;
CREATE TEMP TABLE away_denied AS
SELECT p.user_id FROM public.dg_user_profiles p
WHERE NOT p.active OR p.must_change_password OR NOT EXISTS(
 SELECT 1 FROM public.dg_user_permissions a WHERE a.user_id=p.user_id AND a.permission_key='calendar' AND a.access_level IN ('view','use'));
CREATE TEMP TABLE away_expected AS
SELECT a.period_id,a.staff_id,a.company_location,a.revision,a.start_date,a.end_date,a.away_mode,a.partial_drag_hours,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('date',d.day,'deductionHours',CASE WHEN a.away_mode='partial' THEN a.partial_drag_hours ELSE public.dg_staff_away_full_day_impact(a.staff_id,d.day) END) ORDER BY d.day)
 FROM (SELECT value::date AS day FROM generate_series(GREATEST(a.start_date,'2026-11-02'::date),LEAST(a.end_date,'2026-11-08'::date),'1 day'::interval) value) d
 WHERE public.dg_staff_away_is_working_day(a.company_location,d.day)),'[]'::jsonb) AS occurrences
FROM public.dg_staff_away_periods a JOIN public.dg_capacity_staff s USING(staff_id)
WHERE a.deleted_at IS NULL AND a.start_date<'2026-11-09' AND a.end_date>='2026-11-02';
CREATE TEMP TABLE away_capacity_before AS SELECT md5(COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.production_date)::text,'[]')) AS hash FROM public.dg_daily_capacity c;
DO $$ BEGIN
 IF (SELECT count(*) FROM away_actors)<>4 OR (SELECT count(DISTINCT company_location) FROM away_expected)<2 OR (SELECT count(*) FROM away_denied)<3 THEN
  RAISE EXCEPTION 'Missing seeded actor or cross-location period fixtures';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM away_expected e,generate_series('2026-11-02'::date,'2026-11-08'::date,'1 day'::interval) d
   WHERE d::date BETWEEN e.start_date AND e.end_date AND public.dg_staff_away_is_working_day(e.company_location,d::date)
      IS DISTINCT FROM public.dg_staff_away_is_working_day(CASE WHEN e.company_location='North' THEN 'South' ELSE 'North' END,d::date)) THEN
  RAISE EXCEPTION 'Need a fixture that distinguishes own-location and viewer-location workweeks';
 END IF;
 IF has_function_privilege('anon','public.load_calendar_staff_away_range(date,date)','EXECUTE')
 OR has_function_privilege('service_role','public.load_calendar_staff_away_range(date,date)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.load_calendar_staff_away_range(date,date)','EXECUTE') THEN
  RAISE EXCEPTION 'Unexpected read RPC ACL';
 END IF;
END $$;
GRANT SELECT ON away_actors,away_expected,away_denied TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE actor record;e record;payload jsonb;actual jsonb;foreign_period record;
BEGIN
 FOR actor IN SELECT * FROM away_actors LOOP
  PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);
  payload:=public.load_calendar_staff_away_range('2026-11-02','2026-11-09');
  IF jsonb_array_length(payload->'periods')<>(SELECT count(*) FROM away_expected) THEN RAISE EXCEPTION 'Different cross-location visibility';END IF;
  FOR e IN SELECT * FROM away_expected LOOP
   SELECT value INTO STRICT actual FROM jsonb_array_elements(payload->'periods') WHERE value->>'periodId'=e.period_id::text;
   IF actual->>'staffId'<>e.staff_id::text OR actual->>'companyLocation'<>e.company_location
    OR actual->'occurrences' IS DISTINCT FROM e.occurrences
    OR (actual->>'inEditScope')::boolean IS DISTINCT FROM (actor.company_location=e.company_location) THEN
    RAISE EXCEPTION 'Employee/location/workweek/edit-scope changed: %',e.period_id;
   END IF;
  END LOOP;
  IF payload->'activeStaff' IS DISTINCT FROM public.load_staff_away_calendar_range('2026-11-02','2026-11-09')->'activeStaff' THEN
    RAISE EXCEPTION 'Editable roster broadened';
  END IF;
  SELECT * INTO STRICT foreign_period FROM away_expected WHERE company_location<>actor.company_location LIMIT 1;
  BEGIN
   PERFORM public.delete_staff_away_period(extensions.gen_random_uuid(),foreign_period.period_id,foreign_period.revision);
   RAISE EXCEPTION 'Cross-location delete allowed';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>CASE WHEN actor.access_level='view' THEN 'staff_away.permission_required' ELSE 'staff_away.not_found' END THEN RAISE;END IF;
  END;
 END LOOP;
 FOR actor IN SELECT * FROM away_denied LOOP
  PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);
  BEGIN
   PERFORM public.load_calendar_staff_away_range('2026-11-02','2026-11-09');
   RAISE EXCEPTION 'Protected Calendar read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
   WHEN raise_exception THEN IF SQLERRM NOT IN ('staff_away.permission_required','staff_away.active_profile_required','business.access_required') THEN RAISE;END IF;
  END;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
  PERFORM public.load_calendar_staff_away_range('2026-11-02','2026-11-09');
  RAISE EXCEPTION 'Missing identity allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'staff_away.authentication_required' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT hash FROM away_capacity_before) IS DISTINCT FROM (SELECT md5(COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.production_date)::text,'[]')) FROM public.dg_daily_capacity c) THEN
  RAISE EXCEPTION 'Read or denied mutation changed capacity';
 END IF;
END $$;
ROLLBACK;
\echo 'Calendar cross-location Staff Away SQL authorization/workweek checks passed'
