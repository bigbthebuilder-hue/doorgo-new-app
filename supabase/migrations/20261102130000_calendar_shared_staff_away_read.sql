-- Shared Calendar visibility only. Existing location-bound mutation/RLS/capacity
-- helpers and the old Production-compatible range RPC are deliberately unchanged.
-- Requires the existing business-access foundation (20261027120000).
BEGIN;

CREATE FUNCTION public.load_calendar_staff_away_range(p_start date,p_end_exclusive date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_actor uuid:=auth.uid();v_location text;
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
  IF p_start IS NULL OR p_end_exclusive IS NULL OR p_end_exclusive<=p_start OR p_end_exclusive-p_start>370 THEN RAISE EXCEPTION USING MESSAGE='staff_away.invalid_range';END IF;
  RETURN pg_catalog.jsonb_build_object(
    'activeStaff',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('staffId',s.staff_id,'displayName',s.display_name) ORDER BY s.display_name)
      FROM public.dg_capacity_staff s WHERE s.company_location=v_location AND s.active
    ),'[]'::jsonb),
    'periods',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'periodId',a.period_id,'staffId',a.staff_id,'staffName',s.display_name,
        'companyLocation',a.company_location,'inEditScope',a.company_location=v_location,'startDate',a.start_date,'endDate',a.end_date,
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

ALTER FUNCTION public.load_calendar_staff_away_range(date,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.load_calendar_staff_away_range(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.load_calendar_staff_away_range(date,date) TO authenticated;

COMMIT;
