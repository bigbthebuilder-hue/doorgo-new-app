-- Preserve historical past-date context across a temporary Needs Attention placement.
BEGIN;

CREATE OR REPLACE FUNCTION public.place_production_booking(
  p_command_id uuid, p_booking_id text, p_expected_production_date date,
  p_destination_production_date date, p_wholly_unstarted_acknowledged boolean,
  p_backdate_reason text, p_closed_date_override_acknowledged boolean
) RETURNS TABLE (move_id uuid,booking_id text,previous_production_date date,new_production_date date,
  previous_day_order bigint,new_day_order bigint,shop_hours numeric(10,2),moved_at timestamptz,action_type text,destination_was_closed boolean,status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_profile public.dg_user_profiles%ROWTYPE; v_booking public.dg_production_bookings%ROWTYPE;
  v_native public.dg_native_jobs%ROWTYPE; v_current date; v_today date; v_order bigint; v_now timestamptz:=pg_catalog.clock_timestamp();
  v_move_id uuid:=extensions.gen_random_uuid(); v_closed boolean:=false; v_reason text:=NULLIF(pg_catalog.btrim(p_backdate_reason),''); v_action text;
  v_unscheduled_from date; v_historical_past boolean:=false;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION USING MESSAGE='production_placement.authentication_required'; END IF;
  SELECT * INTO v_profile FROM public.dg_user_profiles p WHERE p.user_id=v_actor;
  IF NOT FOUND OR NOT v_profile.active THEN RAISE EXCEPTION USING MESSAGE='production_placement.active_profile_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='production' AND p.access_level='use')
    OR NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='calendar' AND p.access_level='use')
  THEN RAISE EXCEPTION USING MESSAGE='production_placement.permission_required'; END IF;
  IF p_command_id IS NULL OR p_booking_id IS NULL OR p_wholly_unstarted_acknowledged IS NULL OR p_closed_date_override_acknowledged IS NULL
    OR p_expected_production_date IS NOT DISTINCT FROM p_destination_production_date
  THEN RAISE EXCEPTION USING MESSAGE='production_placement.invalid_request'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_command:'||p_command_id::text,0));
  IF EXISTS (SELECT 1 FROM public.dg_production_booking_moves m WHERE m.command_id=p_command_id)
  THEN RAISE EXCEPTION USING MESSAGE='production_placement.command_uuid_collision'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('dg_production_booking_move_booking:'||p_booking_id,0));
  SELECT * INTO v_booking FROM public.dg_production_bookings b WHERE b.booking_id=p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='production_placement.not_found'; END IF;
  v_current:=public.parse_production_booking_date(v_booking.production_date);
  IF v_current IS DISTINCT FROM p_expected_production_date THEN RAISE EXCEPTION USING MESSAGE='production_placement.stale_booking'; END IF;
  IF v_booking.booking_kind IS DISTINCT FROM 'production' OR v_booking.deleted_at IS NOT NULL OR v_booking.cancelled_at IS NOT NULL
    OR v_booking.status IS DISTINCT FROM 'active' OR v_booking.schedule_status IS DISTINCT FROM 'confirmed'
    OR v_booking.board_visible IS NOT DISTINCT FROM false OR v_booking.locked IS NOT DISTINCT FROM true OR v_booking.completed_at IS NOT NULL
  THEN RAISE EXCEPTION USING MESSAGE='production_placement.ineligible_booking'; END IF;
  SELECT * INTO v_native FROM public.dg_native_jobs j WHERE j.visible_identifier=v_booking.job_id AND j.archived_at IS NULL FOR UPDATE;
  IF FOUND AND NOT EXISTS (SELECT 1 FROM public.dg_user_permissions p WHERE p.user_id=v_actor AND p.permission_key='jobs' AND p.access_level='use')
  THEN RAISE EXCEPTION USING MESSAGE='production_placement.jobs_permission_required'; END IF;
  v_today:=(pg_catalog.clock_timestamp() AT TIME ZONE 'America/Vancouver')::date;
  IF v_current IS NULL THEN
    SELECT m.from_production_date INTO v_unscheduled_from FROM public.dg_production_booking_moves m
    WHERE m.booking_id=p_booking_id AND m.action_type='unschedule' AND m.to_production_date IS NULL
    ORDER BY m.moved_at DESC,m.move_id DESC LIMIT 1;
    v_historical_past:=v_unscheduled_from IS NOT NULL AND v_unscheduled_from<v_today;
  END IF;
  IF p_destination_production_date IS NULL THEN v_action:='unschedule'; v_reason:=NULL;
  ELSIF p_destination_production_date<v_today AND NOT v_historical_past THEN
    v_action:='backdate'; IF v_reason IS NULL THEN RAISE EXCEPTION USING MESSAGE='production_placement.backdate_reason_required'; END IF;
  ELSE v_action:=CASE WHEN v_current IS NULL THEN 'schedule' ELSE 'reschedule' END;
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE='production_placement.invalid_request'; END IF;
  END IF;
  IF p_destination_production_date IS NOT NULL THEN
    IF NOT (v_historical_past AND p_destination_production_date<v_today)
      AND NOT (v_current IS NOT NULL AND v_current<v_today AND p_destination_production_date<v_today)
      AND (COALESCE(v_current,p_destination_production_date)<=v_today OR p_destination_production_date=v_today)
      AND p_wholly_unstarted_acknowledged IS DISTINCT FROM true
    THEN RAISE EXCEPTION USING MESSAGE='production_placement.acknowledgement_required'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.dg_daily_capacity c WHERE c.production_date=p_destination_production_date AND c.is_closed=true) INTO v_closed;
    IF v_closed AND p_closed_date_override_acknowledged IS DISTINCT FROM true THEN RAISE EXCEPTION USING MESSAGE='production_placement.closed_date_override_required'; END IF;
  END IF;
  IF p_destination_production_date IS NULL THEN
    SELECT COALESCE(pg_catalog.min(b.day_order),0)-1024 INTO v_order FROM public.dg_production_bookings b WHERE b.production_date IS NULL;
  ELSE
    SELECT COALESCE(pg_catalog.max(b.day_order),0)+1024 INTO v_order FROM public.dg_production_bookings b WHERE b.production_date=pg_catalog.to_char(p_destination_production_date,'YYYY-MM-DD');
  END IF;
  UPDATE public.dg_production_bookings b SET production_date=CASE WHEN p_destination_production_date IS NULL THEN NULL ELSE pg_catalog.to_char(p_destination_production_date,'YYYY-MM-DD') END,
    day_order=v_order,updated_at=v_now,updated_by=v_actor::text WHERE b.booking_id=p_booking_id;
  IF FOUND AND v_native.internal_job_id IS NOT NULL THEN
    UPDATE public.dg_native_jobs j SET shop_date=p_destination_production_date,shop_date_source=CASE WHEN p_destination_production_date IS NULL THEN NULL ELSE 'Manual' END,
      revision=j.revision+1,updated_at=v_now,updated_by_user_id=v_actor WHERE j.internal_job_id=v_native.internal_job_id;
  END IF;
  INSERT INTO public.dg_production_booking_moves(move_id,command_id,booking_id,from_production_date,to_production_date,shop_hours_snapshot,
    actor_user_id,actor_display_name_snapshot,moved_at,original_updated_at_snapshot,wholly_unstarted_acknowledged,source_system,created_at,action_type,reason,destination_was_closed,closed_date_override_acknowledged)
  VALUES(v_move_id,p_command_id,p_booking_id,v_current,p_destination_production_date,v_booking.shop_hours,v_actor,pg_catalog.btrim(v_profile.display_name),v_now,
    v_booking.updated_at,true,'doorgo_native',v_now,v_action,v_reason,v_closed,v_closed);
  RETURN QUERY SELECT v_move_id,p_booking_id,v_current,p_destination_production_date,v_booking.day_order,v_order,v_booking.shop_hours::numeric(10,2),v_now,v_action,v_closed,'moved'::text;
END; $$;

ALTER FUNCTION public.place_production_booking(uuid,text,date,date,boolean,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.place_production_booking(uuid,text,date,date,boolean,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_production_booking(uuid,text,date,date,boolean,text,boolean) TO authenticated;

COMMIT;
