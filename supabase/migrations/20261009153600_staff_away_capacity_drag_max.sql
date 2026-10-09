BEGIN;

-- Read the same per-date maximum used by save_staff_away_period.
-- Keep the underlying configuration/helper private.
CREATE FUNCTION public.calendar_staff_away_capacity_drag_max(p_staff_id uuid, p_date date)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' STABLE AS $$
DECLARE v_location text:=public.dg_staff_away_scope(true);
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

ALTER FUNCTION public.calendar_staff_away_capacity_drag_max(uuid,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calendar_staff_away_capacity_drag_max(uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.calendar_staff_away_capacity_drag_max(uuid,date) TO authenticated;

COMMIT;
